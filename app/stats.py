"""Anonymous usage numbers for the public /stats page.

Only counts leave this module: never a chart's name, text, or keys. Chart data
is whatever clients sent, so every field is checked before it's counted. The
one free-text field shown is the first word of the character's class, and only
once at least MIN_GROUP charts share it, so no single chart can be picked out.
"""

import json
import re
import statistics
import time
from collections import Counter
from datetime import date, datetime, timedelta

MIN_GROUP = 5
WEEKS = 12
TOP_CLASSES = 10
CLASS_WORD = re.compile(r"[a-z]{3,15}")
LEVEL_TIERS = [("1–4", 1, 4), ("5–10", 5, 10), ("11–16", 11, 16), ("17–20", 17, 20)]
SHAPES = {"rect": "Rectangle", "flag": "Flag", "diamond": "Diamond", "star": "Star", "document": "Document",
          "arrow-right": "Right arrow", "arrow-up": "Up arrow"}
BADGES = {"cost": "Cost", "duration": "Duration", "recharge": "Recharge", "modifier": "Modifier"}


def _list(value):
    return value if isinstance(value, list) else []


def _dicts(value):
    return [v for v in _list(value) if isinstance(v, dict)]


def _class_word(character):
    value = character.get("class")
    if not isinstance(value, str):
        return None
    m = CLASS_WORD.match(value.strip().lower())
    return m.group() if m else None


def _level(character):
    value = character.get("level")
    if isinstance(value, str) and value.strip().isdigit():
        value = int(value)
    if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 20:
        return value
    return None


def _badges(items):
    return [b.get("type") for item in items for b in _dicts(item.get("badges"))]


def _rows(counter, labels):
    """[(label, count)] for known keys, most used first, as bars scaled to the largest."""
    pairs = sorted(((labels[k], n) for k, n in counter.items() if k in labels), key=lambda p: -p[1])
    return _bars(pairs)


def _bars(pairs):
    top = max((n for _, n in pairs), default=0)
    return [{"label": label, "count": n, "pct": round(100 * n / top) if top else 0} for label, n in pairs]


def _share(n, total):
    return round(100 * n / total) if total else 0


def _median(values):
    """The median, without a trailing .0 when it's whole."""
    m = statistics.median(values) if values else 0
    return int(m) if m == int(m) else round(m, 1)


def _week_start(day):
    return day - timedelta(days=day.weekday())


def compute(conn, today=None):
    today = today or date.today()
    week0 = _week_start(today) - timedelta(weeks=WEEKS - 1)
    weekly = Counter()
    total = in_use = last7 = last30 = active7 = 0
    boxes, arrows, lanes = [], [], []
    features = Counter()
    shapes, badges, classes, tiers = Counter(), Counter(), Counter(), Counter()

    for row in conn.execute("SELECT data, created_at, updated_at FROM charts"):
        total += 1
        created = datetime.fromisoformat(row["created_at"]).date()
        updated = datetime.fromisoformat(row["updated_at"]).date()
        last7 += (today - created).days < 7
        last30 += (today - created).days < 30
        active7 += (today - updated).days < 7
        if created >= week0:
            weekly[_week_start(created)] += 1

        try:
            data = json.loads(row["data"])
        except ValueError:
            continue
        if not isinstance(data, dict):
            continue
        character = data.get("character") if isinstance(data.get("character"), dict) else {}
        word, level = _class_word(character), _level(character)
        if word:
            classes[word] += 1
        if level:
            tiers[next(label for label, lo, hi in LEVEL_TIERS if lo <= level <= hi)] += 1

        chart_boxes = _dicts(data.get("boxes"))
        if not chart_boxes:
            continue
        in_use += 1
        chart_edges = _dicts(data.get("edges"))
        chart_lanes = _dicts(data.get("lanes"))
        sidebar = data.get("sidebar") if isinstance(data.get("sidebar"), dict) else None
        items = [i for s in _dicts(sidebar and sidebar.get("sections")) for i in _dicts(s.get("items"))]
        boxes.append(len(chart_boxes))
        arrows.append(len(chart_edges))
        lanes.append(len(chart_lanes))
        shapes.update(b.get("shape", "rect") for b in chart_boxes)
        chart_badges = _badges(chart_boxes) + _badges(chart_lanes) + _badges(items)
        badges.update(chart_badges)
        features["Side column"] += sidebar is not None
        features["Badges"] += bool(chart_badges)
        features["Groups"] += bool(_list(data.get("groups")))
        features["Arrow labels"] += any(isinstance(e.get("label"), str) and e["label"].strip() for e in chart_edges)
        features["Portrait printing"] += data.get("orientation") == "portrait"

    shown = [(w, n) for w, n in classes.most_common() if n >= MIN_GROUP][:TOP_CLASSES]
    other = sum(classes.values()) - sum(n for _, n in shown)
    class_rows = _bars([(w.title(), n) for w, n in shown])
    weeks = [week0 + timedelta(weeks=i) for i in range(WEEKS)]
    return {
        "total": total,
        "in_use": in_use,
        "last7": last7,
        "last30": last30,
        "active7": active7,
        "weekly": [dict(bar, label=f"{d:%b} {d.day}") for d, bar in
                   zip(weeks, _bars([("", weekly[d]) for d in weeks]))],
        "median_boxes": _median(boxes),
        "median_arrows": _median(arrows),
        "median_lanes": _median(lanes),
        "total_boxes": sum(boxes),
        "total_arrows": sum(arrows),
        "features": [{"label": k, "count": features[k], "pct": _share(features[k], in_use)}
                     for k in ("Badges", "Side column", "Groups", "Arrow labels", "Portrait printing")],
        "shapes": _rows(shapes, SHAPES),
        "badges": _rows(badges, BADGES),
        "classes": class_rows,
        "other_classes": other,
        "tiers": _bars([(f"Level {label}", tiers[label]) for label, _, _ in LEVEL_TIERS]),
        "min_group": MIN_GROUP,
    }


def cached(app, conn):
    """compute(), reused for STATS_TTL seconds so a busy page doesn't reread every chart."""
    now = time.monotonic()
    hit = app.extensions.get("stats")
    if hit and now - hit[0] < app.config["STATS_TTL"]:
        return hit[1]
    stats = compute(conn)
    app.extensions["stats"] = (now, stats)
    return stats
