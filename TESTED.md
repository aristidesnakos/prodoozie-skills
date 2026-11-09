# Tested

## website-promo-short

Raw log of the clean-install run from dist/website-promo-short.zip (scrubbed environment, Node 23.3.0, 2026-11-05). What was not tested (Intel, other macOS versions, other browsers, 1x or external displays, other recorders) is in the "Tested on" paragraph of skills/website-promo-short/SKILL.md.

```

$ env -i HOME=~ PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin sh -c echo "PUPPETEER_FROM=[${PUPPETEER_FROM-unset}] CHROME_PATH=[${CHROME_PATH-unset}] NODE_PATH=[${NODE_PATH-unset}]"; node --version; npm --version
PUPPETEER_FROM=[unset] CHROME_PATH=[unset] NODE_PATH=[unset]
v23.3.0
10.9.0
[exit 0]

$ env -i HOME=~ PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin node scripts/doctor.cjs
website-promo-short: doctor

  ok    macOS 26.4, arm64
  ok    Node 23.3.0
  ok    ffmpeg 8.1.2 and ffprobe, with libx264, xfade, overlay and ebur128
  ok    Google Chrome 157.0.8103.38
  FAIL  puppeteer-core not found from <work>/clean1/skills/website-promo-short/package.json
        fix: cd "<work>/clean1/skills/website-promo-short" && npm install
  ok    Color LCD: 3360x2100 pixels, 1680x1050 points, 2x
  ok    22.5 GB free on the disk holding ~/Movies (a full-screen recording is about 150 MB a minute at 2x)
  ok    Prodoozie 1.303.0 at /Applications/iRecord.app
  ok    port 9333 is free

Not checked here: the recorder's Screen Recording permission (System Settings → Privacy & Security → Screen Recording), its trial or
licence, and that Do Not Disturb is on. Do those before recording.

1 problem to fix.
[exit 1]

$ env -i HOME=~ PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm install --no-audit --no-fund
(node:19820) ExperimentalWarning: CommonJS module /opt/homebrew/lib/node_modules/npm/node_modules/debug/src/node.js is loading ES Module /opt/homebrew/lib/node_modules/npm/node_modules/supports-color/index.js using require().
Support for loading ES Module in require() is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

added 25 packages in 747ms
[exit 0]

$ env -i HOME=~ PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin node scripts/doctor.cjs
website-promo-short: doctor

  ok    macOS 26.4, arm64
  ok    Node 23.3.0
  ok    ffmpeg 8.1.2 and ffprobe, with libx264, xfade, overlay and ebur128
  ok    Google Chrome 157.0.8103.38
  ok    puppeteer-core 25.16.0, from <work>/clean1/skills/website-promo-short
  ok    Color LCD: 3360x2100 pixels, 1680x1050 points, 2x
  ok    22.4 GB free on the disk holding ~/Movies (a full-screen recording is about 150 MB a minute at 2x)
  ok    Prodoozie 1.303.0 at /Applications/iRecord.app
  ok    port 9333 is free

Not checked here: the recorder's Screen Recording permission (System Settings → Privacy & Security → Screen Recording), its trial or
licence, and that Do Not Disturb is on. Do those before recording.

All clear.
[exit 0]

$ node scripts/selftest.cjs   (same clean environment)
website-promo-short: selftest (demo site on port 53126, files in /tmp/promo-selftest-Zqm4iU)

1. rehearse, headless
  ok    the steps ran with no error
  ok    each page loaded once (/ /roasts)
  ok    every request carried the user-agent marker
  ok    the cookie banner was dismissed
  ok    the stills were taken
  ok    rehearsal.json holds the true length (11.7 s)

2. overlays
  ok    frame.png is 1080x1920
  ok    endcard.png is 1080x1920

3. a stand-in for the recording, through find-take, analyze-take and build-video
  ok    a stand-in recording was written
  ok    find-take picks the real take and skips the decoys (Demo/scenes/scene-001/take-002.mp4)
  ok    find-take refuses a take older than the run
  ok    find-take refuses a take written seconds ago
  ok    analyze-take finds the window ({"x":120,"y":204,"w":856,"h":1522,"fill":1})
  ok    analyze-take finds where the script began (3 s)
  ok    the video is 1080x1920, 60 fps, H.264
  ok    the video is the right length (9.30 s, expected about 9.30)
  ok    the video has no sound
  ok    the bottom-left check ran and found no link status bubble

18 of 18 checks passed.
[exit 0]
```

## Real recording pass (Prodoozie 1.303, 2026-11-05)

play output of the successful run, then find-take, analyze-take and build-video on the take it recorded.

```
window {"fit":{"iw":428,"ih":761,"ow":428,"oh":793},"geo":{"screenX":60,"screenY":70,"outerWidth":428,"outerHeight":793,"innerWidth":428,"innerHeight":761,"dpr":2,"screenW":1680,"screenH":1050}}

WINDOW READY. It shows a magenta screen at the top left of the main display.
Now, in the recorder: choose the whole screen (Prodoozie: Ready screen, Full Screen), press Record, wait out the 3-2-1,
move the pointer to the far right edge of the screen, take your hands off the keyboard and mouse, and say "recording".
When you say go, a take being written in Prodoozie's recordings folder is checked first; with no recording the script does not play.
Waiting for <work>/realpass2/work/go (up to 15 min). The script itself takes about 11 s.

GO. Hands off. Magenta for 2.5 s, then the script plays.
  0.0 A:start
  4.1 B:roasts
  6.8 C:table
  9.5 D:added
steps done, 11.8 s. The window closes in 3 s.
STOP RECORDING NOW (in the recorder, press Stop). Then wait for the take to be saved.
could not remove /var/folders/mc/kpd3n6z9105d2f781t22hg4h0000gn/T/promo-rXhEOb - ENOTEMPTY

$ find-take
~/Movies/iRecord/Projects/Untitled Recording 2/scenes/scene-001/take-001.mp4
$ analyze-take
{'box': {'x': 120, 'y': 204, 'w': 856, 'h': 1522, 'fill': 0.9992}, 'startTime': 31.666667, 'frames': 3454}

$ build-video
1080,1920,60/1,15.050000
```


## install-video

Run on 2026-11-09, one Apple Silicon Mac, macOS 26.4, Chrome 157, ffmpeg 8.1.2, Node 22.22, Prodoozie 1.309.0. No clean-install run yet.

| What | Result |
|---|---|
| `render-cards.cjs examples/ph-mcp/cut.json` | 7 cards at their sizes; intro, step 3, end and thumbnail identical, pixel for pixel, to the cards of the posted Product Hunt MCP video |
| `build-video.cjs examples/ph-mcp/cut.json` on that video's Prodoozie recording | 27.82 s against a 27.80 s plan, 1920x1080, tagged BT.709 primaries and matrix on the sRGB curve; single frames match the posted video at 68 to 77 dB; the end card's amber reads (232,163,24) decoded as BT.709 (brand: 232,163,23) |
| `stage.cjs` serve, run, `--hide`, `--capture-open` with `opened`, `drop-last`, exit codes, stop | as documented, on stand-in commands |
| `review.cjs`, `take.cjs newest` | on the real recording; `take.cjs writing` only on its "not writing" answer |

Not run: a whole video recorded and cut with these scripts as published (the posted video used earlier versions), a recording with
Prodoozie's "Show cursor in recordings" off, the posting steps in `references/posting.md` more than once, any other Mac, display or browser.
