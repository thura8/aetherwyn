"""Bake a wizard's turnaround (front, side and back views) into one texture atlas.

The game paints each 3D wizard by projecting these three views onto its model
(src/experience/world/characters/turnaroundProjection.ts). Each panel is cropped from the concept sheet,
its background is cut away, and the background is refilled with the nearest character colours. A
model point that lands just outside the painted outline then picks up cloth, not the backdrop.

Usage (from the repo root):
  python tools/paperdoll/bake_turnaround.py <class id | all> <preview_dir>

Writes public/characters/<id>-turnaround.png and src/experience/world/characters/turnarounds/<id>.ts.
Calibration is in sheet pixels. Each figure is drawn 1.80 m tall (hair top to soles, the rig's height),
each view with its own centre line and ground row.
"""
import sys, json, os, base64
import numpy as np
import cv2

MASK_DOWNSAMPLE = 8  # the paint mask is read per model vertex, so a coarse one is plenty
PAD = 8  # atlas gutter, filled with the nearest panel colours so mipmaps do not bleed


CHARACTERS = {
    "mage": {
        "sheet": "docs/concepts/elemental-mage.jpg",
        "views": {
            "front": {"box": (100, 200, 820, 1380), "axis": 452, "top": 220, "ground": 1366},
            "side": {"box": (790, 200, 1190, 1380), "axis": 1000, "top": 231, "ground": 1358, "facing": "left"},
            "back": {"box": (1250, 200, 1790, 1380), "axis": 1520, "top": 231, "ground": 1350},
        },
        "joints": {
            "front": {
                "hips": (452, 755), "chest": (448, 576), "head": (440, 382),
                "upperArmR": (295, 465), "foreArmR": (245, 640), "handR": (205, 790),
                "upperArmL": (548, 465), "foreArmL": (588, 645), "handL": (655, 618),
                "upperLegR": (400, 740), "lowerLegR": (330, 1045), "footR": (290, 1290),
                "upperLegL": (500, 740), "lowerLegL": (500, 1075), "footL": (520, 1290),
                "coatFR": (330, 735), "coatFR2": (232, 997), "coatFL": (560, 735), "coatFL2": (602, 997),
            },
            "back": {
                "hips": (1520, 760), "chest": (1520, 580), "head": (1516, 385),
                "upperArmL": (1392, 470), "foreArmL": (1345, 640), "handL": (1322, 790),
                "upperArmR": (1648, 470), "foreArmR": (1695, 640), "handR": (1712, 790),
                "upperLegL": (1470, 760), "lowerLegL": (1450, 1060), "footL": (1445, 1290),
                "upperLegR": (1570, 760), "lowerLegR": (1590, 1060), "footR": (1595, 1290),
            },
        },
    },
    "guardian": {
        "sheet": "docs/concepts/guardian.jpg",
        "views": {
            "front": {"box": (120, 220, 960, 1450), "axis": 580, "top": 255, "ground": 1425},
            "side": {"box": (1000, 220, 1440, 1460), "axis": 1280, "top": 265, "ground": 1435, "facing": "right"},
            "back": {"box": (1620, 220, 2160, 1430), "axis": 1888, "top": 260, "ground": 1405},
        },
        "joints": {
            "front": {
                "hips": (580, 780), "chest": (580, 600), "head": (580, 425),
                "upperArmR": (450, 485), "foreArmR": (355, 645), "handR": (255, 695),
                "upperArmL": (710, 490), "foreArmL": (790, 650), "handL": (820, 840),
                "upperLegR": (535, 800), "lowerLegR": (500, 1110), "footR": (440, 1360),
                "upperLegL": (630, 800), "lowerLegL": (680, 1110), "footL": (730, 1360),
            },
            "back": {
                "hips": (1888, 790), "chest": (1888, 600), "head": (1890, 430),
                "upperArmL": (1750, 500), "foreArmL": (1695, 700), "handL": (1670, 900),
                "upperArmR": (2040, 500), "foreArmR": (2100, 700), "handR": (2120, 900),
                "upperLegL": (1840, 810), "lowerLegL": (1800, 1110), "footL": (1780, 1360),
                "upperLegR": (1940, 810), "lowerLegR": (2000, 1110), "footR": (2030, 1360),
            },
        },
    },
    "mystic": {
        "sheet": "docs/concepts/mystic.jpg",
        "views": {
            "front": {"box": (60, 150, 1000, 1480), "axis": 543, "top": 200, "ground": 1455},
            "side": {"box": (1040, 150, 1530, 1480), "axis": 1225, "top": 195, "ground": 1460, "facing": "left"},
            "back": {"box": (1540, 150, 2080, 1480), "axis": 1802, "top": 195, "ground": 1460},
        },
        "joints": {
            "front": {
                "hips": (545, 740), "chest": (543, 560), "head": (542, 390),
                "upperArmR": (400, 475), "foreArmR": (330, 680), "handR": (325, 880),
                "upperArmL": (650, 480), "foreArmL": (710, 680), "handL": (830, 680),
                "upperLegR": (500, 760), "lowerLegR": (430, 1180), "footR": (400, 1410),
                "upperLegL": (590, 760), "lowerLegL": (620, 1180), "footL": (650, 1410),
            },
            "back": {
                "hips": (1802, 740), "chest": (1802, 560), "head": (1800, 390),
                "upperArmL": (1650, 560), "foreArmL": (1595, 750), "handL": (1570, 880),
                "upperArmR": (1960, 560), "foreArmR": (2020, 750), "handR": (2050, 880),
                "upperLegL": (1760, 760), "lowerLegL": (1715, 1200), "footL": (1700, 1420),
                "upperLegR": (1845, 760), "lowerLegR": (1910, 1200), "footR": (1920, 1420),
            },
        },
    },
    "scholar": {
        "sheet": "docs/concepts/arcane-scholar.jpg",
        "views": {
            "front": {"box": (200, 230, 900, 1470), "axis": 522, "top": 255, "ground": 1445, "parchment": True},
            "side": {"box": (1600, 240, 2080, 1475), "axis": 1840, "top": 268, "ground": 1455, "facing": "right"},
            "back": {"box": (970, 240, 1540, 1460), "axis": 1265, "top": 268, "ground": 1440},
        },
        "joints": {
            "front": {
                "hips": (522, 760), "chest": (522, 600), "head": (505, 440),
                "upperArmR": (385, 490), "foreArmR": (325, 655), "handR": (300, 820),
                "upperArmL": (660, 490), "foreArmL": (690, 690), "handL": (700, 810),
                "upperLegR": (470, 800), "lowerLegR": (430, 1100), "footR": (350, 1390),
                "upperLegL": (575, 800), "lowerLegL": (610, 1100), "footL": (650, 1390),
            },
            "back": {
                "hips": (1265, 770), "chest": (1265, 600), "head": (1265, 440),
                "upperArmL": (1150, 490), "foreArmL": (1095, 680), "handL": (1065, 850),
                "upperArmR": (1385, 490), "foreArmR": (1440, 680), "handR": (1475, 850),
                "upperLegL": (1220, 800), "lowerLegL": (1190, 1120), "footL": (1170, 1400),
                "upperLegR": (1310, 800), "lowerLegR": (1340, 1120), "footR": (1350, 1395),
            },
        },
    },
}


def background(crop):
    """A panel's smooth backdrop: a 2D quartic per channel, fitted to the pixels that look like the
    panel's border (its median border colour), then refitted without the pixels that disagree."""
    h, w, _ = crop.shape
    step = 3
    small = crop[::step, ::step].astype(np.float64)
    ys, xs = np.mgrid[0:small.shape[0], 0:small.shape[1]]
    u, v = xs.ravel() / small.shape[1] * 2 - 1, ys.ravel() / small.shape[0] * 2 - 1

    def basis(u, v):
        return np.stack([u ** i * v ** j for i in range(5) for j in range(5 - i)], 1)

    A = basis(u, v)
    pixels = small.reshape(-1, 3)
    border = np.concatenate([small[:, :4].reshape(-1, 3), small[:, -4:].reshape(-1, 3), small[:4].reshape(-1, 3)])
    keep = np.linalg.norm(pixels - np.median(border, 0), axis=1) < 40
    for _ in range(6):
        coef, *_ = np.linalg.lstsq(A[keep], pixels[keep], rcond=None)
        error = np.linalg.norm(pixels - np.einsum("ij,jk->ik", A, coef), axis=1)
        keep = error < 14
    full_y, full_x = np.mgrid[0:h, 0:w]
    model = basis(full_x.ravel() / w * 2 - 1, full_y.ravel() / h * 2 - 1)
    model = np.einsum("ij,jk->ik", model, coef)
    return model.reshape(h, w, 3).astype(np.float32)


def largest_with_holes_filled(mask, distance):
    # keep the figure: the largest component (sparks, labels and stray flecks are dropped)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    mask = (labels == keep).astype(np.uint8)
    # fill holes the outside cannot reach: dark leather close to the backdrop. Backdrop seen through a
    # gap (between the legs, under an arm) is a large enclosed hole of backdrop colour.
    flood = mask.copy()
    h, w = mask.shape
    edge = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(flood, edge, (0, 0), 1)
    holes = (1 - flood).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(holes, 8)
    for k in range(1, count):
        hole = labels == k
        if stats[k, cv2.CC_STAT_AREA] < 600 or distance[hole].mean() > 22:
            mask[hole] = 1
    return mask


def figure_mask(crop, bg, parchment=False):
    f = crop.astype(np.float32)
    distance = np.linalg.norm(f - bg, axis=2)
    # saturation beyond the backdrop's own (some backdrops are blue)
    saturation = (f.max(2) - f.min(2)) - (bg.max(2) - bg.min(2))
    mask = ((distance > 16) | (saturation > 30)).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    if parchment:
        mask = cut_parchment(crop, mask)
    mask = largest_with_holes_filled(mask, distance)
    # pull the edge in a little so no backdrop halo is kept
    return cv2.erode(mask, np.ones((3, 3), np.uint8), iterations=2)


def cut_parchment(crop, mask):
    """Separates the figure from a light parchment panel behind it with GrabCut: parchment-coloured
    pixels (light, warm, little saturation) start as probable background."""
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    paper = (hue >= 8) & (hue <= 30) & (sat < 120) & (val > 120)
    paper = cv2.morphologyEx(paper.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
    seeds = np.where(mask == 1, cv2.GC_PR_FGD, cv2.GC_BGD).astype(np.uint8)
    seeds[(mask == 1) & paper] = cv2.GC_PR_BGD
    # the figure's core (dark cloth and leather) is certain
    core = cv2.erode(((mask == 1) & ~paper & (val < 110)).astype(np.uint8), np.ones((5, 5), np.uint8))
    seeds[core == 1] = cv2.GC_FGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(crop, seeds, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    out = ((seeds == cv2.GC_FGD) | (seeds == cv2.GC_PR_FGD)).astype(np.uint8)
    return cv2.morphologyEx(out, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))


def fill_outside(crop, mask):
    """Every background pixel takes the colour of the nearest figure pixel, softened."""
    _, labels = cv2.distanceTransformWithLabels(
        (mask == 0).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(mask == 1)
    # labels number the zero pixels of the input (the figure) in scan order
    lookup = np.zeros((labels.max() + 1, 2), np.int64)
    order = np.argsort(ys * mask.shape[1] + xs)
    lookup[1:len(order) + 1] = np.stack([ys[order], xs[order]], 1)
    nearest = lookup[labels]
    filled = crop[nearest[..., 0], nearest[..., 1]]
    soft = cv2.GaussianBlur(filled, (0, 0), 3)
    return np.where(mask[..., None] == 1, crop, soft)


def bake(class_id, preview):
    character = CHARACTERS[class_id]
    views = character["views"]
    sheet = cv2.imread(character["sheet"])
    panels, masks = {}, {}
    for name, view in views.items():
        x0, y0, x1, y1 = view["box"]
        crop = sheet[y0:y1, x0:x1]
        mask = figure_mask(crop, background(crop), view.get("parchment", False))
        # the paint mask (where the figure is) ships in the calibration file, not as image alpha:
        # browsers premultiply image alpha when decoding, which wrecks the refilled colours
        inside = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 2)
        paint = np.clip(inside * 255, 0, 255).astype(np.uint8)
        panels[name] = np.dstack([fill_outside(crop, mask), paint])
        masks[name] = mask

    width = sum(p.shape[1] for p in panels.values()) + PAD * 2 * len(panels)
    height = max(p.shape[0] for p in panels.values()) + PAD * 2
    atlas = np.zeros((height, width, 4), np.uint8)
    calibration = {}
    x = 0
    for name, panel in panels.items():
        view = views[name]
        padded = cv2.copyMakeBorder(panel, PAD, PAD, PAD, PAD, cv2.BORDER_REPLICATE)
        atlas[:padded.shape[0], x:x + padded.shape[1]] = padded
        bx0, by0, _, _ = view["box"]
        calibration[name] = {
            # atlas pixel of sheet pixel (sx, sy) = (sx + offset[0], sy + offset[1])
            "offset": [x + PAD - bx0, PAD - by0],
            "axis": view["axis"],
            "ground": view["ground"],
            "metresPerPixel": round(1.8 / (view["ground"] - view["top"]), 7),
        }
        if "facing" in view:
            calibration[name]["facing"] = view["facing"]
        x += padded.shape[1]

    out_png = f"public/characters/{class_id}-turnaround.png"
    out_ts = f"src/experience/world/characters/turnarounds/{class_id}.ts"
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    os.makedirs(os.path.dirname(out_ts), exist_ok=True)
    cv2.imwrite(out_png, atlas[:, :, :3], [cv2.IMWRITE_PNG_COMPRESSION, 9])
    small = cv2.resize(atlas[:, :, 3], (width // MASK_DOWNSAMPLE, height // MASK_DOWNSAMPLE),
                       interpolation=cv2.INTER_AREA)

    os.makedirs(preview, exist_ok=True)
    cv2.imwrite(os.path.join(preview, f"{class_id}-atlas.png"), atlas[:, :, :3])
    cv2.imwrite(os.path.join(preview, f"{class_id}-masks.png"),
                np.hstack([cv2.copyMakeBorder(m * 255, 0, height - PAD * 2 - m.shape[0], 0, 4,
                                              cv2.BORDER_CONSTANT, value=128) for m in masks.values()]))

    data = {
        "size": [width, height],
        "views": calibration,
        "paintMask": {"width": small.shape[1], "height": small.shape[0],
                      "data": base64.b64encode(small.tobytes()).decode("ascii")},
        "joints": {view: {bone: list(xy) for bone, xy in joints.items()}
                   for view, joints in character["joints"].items()},
    }
    ts = (
        f"// Generated by tools/paperdoll/bake_turnaround.py from {character['sheet']}.\n"
        "// Do not edit by hand: rerun the script.\n"
        'import type { Turnaround } from "../turnaroundProjection";\n\n'
        f'export const ATLAS = "/characters/{os.path.basename(out_png)}";\n'
        f"export const TURNAROUND: Turnaround = {json.dumps(data, indent=2)};\n"
    )
    with open(out_ts, "w") as f:
        f.write(ts)
    print(f"{class_id}: atlas {width}x{height} -> {out_png}")


def main():
    which, preview = sys.argv[1:3]
    for class_id in CHARACTERS if which == "all" else [which]:
        bake(class_id, preview)


main()
