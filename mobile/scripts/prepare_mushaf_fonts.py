"""Convert only W01 sample fonts from existing WOFF2 to mobile-compatible TTF.

Run with fonttools[woff]. Does not download assets or modify the website.
"""
import hashlib
import json
from pathlib import Path
from fontTools.ttLib import TTFont

APP = Path(__file__).resolve().parents[1]
PROJECT = APP.parent
SAMPLE_PAGES = (1, 2, 604)
DESTINATION = APP / "assets" / "fonts"
DESTINATION.mkdir(parents=True, exist_ok=True)

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

font_pages = set()
layouts = {}
for page in SAMPLE_PAGES:
    layout_path = PROJECT / "public" / "quran" / "hafs" / "layout-v1" / f"{page}.json"
    layout = json.loads(layout_path.read_text(encoding="utf-8"))
    layouts[str(page)] = sha256(layout_path)
    font_pages.update(int(word["pageV1"]) for word in layout["words"].values())

manifest = {"samplePages": SAMPLE_PAGES, "layoutSha256": layouts, "fonts": {}}
for page in sorted(font_pages):
    source = PROJECT / "public" / "quran" / "hafs" / "fonts" / "v1" / f"p{page}.woff2"
    target = DESTINATION / f"qcf-v1-p{page}.ttf"
    font = TTFont(source)
    font.flavor = None
    font.save(target)
    roundtrip = TTFont(target)
    if roundtrip.getBestCmap() != font.getBestCmap():
        raise ValueError(f"Glyph mapping changed on page {page}")
    metadata = {}
    for name_id, label in ((0, "copyright"), (13, "license"), (14, "licenseUrl")):
        record = font["name"].getDebugName(name_id)
        if record:
            metadata[label] = record
    cmap = font.getBestCmap()
    manifest["fonts"][str(page)] = {
        "source": source.relative_to(PROJECT).as_posix(),
        "sourceSha256": sha256(source),
        "ttfSha256": sha256(target),
        "unitsPerEm": font["head"].unitsPerEm,
        "glyphAdvance": {str(code): font["hmtx"][glyph][0] for code, glyph in cmap.items()},
        "metadata": metadata,
    }
    print(f"p{page}: {source.stat().st_size} WOFF2 bytes -> {target.stat().st_size} TTF bytes; cmap preserved")
(DESTINATION / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
