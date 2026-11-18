"""入口：同时提供 /api 和前端静态页面，本地一条命令启动。"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.config import get_settings

app = FastAPI(title="清案 · 可信类案检索", version="0.1.0")
app.include_router(router)

# 放在最后挂载，避免覆盖 /api 路由
app.mount("/", StaticFiles(directory=get_settings().frontend_dir, html=True), name="frontend")
