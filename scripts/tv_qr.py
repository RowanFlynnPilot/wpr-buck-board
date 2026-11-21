"""QR codes for the counter TV slideshow (#/tv), one per location, written as small SVGs to
web/public/tv-qr/<slug>.svg, which the TV page picks by its ?at= address. Each opens WPR's Brag
Board page tagged ref=tv-<slug> (the general one ref=tv), so TV scans are counted apart from the
printed counter cards (ref=<slug>). Each code is also drawn and read back before it's kept. Needs Python with segno, zxing-cpp and
Pillow. A new location: add its slug to LOCATIONS here and in web/src/views/Tv.tsx, then run

    python scripts/tv_qr.py
"""
import os
import sys

import segno
import zxingcpp
from PIL import Image

import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "web", "public", "tv-qr")
BOARD = "https://wausaupilotandreview.com/wausau-pilot-hunting-brag-board/"
# "tv" is the general code; the rest match a sponsor's qr_slug (the counter cards use the same).
LOCATIONS = ["tv", "angelos-family-pizza", "burks-bar"]

os.makedirs(OUT, exist_ok=True)
ok = True
for slug in LOCATIONS:
    url = f"{BOARD}?ref={'tv' if slug == 'tv' else 'tv-' + slug}"
    qr = segno.make(url, error="m")
    svg = os.path.join(OUT, f"{slug}.svg")
    qr.save(svg, kind="svg", dark="#1e2622", light="#ffffff", border=4, omitsize=True, xmldecl=False)
    png = os.path.join(tempfile.gettempdir(), f"tv-qr-{slug}.png")
    qr.save(png, kind="png", scale=8, border=4)
    found = [b.text for b in zxingcpp.read_barcodes(Image.open(png))]
    good = found == [url]
    ok &= good
    print(f"{'ok  ' if good else 'FAIL'} {slug}: v{qr.version}, {os.path.getsize(svg)} bytes, reads {found}")
sys.exit(0 if ok else 1)
