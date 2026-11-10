# Painted character turnaround

Every wizard is a 3D skinned model (`createWizardGeometry` / `createMageGeometry` in
`src/experience/world/characters/wizardRig.ts`). Each is painted by projecting its concept sheet's
front, side and back views onto it, like three slide projectors (`turnaroundProjection.ts`). The model gives
the character real depth, and the painting gives it the concept art's colours and detail.

- The front view is projected with the skeleton in the class stance, the pose it is painted in. The
  side and back views use the neutral stance.
- Each body part is aligned joint by joint. Every bone's joint is moved onto its painted joint, and each
  limb is turned so its next joint lands too. The painting therefore fits the model even where the
  proportions differ a little.
- Every vertex blends the views that face it and can see it (a depth test per view). Each view only
  counts where it really has paint, according to a paint mask. The mask is applied per vertex, not per
  pixel: per-pixel switching made tiny distant triangles flicker onto the painted outline.
- Glows (flame, gems, ember marks) keep their own bright colours.

This script bakes the atlas that the projection reads.

## Requirements

Python 3 with Pillow, numpy and OpenCV:

```bash
python3 -m venv .venv-paperdoll
.venv-paperdoll/bin/pip install pillow numpy opencv-python-headless
```

## Regenerate the turnaround

From the repo root:

```bash
.venv-paperdoll/bin/python tools/paperdoll/bake_turnaround.py all /tmp/turnaround-preview
# or one class: mage | guardian | mystic | scholar
```

Outputs:
- `public/characters/<id>-turnaround.png`: the three views side by side, opaque. Background pixels
  are refilled with the nearest figure colours. Don't add an alpha channel: browsers premultiply image
  alpha on decode, which wrecks those colours.
- `src/experience/world/characters/turnarounds/<id>.ts`: generated calibration (where each view sits in
  the atlas, its centre line, ground row and scale), the painted joints, and the paint mask
  (downsampled 8×, base64). Do not edit it by hand.
- `<preview_dir>`: `<id>-masks.png` (figure masks per view) and `<id>-atlas.png`.

## Calibration

Everything lives in the `CHARACTERS` table at the top of `bake_turnaround.py`, per class, in sheet
pixels:

| Field | Meaning |
|---|---|
| `sheet` | the concept sheet in `docs/concepts/` |
| `views` | per view: crop box, centre line `axis`, hair-top row `top` and sole row `ground`. Each figure is 1.80 m from `top` to `ground`, the rig's height. The side view's `facing` says which side it shows (`"left"`: the wizard faces the picture's left); the other side uses it mirrored, at a lower weight. `parchment` marks a view painted over a light parchment panel (cut out with GrabCut). |
| `joints` | painted joint positions per bone, for the front (class stance) and back (neutral stance) views |

## Changing or adding a character

Edit or add its entry in `CHARACTERS`, bake, and add it to `TURNAROUNDS` in `wizards.ts` if it is new.
The front view should be painted in the class stance (`STANCES` in `wizardClips.ts`), so match the
stance to the art. Fit the model to the painting by changing its shapes in `wizardRig.ts`. Bones and
proportions that the joints cannot absorb, such as head size and coat length, show up as colour smears
beside the painted outline.
