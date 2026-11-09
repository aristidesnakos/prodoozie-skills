# The Product Hunt MCP's tools

As seen on 2026-11-09 (17 tools, server `https://mcp.producthunt.com/mcp`). If a tool or a field differs, read the tool's own
description and say so.

| Tool | Reads or writes | What it is for here |
|---|---|---|
| `get_my_account` | reads | your id, username and scopes |
| `list_my_launches` | reads | your launches: `draft`, `unscheduled`, `scheduled`, `live`; each with `launch_id`, `revision`, permitted actions |
| `get_launch_context` | reads | for a `url`: new or existing product, your draft for it, limits, launch dates on offer, eligibility, daily limit; with `topic`, `category`, `maker`, `shoutout_product`, `funding_backer`: IDs by name |
| `get_launch` | reads | one launch: `values`, `revision`, `assessment` (blockers, suggestions, investor questions), `editable_fields`, `prepared_assets`, website URLs |
| `start_launch` | **writes** | creates a private draft (or resumes your unsubmitted one for the same link, unchanged); never submits |
| `prepare_launch_asset` | **writes** (stages) | an image for a launch: by `source_url`, by an upload ticket for a local file, or as base64 up to 3 MB. PNG, JPEG, WebP, GIF, 10 MB |
| `update_launch` | **writes** | changes a launch. Private draft edits apply; public changes return `needs_confirmation` with a token |
| `submit_launch` | **writes, public** | schedules a draft for its launch day. Without a token it only previews. **Not used by this skill** |
| `submit_feedback` | writes to Product Hunt's team | once per task, only with your yes |
| `get_categories`, `get_products`, `search_launches`, `semantic_product_search`, `find_alternatives`, `get_product_profile`, `get_leaderboard` | reads | research: rivals, what won, a category's best |
| `find_investable_startups` | reads | not relevant here |

## Limits (from `get_launch_context`)

Name 40, tagline 60, description 6 to 500, topics 3, categories 3, promo text 25, promo code 15, shoutout note 20 to 2000. Launch
dates: from tomorrow to about a month ahead, midnight Pacific. Daily launch limit 2.

## What Product Hunt does on its own

- `start_launch` fills a thumbnail and one gallery image from the site's icon and social card. An `update_launch` with the full
  `galleryAssetIds` list replaces them; a thumbnail asset replaces the thumbnail.
- `makerIds` with your own id lists you as Hunter and Maker.
- Opening the draft's page on the website autosaves it once: the revision moves on, the comment's `<li>` items come back wrapped in
  `<p>`, and `productState: "default"` is stored. The words are unchanged.
- The page's launch tags are the topics. Pricing `payment_required` shows as "Payment Required".
- The assessment suggests shoutouts and 3 or more gallery images; both are optional. Investor questions are optional and private.

## Fields that touch the public product page

`crunchbaseUrl`, `teamSize`, `yCombinatorUrl`, `fundingAmount`, `totalFundingAmount` and anything on an existing product can change its
public page even before a launch. Expect `needs_confirmation` for them, and get a yes on the preview.
