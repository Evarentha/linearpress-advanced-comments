<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# 高级评论系统 advanced-comments

LinearPress 的 Cordis 插件，为文章评论区提供：

## 功能

- **未登录用户约束**：评论必须填写姓名；按 IP 限频（默认 1 条/分钟、3 条/10 分钟、5 条/小时，全站文章共用，可后台调整）；评论自动展示 IP（`X-Real-IP` 优先）与归属地。
- **Markdown 评论**：轻量安全的 Markdown 渲染（标题/列表/引用/代码/链接/图片/加粗/斜体/删除线），先转义再渲染防 XSS；字数（含 MD 字符）默认上限 300 字，输入框右下角实时计数并标注 `M↓ Supported`，上限可后台调整。
- **表情与符号**：评论输入框内置表情按钮，弹窗分上下两区（上：标题/关闭/专辑横滑选择；下：当前表情网格，桌面滚轮、移动端触屏滑动）。默认顺序：单个表情 → emoji → 颜文字 → 自定义专辑。
- **自定义表情导入**：插件卡片「自定义表情」入口进入管理页，含三个 2 级菜单：颜文字（文本）、单个表情（图片+配文）、专辑表情（封面图+名称+可选介绍+至少一张表情图与配文）。ID 规则：`TXT_<6位唯一码>`、`SIN_<6位唯一码>`、`COL_<6位唯一码>`，专辑内表情 `COL_<专辑码>_<序号>`。

## 安装

部署到宿主项目的 `src/plugins/advanced-comments`（或通过插件管理页 ZIP/npm 安装），重启 LinearPress 自动发现并启用。

## 后台

- 侧边栏菜单「高级评论」→ 设置页（限频三值、是否必填姓名、Markdown 开关、字数上限、表情开关）。
- 插件卡片「自定义表情」→ 颜文字 / 单个表情 / 专辑表情管理。
- 管理路由需要 `advanced-comments:manage` 权限（超级管理员自动通过）。

## 目录

- `index.ts`：建表、覆盖评论提交路由、限频、IP 归属地、后台路由与菜单
- `src/config.ts` / `src/id.ts` / `src/ip.ts` / `src/markdown.ts` / `src/multipart.ts`
- `views/web/post.ejs`：覆盖文章页评论区（视图优先级最高）
- `views/admin/ac-comments-settings.ejs`、`views/admin/ac-comments-emoji.ejs`
- `public/advanced-comments.css|js`：字数统计、表情面板、后台专辑编辑交互