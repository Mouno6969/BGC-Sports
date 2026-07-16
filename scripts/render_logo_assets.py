from pathlib import Path

import cairosvg

ROOT = Path(__file__).resolve().parents[1]
SVG = ROOT / "frontend" / "public" / "logo.svg"
PUBLIC = ROOT / "frontend" / "public"

for size, filename in ((512, "logo.png"), (192, "logo-192.png"), (512, "logo-512.png")):
    cairosvg.svg2png(
        url=str(SVG),
        write_to=str(PUBLIC / filename),
        output_width=size,
        output_height=size,
    )

print("Rendered logo.png, logo-192.png, and logo-512.png from logo.svg")
