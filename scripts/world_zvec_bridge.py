#!/usr/bin/env python3

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import zvec


def load_payload(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_output(path: str, payload: dict) -> None:
    Path(path).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def build_collection(payload: dict) -> dict:
    collection_path = Path(payload["collection_path"])
    docs = payload.get("docs") or []
    dimension = int(payload["dimension"])
    if dimension <= 0:
        raise ValueError("dimension must be positive")

    shutil.rmtree(collection_path, ignore_errors=True)
    collection_path.parent.mkdir(parents=True, exist_ok=True)

    schema = zvec.CollectionSchema(
        name="world_source_knowledge",
        vectors=[
            zvec.VectorSchema(
                "embedding",
                zvec.DataType.VECTOR_FP32,
                dimension,
                index_param=zvec.HnswIndexParam(),
            )
        ],
    )
    collection = zvec.create_and_open(
        path=str(collection_path),
        schema=schema,
        option=zvec.CollectionOption(read_only=False, enable_mmap=True),
    )
    batch = []
    inserted = 0
    for item in docs:
        batch.append(
            zvec.Doc(
                id=str(item["id"]),
                vectors={"embedding": [float(value) for value in item["embedding"]]},
            )
        )
        if len(batch) >= 256:
            collection.insert(batch)
            inserted += len(batch)
            batch = []
    if batch:
        collection.insert(batch)
        inserted += len(batch)
    collection.flush()
    return {
        "ok": True,
        "count": inserted,
        "dimension": dimension,
    }


def query_collection(payload: dict) -> dict:
    collection = zvec.open(
        payload["collection_path"],
        option=zvec.CollectionOption(read_only=True, enable_mmap=True),
    )
    results = collection.query(
        vectors=zvec.VectorQuery(
            "embedding",
            vector=[float(value) for value in payload["vector"]],
        ),
        topk=int(payload.get("topk") or 10),
    )
    return {
        "ok": True,
        "hits": [
            {
                "id": item.id,
                "score": float(item.score) if item.score is not None else None,
            }
            for item in results
        ],
    }


def main() -> int:
    if len(sys.argv) != 4:
        raise SystemExit("usage: world_zvec_bridge.py <build|query> <input.json> <output.json>")

    command = sys.argv[1]
    input_path = sys.argv[2]
    output_path = sys.argv[3]
    payload = load_payload(input_path)

    if command == "build":
        result = build_collection(payload)
    elif command == "query":
        result = query_collection(payload)
    else:
        raise SystemExit(f"unsupported command: {command}")

    write_output(output_path, result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
