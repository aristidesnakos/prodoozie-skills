# cut.json

One file describes the whole edit. `render-cards.cjs` reads `cards`; `build-video.cjs` reads the rest. Paths are relative to cut.json's
folder; `~/` works. Any object may carry a `"note"`: it is ignored, and it is where the reason for a number goes.
`examples/ph-mcp/cut.json` is the Product Hunt MCP video, field for field.

| Field | Default | What it is |
|---|---|---|
| `take` | (required) | The Prodoozie take, `~/Movies/iRecord/Projects/<Recording>/scenes/scene-001/take-001.mp4`. `node take.cjs newest` prints it. |
| `out` | `out/video.mp4` | The finished video. |
| `workDir` | `work` | Rendered cards (`cards/`) and encoded rows (`segments/`). |
| `fps` | 30 | Output rate. |
| `canvas` | `[1920, 1080]` | Output size. |
| `ground` | `#0B0907` | The colour around the picture and under the cards (pelt-950). |
| `picture` | `{x:80, y:130, w:1760, h:886}` | Where the cropped screen lands. The step frame's hole is cut from the same numbers, so change it here only. |
| `crop` | (required for take rows) | `{x, w, h}` in the take's pixels: the part of the screen to show. Each row gives its own `y`. Keep `w/h` equal to the picture's shape: the build warns past 1%. |
| `paint` | `[]` | Painted over every take row before the crop: `{mode: "delogo"\|"fill", box: [x, y, w, h], color, until}`. `until` (take seconds) stops it for rows that start later. A row's own `paint` replaces this list. |
| `takeColor` | from the take's tags | `{primaries, trc}`. A Prodoozie take is Display P3 on the sRGB curve, and an untagged one is read the same way. Set `{"primaries": "bt709"}` only for another recorder's BT.709 file. |
| `cards` | `{}` | `name: {template, ...fields}`, rendered to `<workDir>/cards/<name>.png`. Templates below. |
| `timeline` | `[]` | The rows, in order. |

## Rows

A **card** row: `{"card": "intro", "dur": 1.6, "fade": 0.25}`. Fades in and out.

A **take** row:

```json
{ "from": 71.6, "dur": 3.8, "y": 418, "frame": "frame3", "speed": 1.0,
  "zoom": { "to": 1.8, "at": [1689, 1173], "in": [0, 0.8], "out": [2.07, 2.47] },
  "paint": [] }
```

- `from`: take second the row starts at. `dur`: seconds it lasts **in the video**. With `speed` 1.75 it reads `dur x 1.75` seconds of the take.
- `y`: the crop's top in the take's pixels. It changes when Chrome's debugging bar comes or goes (content moves about 80 to 120 px at 2x).
- `frame`: the step card laid over this row (its hole shows the picture). Leave it out for a bare picture.
- `zoom`: eased in from `in[0]` to `in[1]` (seconds into the row), held, and eased out over `out` if given. `to` is the scale; `at` is the
  point to zoom on, in pixels of the **crop** (not the take): take x minus `crop.x`, take y minus the row's `y`. The view never leaves the crop.

## Templates

| Template | Size | Fields |
|---|---|---|
| `intro` | 1920x1080 | `kicker` (small caps line), `title` (a new line breaks it), `sub`, `subAccent` (the one amber phrase) |
| `step` | 1920x1080, transparent hole | `num` ("01"), `title` |
| `end` | 1920x1080 | `line` ("Recorded with"), `name`, `url` |
| `thumb` | 1280x720 | `kicker`, `title`, `command` |

They are plain HTML in `templates/`. Edit them there; quote every attribute (an unquoted SVG attribute, `fill=white/`, drops the shape
without a word). Colours are Prodoozie's: ground `#0B0907`, ivory `#F2ECE4` titles, bone text, amber `#E8A317` on one thing per card.

## Lengths that worked

Intro 1.6 s. Each step 3 to 4.5 s. Typing at 1.75x to 2x. A held zoom of 1.8x on the button that is clicked, eased in over 0.8 s and out
over 0.4 s. End card 2.2 s. The whole video under 30 s: the first cut ran 48.6 s, the person asked for shorter and faster with zooms on
what is clicked, and approved a 27.5 s cut.
