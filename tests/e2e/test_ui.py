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


def lane_header(page, lane_id):
    return page.locator(f'[data-lane="{lane_id}"]')


def drag(page, start, end):
    page.mouse.move(*start)
    page.mouse.down()
    page.mouse.move(*end, steps=8)
    page.mouse.up()


def test_full_flow(page: Page, live_server):
    chart_id = create_character(page, live_server)
    page.on("dialog", lambda d: d.accept())

    # New charts start with the five default swim lanes, top to bottom.
    expect(page.locator(".lane-name")).to_have_text(
        ["Start of turn", "Attack", "Bonus Actions", "Reactions", "Other Actions"]
    )

    # Palette came from the questionnaire.
    expect(page.locator(".card", has_text="Greataxe")).to_be_visible()
    expect(page.locator(".summary")).to_contain_text("STR +4")

    # Select the Attack lane and click cards into it; the second card lands
    # to the right of the first (which is selected after it's added).
    lane_header(page, "l2").click()
    expect(page.get_by_label("Lane name")).to_have_value("Attack")
    page.locator(".card", has_text="Greataxe").click()
    page.locator(".card", has_text="Decision?").click()
    # Bonus Actions lane: a blank card takes the lane's color.
    lane_header(page, "l3").click()
    page.locator(".card", has_text="Rage").click()
    page.locator(".card", has_text="Blank box").click()
    expect(page.locator("[data-box]")).to_have_count(4)

    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")
    data = chart_data(live_server, chart_id)
    lanes = {b["id"]: b["lane"] for b in data["boxes"]}
    assert lanes == {"b1": "l2", "b2": "l2", "b3": "l3", "b4": "l3"}
    b2 = next(b for b in data["boxes"] if b["id"] == "b2")
    b1 = next(b for b in data["boxes"] if b["id"] == "b1")
    assert b2["x"] > b1["x"] + b1["w"]
    assert next(b for b in data["boxes"] if b["id"] == "b4")["color"] == "#bfdbfe"

    # Selecting b1 suggests arrows to its right-hand neighbour (b2) and the box
    # below it in the next lane (b3); clicking one makes it real.
    page.mouse.click(*box_center(page, "b1"))
    expect(page.locator('[data-ghost][data-from="b1"][data-to="b2"]')).to_have_count(1)
    expect(page.locator('[data-ghost][data-from="b1"][data-to="b3"]')).to_have_count(1)
    # Overlapping suggestions can share screen points, so target this one directly.
    page.locator('[data-ghost][data-to="b2"] .ghost-hit').dispatch_event("pointerdown", {"button": 0})
    expect(page.locator("[data-edge]")).to_have_count(1)

    # Manual arrow across lanes: Rage (Bonus Actions) top -> Decision (Attack).
    anchor = page.locator('[data-box="b3"] [data-anchor="top"]').bounding_box()
    drag(page, (anchor["x"] + 6, anchor["y"] + 6), box_center(page, "b2"))
    expect(page.locator("[data-edge]")).to_have_count(2)

    # Drag Decision (b2) down into the Reactions lane.
    reactions = lane_header(page, "l4").bounding_box()
    x, y = box_center(page, "b2")
    drag(page, (x, y), (x, reactions["y"] + reactions["height"] / 2))

    # Resizing b1 taller grows the Attack lane and pushes later lanes down.
    page.mouse.click(*box_center(page, "b1"))
    before = lane_header(page, "l3").bounding_box()["y"]
    handle = page.locator('[data-box="b1"] [data-resize]').bounding_box()
    hx, hy = handle["x"] + 5, handle["y"] + 5
    drag(page, (hx, hy), (hx, hy + 150))
    assert lane_header(page, "l3").bounding_box()["y"] > before + 100

    # Recolor and edit text.
    page.get_by_role("button", name="Indigo").click()
    page.mouse.dblclick(*box_center(page, "b1"))
    page.locator(".box-editor").fill("Greataxe\n+5/1d12+4")
    page.keyboard.press("Control+Enter")
    expect(page.locator('[data-box="b1"]')).to_contain_text("+5/1d12+4")

    # Rename a lane from the toolbar, add one, move it up, then delete it.
    lane_header(page, "l5").click()
    page.get_by_label("Lane name").fill("Movement & Other")
    page.keyboard.press("Enter")
    expect(lane_header(page, "l5")).to_contain_text("Movement & Other")
    page.get_by_role("button", name="Add lane below").click()
    expect(page.locator(".lane-name")).to_have_count(6)
    page.get_by_role("button", name="Move lane up").click()
    expect(page.locator(".lane-name").nth(4)).to_have_text("New lane")
    page.get_by_role("button", name="Delete lane").click()
    expect(page.locator(".lane-name")).to_have_count(5)

    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")

    data = chart_data(live_server, chart_id)
    boxes = {b["id"]: b for b in data["boxes"]}
    assert boxes["b2"]["lane"] == "l4"
    assert boxes["b1"]["color"] == "#a5b4fc"
    assert boxes["b1"]["text"] == "Greataxe\n+5/1d12+4"
    assert boxes["b1"]["h"] >= 200
    assert [l["name"] for l in data["lanes"]][-1] == "Movement & Other"
    assert len(data["edges"]) == 2

    # The arrow into b2 still ends at b2's left midpoint in its new lane.
    edge = next(e for e in data["edges"] if e["from"]["box"] == "b1")
    b2_rect = page.locator('[data-box="b2"] .box-rect').bounding_box()
    end = page.evaluate(
        """id => {
          const path = document.querySelector(`[data-edge="${id}"] .edge-line`);
          const p = path.getPointAtLength(path.getTotalLength());
          const m = path.getScreenCTM();
          return [p.x * m.a + m.e, p.y * m.d + m.f];
        }""",
        edge["id"],
    )
    assert abs(end[0] - b2_rect["x"]) < 2
    assert abs(end[1] - (b2_rect["y"] + b2_rect["height"] / 2)) < 2

    # Reload: everything persisted.
    page.reload()
    expect(page.locator("[data-box]")).to_have_count(4)
    expect(page.locator("[data-edge]")).to_have_count(2)
    expect(page.locator(".lane-name").last).to_have_text("Movement & Other")

    # Deleting a lane removes its boxes and their arrows (confirm is accepted).
    lane_header(page, "l3").click()
    page.keyboard.press("Delete")
    expect(page.locator("[data-box]")).to_have_count(2)
    expect(page.locator("[data-edge]")).to_have_count(1)


def test_print_sheet_fits_page(page: Page, live_server):
    create_character(page, live_server)
    lane_header(page, "l2").click()
    page.locator(".card", has_text="Greataxe").click()
    lane_header(page, "l3").click()
    page.locator(".card", has_text="Rage").click()
    page.evaluate("window.print = () => {}")
    page.get_by_role("button", name="Print").click()
    page.emulate_media(media="print")
    sheet_svg = page.locator("#print-sheet .chart-svg")
    expect(sheet_svg).to_be_visible()
    expect(page.locator("#app")).to_be_hidden()
    expect(page.locator("#print-sheet")).to_contain_text("Barbarian")
    expect(page.locator("#print-sheet [data-box]")).to_have_count(2)
    expect(page.locator("#print-sheet .lane-name")).to_have_count(5)
    pdf = page.pdf(format="Letter", landscape=True, print_background=True, prefer_css_page_size=True)
    assert len(re.findall(rb"/Type\s*/Page(?!s)", pdf)) == 1
    if out := os.environ.get("CHARFLOW_PDF_OUT"):
        with open(out, "wb") as f:
            f.write(pdf)


def test_cards_wrap_at_page_edge(page: Page, live_server):
    chart_id = create_character(page, live_server)

    # Seven cards into one lane: five fit across the page, then they wrap.
    lane_header(page, "l2").click()
    for _ in range(7):
        page.locator(".card", has_text="Greataxe").click()
    expect(page.locator("[data-box]")).to_have_count(7)
    expect(page.locator(".page-bottom-label")).to_have_text("Bottom of the printed page")

    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")
    boxes = chart_data(live_server, chart_id)["boxes"]
    assert all(b["lane"] == "l2" for b in boxes)
    assert max(b["x"] + b["w"] for b in boxes) <= 980
    rows = sorted({b["y"] for b in boxes})
    assert len(rows) == 2
    assert sum(b["y"] == rows[0] for b in boxes) == 5

    # Dragging a box far to the right stops it at the page edge.
    last = boxes[-1]["id"]
    x, y = box_center(page, last)
    drag(page, (x, y), (x + 2000, y))
    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")
    moved = next(b for b in chart_data(live_server, chart_id)["boxes"] if b["id"] == last)
    assert moved["x"] + moved["w"] == 980


def test_box_shapes(page: Page, live_server):
    chart_id = create_character(page, live_server)

    # Lane headers are drawn as flags.
    expect(page.locator('[data-lane="l1"] path.lane-header-rect')).to_have_count(1)

    # The Decision? card starts as a diamond; other cards are rectangles.
    lane_header(page, "l2").click()
    page.locator(".card", has_text="Decision?").click()
    page.locator(".card", has_text="Greataxe").click()
    expect(page.locator('[data-box="b1"] path.box-rect')).to_have_count(1)
    expect(page.locator('[data-box="b2"] rect.box-rect')).to_have_count(1)

    # The selected box (b2) changes shape from the toolbar and grows to fit a star.
    expect(page.get_by_role("button", name="Rectangle")).to_have_attribute("aria-pressed", "true")
    page.get_by_role("button", name="Star").click()
    expect(page.get_by_role("button", name="Star")).to_have_attribute("aria-pressed", "true")
    expect(page.locator('[data-box="b2"] path.box-rect')).to_have_count(1)

    # Diamonds can change shape too.
    page.mouse.click(*box_center(page, "b1"))
    page.get_by_role("button", name="Up arrow").click()

    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")
    boxes = {b["id"]: b for b in chart_data(live_server, chart_id)["boxes"]}
    assert boxes["b1"]["shape"] == "arrow-up"
    assert boxes["b2"]["shape"] == "star"
    assert boxes["b2"]["h"] >= 140

    # Shapes survive a reload and print.
    page.reload()
    expect(page.locator('[data-box="b2"] path.box-rect')).to_have_count(1)
    page.evaluate("window.print = () => {}")
    page.get_by_role("button", name="Print").click()
    expect(page.locator("#print-sheet [data-box] path.box-rect")).to_have_count(2)
