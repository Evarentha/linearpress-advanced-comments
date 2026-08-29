<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# 高级评论系统（advanced-comments）

LinearPress 的 Cordis 插件，为文章评论区提供 **Markdown 评论、限频与姓名约束、IP 归属地展示与表情面板**。

> 本仓库是 LinearPress 插件 **advanced-comments** 的独立开发仓库。插件即 Cordis 插件函数，即插即用、可停用可卸载。

## 插件化的优势

- **覆盖视图即可增强**：通过 `views/web/post.ejs` 覆盖文章页评论区，用 Hook 注入模板辅助（Markdown 渲染、限频状态、表情数据），核心评论路由与数据模型不动。
- **可叠加限频策略**：核心自带「同 IP 10 分钟 20 条」基础限频，本插件在其上叠加更严格的多窗口策略，互不冲突。
- **存储型 XSS 防护开箱即用**：Markdown 先转义后渲染；自定义表情只存 ID 引用，非富文本。

## 功能

- **未登录用户约束**：评论必须填写姓名；按 IP 限频（默认 1 条/分钟、3 条/10 分钟、5 条/小时，全站共用，后台可调）；评论自动展示 IP（`X-Real-IP` 优先）与归属地。
- **Markdown 评论**：轻量安全渲染（标题/列表/引用/代码/链接/图片/加粗/斜体/删除线），字数默认上限 300，输入框右下角实时计数并标注 `M↓ Supported`。
- **表情与符号**：评论框内置表情按钮，弹窗分区：单个表情 → emoji → 颜文字 → 自定义专辑；桌面滚轮/移动端触屏滑动。
- **自定义表情导入**：插件卡片「自定义表情」进入管理页——颜文字（文本）、单个表情（图片+配文）、专辑表情（封面+多图）；ID 规则 `TXT_/SIN_/COL_<6位码>`。

## 安装

```bash
# 方式一：工作区同步
cd base && sh scripts/sync-plugins.sh advanced-comments

# 方式二：克隆到运行目录（目录名必须等于插件 id）
git clone <本仓库地址> src/plugins/advanced-comments
```

重启 LinearPress 自动发现并启用；也可 ZIP/npm 安装。

## 后台

- 侧边栏「高级评论」→ 设置页（限频三值、姓名必填、Markdown 开关、字数上限、表情开关）
- 插件卡片「自定义表情」→ 颜文字 / 单个表情 / 专辑表情管理
- 管理路由需要 `advanced-comments:manage` 权限（超级管理员自动通过）

## 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone <本仓库地址> LinearPress/Plugins/advanced-comments
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh advanced-comments
npm run dev
```

## 目录结构

```text
advanced-comments/
├── plugin.json               # Manifest（permissions: advanced-comments:manage）
├── index.ts                  # 建表、覆盖评论提交路由、限频、IP 归属地、后台路由与菜单
├── src/
│   ├── config.ts / id.ts / ip.ts / markdown.ts / multipart.ts
├── views/
│   ├── web/post.ejs          # 覆盖文章页评论区（视图优先级最高）
│   └── admin/                # 设置页、表情管理页
└── public/                   # 字数统计、表情面板、后台专辑编辑交互
```

## 贡献与发布

- conventional commits；提交前 `cd base && npm run typecheck`
- 版本：`git tag v1.0.0 && git push --tags`
- License：MIT（见仓库 LICENSE）