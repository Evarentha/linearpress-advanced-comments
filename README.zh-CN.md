# 评论增强

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-advanced-comments.svg)](https://www.npmjs.com/package/@evarentha/linearpress-advanced-comments) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

[English](README.md) | **简体中文**

为 LinearPress 评论加上规则、Markdown 和表情面板。

## 功能

- 访客规则：按 IP 限制频率、最少和最多字数、必须填写称呼。
- 评论支持 Markdown（加粗、斜体、代码、链接、图片、引用、列表），安全渲染。
- 评论框下的表情面板：常用表情、颜文字，以及自己上传的表情和专辑。
- 可选显示评论者的 IP 属地。

## 入口

- `/admin/advanced-comments`：评论规则、颜文字、单个表情和表情专辑（权限 advanced-comments:manage）

## 安装

LinearPress 4 已内置。在后台“插件”页启用或停用，立即生效，无需重启。其他安装方式：在 LinearPress 目录执行 `npm run sync -- advanced-comments`，或把本仓库放到 `src/plugins/advanced-comments`（目录名必须等于插件 id）。

需要 LinearPress ^4.0.0，支持 SQLite 和 MySQL。

## 许可

GPL-3.0-or-later，见 [LICENSE](LICENSE)。

源码：https://github.com/Evarentha/linearpress-advanced-comments
