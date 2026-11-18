"""检索流水线：parse → recall → rerank →（按需）explain → cite。

每一步都是纯函数，API 和 eval/run_eval.py 调用的是同一条链路。"""

import time

from app.config import Settings
from app.pipeline.recall import recall
from app.pipeline.rerank import rerank
from app.schemas import Hit, ParsedQuery
from app.sources.base import CaseSource

RECALL_SIZE = 100  # 召回候选数，实验起点，按服务限制与耗时调整


def run_search(
    q: ParsedQuery, source: CaseSource, s: Settings, size: int
) -> tuple[list[Hit], list[str], int]:
    t0 = time.perf_counter()
    candidates, d1 = recall(q, source, size=RECALL_SIZE)
    hits, d2 = rerank(q, candidates, s, top_k=size)
    return hits, d1 + d2, int((time.perf_counter() - t0) * 1000)
