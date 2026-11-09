# Gotchas

Each of these cost a retake or a day once.

## The window and the recording

- **Drive Chrome yourself, not through a browser extension.** An extension's glow border and indicators would land in the footage. `run.cjs`
  starts its own Chrome (`open -n`, a temporary profile, a DevTools port), so it comes to the front and your own Chrome is untouched.
- **A script's click does not move the real pointer**, so the cursor and the click ripple are a page-side overlay. A recorder's own cursor track is
  empty. The real pointer stays where you left it: park it at the far right edge of the screen before recording, and do not touch it.
- **The magenta screen is both calibration and clock.** `play` shows `#ff00ff` over the whole window; the capture shifts it to about
  (236, 45, 245), so `analyze-take` matches it by shape, not by value. It reads the window's exact rectangle from it, and the first frame that is
  not magenta is the moment the script began. The recording must therefore start while the window shows magenta, and the go signal comes after.
- **The window must be in front when the script plays.** The go signal comes from another window (the chat, a terminal), which is frontmost and often covers the top left of the screen: on the first real pass the recording was of that window, with a sliver of magenta. `play` raises the throwaway Chrome by its own process id at go (through System Events, which may ask once for permission); if it prints a WARNING that it could not, click the magenta window before you say go. `analyze-take` says when the window is not whole (fill under 0.98).
- **Chrome opens a New Tab page for `--app=about:blank`**, so the window opens on a blank `data:` page and the script navigates after the user
  agent is set. That also means the start page loads once, not twice.
- **The title bar is 32 points and is not in the viewport**: the viewport box in a 2x take is 856 x 1522 pixels at (120, 204).
- **The display must be 2x.** `doctor` checks it, and `play` stops before you record if the window is not 428 x 761 CSS pixels at 2x. A window
  taller than the display (a scaled "larger text" resolution) is the usual reason.
- **A site's mobile layout is chosen by width, not agent**, nearly always. If `probe` shows a desktop layout at 428 px, set `userAgent`.

## What shows up in the picture that is not the site

- **Chrome's link status bubble** is browser UI: while the real pointer rests on a link, a dark pill with the URL shows at the window's bottom-left.
  No CSS can hide it, so `run.cjs` never moves the real pointer to a link: the overlay cursor glides there and the link is activated with
  `el.click()`. `build-video` scans the bottom-left corner of every frame and warns with times: treat a warning as a retake, and always look at a
  bottom strip of the frames where the cursor rests on something.
- **Park the real pointer before scrolling.** A link that scrolls under a resting pointer shows the same bubble as hovering it. After a button
  click, and before any `scrollTo` or `scrollBy`, add `{"park": true}`.
- **The macOS scrollbar shows while a page scrolls** (a grey thumb that makes a phone video look like a desktop window). The overlay hides every
  scroller's, the page's and any card that scrolls sideways. Headless Chrome draws no scrollbar, so a rehearsal's stills are clean either way,
  and a screenshot of the real window taken over DevTools showed none even without the fix:
  **the first real recording must have its right edge and bottom edge looked at as strips** (crop a frame mid-scroll and one under any table that
  scrolls sideways, about 40 px wide on the right and 40 px tall at the bottom). A grey bar or thumb means a scroller the overlay did not reach.
- **A focus ring or a "Skip to main content" bar after a click.** Some frameworks move focus to the new page's first link and draw it while
  focused. It shows in a rehearsal still if you look; add `{"blur": true}` after the navigation.
- **A sticky translucent header blurs the content under it.** That is the site, not a bug: frame the first beat so the interesting part sits
  below it (`scrollTo ... "at": 100`).
- **Cross-dissolving two text-heavy screens is a muddy double exposure.** The default is a slide (`slideup`).
- **A cookie banner on a fresh profile.** Dismiss it with the privacy-preserving button in `dismiss`. The visits are not real visitors; say so
  in the report.
- **A date or a countdown on the page dates the video.** A "days to go" counter, today's date or a "new this week" badge makes the footage
  wrong on a known day. Keep it out of frame, or write down the day the video goes stale.
- **Something the owner wants kept out of the video** (a link, a section). Compare the deepest point the storyboard reaches (where the start
  page is scrolled to, plus every `scrollBy`) with that element's y in `probe`'s output, then look at the bottom strips of the built video. A
  storyboard that scrolls only the top of a long page never reaches it; one that scrolls further must be checked.

## The page while it plays

- **The page may still be smooth-scrolling after a click** (focus management, `scrollIntoView`): `click` waits for `scrollY` to stop before aiming.
- **A wrapped inline link's bounding-box centre sits on plain text between its lines**: aim at its first line box. The element helpers do.
- **`networkidle0` times out on pages with many font slices** (Google Fonts for CJK). Load, then wait for `document.fonts.ready`. The end card
  refuses to draw if its faces did not load, rather than silently falling back to a system font.
- **A site that counts visits sees every load**: `rehearse`, `check`, `play` and `probe` each load the start page, and a framework that prefetches
  its links (Next.js does) fetches them too. A server-side counter that carries no user agent cannot tell the marker from a visitor: note the
  times of your runs, and tell the site's owner.
- **A heavy page rehearses slower than it plays.** `rehearse` takes its stills at the mark with the steps waiting, and records the still-free
  length; read `steps total` with `STILLS=0` for a pure timing.

## Prodoozie

- Pick **Full Screen** on the Ready screen, and the display the window is on (the main one). The video is silent and screen-only: no camera, and
  the microphone is not needed.
- Screen Recording permission for Prodoozie is in System Settings → Privacy & Security → Screen Recording. A black recording is that permission.
- The 3-2-1 runs before the recording starts. Do Not Disturb on is the safe state: a banner arriving during the script is on your screen.
- A recording of a 2x display is up to about 2.5 MB a second while the page moves (a 70 s recording of a scrolling page was 166 MB; a still
  screen is far less). Check free disk before you record.
- A recording is kept in `~/Movies/iRecord/Projects/<name>/` (the folder keeps the name Prodoozie had before; Camera footage would sit beside the
  screen file as `.camera.mp4`, which `find-take` skips). It shows your whole desktop. Deleting the Recording from Prodoozie's Home removes its
  folder from disk: do that when the video is done.
- **Music:** `mix-music.cjs` wants a track you may publish. -24 LUFS is the default for a bed under a silent screen recording; -18 was too
  forward. You cannot hear the result from a script: say you measured it, ask how it sounds, and re-run with another `--lufs` (it overwrites).

## The tools

- **The URL band and the end card are HTML drawn by Chrome**, then laid over the video with ffmpeg's `overlay`. Not every ffmpeg build has
  `drawtext`, so no text is drawn by ffmpeg.
- **zsh, the macOS shell:** `echo =====` fails (a word that starts with `=` is looked up as a command), and macOS `sed -i` needs an empty
  suffix (`sed -i '' ...`). Edit promo.json with an editor or a short script.
- **The throwaway Chrome profile can still be written to as the browser closes**, so `run.cjs` retries its delete. A `promo-*` folder left in
  the temp folder is from a run that was killed.
