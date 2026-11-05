# Prodoozie skills

Free skills for Claude Code, from the makers of [Prodoozie](https://prodoozie.com), a screen recorder for the Mac. Each one turns a piece of real
work into video, and each is a worked example of what a recorder is for. Copy them, change them, keep them.

## website-promo-short

Turns a web page into a vertical promo short, 1080x1920, for Shorts, Reels and TikTok. A script plays a phone-width click-through of the page in
a Chrome window, you record the screen, and ffmpeg crops the recording into a framed video: a URL pill above the phone, the cursor and its clicks,
and an end card with the URL large. Silent, 30 to 45 seconds; a music bed is optional.

### Install

Paste this into Claude Code:

> Fetch https://prodoozie.com/skills/website-promo-short/manifest.json and install each file it lists into ~/.claude/skills/website-promo-short/,
> then run npm install there. Check each file's sha256 against the manifest, run `node scripts/doctor.cjs`, and tell me what it says.

Or by hand, from this repository:

```bash
cp -R skills/website-promo-short ~/.claude/skills/
cd ~/.claude/skills/website-promo-short && npm install && node scripts/doctor.cjs
```

Or unzip `dist/website-promo-short.zip` into `~/.claude/skills/`. The files are plain JavaScript and Markdown: read them before you run them.
`npm install` fetches one package, `puppeteer-core`, and downloads no browser.

Then ask Claude Code for "a promo video of my website at https://your-site.example". It runs `scripts/doctor.cjs` first and tells you what to fix.
`node scripts/selftest.cjs` proves the machinery on a made-up shop on your own Mac, visiting nobody's site and recording nothing.

### What you need

- A Mac, Apple Silicon, macOS 26, with a Retina display at least 900 points tall as the main display
- Node 22.12 or newer, `ffmpeg` (`brew install ffmpeg`), and Google Chrome
- A recorder that films the whole screen. It was made with [Prodoozie](https://prodoozie.com) and is tested only with it; the skill reads the
  recording file, so another recorder at 2x should work, but nobody has tried

### Tested on

One Apple Silicon Mac (M2) on macOS 26, one Retina display, Chrome 157, Node 22 and Prodoozie 1.303, on two sites (a quiz and list site, a data
dashboard) and the demo shop in `skills/website-promo-short/examples/demo-site`. Nothing wider is claimed. `TESTED.md` is the log of the clean-install
run, and says what has not been run.

### Use it on your own site

It makes a scripted visit to a real page, which counts in that site's analytics and logs. Film your own site, or one you have permission to film;
read its terms and any licence or promotion limit first; submit nothing; never post for anyone; keep the raw recording, which shows your whole
desktop, private. The full rules are the "Hard stops" in [`SKILL.md`](skills/website-promo-short/SKILL.md).

## Layout

```
skills/website-promo-short/   the skill: SKILL.md, scripts/, references/, examples/demo-site/, package.json
dist/                         website-promo-short.zip and manifest.json (every file, with its sha256): what prodoozie.com serves
tools/build-dist.cjs          rebuilds dist/ from the skill; --check says whether it is current
TESTED.md                     what was run, on what, and what was not
```

Every change to the skill is followed by `node tools/build-dist.cjs`, and prodoozie.com serves a copy of `dist/` and of the skill's files.

## Licence

MIT, see [`LICENSE`](LICENSE).
