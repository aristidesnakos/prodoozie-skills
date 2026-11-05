# promo.json

One file per video. Every path in it is relative to the file itself (a leading `~/` is your home folder). Start from
`examples/demo-site/promo.json` and edit. `name` and `url` are required; everything else has a default.

## Fields

| field | meaning |
|---|---|
| `name`, `url`, `start` | the file stem of the video; the page it promotes; the first page shown (default `url`) |
| `urlHost`, `urlPath` | the URL as drawn in the pill and on the end card; default from `url` without `www.`. Draw the form that resolves: if the bare domain redirects to `www.`, say so in the host. A pill or box that does not fit stops the run with a message: shorten `urlPath` or leave it empty |
| `viewport` | CSS pixels, default `428 x 761` (9:16, gets a site's phone layout). The display is assumed 2x |
| `dismiss` | button texts to click once on first load (a cookie banner), in the throwaway profile. Pick the privacy-preserving one. The start page loads once, and a second time only if a clicked banner is still showing |
| `hide` | texts of floating buttons to hide (a chat or feedback button). `rehearse` and `play` hide them; `probe` lists them under "FIXED-position items" |
| `steps` | the storyboard, below |
| `stills` | mark labels to screenshot during `rehearse`, into `work/rehearsal/` |
| `endcard` | `eyebrow`; `headline` and `sub`, each an array of lines (a line is a string or an array of runs; a run is a string or `{text, accent?, serif?}`); `mascot` (a transparent PNG); `ctaLabel`; `footerLeft`, `footerRight` |
| `brand` | `cream` (paper), `ink`, `ink2` (text), `accent` (identity colour), `accentInk` (eyebrow, URL box and footer bar: dark enough for cream text), `sagePale` (disc behind a mascot), `serif` and `sans` (Google Fonts families, `Inter` and `Fraunces` by default). Optional: `grid` and `pillBorder` (CSS colours, otherwise tints of `ink` and `cream`), `ripple` (click ripple, default `accent`), `fontsLink` (raw HTML for the card's `<head>` when the faces are not on Google Fonts). The window's ring and the pill's shadow follow `ink` |
| `transition`, `transitionSec`, `endHoldSec`, `tailSec` | the slide into the end card (`slideup`, 0.45 s), how long it holds (3.6 s), how long the page is kept after the last step (0.15 s) |
| `music` | `{file, lufs, fadeInSec, fadeOutSec}`, read by `mix-music.cjs` |
| `userAgentMarker` | added to Chrome's own user agent, e.g. `"my-site-promo/1.0"`, in `rehearse`, `check`, `play` and `probe --config`, so a scripted visit can be told apart in a site's logs and filters. See the hard stops in SKILL.md |
| `userAgent` | a full user-agent string instead, for the rare site that serves a different page by agent (the window is desktop Chrome at phone width; layout is chosen by width on nearly every site) |
| `recorder`, `projects` | `"prodoozie"` (default): when `play` is told to go it checks that a take was written in Prodoozie's recordings folder in the last 20 s, and refuses to play into a recording that never started. `"other"` skips the check, for another recorder. `projects`: where that folder is (default `~/Movies/iRecord/Projects`; it keeps the name Prodoozie had before) |
| `puppeteerFrom`, `chrome`, `port`, `window` | environment: another project's `package.json` that has puppeteer (default: this skill's own, installed by `npm install`); the Chrome executable (default `/Applications/Google Chrome.app/...`, or `CHROME_PATH`); the DevTools port (9333); where the window sits (`{left: 60, top: 70}`, points) |
| `workDir`, `outDir` | `work` (rehearsals, overlays, analysis) and `out` (the videos), next to the file |

## Steps

An element is `{css, nth?}` or `{text, tag?, exact?, nth?}`. Text matches the deepest element whose text contains it; an inline link that wraps over
two lines is aimed at its first line.

| step | does |
|---|---|
| `{"hold": ms}` | wait |
| `{"mark": "label"}` | a timestamp; prints; can take a still in `rehearse` (list it in `stills`) |
| `{"cursor": true}` / `false` | show or hide the cursor overlay |
| `{"scrollTo": {...element, "at": 470, "ms": 1200}}` | eased scroll so the element's top sits `at` px from the top of the window |
| `{"scrollBy": {"px": 220, "ms": 1000}}` | eased scroll by an amount |
| `{"click": {...element, "glideMs": 500, "settle": 120}}` | glide the cursor to it (scrolling first if it is off screen) and click. A link is activated with `el.click()`, never by hovering it, to keep Chrome's link status bubble out of the footage |
| `{"point": {...element, "glideMs": 600, "dx": 0, "dy": 0}}` | glide the cursor to it without clicking or hovering: "this is here". The element must already be on screen |
| `{"park": true}` | move the real pointer to the right margin where no link is. Do it after a button click and before scrolling: a link that scrolls under a resting pointer shows the status bubble |
| `{"waitPath": "/path"}`, `{"waitFor": "css"}`, `{"waitText": "text"}` | wait for the page to get there |
| `{"goto": "https://..."}` | a full navigation |
| `{"key": "Enter"}` | press a key |
| `{"blur": true}` | blur the focused element. After a link click some frameworks move focus to a "Skip to main content" link, which is drawn while focused. The element is noted; nothing is noted when nothing had focus |
| `{"eval": "document.title"}` | run a JavaScript expression in the page; a result that is not `undefined` is noted. For a one-off (remove a banner) before it is worth a module |
| `{"module": "file.cjs"}` | site-specific logic: `module.exports = async (ctx) => {...}`. **It runs as code on your Mac with full access: only use modules you wrote or read** |

A module gets `ctx = { page, cfg, sleep, log(label), mark, clickEl(expr, opts), glide, rect, elExpr, scrollSettled, ensure }`. `await ctx.log(label)`
takes the label's still in a rehearsal and the module waits for it, so the still-free total stays exact. A module is for what the generic steps
cannot do (answer a quiz, fill a field you were told you may fill): it reads the page and decides.

## Shape of a storyboard

30 to 40 seconds: a 1 to 2 second hook on the start page, an eased scroll to the link, the click, the interaction at about 2.4 seconds a beat (the
first beat slower so the format registers), a 3 second hold on the payoff. A page that is its own payoff (a list, a table, a tool with state)
needs no module: `click` the buttons, `point` at the ones you only want to show, `park` before every scroll, then `scrollBy` through the content.
`examples/demo-site/promo.json` is that shape, short.

`rehearse` prints `steps total`, the moving part of the video. `analyze-take` and `build-video` use the time `play` really took, so the video is as
long as the steps ran, plus `tailSec`, plus the end card.
