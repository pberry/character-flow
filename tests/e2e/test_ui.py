"""Browser tests for the main flow. Run with `uv run pytest tests/e2e`
(uses installed Google Chrome by default, see pyproject.toml; or run
`uv run playwright install chromium` and drop that option)."""

import json
import os
import re
import urllib.request

from playwright.sync_api import Page, expect


def chart_data(base, edit_key):
    with urllib.request.urlopen(f"{base}/api/edit/{edit_key}") as resp:
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
    # A new chart opens with its links, since they're the only way back to it.
    expect(page.get_by_text("Bookmark your chart")).to_be_visible()
    page.get_by_role("button", name="Done").click()
    assert re.search(r"#/edit/[\w-]{22,}$", page.url)
    return page.url.rsplit("/", 1)[-1]


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


def test_print_notes(page: Page, live_server):
    create_character(page, live_server)
    page.evaluate("window.print = () => {}")
    # No notes: no strip, and the full-height page guide.
    page.get_by_role("button", name="Print").click()
    expect(page.locator("#print-sheet .print-notes")).to_have_count(0)
    expect(page.locator("#print-sheet")).not_to_contain_text("null")
    expect(page.locator(".page-bottom-label")).to_have_text("Bottom of the printed page")
    full_h = float(page.locator(".page-bottom").get_attribute("y1"))

    # Notes from the questionnaire print under the chart, even long ones on one page.
    page.get_by_role("link", name="Edit character").click()
    long_notes = "Stay at range; Luck before saves.\n" + "Rage when two or more enemies are adjacent. " * 30
    page.get_by_placeholder("Tactics, personality, anything to remember in a fight").fill(long_notes)
    page.get_by_role("button", name="Save & open flowchart →").click()
    expect(page.locator(".page-bottom-label")).to_have_text("Bottom of the printed page (notes print below)")
    assert float(page.locator(".page-bottom").get_attribute("y1")) < full_h

    page.evaluate("window.print = () => {}")
    page.get_by_role("button", name="Print").click()
    notes = page.locator("#print-sheet .print-notes")
    expect(notes).to_contain_text("Stay at range; Luck before saves.")
    page.emulate_media(media="print")
    svg = page.locator("#print-sheet .chart-svg").bounding_box()
    box = notes.bounding_box()
    assert abs(svg["height"] - 6 * 96) < 2, "the chart gives up the strip's height"
    assert box["y"] >= svg["y"] + svg["height"] - 1, "notes sit under the chart"
    pdf = page.pdf(format="Letter", landscape=True, print_background=True, prefer_css_page_size=True)
    assert len(re.findall(rb"/Type\s*/Page(?!s)", pdf)) == 1


def test_print_portrait(page: Page, live_server):
    chart_id = create_character(page, live_server)
    expect(page.get_by_role("button", name="Landscape")).to_have_attribute("aria-pressed", "true")
    landscape_h = float(page.locator(".page-bottom").get_attribute("y1"))

    # Portrait moves the page-bottom guide down, and saves with the chart.
    page.get_by_role("button", name="Portrait").click()
    expect(page.get_by_role("button", name="Portrait")).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_role("button", name="Landscape")).to_have_attribute("aria-pressed", "false")
    assert float(page.locator(".page-bottom").get_attribute("y1")) > 1.8 * landscape_h
    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")
    assert chart_data(live_server, chart_id)["orientation"] == "portrait"
    page.reload()
    expect(page.get_by_role("button", name="Portrait")).to_have_attribute("aria-pressed", "true")

    # It prints on one portrait page, the chart filling the page width.
    page.evaluate("window.print = () => {}")
    page.get_by_role("button", name="Print").click()
    expect(page.locator("#print-sheet")).to_have_class(re.compile(r"\bportrait\b"))
    page.emulate_media(media="print")
    svg = page.locator("#print-sheet .chart-svg").bounding_box()
    assert abs(svg["width"] - 7.7 * 96) < 2
    assert abs(svg["height"] - 9.3 * 96) < 2
    pdf = page.pdf(print_background=True, prefer_css_page_size=True)
    assert len(re.findall(rb"/Type\s*/Page(?!s)", pdf)) == 1
    width, height = map(float, re.search(rb"/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)", pdf).groups())
    assert (round(width), round(height)) == (612, 792), "letter portrait"

    # Back to landscape for the next print.
    page.emulate_media(media="screen")
    page.get_by_role("button", name="Landscape").click()
    page.get_by_role("button", name="Print").click()
    expect(page.locator("#print-sheet")).not_to_have_class(re.compile(r"\bportrait\b"))
    page.emulate_media(media="print")
    pdf = page.pdf(print_background=True, prefer_css_page_size=True)
    width, height = map(float, re.search(rb"/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)", pdf).groups())
    assert (round(width), round(height)) == (792, 612), "letter landscape"


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


def test_badges(page: Page, live_server):
    chart_id = create_character(page, live_server)
    answers = []
    page.on("dialog", lambda d: d.accept(answers.pop(0)) if answers else d.dismiss())

    lane_header(page, "l3").click()
    page.locator(".card", has_text="Rage").click()

    # Add a cost, a recharge, and a second recharge badge to the selected box.
    answers.extend(["1 FP", "SR", "LR"])
    page.get_by_role("button", name="Add cost badge").click()
    page.get_by_role("button", name="Add recharge badge").click()
    page.get_by_role("button", name="Add recharge badge").click()
    expect(page.locator('[data-box="b1"] [data-badge]')).to_have_count(3)
    expect(page.locator('[data-box="b1"] .badge-cost .badge-text')).to_have_text("1 FP")

    # The cost badge sits on the top-right corner.
    box = page.locator('[data-box="b1"] .box-rect').bounding_box()
    badge = page.locator('[data-box="b1"] .badge-cost .badge-shape').bounding_box()
    assert abs(badge["x"] + badge["width"] / 2 - (box["x"] + box["width"])) < 3
    assert abs(badge["y"] + badge["height"] / 2 - box["y"]) < 3

    # Double-click a badge to edit it; remove one from the toolbar.
    answers.append("2 FP")
    x, y = (badge["x"] + badge["width"] / 2, badge["y"] + badge["height"] / 2)
    page.mouse.dblclick(x, y)
    expect(page.locator('[data-box="b1"] .badge-cost .badge-text')).to_have_text("2 FP")
    # The badge is now selected; Escape goes back to its box.
    page.keyboard.press("Escape")
    page.get_by_role("button", name="Remove recharge badge SR").click()
    expect(page.locator('[data-box="b1"] [data-badge]')).to_have_count(2)

    # Cancelling the prompt adds nothing.
    page.get_by_role("button", name="Add duration badge").click()
    expect(page.locator('[data-box="b1"] [data-badge]')).to_have_count(2)

    # Click a badge to select it, then give it a color and change it back.
    cost = page.locator('[data-box="b1"] .badge-cost')
    cost.click()
    expect(page.locator(".toolbar")).to_contain_text("Cost badge")
    expect(cost).to_have_class(re.compile(r"\bselected\b"))
    expect(page.get_by_label("Badge text")).to_have_value("2 FP")
    page.get_by_role("button", name="Green", exact=True).click()
    expect(cost.locator(".badge-shape")).to_have_attribute("fill", "#bbf7d0")
    page.get_by_role("button", name="Default color").click()
    expect(cost.locator(".badge-shape")).to_have_attribute("fill", "#c7d2fe")
    page.get_by_role("button", name="Blue", exact=True).click()
    # Edit its text from the toolbar.
    page.get_by_label("Badge text").fill("3 FP")
    page.keyboard.press("Enter")
    expect(cost.locator(".badge-text")).to_have_text("3 FP")
    # Escape goes back to the box; a chip selects the badge again.
    page.keyboard.press("Escape")
    expect(page.get_by_role("button", name="Delete box")).to_be_visible()
    page.get_by_role("button", name="Select recharge badge LR").click()
    expect(page.locator(".toolbar")).to_contain_text("Recharge badge")
    # Delete removes only the badge; the box stays and is selected.
    page.keyboard.press("Delete")
    expect(page.locator('[data-box="b1"] [data-badge]')).to_have_count(1)
    expect(page.get_by_role("button", name="Delete box")).to_be_visible()
    answers.append("LR")
    page.get_by_role("button", name="Add recharge badge").click()

    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")
    box_data = chart_data(live_server, chart_id)["boxes"][0]
    assert box_data["badges"] == [{"type": "cost", "text": "3 FP", "color": "#bfdbfe"}, {"type": "recharge", "text": "LR"}]

    # Badges survive a reload and print.
    page.reload()
    expect(page.locator('[data-box="b1"] [data-badge]')).to_have_count(2)
    page.evaluate("window.print = () => {}")
    page.get_by_role("button", name="Print").click()
    expect(page.locator("#print-sheet .badge")).to_have_count(2)
    expect(page.locator("#print-sheet .badge-cost .badge-shape")).to_have_attribute("fill", "#bfdbfe")


def test_lane_header_badges(page: Page, live_server):
    chart_id = create_character(page, live_server)
    answers = []
    page.on("dialog", lambda d: d.accept(answers.pop(0)) if answers else d.dismiss())

    lane_header(page, "l1").click()
    answers.extend(["1/turn", "10 min"])
    page.get_by_role("button", name="Add cost badge").click()
    page.get_by_role("button", name="Add duration badge").click()
    header = page.locator('#app [data-lane="l1"]')
    expect(header.locator("[data-badge]")).to_have_count(2)

    # The badges stay inside the lane and left of the boxes.
    band = page.locator("#app .lane-band").first.bounding_box()
    for i in range(2):
        b = header.locator(f'[data-badge="{i}"] .badge-shape').bounding_box()
        assert b["y"] >= band["y"] - 1 and b["y"] + b["height"] <= band["y"] + band["height"] + 1
        assert b["x"] >= band["x"] - 1

    # Clicking a header badge selects it; double-clicking edits it.
    header.locator('[data-badge="0"]').click()
    expect(page.locator(".toolbar")).to_contain_text("Cost badge")
    page.get_by_role("button", name="Pink", exact=True).click()
    answers.append("2/turn")
    b = header.locator('[data-badge="0"] .badge-shape').bounding_box()
    page.mouse.dblclick(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
    expect(header.locator('[data-badge="0"] .badge-text')).to_have_text("2/turn")
    page.keyboard.press("Escape")
    expect(page.get_by_label("Lane name")).to_have_value("Start of turn")

    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")
    lane = chart_data(live_server, chart_id)["lanes"][0]
    assert lane["badges"] == [{"type": "cost", "text": "2/turn", "color": "#fbcfe8"}, {"type": "duration", "text": "10 min"}]

    page.reload()
    expect(page.locator('#app [data-lane="l1"] [data-badge]')).to_have_count(2)
    page.evaluate("window.print = () => {}")
    page.get_by_role("button", name="Print").click()
    expect(page.locator('#print-sheet [data-lane="l1"] .badge')).to_have_count(2)


def test_side_column(page: Page, live_server):
    chart_id = create_character(page, live_server)
    answers = []
    page.on("dialog", lambda d: d.accept(answers.pop(0)) if answers else d.accept())

    # A box near the right edge gets pulled in when the column narrows the lanes.
    lane_header(page, "l2").click()
    for _ in range(5):
        page.locator(".card", has_text="Greataxe").click()
    page.keyboard.press("Escape")

    expect(page.locator("[data-section]")).to_have_count(0)
    page.get_by_role("button", name="Add side column").click()
    expect(page.locator("[data-section]")).to_have_count(4)
    expect(page.locator(".section-name")).to_have_text(["Gear", "Resources", "Healing", "Conditions"])
    expect(page.get_by_role("button", name="Add side column")).to_have_count(0)
    # With nothing selected, the toolbar doesn't show a stray "null" for the hidden button.
    page.keyboard.press("Escape")
    expect(page.locator(".toolbar")).not_to_contain_text("null")

    # Add an item to Resources and type its text in place.
    page.locator('[data-section="s2"]').click()
    expect(page.get_by_label("Section name")).to_have_value("Resources")
    page.get_by_role("button", name="Add item", exact=True).click()
    page.locator(".box-editor").fill("Focus Points")
    page.keyboard.press("Control+Enter")
    expect(page.locator('[data-item="t1"]')).to_contain_text("Focus Points")

    # Three tick circles and a recharge badge.
    for _ in range(3):
        page.get_by_role("button", name="More tick circles").click()
    expect(page.locator('[data-item="t1"] .tick')).to_have_count(3)
    page.get_by_role("button", name="Fewer tick circles").click()
    expect(page.locator('[data-item="t1"] .tick')).to_have_count(2)
    answers.append("SR")
    page.get_by_role("button", name="Add recharge badge").click()
    expect(page.locator('[data-item="t1"] [data-badge]')).to_have_count(1)

    # Color the item.
    expect(page.locator('[data-item="t1"] .item-rect')).to_have_attribute("fill", "#fff")
    page.get_by_role("button", name="Red", exact=True).click()
    expect(page.locator('[data-item="t1"] .item-rect')).to_have_attribute("fill", "#fecaca")

    # A second item below it, then rename the section.
    page.get_by_role("button", name="Add item below").click()
    page.locator(".box-editor").fill("Luck Points")
    page.keyboard.press("Control+Enter")
    page.locator('[data-section="s2"]').click()
    page.get_by_label("Section name").fill("Pools")
    page.keyboard.press("Enter")
    expect(page.locator('[data-section="s2"] .section-name')).to_have_text("Pools")

    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")
    data = chart_data(live_server, chart_id)
    pools = data["sidebar"]["sections"][1]
    assert pools["name"] == "Pools"
    assert pools["items"] == [
        {"id": "t1", "text": "Focus Points", "count": 2, "badges": [{"type": "recharge", "text": "SR"}], "color": "#fecaca"},
        {"id": "t2", "text": "Luck Points", "count": 0, "badges": []},
    ]
    # The fifth box no longer fit across the row and was pulled in from the edge.
    assert max(b["x"] + b["w"] for b in data["boxes"]) <= 780

    # The column survives a reload and prints.
    page.reload()
    expect(page.locator("[data-item]")).to_have_count(2)
    page.evaluate("window.print = () => {}")
    page.get_by_role("button", name="Print").click()
    expect(page.locator("#print-sheet .tracker-item")).to_have_count(2)
    expect(page.locator('#print-sheet [data-item="t1"] .item-rect')).to_have_attribute("fill", "#fecaca")
    page.emulate_media(media="print")
    pdf = page.pdf(format="Letter", landscape=True, print_background=True, prefer_css_page_size=True)
    assert len(re.findall(rb"/Type\s*/Page(?!s)", pdf)) == 1
    page.emulate_media(media="screen")

    # Removing the column (confirmed) gives the lanes their width back.
    page.locator("#app .side-band").click(position={"x": 100, "y": 5})
    page.get_by_role("button", name="Remove side column").click()
    expect(page.locator("#app [data-section]")).to_have_count(0)
    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")
    assert chart_data(live_server, chart_id)["sidebar"] is None


def test_groups(page: Page, live_server):
    chart_id = create_character(page, live_server)
    answers = []
    page.on("dialog", lambda d: d.accept(answers.pop(0)) if answers else d.accept())

    lane_header(page, "l2").click()
    for _ in range(3):
        page.locator(".card", has_text="Greataxe").click()

    # Shift-click builds a multi-selection; "Group" draws a bracket around it.
    page.mouse.click(*box_center(page, "b1"))
    page.keyboard.down("Shift")
    page.mouse.click(*box_center(page, "b2"))
    page.keyboard.up("Shift")
    expect(page.locator(".toolbar")).to_contain_text("2 boxes selected")
    expect(page.locator('[data-box="b1"].selected, [data-box="b2"].selected')).to_have_count(2)
    page.get_by_role("button", name="Group", exact=True).click()
    expect(page.locator("[data-group]")).to_have_count(1)
    expect(page.get_by_role("button", name="Bracket")).to_have_attribute("aria-pressed", "true")

    # The bracket surrounds both boxes.
    line = page.locator('[data-group="g1"] .group-line').bounding_box()
    b1 = page.locator('[data-box="b1"] .box-rect').bounding_box()
    b2 = page.locator('[data-box="b2"] .box-rect').bounding_box()
    assert line["x"] < b1["x"] and line["x"] + line["width"] > b2["x"] + b2["width"]
    assert line["y"] < b1["y"] and line["y"] + line["height"] > b1["y"] + b1["height"]

    # Label, style, and adding the third box with shift-click while the group is selected.
    page.get_by_label("Group label").fill("While raging")
    page.keyboard.press("Enter")
    expect(page.locator('[data-group="g1"] .group-label')).to_have_text("While raging")
    page.get_by_role("button", name="Outline").click()
    page.keyboard.down("Shift")
    page.mouse.click(*box_center(page, "b3"))
    page.keyboard.up("Shift")
    expect(page.locator(".toolbar")).to_contain_text("3 boxes")

    # The group follows a box when it moves.
    before = page.locator('[data-group="g1"] .group-line').bounding_box()
    x, y = box_center(page, "b3")
    drag(page, (x, y), (x, y + 120))
    after = page.locator('[data-group="g1"] .group-line').bounding_box()
    assert after["height"] > before["height"] + 60

    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")
    data = chart_data(live_server, chart_id)
    assert data["groups"] == [{"id": "g1", "boxes": ["b1", "b2", "b3"], "label": "While raging", "style": "outline"}]

    # Selecting changes the toolbar's height, but the chart stays still on screen.
    box_before = page.locator('[data-box="b1"] .box-rect').bounding_box()
    page.mouse.click(*box_center(page, "b1"))
    expect(page.get_by_role("button", name="Delete box")).to_be_visible()
    lane_header(page, "l1").click()
    expect(page.get_by_label("Lane name")).to_be_visible()
    box_after = page.locator('[data-box="b1"] .box-rect').bounding_box()
    assert abs(box_after["y"] - box_before["y"]) < 1

    # Clicking the group's line selects it; double-clicking edits the label.
    answers.append("While attuned")
    gl = page.locator('[data-group="g1"] .group-line').bounding_box()
    page.mouse.dblclick(gl["x"] + gl["width"] / 3, gl["y"] + gl["height"] - 1)
    expect(page.locator('[data-group="g1"] .group-label')).to_have_text("While attuned")
    expect(page.locator(".toolbar")).to_contain_text("Ungroup")

    # Prints, then ungroup leaves the boxes.
    page.evaluate("window.print = () => {}")
    page.get_by_role("button", name="Print").click()
    expect(page.locator("#print-sheet .group")).to_have_count(1)
    page.get_by_role("button", name="Ungroup").click()
    expect(page.locator("#app [data-group]")).to_have_count(0)
    expect(page.locator("#app [data-box]")).to_have_count(3)


def test_arrow_keys_nudge_boxes(page: Page, live_server):
    chart_id = create_character(page, live_server)
    lane_header(page, "l2").click()
    page.locator(".card", has_text="Greataxe").click()
    page.locator(".card", has_text="Rage").click()
    start = {b["id"]: b for b in chart_data_after_save(page, live_server, chart_id)["boxes"]}

    # One grid step per arrow press, five with Shift.
    page.mouse.click(*box_center(page, "b1"))
    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Shift+ArrowDown")
    b1 = {b["id"]: b for b in chart_data_after_save(page, live_server, chart_id)["boxes"]}["b1"]
    assert (b1["x"], b1["y"], b1["lane"]) == (start["b1"]["x"] + 10, start["b1"]["y"] + 60, "l2")

    # A multi-selection moves together.
    page.keyboard.down("Shift")
    page.mouse.click(*box_center(page, "b2"))
    page.keyboard.up("Shift")
    page.keyboard.press("ArrowLeft")
    boxes = {b["id"]: b for b in chart_data_after_save(page, live_server, chart_id)["boxes"]}
    assert boxes["b1"]["x"] == start["b1"]["x"]
    assert boxes["b2"]["x"] == start["b2"]["x"] - 10

    # Lanes don't move.
    lane_header(page, "l2").click()
    page.keyboard.press("ArrowDown")
    data = chart_data_after_save(page, live_server, chart_id)
    assert [lane["id"] for lane in data["lanes"]][:2] == ["l1", "l2"]
    assert {b["id"]: b for b in data["boxes"]} == boxes


def chart_data_after_save(page, base, chart_id):
    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")
    return chart_data(base, chart_id)


def test_links_home_list_and_view_page(page: Page, live_server):
    edit_key = create_character(page, live_server)
    page.on("dialog", lambda d: d.accept() if d.type != "prompt" else d.accept("Brakka (copy)"))
    lane_header(page, "l2").click()
    page.locator(".card", has_text="Greataxe").click()
    page.get_by_role("button", name="Save").click()
    expect(page.locator(".status")).to_have_text("Saved")

    # The Links dialog shows both links; the view link is a different key.
    page.get_by_role("button", name="Links").click()
    edit_link = page.get_by_label("Edit link").input_value()
    view_link = page.get_by_label("View link").input_value()
    assert edit_link.endswith(f"#/edit/{edit_key}")
    view_key = view_link.rsplit("/", 1)[-1]
    assert view_key != edit_key
    page.get_by_role("button", name="Done").click()

    # Home lists the chart from this browser, and nothing else.
    page.get_by_role("link", name="← Home").click()
    expect(page.locator(".chart-link")).to_have_text(["Brakka"])

    # The view page draws the chart with no editing controls, and the old id URLs go home.
    page.goto(view_link)
    expect(page.locator(".view-sheet [data-box]")).to_have_count(1)
    expect(page.get_by_text("View only")).to_be_visible()
    expect(page.get_by_role("button", name="Edit character")).to_have_count(0)
    expect(page.locator(".palette")).to_have_count(0)
    expect(page.locator(".view-sheet")).not_to_contain_text("edit")
    assert edit_key not in page.content()

    # "Make a copy" opens a new, separately editable chart.
    page.get_by_role("button", name="Make a copy").click()
    expect(page.get_by_text("Bookmark your chart")).to_be_visible()
    page.get_by_role("button", name="Done").click()
    copy_key = page.url.rsplit("/", 1)[-1]
    assert copy_key not in (edit_key, view_key)
    expect(page.locator(".chart-name")).to_have_text("Brakka (copy)")
    assert len(chart_data(live_server, copy_key)["boxes"]) == 1

    page.goto(f"{live_server}/#/chart/1")
    expect(page.get_by_role("button", name="Create chart")).to_be_visible()


def test_deleted_chart_leaves_home_list(page: Page, live_server):
    edit_key = create_character(page, live_server)
    page.on("dialog", lambda d: d.accept("Renamed"))
    page.get_by_role("link", name="← Home").click()
    expect(page.locator(".chart-link")).to_have_count(1)
    req = urllib.request.Request(f"{live_server}/api/edit/{edit_key}", method="DELETE")
    urllib.request.urlopen(req)
    page.get_by_role("button", name="Rename").click()
    expect(page.locator(".error")).to_contain_text("no longer exists")
    expect(page.locator(".chart-link")).to_have_count(0)


def test_no_html_injection_sinks():
    """Chart text from strangers shows up on view pages, so it must never be
    parsed as HTML (it could read edit links from localStorage)."""
    js = os.path.join(os.path.dirname(__file__), "..", "..", "app", "static", "js")
    for name in os.listdir(js):
        source = open(os.path.join(js, name)).read()
        for sink in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("):
            assert sink not in source, f"{sink} in {name}"


def test_home_page_explains_itself(page: Page, live_server):
    page.goto(live_server)
    expect(page.get_by_role("heading", name="Character Flow")).to_be_visible()
    for heading in ("Start a chart", "How it works", "Who it's for", "No accounts. Your link is your key."):
        expect(page.get_by_role("heading", name=heading)).to_be_visible()
    # Nothing from other people, and no empty recent section.
    expect(page.locator(".recent")).to_be_hidden()
    assert "Character Flow" in page.title()
    assert page.locator('meta[name="description"]').get_attribute("content")


def test_home_page_demo_video(page: Page, live_server):
    page.goto(live_server)
    video = page.locator(".media video")
    expect(video).to_have_attribute("src", "/static/media/demo.mp4")
    expect(video).to_have_attribute("aria-label", re.compile("Sable Quickfingers"))
    # Plays silently on a loop, like a GIF, and the files are actually served.
    assert video.evaluate("v => v.muted && v.loop && v.autoplay")
    page.wait_for_function("document.querySelector('.media video').readyState >= 2")
    for path in ("/static/media/demo.mp4", "/static/media/demo.png"):
        assert page.request.get(live_server + path).ok


def test_home_page_demo_video_respects_reduced_motion(page: Page, live_server):
    page.emulate_media(reduced_motion="reduce")
    page.goto(live_server)
    video = page.locator(".media video")
    expect(video).to_have_attribute("poster", "/static/media/demo.png")
    assert video.evaluate("v => !v.autoplay && v.paused")


def test_faq_page_from_home_footer(page: Page, live_server):
    page.goto(live_server)
    page.locator(".site-footer").get_by_role("link", name="FAQ").click()
    expect(page.get_by_role("heading", name="Frequently asked questions")).to_be_visible()
    # Same stylesheet as the app, and the brand leads back home.
    assert page.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(246, 245, 242)"
    page.get_by_role("link", name="Character Flow").click()
    expect(page.get_by_role("heading", name="Start a chart")).to_be_visible()
