# Advanced Comments

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-advanced-comments.svg)](https://www.npmjs.com/package/@evarentha/linearpress-advanced-comments) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

`advanced-comments` rebuilds the comment area on LinearPress posts: rate limiting for guests across three windows, masked IPs with geolocation, safe Markdown, a live character counter, and an emoji system managed from the admin console. It's a type `both` plugin (server routes plus views and frontend assets) and needs no other plugin. It overrides the base post template (`views/web/post.ejs`) to draw the new comment area, and view overrides take priority over base templates.

## What it does

Comments from visitors who are not logged in are limited by IP across three overlapping windows: 1 per minute, 3 per 10 minutes, and 5 per hour by default, all adjustable in settings. These limits stack on top of the base's own per-IP limit, and the two coexist without conflict. You can also decide whether guests must leave a name to comment.

Guest comments show a partial IP (first two octets for IPv4, first two groups for IPv6) next to the resolved location. The full IP is stored server-side only and never sent to the browser. Locations are resolved through ip-api.com and cached at two levels, in memory and in a database table.

Comment text is HTML-escaped before any markup is applied, which rules out stored XSS. Link targets are whitelisted to http, https, mailto, and relative addresses; anything else degrades to `#`. Uploaded emoji images must be PNG, JPG, GIF, or WebP, so HTML, SVG, and other active content never gets hosted same-origin. Headings, lists, quotes, fenced code blocks, bold, italic, and strikethrough are all supported.

The comment box shows a running count against the configured maximum, 300 by default. Counting is done in Unicode code points, so the browser counter and the server-side check always agree.

A picker in the comment box offers a Unicode emoji panel, kaomoji, and custom images: single images with captions, or albums with covers and captions. For example, this comment uses the safe Markdown and an emoji token:

```markdown
**Key point** was already covered in [the previous chapter](https://example.com/prev), code as usual: `npm i linearpress`.
Bookmarked :emoji:SIN_a1b2c3
```

The `:emoji:` token is replaced by the uploaded image at render time; IDs come from the emoji management page and use the prefixes shown there: `SIN_` for a single image, `TXT_` for kaomoji, and `COL_<album>_<position>` for an entry inside an album, for example `:emoji:COL_a1b2c3_2`.

## Install

```bash
git clone https://github.com/Evarentha/linearpress-advanced-comments.git src/plugins/advanced-comments
```

The directory name must equal the plugin id. Restart afterwards, or sync from the `base` checkout (`sh scripts/sync-plugins.sh advanced-comments`), or upload the ZIP / npm name from the admin Plugins page.

Running behind a reverse proxy? Set `TRUST_PROXY=1` so visitor IPs are read from `X-Real-IP` / `X-Forwarded-For`. Without it the plugin falls back to the socket address.

## Settings

The settings page lives at `/admin/advanced-comments/settings` (admin sidebar entry "高级评论", Advanced Comments): rate limiting on/off and the three window values, whether guests must fill in a name, Markdown rendering on/off, the maximum comment length, and the emoji panel on/off. Custom emoji are managed at `/admin/advanced-comments/emoji`, with separate tabs for kaomoji, single images, and albums.

Both pages require `advanced-comments:manage`, which super administrators hold automatically. Settings are stored as JSON under the key `advanced-comments` in the plugin's own `ac_config` table in the business database.

## How it plugs in

Comment submission (POST) is overridden on all six permalink shapes that carry comment endpoints; the seventh format, `/posts/:id`, has no comment endpoint in the base system either: `/posts/:slug/comments`, `/posts/:first/:slug/comments`, `/posts/:MM/:dd/:slug/comments`, `/posts/:yyyy/:MM/:dd/:slug/comments`, `/post-:slug-page.html/comments`, and `/post/:slug/comments`. `GET /api/advanced-comments/emoji` returns the emoji store for the frontend picker. The `site:locals` hook injects an `ac` helper object (config, comment metadata, Markdown renderer, emoji API path) for templates, and `admin:menu` adds the sidebar entry.

An hourly job prunes the rate-limit log (kept for two days) and caps the IP cache at 5000 rows. colorful-profiles overrides the same post view but preserves this plugin's comment features and adds avatars, so the two work together.

## Tables

All created in the business database:

| Table | Purpose |
| --- | --- |
| `ac_config` | plugin settings (JSON) |
| `ac_comment_log` | guest comment timestamps, the input for rate limiting |
| `ac_comment_meta` | full IP and resolved location per comment (server-side only) |
| `ac_ip_cache` | resolved geolocation per IP |
| `ac_text_emoji` | kaomoji entries |
| `ac_single_emoji` | custom single images |
| `ac_album` | emoji albums (cover, caption) |
| `ac_album_emoji` | images inside an album |

## License

GPL-3.0-or-later, Copyright (C) 2026 Evarentha. See LICENSE.
