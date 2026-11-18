"""把 backend/app/schemas.py 生成的接口定义导出到 docs/openapi.json。
改了 schemas.py 后运行（在 backend/ 目录）：uv run python ../scripts/export_openapi.py"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402

out = ROOT / "docs" / "openapi.json"
out.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"已更新 {out.relative_to(ROOT)}")
