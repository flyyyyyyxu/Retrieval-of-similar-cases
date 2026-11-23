"""导入本地案例及分析。默认写入 Git 忽略的 var/；原始文件保持不变。"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.sources.local_import import clean_case  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--annotations", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "var" / "local_cases.json")
    args = parser.parse_args()
    annotation_path = args.annotations or args.source.with_name("案例分析.json")
    raw = json.loads(args.source.read_text(encoding="utf-8-sig"))
    annotations = json.loads(annotation_path.read_text(encoding="utf-8-sig"))
    cases = [clean_case(item, annotations.get(item["id"], [])) for item in raw]
    if len({c.id for c in cases}) != len(cases):
        raise ValueError("发现重复文书 ID")
    if len({c.case_number for c in cases}) != len(cases):
        raise ValueError("发现重复案号，请先核对版本")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temp = args.output.with_suffix(".tmp")
    temp.write_text(json.dumps([c.model_dump(mode="json") for c in cases],
                               ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(args.output)
    print(f"已导入 {len(cases)} 件文书、{sum(len(c.paragraphs) for c in cases)} 个原文段落")
    print(f"分析摘要 {sum(s.origin == 'ai' for c in cases for s in c.content_sections)} 段；{args.output}")


if __name__ == "__main__":
    main()
