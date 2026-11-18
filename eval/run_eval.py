"""离线评测：直接调用 pipeline（不走 HTTP），对比“基线关键词检索”和“完整方案”。

运行（在 backend/ 目录）：
    uv run python ../eval/run_eval.py

输入：
    eval/queries.csv     query_id,text,note
    eval/judgments.csv   query_id,case_id,relevance(0 不相关 / 1 有参考价值 / 2 高度相关),reason
标注由法律成员独立完成，排序模型的分数不能当作标注答案。
"""

import csv
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.api import case_type, llm, prompt, source  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.pipeline import run_search  # noqa: E402
from app.pipeline.parse import parse_query  # noqa: E402
from app.schemas import Filters  # noqa: E402

K = 5


def read_csv(name: str) -> list[dict]:
    with open(ROOT / "eval" / name, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def baseline(text: str) -> list[str]:
    """基线：同一案例库，用原文里出现的词表词做“任一命中”检索，不解析、不重排。"""
    words = [w for w in case_type().vocabulary() if w in text]
    hits = source().search(words, Filters(), match="any", size=K)
    return [h.case.id for h in hits]


def ours(text: str) -> list[str]:
    q = parse_query(text, case_type(), llm(), prompt("parse")).query
    hits, _, _ = run_search(q, source(), get_settings(), size=K)
    return [h.case.id for h in hits]


def metrics(ranked: list[str], labels: dict[str, int]) -> dict:
    top = ranked[:K]
    key = {c for c, r in labels.items() if r == 2}
    return {
        "p@5": sum(labels.get(c, 0) >= 1 for c in top) / K,
        "hit@5": (len(key & set(top)) / len(key)) if key else None,
    }


def main():
    labels: dict[str, dict[str, int]] = defaultdict(dict)
    for row in read_csv("judgments.csv"):
        labels[row["query_id"]][row["case_id"]] = int(row["relevance"])

    rows = []
    for q in read_csv("queries.csv"):
        t0 = time.perf_counter()
        ranked_ours = ours(q["text"])
        ms = int((time.perf_counter() - t0) * 1000)
        ranked_base = baseline(q["text"])
        lab = labels[q["query_id"]]
        rows.append({"query_id": q["query_id"], "ms": ms,
                     "base": metrics(ranked_base, lab), "ours": metrics(ranked_ours, lab),
                     "ranked_ours": ranked_ours, "ranked_base": ranked_base})

    def avg(system: str, m: str):
        vals = [r[system][m] for r in rows if r[system][m] is not None]
        return sum(vals) / len(vals) if vals else float("nan")

    print(f"数据源: {get_settings().case_source}    问题数: {len(rows)}")
    print(f"{'':8}{'P@5':>8}{'Hit@5':>8}")
    for system in ("base", "ours"):
        print(f"{system:8}{avg(system, 'p@5'):>8.2f}{avg(system, 'hit@5'):>8.2f}")
    print(f"平均耗时(ours): {sum(r['ms'] for r in rows) / max(len(rows), 1):.0f} ms")

    out = ROOT / "eval" / "runs"
    out.mkdir(exist_ok=True)
    path = out / f"{time.strftime('%Y%m%d-%H%M%S')}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"明细: {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
