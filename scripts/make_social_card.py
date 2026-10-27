"""Draw the link preview image: app/static/media/social-card.png.

    uv run python scripts/make_social_card.py

Slack, Discord, and social sites show it for every Character Flow link,
including view links (their keys are in the fragment, which unfurlers never
see). It crops the chart out of demo.png, so re-run this after record_demo.py.
"""

import base64
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "app" / "static" / "media"
# 1.91:1, the size Facebook, LinkedIn, Slack, and Discord all show uncropped.
SIZE = {"width": 1200, "height": 630}
# The chart's lanes in demo.png (1280x800), left of the page-bottom guide.
CHART = {"x": 262, "y": 112, "w": 904, "h": 212}
SCALE = 1.2

CARD = """<!doctype html>
<html><head><meta charset="utf-8"><style>
  body {{ margin: 0; width: 1200px; height: 630px; box-sizing: border-box; padding: 56px;
         background: #f6f5f2; color: #1f2328; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }}
  h1 {{ margin: 0; font-size: 72px; line-height: 1.1; color: #7a2e2e; letter-spacing: -1px; }}
  p {{ margin: 14px 0 0; font-size: 34px; line-height: 1.3; }}
  .muted {{ margin-top: 8px; font-size: 26px; color: #6b6f76; }}
  .chart {{ margin-top: 36px; width: {w}px; height: {h}px; border: 1px solid #e3e0d8; border-radius: 12px;
            background: #fff url(data:image/png;base64,{png}) -{x}px -{y}px / {bw}px {bh}px no-repeat; }}
</style></head><body>
  <h1>Character Flow</h1>
  <p>A one-page combat flowchart for your tabletop RPG character.</p>
  <p class="muted">Free · No account · Prints on one sheet for the table</p>
  <div class="chart"></div>
</body></html>
"""


def main():
    demo = MEDIA / "demo.png"
    if not demo.exists():
        sys.exit(f"{demo} is missing; run scripts/record_demo.py first")
    html = CARD.format(
        png=base64.b64encode(demo.read_bytes()).decode(),
        x=round(CHART["x"] * SCALE), y=round(CHART["y"] * SCALE),
        w=round(CHART["w"] * SCALE), h=round(CHART["h"] * SCALE),
        bw=round(1280 * SCALE), bh=round(800 * SCALE),
    )
    out = MEDIA / "social-card.png"
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(viewport=SIZE)
        page.set_content(html)
        page.screenshot(path=str(out))
        browser.close()
    print(f"{out}: {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
