<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# 高级评论系统 · Advanced Comments

Comment section enhancement for LinearPress：**Markdown comments, rate limiting & guest name requirement, IP geo display and an emoji panel**.

LinearPress 的评论增强插件：**Markdown 评论、限频与姓名约束、IP 归属地展示与表情面板**。

> Independent plugin repository for LinearPress **advanced-comments**. A plugin is a Cordis plugin function — install on demand, disable/uninstall cleanly.
> 本仓库是 LinearPress 插件 **advanced-comments** 的独立仓库。

## Why Plugins? / 插件化的优势

- **View override = enhancement** —— overrides the comment section via `views/web/post.ejs` and injects template helpers via hooks; core comment routes & data model untouched.
  **覆盖视图即可增强**——通过视图覆盖 + Hook 注入模板辅助，核心评论路由与数据模型不动。
- **Stackable rate limits** —— the core ships a basic per-IP limit; this plugin layers stricter multi-window policies on top, no conflict.
  **可叠加限频策略**——核心自带基础限频，本插件在其上叠加更严格的多窗口策略。
- **XSS-safe by construction** —— Markdown is escaped-then-rendered; custom emoji store only IDs, never rich text.
  **防存储型 XSS 开箱即用**——先转义后渲染；自定义表情只存 ID 引用。

## Features / 功能

- **Guest constraints & limits / 未登录约束与限频**：name required; per-IP limits（default 1/min、3/10min、5/hour，adjustable）；IP display（`X-Real-IP` preferred）with geo.
- **Markdown comments / Markdown 评论**：safe renderer（headings/lists/quotes/code/links/images/bold/italic/strikethrough）；default 300-char limit with live counter and `M↓ Supported` hint.
- **Emoji panel / 表情与符号**：single emoji → emoji → kaomoji → custom albums; mouse-wheel/touch swiping; custom import with rules `TXT_/SIN_/COL_<6位码>`.

## Install / 安装

```bash
# Option 1 — workspace sync（工作区同步）
cd base && sh scripts/sync-plugins.sh advanced-comments

# Option 2 — clone into runtime dir（目录名必须等于插件 id）
git clone https://github.com/Evarentha/linearpress-advanced-comments src/plugins/advanced-comments
```

## Admin / 后台

- Sidebar「高级评论」→ settings（rate limits, name required, Markdown toggle, length, emoji toggle）
- Plugin card「自定义表情」→ kaomoji / single emoji / album management
- Admin routes need `advanced-comments:manage`（super admin auto-granted）

## Local Development / 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone https://github.com/Evarentha/linearpress-advanced-comments LinearPress/Plugins/advanced-comments
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh advanced-comments
npm run dev
```

## Directory / 目录结构

```text
advanced-comments/
├── plugin.json               Manifest（permissions: advanced-comments:manage）
├── index.ts                  entry：tables, comment route, rate limits, IP geo, admin routes & menu
├── src/                      config / id / ip / markdown / multipart modules
├── views/
│   ├── web/post.ejs          overrides the article page comment section
│   └── admin/                settings + emoji management pages
└── public/                   char count, emoji panel, album editing
```

## Contribute & Release / 贡献与发布

- conventional commits；`cd base && npm run typecheck` before commit
- Version：`git tag v1.0.0 && git push --tags`
- License：MIT（LICENSE）