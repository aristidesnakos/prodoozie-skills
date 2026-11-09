# cut.json

What `scripts/cut-video.cjs` reads. Paths are relative to the cut.json file; `~` is your home.

| Field | Required | Meaning |
|---|---|---|
| `take` | yes | the recording, a Full Screen take (Prodoozie's `take-001.mp4`) |
| `output` | no | the video to write; default `draft-by-mcp.mp4` beside cut.json |
| `crop` | yes | `[x, y, w, h]` of the chat column, in take pixels (a 2x take is twice the points). Leave out the sidebar, the menu bar and the Dock |
| `duration` | no | seconds of the take to use, from its start; default the whole take |
| `kicker` | no | a small line above every label, e.g. "Product Hunt, by MCP" |
| `steps` | yes | the labels, in order: `from` and `to` in take seconds (a label shows from `from` up to, not including, `to`; the last one runs to the end), `say` (the big line), and optionally `call` (the tool name, in mono), `note` (one or two short sentences), `step` (e.g. "call 1 of 7") |
| `end` | no | the end card: `big`, `sub`, `url`, `seconds` (default 3.5) |
| `brand` | no | `ground`, `ink`, `accent` colours and `display`, `body`, `mono` font names installed on the Mac; default Prodoozie's (#0B0907, #F2ECE4, #E8A317; Futura, Helvetica Neue, Menlo) |
| `chrome` | no | path to Google Chrome; default `/Applications/Google Chrome.app/...`, or `CHROME_PATH` |

The column is fitted into an 860x960 box at the left (height-bound columns sit at x 110, y 60); the labels take the right half.

Finding the numbers: pull a frame every 10 s at a third of the take's size
(`ffmpeg -ss 20 -i take-001.mp4 -frames:v 1 -vf scale=1120:-1 f20.jpg`), read the column's edges off it and multiply by 3. For the
step times, the chat shows each call's running clock ("Using producthunt: start launch 22m 43s"): frames a few seconds apart give each
call's start.
