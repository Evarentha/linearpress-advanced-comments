# Comment Enhancements

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-advanced-comments.svg)](https://www.npmjs.com/package/@evarentha/linearpress-advanced-comments) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

Comment rules, Markdown comments and an emoji panel for LinearPress.

## Features

- Rules for guests: rate limit per IP, minimum and maximum length, required name.
- Markdown in comments (bold, italic, code, links, images, quotes, lists), rendered safely.
- Emoji panel under the comment box: common emoji, kaomoji, and your own uploaded emoji and albums.
- Optional display of the commenter’s IP region.

## Where to find it

- `/admin/advanced-comments`: rules, text emoji, single emoji and albums (permission advanced-comments:manage)

## Install

Bundled with LinearPress 4. Enable or disable it on the admin Plugins page; the change applies immediately, no restart. In another checkout, run `npm run sync -- advanced-comments` from LinearPress, or put this repository at `src/plugins/advanced-comments` (the directory name must equal the plugin id).

Requires LinearPress ^4.0.0. Works on SQLite and MySQL.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

Source: https://github.com/Evarentha/linearpress-advanced-comments
