---
name: website-promo-short
description: Make a vertical (1080x1920) promo short of a web page for Shorts, Reels and TikTok. A scripted phone-width click-through of the page is recorded off the Mac's screen and framed with a URL band and an end card. Use when asked for a promo video, short, reel, teaser or screen recording of my website, landing page, quiz, tool, dashboard or app page, or to promote a page with a video. macOS only, needs Google Chrome, ffmpeg and a screen recorder (made with Prodoozie). The recording takes over the screen for about a minute.
---

# Website promo short

Makes a 30-45 s vertical video of a real page at phone width: a cursor clicks through the site, a URL pill stays on screen above the phone window,
and a closing card shows the URL large. Silent, 1080x1920, 60 fps H.264; a music bed is optional. The person presses Record in
[Prodoozie](https://prodoozie.com); the scripts do the rest.

**Tested on, and nothing wider is claimed:** One Apple Silicon Mac (M2) on macOS 26 with one Retina display, Chrome 157, Node 22 and 23, and Prodoozie 1.303. The picture, overlay and build steps ran on two real sites (a quiz and list site, a data dashboard) and on the demo shop that comes with the skill. The recording hand-off (`play`, where you press Record) ran for real once, on the demo shop with Prodoozie 1.303: the video came out 1080x1920 with clean edges. `selftest` covers everything but the recording itself. Not tested: Intel, other macOS versions, other browsers, 1x or external displays. Another recorder that films the whole display at 2x should work, because the skill only reads the file; that is untested too.

```
doctor -> probe -> storyboard (promo.json) -> rehearse (headless) -> overlays -> play + the person records -> find-take -> analyze -> build -> music
```

`S=~/.claude/skills/website-promo-short/scripts`. Work in a folder of the person's choosing, e.g. `~/promo/<slug>/`; copy
`examples/demo-site/promo.json` there and edit it. Every field and step is in `references/promo-json.md`; things that went wrong once are in
`references/gotchas.md`. Read both before the first storyboard.

## Hard stops

- **Film your own site, or one you have permission to film.** Ask which it is. Read the site's terms, and any licence, data-source or promotion
  limit its owner names (a data licence that bars promoting a product, a sponsor's rules, a "no promotion" note), before showing it in a video.
  When unsure, stop and ask the person to check with the owner. Never film a page behind a login.
- **A scripted visit is a real visit.** It counts in the site's analytics and server logs: every `probe`, `rehearse`, `play` loads the page.
  Offer the user-agent marker (`userAgentMarker` in promo.json, so the visits can be told apart or filtered), keep the times of your runs, and
  tell the owner if it is not the person. A server-side counter that logs no user agent cannot be filtered by the marker.
- **Nothing is submitted.** No forms, sign-ups, purchases or API calls, and nothing typed into a field you were not told you may fill. The
  storyboard clicks links and buttons that only read, or `point`s at the rest.
- **Run only a promo.json you wrote or read.** Its `module` and `eval` steps run code on the Mac.
- **Never post it for the person.** Hand them the file. Music must be a track they may publish (their own, or licensed for a promo on the
  platforms they post to); not a "free" track of unclear origin.
- **The raw recording is private.** It shows the whole desktop: other apps, notifications. Never export, attach, upload or publish it, only the
  cropped video; say where it is, and that deleting the Recording from Prodoozie's Home removes it.
- **Recording takes over the screen** for 1 to 2 minutes. Ask in words first ("Go now" / "Not yet"), say what will happen (a phone-size Chrome
  window at the top left, hands off the keyboard and mouse, Do Not Disturb on), and say the moment the screen is free. Never in a loop.

## Setup, once

1. `cd ~/.claude/skills/website-promo-short && npm install` (puppeteer-core only: it drives the Chrome already installed, nothing is downloaded).
2. `node $S/doctor.cjs`: macOS, Node 22.12+, ffmpeg with libx264, Chrome, puppeteer-core, a 2x main display at least 900 points tall, free disk,
   Prodoozie. Each failure prints its fix. Do the fixes, run it again. Prodoozie also needs Screen Recording permission: System Settings → Privacy
   & Security.
3. `node $S/selftest.cjs` (about a minute, no site visited, nothing recorded): proves rehearsal, overlays and the cut-and-build chain on the demo shop.

## Steps

1. **Ask**, only what is not said: which page is promoted and what is the story (a quiz: answer it; a tool: use it; a page to read: scroll it; a page with
   no main action, such as a dashboard: ask what to show, what stays out, and what the viewer should do after); where the video starts (the page that links
   to it makes "click through to it" real; check what is above the fold there); music or none; the two permission questions above (own site? terms read?).
2. **Probe.** `node $S/probe.cjs <url> --out probe [--config promo.json]` prints the links and buttons with their y positions, flags wrapped links,
   lists floating chrome to hide, and saves a phone-width screenshot: Read it. `--config` loads the page the way `run.cjs` will (marker, banner button).
3. **Storyboard.** Write `promo.json`: 30-40 s, a 1-2 s hook, an eased scroll to the link, the click, about 2.4 s a beat, a 3 s hold on the payoff.
4. **Rehearse headless.** `STILLS=0 node $S/run.cjs rehearse promo.json` for true timing and any step error, then without `STILLS=0` and look at
   `work/rehearsal/`: the answered state, anything with a banner, a floating button or a focus ring. Fix before touching the screen. Gate: no step
   error, no banner or chat button in view, total under about 45 s. A rehearsal cannot show a scrollbar (step 8).
5. **Overlays.** `node $S/render-assets.cjs promo.json` writes `work/frame.png` and `work/endcard.png`; Read both. It measures them: a headline too wide
   for the card shrinks (to 60%) and says so, a URL that does not fit stops the run (shorten `urlPath`). It needs the internet for the card's fonts.
6. **Record.** Ask first (hard stops), then:
   - `node $S/run.cjs play promo.json`, in the background, reading its output. It opens the window on a **magenta** screen at the top left of the main
     display, checks it is 2x and fits, and waits for `work/go`.
   - Tell the person, in one message: in Prodoozie choose **Full Screen** and the main display, press **Record**, wait out the 3-2-1, move the
     pointer to the far right edge of the screen, take their hands off, and say "recording". The recording must start while the window shows magenta.
   - When they say "recording": `touch work/go` (next to promo.json; `play` prints the path). `play` first checks that Prodoozie is writing a take
     (`"recorder": "other"` in promo.json skips this); with none it prints **NOT PLAYING**, stays on magenta and waits for go again: tell the person the
     recording has not started. Otherwise it holds magenta 2.5 s, plays the script, prints **STOP RECORDING NOW** and closes.
   - Tell them to stop the recording, and to say when Prodoozie has saved it. Then say the screen is free.
7. **Find, analyze, build.** `node $S/find-take.cjs promo.json` (the newest Prodoozie take, refused if it is older than the run or still being saved;
   or pass the file: `... promo.json ~/path/recording.mov`), `node $S/analyze-take.cjs promo.json` (about 15 s: the window's box and the first frame
   of the script, from the magenta), `node $S/build-video.cjs promo.json`. Make the contact sheet it prints and Read it, then Read two full frames, one
   mid-run and one in the transition. Look for: the URL pill on every frame, no magenta in frame 0, sharp text, a clean slide into the end card.
   Its bottom-left check names a link status bubble: a warning means record again.
8. **The first recording's edges.** Read a 40 px strip at the right edge and one at the bottom of a frame mid-scroll and one under any card that
   scrolls sideways: a grey bar or thumb means a scroller the overlay missed. Record again.
9. **Music (optional).** `node $S/mix-music.cjs promo.json --file <track> [--lufs -24]` writes `<name>-music.mp4` without re-encoding the picture
   and prints loudness and peak. You cannot listen: say you measured it.
10. **Report.** The files (`out/<name>.mp4`, the music cut), what is scripted (the cursor, any deliberate action), where the raw recording is and that
    it stays private, the times of the visits for the site's logs, and anything unverified (not listened to; not watched on a phone).
