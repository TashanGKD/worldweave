#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import posixpath
import shlex
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parent.parent

DEFAULT_HOST = "your-server-host"
DEFAULT_USER = "ubuntu"
DEFAULT_KEY = Path.home() / ".ssh" / "id_rsa_lighthouse"
DEFAULT_REMOTE_ROOT = "/home/ubuntu/world"
DEFAULT_PM2_APP = "xia-report-world"
DEFAULT_REFRESH_PM2_APP = "world-source-refresh"

ROOT_DIRS = [
    "src",
    "public",
    "scripts",
    "research",
    "assets",
    "docs",
]

ROOT_FILES = [
    ".babelrc",
    ".env.example",
    ".gitignore",
    ".npmrc",
    "README.md",
    "components.json",
    "ecosystem.config.js",
    "eslint.config.mjs",
    "next-env.d.ts",
    "next.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    "postcss.config.mjs",
    "tsconfig.json",
]

OPTIONAL_ROOT_DIRS = ["zvec"]

SKIP_PARTS = {
    "__pycache__",
    ".next",
    "node_modules",
    "logs",
    "output",
    ".cache",
    ".playwright-cli",
    ".venv-zvec",
    ".hermes-venv",
    "external-repos",
    ".git",
    ".github",
}

SKIP_FILES = {
    "tsconfig.tsbuildinfo",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync the local world app source set to the remote PM2 host.")
    parser.add_argument("--host", default=os.environ.get("WORLD_DEPLOY_HOST", DEFAULT_HOST))
    parser.add_argument("--user", default=os.environ.get("WORLD_DEPLOY_USER", DEFAULT_USER))
    parser.add_argument(
        "--key",
        default=os.environ.get("WORLD_DEPLOY_KEY", str(DEFAULT_KEY)),
        help="SSH private key path",
    )
    parser.add_argument(
        "--remote-root",
        default=os.environ.get("WORLD_DEPLOY_REMOTE_ROOT", DEFAULT_REMOTE_ROOT),
        help="Remote app root",
    )
    parser.add_argument(
        "--pm2-app",
        default=os.environ.get("WORLD_DEPLOY_PM2_APP", DEFAULT_PM2_APP),
        help="PM2 application name",
    )
    parser.add_argument(
        "--refresh-pm2-app",
        default=os.environ.get("WORLD_DEPLOY_REFRESH_PM2_APP", DEFAULT_REFRESH_PM2_APP),
        help="PM2 application name for the recurring source refresh worker",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("WORLD_DEPLOY_PORT", "5000")),
        help="Remote WorldWeave HTTP port used for health checks",
    )
    parser.add_argument(
        "--include-zvec",
        action="store_true",
        help="Also sync the vendored zvec tree. Off by default to keep deploys fast.",
    )
    return parser.parse_args()


def should_skip(rel_path: Path) -> bool:
    if any(part in SKIP_PARTS for part in rel_path.parts):
        return True
    if rel_path.name in SKIP_FILES:
        return True
    return False


def iter_deploy_paths(include_zvec: bool) -> list[Path]:
    items: list[Path] = []
    for root_dir in ROOT_DIRS + (OPTIONAL_ROOT_DIRS if include_zvec else []):
        path = ROOT / root_dir
        if path.exists():
            items.append(path)
    for root_file in ROOT_FILES:
        path = ROOT / root_file
        if path.exists():
            items.append(path)
    return items


def iter_tracked_deploy_files(include_zvec: bool) -> list[Path]:
    allowed_dirs = set(ROOT_DIRS + (OPTIONAL_ROOT_DIRS if include_zvec else []))
    allowed_files = set(ROOT_FILES)
    output = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    files: list[Path] = []
    for raw_item in output.decode("utf-8", "ignore").split("\0"):
        if not raw_item:
            continue
        rel = Path(raw_item)
        if should_skip(rel):
            continue
        if rel.as_posix() in allowed_files or (rel.parts and rel.parts[0] in allowed_dirs):
            path = ROOT / rel
            if path.is_file():
                files.append(path)
    return files


def build_archive(include_zvec: bool) -> Path:
    fd, temp_name = tempfile.mkstemp(prefix="world-deploy-", suffix=".tar.gz")
    os.close(fd)
    archive_path = Path(temp_name)

    with tarfile.open(archive_path, "w:gz") as tar:
        for item in iter_tracked_deploy_files(include_zvec):
            rel = item.relative_to(ROOT)
            tar.add(item, arcname=rel.as_posix())

    return archive_path


def run_remote(client: paramiko.SSHClient, command: str, timeout: int = 7200) -> None:
    print(f">>> {command}")
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "ignore")
    err = stderr.read().decode("utf-8", "ignore")
    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)
    exit_code = stdout.channel.recv_exit_status()
    if exit_code != 0:
        raise RuntimeError(f"remote command failed ({exit_code}): {command}")


def shell_join(items: list[str]) -> str:
    return " ".join(shlex.quote(item) for item in items)


def ensure_remote_dirs(sftp: paramiko.SFTPClient, remote_root: str) -> None:
    parts = remote_root.split("/")
    current = ""
    for part in parts:
        if not part:
            continue
        current += "/" + part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def main() -> int:
    args = parse_args()
    archive_path = build_archive(args.include_zvec)
    remote_archive = f"/tmp/world-deploy-{int(time.time())}.tar.gz"

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=args.host,
        username=args.user,
        key_filename=args.key,
        timeout=10,
        banner_timeout=10,
        auth_timeout=10,
    )
    try:
        sftp = client.open_sftp()
        ensure_remote_dirs(sftp, args.remote_root)
        sftp.put(str(archive_path), remote_archive)
        sftp.close()

        remove_dir_targets = ROOT_DIRS + (OPTIONAL_ROOT_DIRS if args.include_zvec else [])
        remove_file_targets = ROOT_FILES
        remote_remove_dirs = [posixpath.join(args.remote_root, target) for target in remove_dir_targets]
        remote_remove_files = [posixpath.join(args.remote_root, target) for target in remove_file_targets]

        bootstrap_pnpm = (
            "mkdir -p $HOME/bin && "
            "cat > $HOME/bin/pnpm <<'SH'\n#!/bin/sh\nexec corepack pnpm \"$@\"\nSH\n"
            "chmod +x $HOME/bin/pnpm"
        )
        run_remote(client, f"bash -lc {shlex.quote(bootstrap_pnpm)}", timeout=120)

        deploy_cmd = (
            f"set -euo pipefail; "
            f"rm -rf {shell_join(remote_remove_dirs)}; "
            f"rm -f {shell_join(remote_remove_files)}; "
            f"tar -xzf {shlex.quote(remote_archive)} -C {shlex.quote(args.remote_root)}; "
            f"rm -f {shlex.quote(remote_archive)}"
        )
        run_remote(client, f"bash -lc {shlex.quote(deploy_cmd)}", timeout=1200)

        run_remote(
            client,
            f"bash -lc {shlex.quote(f'export PATH=$HOME/bin:$PATH && cd {args.remote_root} && mkdir -p logs && pnpm install --frozen-lockfile --registry=https://registry.npmjs.org && pnpm build')}",
            timeout=7200,
        )
        restart_cmd = (
            f"export PATH=$HOME/bin:$PATH && cd {args.remote_root} && "
            f"WORLDWEAVE_DIR={shlex.quote(args.remote_root)} PORT={args.port} "
            f"npx --yes pm2 startOrReload ecosystem.config.js "
            f"--only {args.pm2_app} --update-env"
        )
        run_remote(client, f"bash -lc {shlex.quote(restart_cmd)}", timeout=600)
        refresh_cmd = (
            f"export PATH=$HOME/bin:$PATH && cd {args.remote_root} && "
            f"WORLDWEAVE_DIR={shlex.quote(args.remote_root)} PORT={args.port} "
            f"npx --yes pm2 startOrReload ecosystem.config.js "
            f"--only {args.refresh_pm2_app} --update-env"
        )
        run_remote(client, f"bash -lc {shlex.quote(refresh_cmd)}", timeout=600)
        run_remote(client, f"bash -lc {shlex.quote(f'cd {args.remote_root} && npx --yes pm2 save')}", timeout=300)

        for url in [
            f"http://127.0.0.1:{args.port}/",
            f"http://127.0.0.1:{args.port}/api/v1/world/state?scene=global",
            f"http://127.0.0.1:{args.port}/api/v1/openclaw/skill.md",
        ]:
            run_remote(client, f"bash -lc {shlex.quote(f'curl -I --max-time 20 {url}')}", timeout=120)
    finally:
        client.close()
        try:
            archive_path.unlink(missing_ok=True)
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
