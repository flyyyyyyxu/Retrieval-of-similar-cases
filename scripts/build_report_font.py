"""Rebuild the PDF fonts from @fontsource-variable/noto-sans-sc@5.3.1 (OFL-1.1).

uv run --isolated --no-project --with 'fonttools[woff]' python scripts/build_report_font.py ARCHIVE
The npm archive is only a build input, not a runtime dependency.
"""

import sys
import tarfile
import tempfile
from pathlib import Path

from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

target = Path(__file__).resolve().parents[1] / "backend/assets/fonts"
target.mkdir(parents=True, exist_ok=True)
with tarfile.open(sys.argv[1]) as archive, tempfile.TemporaryDirectory() as work:
    members = [m for m in archive.getmembers() if m.name.endswith(".woff2")]
    (target / "OFL.txt").write_bytes(archive.extractfile("package/LICENSE").read())
    for weight, name in [(400, "Regular"), (700, "Bold")]:
        parts = []
        for i, member in enumerate(members):
            part = Path(work) / f"{weight}-{i}.ttf"
            font = TTFont(archive.extractfile(member))
            instantiateVariableFont(font, {"wght": weight}, inplace=True)
            font.flavor = None
            for table in ("GSUB", "GPOS", "GDEF", "DSIG", "STAT"):
                if table in font:
                    del font[table]
            font.save(part)
            font.close()
            parts.append(str(part))
        merged = Merger().merge(parts)
        for record in merged["name"].names:
            if record.nameID in (1, 2, 3, 4, 6):
                value = {1: "QingAn Sans", 2: name, 3: f"QingAnSans-{name}",
                         4: f"QingAn Sans {name}", 6: f"QingAnSans-{name}"}[record.nameID]
                record.string = value.encode(record.getEncoding(), errors="replace")
        output = target / f"QingAnSans-{name}.ttf"
        merged.save(output)
        print(f"Built {output.name}: {output.stat().st_size} bytes", flush=True)
