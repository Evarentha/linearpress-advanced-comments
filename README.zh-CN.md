# 高级评论系统（advanced-comments）

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-advanced-comments.svg)](https://www.npmjs.com/package/@evarentha/linearpress-advanced-comments) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

[English](README.md) | **简体中文**

`advanced-comments` 重新构建 LinearPress 的文章评论区，提供未登录访客的多窗口限频、脱敏 IP 与归属地展示、安全的 Markdown 渲染、实时字数统计，以及可在后台管理的表情系统。插件类型为 `both`（服务端路由、视图与前端资源），不依赖其他插件。插件提供独立评论 partial，不覆盖主题的 `web/post`；未安装主题时自动增强 Base 默认文章页。

## 功能

未登录访客的评论按 IP 限频，三个窗口叠加：默认每分钟 1 条、每 10 分钟 3 条、每小时 5 条，均可在设置中调整。插件接管评论路由并执行这些限额。检查与持久化占用在单进程内串行完成，支持异步数据库；多进程部署仍需额外的数据库级锁。无效字段和被拒绝的请求不扣额度，通过字段校验的游客请求即占用额度，后续 hook/存储失败不退还，避免失败请求无限重试。是否强制游客填写姓名亦可配置。

游客评论旁展示部分 IP（IPv4 保留前两段，IPv6 保留前两组）与归属地。完整 IP 仅存于服务端，不下发至浏览器。归属地经 ip-api.com 解析，采用内存与数据库表两级缓存。

评论正文先经 HTML 转义再应用任何标记，从根本上杜绝存储型 XSS。链接仅放行 http、https、mailto 与相对地址，其余一律降级为 `#`；上传的表情图片仅接受 PNG、JPG、GIF、WebP，HTML、SVG 等可执行内容不会被同源托管。标题、列表、引用、围栏代码块、加粗、斜体、删除线均在支持范围内。

评论框实时显示字数，上限默认 300，可配置。计数按 Unicode 码点计算，浏览器端与服务端的校验结果保持一致。评论框内提供表情选择器，包含 Unicode 表情面板、颜文字及自定义图片（带配文的单图，或带封面与配文的专辑）。例如，下面这条评论同时用到了安全 Markdown 与表情令牌：

```markdown
**重点**已在 [上一章](https://example.com/prev) 讲过,代码照常用 `npm i linearpress`。
收藏了 :emoji:SIN_a1b2c3
```

`:emoji:` 令牌在渲染时替换为已上传的图片，ID 来自表情管理页并使用页面所示前缀：单图为 `SIN_`、颜文字为 `TXT_`、专辑内条目为 `COL_<专辑>_<序号>`，例如 `:emoji:COL_a1b2c3_2`。

## 安装

```bash
git clone https://github.com/Evarentha/linearpress-advanced-comments.git src/plugins/advanced-comments
```

目录名必须与插件 id 一致，安装后需重启 LinearPress，插件在启动时被发现并激活。也可以在 `base` 检出中执行 `sh scripts/sync-plugins.sh advanced-comments`，或在后台插件页上传 ZIP、填写 npm 包名。

若站点位于反向代理之后，应将 `TRUST_PROXY` 设为 `1`，使访客 IP 取自 `X-Real-IP` / `X-Forwarded-For`；未设置时回退至 socket 地址。

## 设置

设置页位于 `/admin/advanced-comments/settings`（侧栏入口「高级评论」），包含限频开关与三个窗口值、游客是否必须填写姓名、Markdown 开关、评论长度上限、表情面板开关。自定义表情在 `/admin/advanced-comments/emoji` 管理，颜文字、单图、专辑各设一个标签页。

两个页面均需要 `advanced-comments:manage` 权限，超级管理员自动具备。设置统一存储于基础设施库 `plugins.config`，插件 ID 为 `advanced-comments`。独立设置页与通用 JSON 设置页使用同一来源；每次请求重新读取，保存后无须重启。首次未配置时导入旧 `ac_config`，以后不再写入该旧表。站点设置也通过 `ctx.config.get()` 获取；Base 在 MySQL 模式下仍有意将站点设置和插件注册表保留在本地基础设施 SQLite。

## 接入方式

评论提交（POST）在全部六种带评论端点的固定链接形态上被接管（第七种格式 `/posts/:id` 在基础系统中同样没有评论端点）：`/posts/:slug/comments`、`/posts/:first/:slug/comments`、`/posts/:MM/:dd/:slug/comments`、`/posts/:yyyy/:MM/:dd/:slug/comments`、`/post-:slug-page.html/comments`、`/post/:slug/comments`。`GET /api/advanced-comments/emoji` 为前端选择器提供表情数据；`site:locals` Hook 向模板注入 `ac` 辅助对象（配置、评论元数据、Markdown 渲染器、表情 API 地址）；`admin:menu` 负责侧栏入口。

限频日志在预占时每分钟清理一小时前记录，后台另有每小时清理任务；内存 IP 缓存最多 2048 项。colorful-profiles 与此 partial 共享评论功能，不抢占主题文章模板。

主题在文章内容后包含 `<%- include(advancedCommentsPartial) %>`（先以 `typeof advancedCommentsPartial === "string"` 判断）；变量来自 `site:locals`，指向 `views/partials/advanced-comments.ejs` 的绝对路径。必需 locals 仅 `post` 与 `postUrl`，`comments/currentUser/notice/acCommentError/ac` 和 `cf*` 资料辅助函数均有本地默认。partial 保留 `ac-toolbar`、`ac-comment-form`、`ac-error`、`guest_name`/`guest_email`；captcha 可沿用 `form[action$="/comments"]` 和显式 submit 按钮注入，也可通过可信的 `acCommentFormExtraHtml` 扩展。主题布局应输出插件声明的 styles/scripts；partial 输出客户端 emoji 配置。

## 数据表

以下表均创建于业务库：

| 表 | 用途 |
| --- | --- |
| `ac_config` | 旧版设置，只用于首次迁移 |
| `ac_comment_log` | 游客评论时间戳，限频的输入 |
| `ac_comment_meta` | 每条评论的完整 IP 与归属地（仅服务端） |
| `ac_ip_cache` | 每个 IP 的归属地缓存 |
| `ac_text_emoji` | 颜文字 |
| `ac_single_emoji` | 自定义单图 |
| `ac_album` | 表情包专辑（封面、配文） |
| `ac_album_emoji` | 专辑内的图片 |

## 许可证

本项目以 GPL-3.0-or-later 许可发布，Copyright (C) 2026 Evarentha，完整文本见 [LICENSE](LICENSE)。
