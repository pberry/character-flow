"""Record the home page demo: a rogue's chart built from scratch.

    uv run python scripts/record_demo.py

Starts the app on a throwaway database, drives the UI with Playwright while
recording video, then uses ffmpeg to write app/static/media/demo.mp4 and a
poster frame, demo.png. Re-run it after UI changes to refresh the video.
"""

import logging
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright
from werkzeug.serving import make_server

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import create_app  # noqa: E402

MEDIA = ROOT / "app" / "static" / "media"
SIZE = {"width": 1280, "height": 800}

CHARACTER = {
    "name": "Sable Quickfingers",
    "class": "Rogue (Arcane Trickster)",
    "level": "5",
    "abilities": ["8", "18", "14", "14", "10", "12"],
    "weapons": [
        ("Rapier", "+7 to hit, 1d8+4 piercing"),
        ("Shortbow", "+7 to hit, 1d6+4, range 80/320"),
        ("Dagger", "+7 to hit, 1d4+4, thrown"),
    ],
    "spells": [
        ("Mage Hand", "Cantrip, bonus action to steer"),
        ("Booming Blade", "Cantrip, melee hit + 1d8 thunder"),
        ("Shield", "Reaction, +5 AC"),
    ],
    "features": [
        ("Sneak Attack", "3d6, once per turn"),
        ("Cunning Action", "Bonus: Dash, Disengage, Hide"),
        ("Uncanny Dodge", "Reaction, halve damage"),
        ("Expertise", "Stealth, Thieves' tools"),
    ],
}

# A visible pointer, since recorded video doesn't show the real one.
CURSOR_JS = """
addEventListener("DOMContentLoaded", () => {
  const c = document.createElement("div");
  c.style.cssText = "position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;"
    + "background:rgba(220,38,38,.35);border:2px solid rgba(220,38,38,.9);pointer-events:none;z-index:99999;"
    + "transition:transform .08s";
  c.id = "demo-cursor";
  document.body.appendChild(c);
  const move = (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; };
  addEventListener("mousemove", move, true);
  addEventListener("dragover", move, true);
  addEventListener("mousedown", () => { c.style.transform = "scale(.7)"; }, true);
  addEventListener("mouseup", () => { c.style.transform = ""; }, true);
});
"""


def serve(db_path):
    server = make_server("127.0.0.1", 0, create_app(db_path))
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}"


def center(locator):
    bb = locator.bounding_box()
    return bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2


def glide(page: Page, target, steps=15):
    """Move the pointer to a locator or point, so the viewer can follow it."""
    x, y = center(target) if not isinstance(target, tuple) else target
    page.mouse.move(x, y, steps=steps)


def click(page: Page, locator, pause=250):
    glide(page, locator)
    page.wait_for_timeout(120)
    locator.click()
    page.wait_for_timeout(pause)


def type_into(page: Page, locator, text, delay=25):
    glide(page, locator, steps=8)
    locator.click()
    locator.fill("")
    locator.type(text, delay=delay)


def drag(page: Page, start, end, steps=20):
    page.mouse.move(*start, steps=10)
    page.mouse.down()
    page.mouse.move(*end, steps=steps)
    page.mouse.up()
    page.wait_for_timeout(300)


def drag_card(page: Page, label, lane, x):
    """Drag a palette card into the lane-th lane, x pixels from the band's left edge."""
    card = page.locator(".card", has_text=label).first
    card.scroll_into_view_if_needed()
    band = page.locator(".lane-band").nth(lane)
    glide(page, card)
    target = {"x": x, "y": band.bounding_box()["height"] / 2}
    # drag_to fires the HTML5 drag events the palette listens for.
    card.drag_to(band, target_position=target, steps=20, force=True)
    page.wait_for_timeout(400)


def last_box(page: Page):
    """The box just added, pinned by id so later boxes don't change what it points at."""
    box_id = page.locator("[data-box]").last.get_attribute("data-box")
    return page.locator(f'[data-box="{box_id}"]')


def set_text(page: Page, box, text):
    page.mouse.dblclick(*center(box.locator(".box-rect")))
    editor = page.locator(".box-editor")
    editor.fill("")
    editor.type(text, delay=30)
    page.keyboard.press("Control+Enter")
    page.wait_for_timeout(300)


def connect(page: Page, src, dst, side="right"):
    """Draw an arrow from src's side anchor to the facing side of dst."""
    page.mouse.click(*center(src.locator(".box-rect")))
    page.wait_for_timeout(200)
    anchor = src.locator(f'[data-anchor="{side}"]').bounding_box()
    bb = dst.locator(".box-rect").bounding_box()
    # The arrow attaches to the side nearest the drop point.
    end = (bb["x"] + 8, bb["y"] + bb["height"] / 2) if side == "right" else (bb["x"] + bb["width"] / 2, bb["y"] + 8)
    drag(page, (anchor["x"] + anchor["width"] / 2, anchor["y"] + anchor["height"] / 2), end)


def fill_character(page: Page):
    c = CHARACTER
    type_into(page, page.get_by_placeholder("Brakka Stonefist"), c["name"])
    type_into(page, page.get_by_placeholder("Fighter"), c["class"])
    type_into(page, page.get_by_label("Level"), c["level"])
    for score, value in zip(page.get_by_label("Score").all(), c["abilities"]):
        type_into(page, score, value, delay=40)
    for title, key in (("Weapons & attacks", "weapons"), ("Spells & powers", "spells"), ("Features & abilities", "features")):
        section = page.locator("section.panel", has=page.get_by_role("heading", name=title))
        for i, (name, notes) in enumerate(c[key]):
            if i:
                click(page, section.get_by_role("button", name="+ Add"), pause=100)
            row = section.locator(".item-row").nth(i)
            row.scroll_into_view_if_needed()
            type_into(page, row.get_by_label("Name"), name, delay=15)
            type_into(page, row.get_by_label("Notes"), notes, delay=10)


def build_chart(page: Page):
    page.on("dialog", lambda d: d.accept())
    # Keep just Start of turn and Attack.
    for lane_id in ("l5", "l4", "l3"):
        click(page, page.locator(f'[data-lane="{lane_id}"]'), pause=150)
        click(page, page.get_by_role("button", name="Delete lane"), pause=300)
    expect(page.locator(".lane-name")).to_have_count(2)

    # Start of turn: the two Sneak Attack checks.
    drag_card(page, "Decision?", 0, 580)
    hidden = last_box(page)
    set_text(page, hidden, "Hidden?")
    drag_card(page, "Decision?", 0, 830)
    ally = last_box(page)
    set_text(page, ally, "Ally next to target?")

    # Attack: weapon, hit check, Sneak Attack.
    drag_card(page, "Rapier", 1, 330)
    rapier = last_box(page)
    drag_card(page, "Decision?", 1, 580)
    hit = last_box(page)
    set_text(page, hit, "Hit?")
    drag_card(page, "Sneak Attack", 1, 830)
    sneak = last_box(page)

    connect(page, rapier, hit)
    connect(page, hit, sneak)
    connect(page, hidden, ally)
    connect(page, ally, sneak, side="bottom")

    page.mouse.click(1240, 760)  # deselect, so the finished chart is clean
    click(page, page.get_by_role("button", name="Save"), pause=300)
    expect(page.locator(".status")).to_have_text("Saved")
    glide(page, (1200, 120), steps=20)
    page.wait_for_timeout(2500)


def record(base, video_dir, poster):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        context = browser.new_context(viewport=SIZE, record_video_dir=video_dir, record_video_size=SIZE)
        context.add_init_script(CURSOR_JS)
        page = context.new_page()

        page.goto(base)
        page.wait_for_timeout(800)
        type_into(page, page.get_by_label("New chart name"), "Sable", delay=60)
        click(page, page.get_by_role("button", name="Create chart"))
        expect(page.get_by_text("Tell me about your character")).to_be_visible()
        fill_character(page)
        click(page, page.get_by_role("button", name="Save & open flowchart →"))
        expect(page.get_by_text("Bookmark your chart")).to_be_visible()
        page.wait_for_timeout(600)
        click(page, page.get_by_role("button", name="Done"))

        build_chart(page)
        page.screenshot(path=poster, style="#demo-cursor { display: none; }")
        video = page.video.path()
        context.close()
        browser.close()
    return video


def main():
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg is required: brew install ffmpeg")
    MEDIA.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        server, base = serve(str(Path(tmp) / "demo.db"))
        try:
            webm = record(base, tmp, str(MEDIA / "demo.png"))
        finally:
            server.shutdown()
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", webm,
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "slow",
             "-movflags", "+faststart", "-an", str(MEDIA / "demo.mp4")],
            check=True,
        )
    for name in ("demo.mp4", "demo.png"):
        print(f"{MEDIA / name}: {(MEDIA / name).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
