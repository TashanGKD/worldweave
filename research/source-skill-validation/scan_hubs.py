#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_markdown_table(lines: list[str], start_index: int) -> list[dict[str, str]]:
    header_line = lines[start_index].strip().strip("|")
    headers = [item.strip() for item in header_line.split("|")]
    rows: list[dict[str, str]] = []
    i = start_index + 2
    while i < len(lines):
        line = lines[i].rstrip("\n")
        if not line.strip():
            break
        if not line.lstrip().startswith("|"):
            break
        parts = [item.strip() for item in line.strip().strip("|").split("|")]
        if len(parts) < len(headers):
            i += 1
            continue
        row = {headers[idx]: parts[idx] for idx in range(len(headers))}
        rows.append(row)
        i += 1
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse hub index markdown into a structured JSON list.")
    parser.add_argument("--markdown", required=True, help="Path to hub index markdown file.")
    parser.add_argument("--output", required=True, help="Output JSON path.")
    parser.add_argument(
        "--hub",
        action="append",
        default=[],
        help="Optional platform_name filter (substring match, case-insensitive).",
    )
    args = parser.parse_args()

    markdown_path = Path(args.markdown)
    lines = markdown_path.read_text(encoding="utf-8").splitlines()

    header_index = None
    for idx, line in enumerate(lines):
        if line.strip().lower().startswith("| platform_name |"):
            header_index = idx
            break

    if header_index is None:
        raise SystemExit("Could not find hub table header in markdown.")

    rows = parse_markdown_table(lines, header_index)
    if args.hub:
        filters = [item.lower() for item in args.hub]
        rows = [
            row
            for row in rows
            if any(
                flt in row.get("platform_name", "").lower() or flt in row.get("url", "").lower()
                for flt in filters
            )
        ]

    payload = []
    for row in rows:
        payload.append(
            {
                "platform_name": row.get("platform_name", ""),
                "url": row.get("url", ""),
                "platform_type": row.get("platform_type", ""),
                "domestic_ip_access": row.get("domestic_ip_access", ""),
                "content_visibility": row.get("content_visibility", ""),
                "searchability": row.get("searchability", ""),
                "signal_skill_density": row.get("signal_skill_density", ""),
                "worth_tracking": row.get("worth_tracking", ""),
                "notes": row.get("notes", ""),
                "status_code": None,
                "theme_hits": {},
            }
        )

    Path(args.output).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"hub_scan_count={len(payload)} output={args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
