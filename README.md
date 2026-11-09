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

Or unzip `dist/website-promo-short/website-promo-short.zip` into `~/.claude/skills/`. The files are plain JavaScript and Markdown: read them before you run them.
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

## install-video

Makes a short landscape video, 1920x1080 for YouTube, X and LinkedIn, of installing a command-line tool, an MCP server or a web integration.
Claude runs the real commands in its own shell and shows them, with their real output, on a terminal page in Chrome; it opens the real
sign-in page and asks you before any consent click; you record the screen. Scripts cut the recording into numbered steps on a dark ground,
with eased zooms, sped-up typing, an intro card, an end card and a thumbnail. When you ask, it posts the video too, one destination at a
time and only after you approve the exact account and text; Product Hunt only ever as a draft.

### Install

From this repository:

```bash
cp -R skills/install-video ~/.claude/skills/
```

Or unzip `dist/install-video/install-video.zip` into `~/.claude/skills/`. Plain JavaScript, HTML and Markdown, no packages to install: read
them before you run them. Then ask Claude Code for "an install video of <the tool>".

### What you need

- A Mac, Apple Silicon, macOS 26, a Retina display
- Node 22.12 or newer, `ffmpeg` (`brew install ffmpeg`), Google Chrome with the Claude in Chrome extension connected
- [Prodoozie](https://prodoozie.com) to record the screen; the edit reads its recording, and reads its colour as Prodoozie writes it

### Tested on

One Apple Silicon Mac on macOS 26, one Retina display, Chrome 157, Prodoozie 1.309, ffmpeg 8.1, Node 22. One video was made and posted this
way, the [Product Hunt MCP install](https://youtu.be/76qp9LrsN8I), with earlier versions of these scripts; the scripts here rebuild that video
from its recording. `TESTED.md` says what was run and what was not.

### Use it on your own accounts

The commands it records are real: they install software and sign in. The recording shows your whole screen: keep the raw file private. It
posts nothing unless you ask, and then only after a yes per destination. The full rules are the "Hard stops" in
[`SKILL.md`](skills/install-video/SKILL.md).

## product-hunt-mcp-draft

Makes a private Product Hunt launch draft for your own product through the Product Hunt MCP, in about seven calls where the website takes
about 40 clicks, typing and uploads. The copy comes from your own site and docs, each claim with its source. Claude shows you the exact
payload and writes nothing until you say yes, and it never submits or schedules the launch. If you want, Prodoozie records the run and
`scripts/cut-video.cjs` cuts it into a 1920x1080 video: the chat on the left, a label for each call on the right, an end card.

### Install

Paste this into Claude Code:

> Fetch https://prodoozie.com/skills/product-hunt-mcp-draft/manifest.json and install each file it lists into ~/.claude/skills/product-hunt-mcp-draft/,
> then run npm install there. Check each file's sha256 against the manifest and tell me whether every file matches.

Or by hand, from this repository:

```bash
cp -R skills/product-hunt-mcp-draft ~/.claude/skills/
cd ~/.claude/skills/product-hunt-mcp-draft && npm install
```

Or unzip `dist/product-hunt-mcp-draft/product-hunt-mcp-draft.zip` into `~/.claude/skills/`. The files are plain JavaScript and Markdown: read
them before you run them. `npm install` fetches one package, `puppeteer-core`, and downloads no browser; only the video needs it.

Then add the Product Hunt MCP, and sign in to Product Hunt yourself when it asks:

```bash
claude mcp add --transport http --scope user producthunt https://mcp.producthunt.com/mcp
```

Start a new Claude Code session, because one that was running when the MCP was added may not see its tools, and ask for "a Product Hunt
draft for <your product>".

### What you need

- For the draft: Claude Code, the Product Hunt MCP, and your own Product Hunt account
- For the video: a Mac, Apple Silicon, macOS 26; [Prodoozie](https://prodoozie.com) with Screen Recording permission; `ffmpeg`
  (`brew install ffmpeg`), Node 22.12 or newer, and Google Chrome

### Tested on

One Product Hunt account and one product, Prodoozie, new on Product Hunt, drafted once on 2026-11-09 from Claude Code in the Claude desktop
app, on one Apple Silicon Mac on macOS 26.4 with one Retina display. Prodoozie 1.309.0 recorded the run, and `cut-video.cjs` cut it with
Node 22, ffmpeg 8.1 and Chrome 157. Not tested: a product already on Product Hunt, resuming a draft made on the website, uploading a local
image, makers or a team, any other Mac, macOS version or recorder. Nothing wider is claimed. `TESTED.md` says what was run.

### Use it on your own product

You sign in to Product Hunt yourself; Claude never types a password or authorizes for you. It makes a draft only: it never calls
`submit_launch` with a confirmation token, which schedules the launch and notifies followers, so you launch it yourself, when you choose.
Every write waits for a yes on its exact content. The raw recording shows your whole desktop: keep it private. The full rules are the
"Hard stops" in [`SKILL.md`](skills/product-hunt-mcp-draft/SKILL.md).

## Layout

```
skills/<name>/                 one folder per skill: SKILL.md, scripts/, references/, and what else it needs
dist/<name>/                   <name>.zip and manifest.json (every file, with its sha256): what prodoozie.com serves for that skill
tools/build-dist.cjs           rebuilds dist/ for every published skill; --check says whether it is current
TESTED.md                      what was run, on what, and what was not
```

Every change to a skill is followed by `node tools/build-dist.cjs`, and prodoozie.com serves a copy of `dist/<name>/` and of the skill's files.

## Licence

MIT, see [`LICENSE`](LICENSE).
