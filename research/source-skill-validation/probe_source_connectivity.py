#!/usr/bin/env python3
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


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


def load_table_from_markdown(markdown_path: Path, header_prefix: str) -> list[dict[str, str]]:
    lines = markdown_path.read_text(encoding="utf-8").splitlines()
    header_index = None
    for idx, line in enumerate(lines):
        if line.strip().lower().startswith(header_prefix):
            header_index = idx
            break
    if header_index is None:
        raise SystemExit(f"Could not find table header '{header_prefix}' in {markdown_path}")
    return parse_markdown_table(lines, header_index)


def to_int(value: str) -> int | None:
    if not value:
        return None
    value = value.strip()
    try:
        if "." in value:
            return int(float(value))
        return int(value)
    except ValueError:
        return None


def normalize_status(status: str) -> str:
    status = status.strip().lower()
    if status == "verified":
        return "verified"
    if status == "partially_verified":
        return "partially_verified"
    return "unverified"


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    validation_dir = repo_root / "research" / "source-skill-validation"
    candidates_md = repo_root / "research" / "source-skill-candidates.md"
    registry_md = repo_root / "research" / "source-link-registry.md"
    today = date.today().isoformat()

    registry_rows = load_table_from_markdown(registry_md, "| skill |")
    connectivity_rows: list[dict[str, object]] = []
    connectivity_counter: Counter[str] = Counter()
    host_counter: Counter[str] = Counter()

    for row in registry_rows:
        connectivity = row.get("connectivity", "").strip() or "unknown"
        status_code = to_int(row.get("status_code", ""))
        elapsed_ms = to_int(row.get("elapsed_ms", ""))
        url = row.get("source_url", "")
        if url:
            host = urlparse(url).hostname or ""
            if host and connectivity == "blocked_or_unknown":
                host_counter[host] += 1
        connectivity_counter[connectivity] += 1
        connectivity_rows.append(
            {
                "skill": row.get("skill", ""),
                "source_name": row.get("source_name", ""),
                "source_url": url,
                "source_type": row.get("source_type", ""),
                "connectivity": connectivity,
                "status_code": status_code,
                "elapsed_ms": elapsed_ms,
                "extracted_from": row.get("extracted_from", ""),
                "note": row.get("note", ""),
            }
        )

    connectivity_payload = {
        "date": today,
        "summary": {
            "direct": connectivity_counter.get("direct", 0),
            "unstable": connectivity_counter.get("unstable", 0),
            "blocked_or_unknown": connectivity_counter.get("blocked_or_unknown", 0),
        },
        "rows": connectivity_rows,
    }

    coverage_rows = load_table_from_markdown(
        candidates_md, "| name | hub_origin | validation_status |"
    )
    endpoint_covered = 0
    site_covered = 0
    uncovered = 0
    site_only_names: list[str] = []
    uncovered_names: list[str] = []

    for row in coverage_rows:
        name = row.get("name", "").strip()
        status = normalize_status(row.get("validation_status", ""))
        if status == "verified":
            endpoint_covered += 1
        elif status == "partially_verified":
            site_covered += 1
            if name:
                site_only_names.append(name)
        else:
            uncovered += 1
            if name:
                uncovered_names.append(name)

    completion_stage = "entering_long_tail"
    if uncovered > 0 or site_covered > 2:
        completion_stage = "in_progress"

    skill_frontier = [
        {"host": host, "count": count} for host, count in host_counter.most_common(20)
    ]

    coverage_payload = {
        "date": today,
        "completion_stage": completion_stage,
        "high_value_total": len(coverage_rows),
        "endpoint_covered": endpoint_covered,
        "site_covered": site_covered,
        "uncovered": uncovered,
        "high_value_site_only_names": site_only_names,
        "high_value_uncovered_names": uncovered_names,
        "skill_frontier": skill_frontier,
    }

    connectivity_path = validation_dir / f"probe-{today}-source-connectivity.json"
    coverage_path = validation_dir / f"probe-{today}-source-coverage.json"
    connectivity_path.write_text(
        json.dumps(connectivity_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    coverage_path.write_text(
        json.dumps(coverage_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    connectivity_md = validation_dir / f"round-{today}-source-connectivity.md"
    coverage_md = validation_dir / f"round-{today}-source-coverage.md"

    connectivity_md.write_text(
        "\n".join(
            [
                f"# Source connectivity round {today}",
                "",
                f"- direct: {connectivity_payload['summary']['direct']}",
                f"- unstable: {connectivity_payload['summary']['unstable']}",
                f"- blocked_or_unknown: {connectivity_payload['summary']['blocked_or_unknown']}",
            ]
        ),
        encoding="utf-8",
    )
    coverage_md.write_text(
        "\n".join(
            [
                f"# Source coverage round {today}",
                "",
                f"- completion_stage: {completion_stage}",
                f"- endpoint_covered: {endpoint_covered} / {len(coverage_rows)}",
                f"- site_covered: {site_covered}",
                f"- uncovered: {uncovered}",
            ]
        ),
        encoding="utf-8",
    )

    print(f"Wrote {connectivity_path}")
    print(f"Wrote {coverage_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
