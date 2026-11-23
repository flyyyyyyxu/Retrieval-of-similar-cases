"""Restore fonts when a source upload used compressed file parts."""

import gzip
from pathlib import Path

fonts = Path(__file__).resolve().parents[1] / "backend/assets/fonts"
for weight in ("Bold", "Regular"):
    target = fonts / f"QingAnSans-{weight}.ttf"
    parts = sorted(fonts.glob(f"{target.name}.gz.part*"))
    if parts:
        target.write_bytes(gzip.decompress(b"".join(part.read_bytes() for part in parts)))
    if not target.is_file():
        raise FileNotFoundError(target)
