# Gotchas

Each of these cost a take, a cut or half an hour on 2026-11-09, making the Product Hunt MCP install video (three takes, two cuts).

## Driving the Mac

- **The agent cannot type into Terminal.** Computer use grants terminals at "click" tier: no typing, no keys, no menus, no right-click, and
  scripting around that (`osascript ... do script`) is not allowed either. The Claude app's own terminal panel is about 230 pt wide and
  Claude's window cannot be granted, so it cannot be widened: unreadable on camera. Hence the terminal stage (`stage.cjs`): a browser page
  that shows the real commands the agent runs in its own shell, with their real output, live. Say so in the report.
- **Holding full computer-use control floats the Claude window over every other app,** and a "Claude is using your computer" pill shows
  mid-screen. Both land in a Full Screen capture. Release full control before the take; drive with Bash, Claude in Chrome and background
  `app_*` calls only. Bring Chrome forward with `open -a "Google Chrome"` and check with `screencapture -x` (no pill, no Claude window).
- **Stage Manager, when it is on**, keeps only the front app's windows on stage; the rest are tilted thumbnails at the left. One app
  in front, one window.
- **Prodoozie's buttons are pressed in the background by element index**, read fresh each time (`app_find` or a background screenshot).
  The Ready screen was rebuilt in 1.313.0: never reuse an index from an earlier run. Stop is the menu: Recording > Stop Recording.
- **The Ready screen once closed by itself** between opening it and pressing Record (after the person answered in the Claude window). Open
  it with File > New Recording, bring Chrome forward, re-read the elements, press Record at once, then run `take.cjs writing`.

## Chrome and Claude in Chrome

- **Claude in Chrome's clicks are page events, not mouse clicks.** The real pointer does not move and macOS sees no click, so Prodoozie's
  cursor track holds no clicks and its click zoom (Auto, On click) has nothing to follow. Zooms are made in the edit (`cut.json` `zoom`).
- **The real pointer stays where it was left, and Prodoozie draws it.** Turn off Settings > Recording > "Show cursor in recordings" before
  the take (the person's choice: it applies to every recording until turned back on). Not yet tried in a take; on 2026-11-09 the parked
  pointer was painted out instead (`paint` in cut.json), which smears whatever it sat on.
- **Claude in Chrome works only in its own tab group, and cannot switch tabs.** A tab it creates opens in the background. A link opened
  with `open URL` lands outside the group, where it cannot be clicked. Keep the whole video in ONE extension tab and navigate it from page
  to page (install page, terminal stage, consent page, terminal stage).
- **A tab a page opened with `window.open` closes itself on an OAuth callback page.** Use the extension's own tab for the consent page.
- **The debugging bar** ("Claude started debugging this browser") comes and goes as the extension attaches, and moves the page 40 to 60 pt.
  It cannot be hidden. Look for it in the review sheet and give each row its own crop `y`.
- **The extension's group window is the person's main Chrome window.** Note its size and place before resizing (`resize_window`), keep
  it inside the screen (a window past the right edge clips long lines), and put it back afterwards.
- **Make the page readable at 1920 wide:** CSS zoom 1.3 on the install page, scrolled to its anchor, and hide what is personal (avatar,
  notification count) with a style in that tab only. Say so in the report.

## The terminal stage

- **A long line** (a sign-in URL) fills four lines: the page puts any URL over 60 characters on one line with an ellipsis.
- **An answer longer than the window** ran off the bottom before the page scrolled itself: it does now. Ask the CLI for short plain lines
  ("one plain-text line each"), not a table.
- **A command that prints only to a terminal** (a sign-in that waits for its callback) needs `--pty`.
- **The sign-in link** goes to a browser through `open` or `$BROWSER`. `--capture-open` catches it in a file; then navigate the extension's
  tab there. It is a one-time link: never paste it into a report.
- **Rehearse every command once off camera, then undo it** (`claude mcp remove`, `claude mcp logout`), so the take is first-time right and
  still real. A command that fails on camera: `stage.cjs drop-last`, then run it again.

## The edit

- **Prodoozie's take is Display P3 on the sRGB curve.** An ffmpeg edit that ignores the tags shows it as sRGB (duller reds), and a card
  encoded by ffmpeg's default (BT.601) and left untagged shows the brand amber as (239,161,15) instead of (232,163,23) in a player.
  `build-video.cjs` converts and tags every row the same. Rows with different tags also make ffmpeg rebuild its filters at each join,
  which cost a review sheet its first tiles.
- **A looped PNG runs at 25 fps.** An overlay that ends on it drops the row's last frame: the posted cut is 0.3 s short of its plan.
  The ground sets each row's length now.
- **An unquoted SVG attribute** (`fill=white/`) silently drops the shape. Every template attribute is quoted.
- **Read the contact sheet and full frames** at each zoom, each card and where the pointer was, before the person sees the cut.

## Disk

- A take is about 0.4 MB/s of a still browser on a 3360x2100 display (49 MB for 2 minutes), more when the picture moves. Each cut writes
  about 10 MB of rows. `df -h ~` before recording.
