#!/usr/bin/env python3
"""Local-only PDF ingest and page-aware extraction for the material library."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PRIVATE_ROOT = PROJECT_ROOT / "private"
VALID_ROUTES = {"due-diligence", "manager-materials"}


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_records(store_path: Path) -> list[dict]:
    if not store_path.exists():
        return []
    return json.loads(store_path.read_text(encoding="utf-8"))


def save_records(store_path: Path, records: list[dict]) -> None:
    store_path.parent.mkdir(parents=True, exist_ok=True)
    temp = store_path.with_suffix(".tmp")
    temp.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(store_path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_record(records: list[dict], record_id: str) -> dict:
    for record in records:
        if record["id"] == record_id:
            return record
    raise ValueError(f"材料记录不存在: {record_id}")


def infer_metadata(text: str, file_name: str, route: str) -> dict:
    compact = re.sub(r"\s+", " ", text[:12000])
    date_match = re.search(r"(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})", compact)
    material_date = (
        f"{date_match.group(1)}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"
        if date_match
        else datetime.now().strftime("%Y-%m-%d")
    )
    if "SmartBeta" in file_name or "价值风格指数" in file_name:
        manager, strategy = "申万宏源研究", "Smart Beta价值策略"
    elif "可转债" in file_name or "转债" in compact[:3000]:
        manager, strategy = "国盛证券研究所", "可转债量化策略"
    else:
        manager, strategy = "待复核来源机构", "待复核策略"
    title = re.sub(r"^\d{8}[-_]", "", Path(file_name).stem)
    material_type = "管理人尽调报告" if route == "due-diligence" else "策略与路演材料"
    return {
        "manager": manager,
        "strategy": strategy,
        "title": title,
        "materialDate": material_date,
        "materialType": material_type,
    }


def rule_summary(pages: list[dict], needs_ocr: bool) -> tuple[str, list[str], list[str], list[str]]:
    if needs_ocr:
        return (
            "未生成摘要：PDF没有提取到足够文字，已标记为需要OCR。",
            [],
            ["需要OCR后才能生成可复核的摘要与重点。"],
            ["需要OCR"],
        )
    text = "\n".join(page["text"] for page in pages)
    lines = [
        re.sub(r"\s+", " ", line).strip()
        for line in text.splitlines()
        if len(re.sub(r"\s+", "", line)) >= 24
    ]
    unique_lines = list(dict.fromkeys(lines))
    summary_source = " ".join(unique_lines[:4])[:460]
    summary = f"【测试摘要｜规则生成】{summary_source}"
    highlights = [f"【测试提取】{line[:180]}" for line in unique_lines[:3]]
    risks = [
        "【测试提示】摘要由本地规则生成，必须在发布前对照原PDF逐页复核。",
        "【测试提示】图表、复杂表格和图片中的信息可能未被文本提取覆盖。",
    ]
    tags = ["本地PDF", "规则摘要", "待人工复核"]
    return summary, highlights, risks, tags


def ingest(file_path: Path, route: str, private_root: Path, original_name: str | None = None) -> dict:
    if route not in VALID_ROUTES:
        raise ValueError("route 必须是 due-diligence 或 manager-materials")
    if not file_path.exists():
        raise FileNotFoundError(f"PDF不存在: {file_path}")
    if file_path.suffix.lower() != ".pdf":
        raise ValueError("仅支持PDF文件")

    store_path = private_root / "data" / "materials.json"
    uploads_dir = private_root / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    file_hash = sha256_file(file_path)
    records = load_records(store_path)
    duplicate = next((item for item in records if item.get("fileHash") == file_hash), None)
    if duplicate:
        return {"duplicate": True, "record": duplicate}

    safe_name = original_name or file_path.name
    stored_path = uploads_dir / f"{file_hash}.pdf"
    if file_path.resolve() != stored_path.resolve():
        shutil.copy2(file_path, stored_path)
    created_at = now_iso()
    record = {
        "id": f"local-{file_hash[:16]}",
        "route": route,
        "manager": "待解析",
        "title": Path(safe_name).stem,
        "materialDate": datetime.now().strftime("%Y-%m-%d"),
        "materialType": "管理人尽调报告" if route == "due-diligence" else "策略与路演材料",
        "strategy": "待解析",
        "summary": "文件已保存到本地私有目录，等待解析。",
        "highlights": [],
        "risks": [],
        "tags": ["本地上传", "待解析"],
        "status": "待解析",
        "needsOcr": False,
        "summaryKind": "none",
        "pages": [],
        "fileName": safe_name,
        "fileHash": file_hash,
        "storedFile": str(stored_path.relative_to(PROJECT_ROOT)),
        "pdfUrl": f"http://localhost:3001/api/materials/local-{file_hash[:16]}/pdf",
        "createdAt": created_at,
        "updatedAt": created_at,
        "statusHistory": [{"status": "待解析", "at": created_at}],
    }
    records.insert(0, record)
    save_records(store_path, records)
    return {"duplicate": False, "record": record}


def parse_record(record_id: str, private_root: Path) -> dict:
    store_path = private_root / "data" / "materials.json"
    records = load_records(store_path)
    record = find_record(records, record_id)
    pdf_path = PROJECT_ROOT / record["storedFile"]
    try:
        pages = []
        with pdfplumber.open(pdf_path) as pdf:
            for number, page in enumerate(pdf.pages, 1):
                text = (page.extract_text() or "").replace("\x00", " ").strip()
                pages.append({"pageNumber": number, "text": text, "charCount": len(text)})
        total_chars = sum(page["charCount"] for page in pages)
        needs_ocr = total_chars < 50
        metadata = infer_metadata("\n".join(page["text"] for page in pages), record["fileName"], record["route"])
        summary, highlights, risks, tags = rule_summary(pages, needs_ocr)
        timestamp = now_iso()
        record.update(
            metadata,
            pages=pages,
            totalPages=len(pages),
            totalChars=total_chars,
            needsOcr=needs_ocr,
            summary=summary,
            highlights=highlights,
            risks=risks,
            tags=tags,
            summaryKind="none" if needs_ocr else "test-rule",
            status="待复核",
            updatedAt=timestamp,
            parseError=None,
        )
        record["statusHistory"].append({"status": "待复核", "at": timestamp})
    except Exception as exc:
        timestamp = now_iso()
        record.update(
            status="解析失败",
            parseError=str(exc),
            summary="解析失败，未生成摘要或正文。",
            updatedAt=timestamp,
        )
        record["statusHistory"].append({"status": "解析失败", "at": timestamp})
    save_records(store_path, records)
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description="保存并逐页解析单份PDF")
    parser.add_argument("--file", type=Path, help="要保存并解析的PDF路径")
    parser.add_argument("--route", choices=sorted(VALID_ROUTES), help="材料模块")
    parser.add_argument("--original-name", help="保留的原始文件名")
    parser.add_argument("--record-id", help="解析已有本地记录")
    parser.add_argument("--ingest-only", action="store_true", help="只保存和建档，不解析")
    parser.add_argument("--private-root", type=Path, default=DEFAULT_PRIVATE_ROOT)
    args = parser.parse_args()

    try:
        if args.record_id:
            result = {"duplicate": False, "record": parse_record(args.record_id, args.private_root)}
        elif args.file and args.route:
            result = ingest(args.file, args.route, args.private_root, args.original_name)
            if not args.ingest_only and not result["duplicate"]:
                result["record"] = parse_record(result["record"]["id"], args.private_root)
        else:
            parser.error("请提供 --record-id，或同时提供 --file 和 --route")
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
