"""Browser tests for the main flow. Run with `uv run pytest tests/e2e`
(uses installed Google Chrome by default, see pyproject.toml; or run
`uv run playwright install chromium` and drop that option)."""

import json
import os
import re
import urllib.request

from playwright.sync_api import Page, expect


def chart_data(base, chart_id):
    with urllib.request.urlopen(f"{base}/api/charts/{chart_id}") as resp:
        return json.load(resp)["data"]


def box_center(page, box_id):
    bb = page.locator(f'[data-box="{box_id}"] .box-rect').bounding_box()
    return bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2


def create_character(page: Page, base):
    page.goto(base)
    page.get_by_label("New chart name").fill("Brakka")
    page.get_by_role("button", name="Create chart").click()
    expect(page.get_by_text("Tell me about your character")).to_be_visible()
    page.get_by_placeholder("Brakka Stonefist").fill("Brakka")
    page.get_by_placeholder("Fighter").fill("Barbarian")
    page.get_by_label("Score").first.fill("18")
    expect(page.locator(".mod").first).to_have_text("+4")
    page.get_by_placeholder("Longsword").fill("Greataxe")
    page.get_by_placeholder("+5 to hit, 1d8+3 slashing").fill("1d12+4")
    page.get_by_placeholder("Second Wind").fill("Rage")
    page.get_by_role("button", name="Save & open flowchart →").click()
    expect(page.locator(".chart-name")).to_have_text("Brakka")
    return int(page.url.rsplit("/", 1)[-1])


def test_full_flow(page: Page, live_server):
    chart_id = create_character(page, live_server)

    # Palette came from the questionnaire.
    expect(page.locator(".card", has_text="Greataxe")).to_be_visible()
    expect(page.locator(".summary")).to_contain_text("STR +4")

    # Click-to-add three cards; each lands right of the selected box.
    page.locator(".card", has_text="Start of turn").click()
    page.locator(".card", has_text="Rage").click()
    page.locator(".card", has_text="Greataxe").click()
    expect(page.locator("[data-box]")).to_have_count(3)

    # Selecting the middle box suggests arrows; clicking one makes it real.
    x, y = box_center(page, "b2")
    page.mouse.click(x, y)
    expect(page.locator("[data-ghost]")).not_to_have_count(0)
    page.locator("[data-ghost] .ghost-hit").first.click(force=True)
    expect(page.locator("[data-edge]")).to_have_count(1)

    # Manually connect b2 -> b3 by dragging from b2's right anchor.
    anchor = page.locator('[data-box="b2"] [data-anchor="right"]').bounding_box()
    tx, ty = box_center(page, "b3")
    page.mouse.move(anchor["x"] + 6, anchor["y"] + 6)
    page.mouse.down()
    page.mouse.move(tx, ty, steps=5)
    page.mouse.up()
    expect(page.locator("[data-edge]")).to_have_count(2)

    # Moving a box keeps the arrow attached to its new left midpoint.
    x, y = box_center(page, "b3")
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 40, y + 120, steps=5)
    page.mouse.up()

    # Recolor and edit text.
    page.get_by_role("button", name="Blue").click()
    page.mouse.dblclick(*box_center(page, "b3"))
    page.locator(".box-editor").fill("Greataxe\nReckless Attack")
    page.keyboard.press("Control+Enter")
    expect(page.locator('[data-box="b3"]')).to_contain_text("Reckless Attack")

    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")

    data = chart_data(live_server, chart_id)
    b3 = next(b for b in data["boxes"] if b["id"] == "b3")
    assert b3["color"] == "#bfdbfe"
    assert b3["text"] == "Greataxe\nReckless Attack"
    assert len(data["edges"]) == 2
    edge_to_b3 = next(e for e in data["edges"] if e["to"]["box"] == "b3")
    assert edge_to_b3["from"] == {"box": "b2", "side": "right"}

    # The rendered arrow ends at b3's left midpoint after the move.
    end = page.evaluate(
        """() => {
          const p = document.querySelector('[data-edge="%s"] .edge-line').getAttribute('d');
          return p.trim().split(/[ML ]+/).filter(Boolean).slice(-2).map(Number);
        }""" % edge_to_b3["id"]
    )
    assert end == [b3["x"], b3["y"] + b3["h"] / 2]

    # Reload: everything persisted.
    page.reload()
    expect(page.locator("[data-box]")).to_have_count(3)
    expect(page.locator("[data-edge]")).to_have_count(2)

    # Delete selected edge with the keyboard.
    page.locator(f'[data-edge="{edge_to_b3["id"]}"] .edge-hit').click(force=True)
    page.keyboard.press("Delete")
    expect(page.locator("[data-edge]")).to_have_count(1)


def test_print_sheet_fits_page(page: Page, live_server):
    create_character(page, live_server)
    page.locator(".card", has_text="Start of turn").click()
    page.locator(".card", has_text="Greataxe").click()
    page.evaluate("window.print = () => {}")
    page.get_by_role("button", name="Print").click()
    page.emulate_media(media="print")
    sheet_svg = page.locator("#print-sheet .chart-svg")
    expect(sheet_svg).to_be_visible()
    expect(page.locator("#app")).to_be_hidden()
    expect(page.locator("#print-sheet")).to_contain_text("Barbarian")
    expect(page.locator("#print-sheet [data-box]")).to_have_count(2)
    pdf = page.pdf(format="Letter", landscape=True, print_background=True, prefer_css_page_size=True)
    assert len(re.findall(rb"/Type\s*/Page(?!s)", pdf)) == 1
    if out := os.environ.get("CHARFLOW_PDF_OUT"):
        with open(out, "wb") as f:
            f.write(pdf)
