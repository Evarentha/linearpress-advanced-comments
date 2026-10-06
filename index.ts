/*
 * Advanced Comments Plugin Entry
 *
 * Cordis plugin that upgrades the comment system with Markdown rendering, IP-based rate limiting and geolocation, and a custom emoji panel.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@gmail.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Registers the plugin's SQLite schema and persisted configuration, overrides
 * the comment submission route for every permalink pattern, and exposes
 * comment rendering helpers to the overridden post view. Guest comments are
 * rate-limited per client IP and recorded with masked IPs and best-effort
 * geolocation. Also provides the custom emoji subsystem (kaomoji, single
 * images, albums) with admin management pages and a JSON API.
 * @since 1.0.0
 */

import type { Context } from 'cordis';
import type { RequestHandler, Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { checkPermission, requireAuth } from '../../services/permission.service.js';
import { resolvePostParams, postUrl } from '../../core/permalinks.js';
import type { Post } from '../../types/index.js';
import { DEFAULT_CONFIG, normalizeConfig, CONFIG_KEY, type AdvancedCommentsConfig } from './src/config.js';
import { generateUniqueId } from './src/id.js';
import { detectClientIp, resolveLocation } from './src/ip.js';
import { countChars, renderMarkdown } from './src/markdown.js';
import { parseMultipart, readRawBody } from './src/multipart.js';
import { createRateLimiter } from './src/rate-limit.js';
import { defaultPostFallback } from './src/default-view.js';

const PLUGIN_ID = 'advanced-comments';
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(PLUGIN_DIR, 'public');
const FILES_DIR = path.join(PUBLIC_DIR, 'ac-files');
const ADMIN_BASE = '/admin/advanced-comments';
const EMOJI_BASE = `${ADMIN_BASE}/emoji`;
const API_EMOJI = '/api/advanced-comments/emoji';
const MAX_UPLOAD = 16 * 1024 * 1024;

/* ------------------------------------------------------------------ schema */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ac_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS ac_comment_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ac_comment_log_ip_time ON ac_comment_log(ip, created_at);
CREATE TABLE IF NOT EXISTS ac_comment_meta (comment_id INTEGER PRIMARY KEY, ip TEXT NOT NULL, location TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ac_ip_cache (ip TEXT PRIMARY KEY, location TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ac_text_emoji (id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ac_single_emoji (id TEXT PRIMARY KEY, name TEXT NOT NULL, image_path TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ac_album (id TEXT PRIMARY KEY, name TEXT NOT NULL, cover_path TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ac_album_emoji (id TEXT PRIMARY KEY, album_id TEXT NOT NULL, image_path TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL);
`;

/* ------------------------------------------------------------- type helpers */

type Db = {
  all<T>(sql: string, ...params: unknown[]): Promise<T[]> | T[];
  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> | T | undefined;
  run(sql: string, ...params: unknown[]): unknown;
  exec(sql: string): Promise<unknown> | unknown;
};

interface ImageEmoji { id: string; name: string; url: string; }
interface TextEmoji { id: string; name: string; content: string; }
interface AlbumEmoji { id: string; name: string; url: string; position: number; }
interface Album { id: string; name: string; cover: string; description: string | null; emojis: AlbumEmoji[]; }
interface EmojiStore { singles: ImageEmoji[]; texts: TextEmoji[]; albums: Album[]; urlById: Map<string, string>; }
interface SingleRow { id: string; name: string; image_path: string; created_at: string; }
interface TextRow { id: string; name: string; content: string; }
interface AlbumRow { id: string; name: string; cover_path: string; description: string | null; created_at: string; }
interface AlbumEmojiRow { id: string; album_id: string; image_path: string; name: string; position: number; }

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : '操作失败');
const param = (value: unknown): string => Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
const text = (value: unknown): string => String(value ?? '').trim();
const fileUrl = (name: string): string => `/plugins/${PLUGIN_ID}/ac-files/${name}`;
/** 页面处理器包装：失败时渲染 error 视图（与 Base wrap 语义一致）。 */
const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler => (req, res) => {
  void Promise.resolve(fn(req, res)).catch((error) => res.status(500).render('error', { title: '服务器错误', message: messageOf(error) }));
};
/** JSON API 处理器包装：失败时返回 { ok:false }（与 Base JSON 约定一致）。 */
const wrapJson = (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler => (req, res) => {
  void Promise.resolve(fn(req, res)).catch((error) => res.status(500).json({ ok: false, message: messageOf(error) }));
};

function buildStore(singleRows: Array<{ id: string; name: string; image_path: string }>, textRows: Array<{ id: string; name: string; content: string }>, albumRows: Array<{ id: string; name: string; cover_path: string; description: string | null; created_at: string }>, albumEmojiRows: Array<{ id: string; album_id: string; image_path: string; name: string; position: number }>): EmojiStore {
  const urlById = new Map<string, string>();
  const singles = singleRows.map((row) => { const url = fileUrl(row.image_path); urlById.set(row.id, url); return { id: row.id, name: row.name, url }; });
  const texts = textRows.map((row) => ({ id: row.id, name: row.name, content: row.content }));
  const byAlbum = new Map<string, AlbumEmoji[]>();
  for (const row of albumEmojiRows) {
    const url = fileUrl(row.image_path); urlById.set(row.id, url);
    const list = byAlbum.get(row.album_id) ?? []; list.push({ id: row.id, name: row.name, url, position: row.position }); byAlbum.set(row.album_id, list);
  }
  const albums = albumRows.map((row) => {
    const emojis = (byAlbum.get(row.id) ?? []).sort((a, b) => a.position - b.position);
    return { id: row.id, name: row.name, cover: fileUrl(row.cover_path), description: row.description, emojis };
  });
  return { singles, texts, albums, urlById };
}

/* ------------------------------------------------------------------ config */

export default async function advancedComments(ctx: Context): Promise<void> {
  const db = ctx.databaseService as unknown as Db;
  const { web, hooks } = ctx.linearpress;

  // Only uniquely named fallback/admin views; themes own their web/post.
  web.viewDir(path.join(PLUGIN_DIR, 'views'));
  web.middleware(defaultPostFallback('ac-post'));

  await db.exec(SCHEMA);
  await fs.ensureDir(FILES_DIR);

  // plugins.config is canonical. Import legacy ac_config only once when no
  // registry value exists; subsequent generic JSON updates are read per request.
  let stored = await ctx.plugins.getConfig(PLUGIN_ID) as AdvancedCommentsConfig | null;
  if (stored == null) {
    try {
      const row = await db.get<{ value: string }>('SELECT value FROM ac_config WHERE key=?', CONFIG_KEY);
      if (row?.value) stored = JSON.parse(row.value);
    } catch { /* legacy corrupt/missing: use defaults */ }
    await ctx.plugins.setConfig(PLUGIN_ID, normalizeConfig(stored));
  }
  // Retire the legacy value after canonical persistence. A later JSON `null`
  // reset must not resurrect stale settings on the following application boot.
  await db.run('DELETE FROM ac_config WHERE key=?', CONFIG_KEY);
  let config = normalizeConfig(stored);
  const readConfig = async () => {
    config = normalizeConfig(await ctx.plugins.getConfig(PLUGIN_ID));
    return config;
  };
  const saveConfig = async (next: AdvancedCommentsConfig) => {
    await ctx.plugins.setConfig(PLUGIN_ID, next);
    config = next;
  };

  // 表情内存缓存，供前台面板与渲染使用。
  let emojiStore: EmojiStore = { singles: [], texts: [], albums: [], urlById: new Map() };
  const reloadEmoji = async () => {
    const [singles, texts, albums, albumEmojis] = await Promise.all([
      db.all<SingleRow>('SELECT id,name,image_path,created_at FROM ac_single_emoji ORDER BY created_at'),
      db.all<TextRow>('SELECT id,name,content FROM ac_text_emoji ORDER BY created_at'),
      db.all<AlbumRow>('SELECT id,name,cover_path,description,created_at FROM ac_album ORDER BY created_at'),
      db.all<AlbumEmojiRow>('SELECT id,album_id,image_path,name,position FROM ac_album_emoji ORDER BY album_id,position')
    ]);
    emojiStore = buildStore(singles, texts, albums, albumEmojis);
  };
  await reloadEmoji();

  const emojiUrl = (id: string): string | null => emojiStore.urlById.get(id) ?? null;
  const renderComment = (content: string, cfg = config): string => {
    if (cfg.markdownEnabled) return renderMarkdown(content, emojiUrl);
    // 关闭 Markdown 时仍展开表情图片令牌，其余按纯文本转义呈现。
    return String(content ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/:emoji:([A-Z0-9_]+)/g, (full, id: string) => { const url = emojiUrl(String(id)); return url ? `<img class="ac-emoji-img" src="${url}" alt="emoji" loading="lazy">` : full; })
      .replace(/\n/g, '<br>');
  };

  /* ----------------------------------------------------- rate limiting */

  const reserveRateLimit = createRateLimiter(db);

  /* ------------------------------------------- comment route override */

  const commentPatterns = [
    '/posts/:slug/comments',
    '/posts/:first/:slug/comments',
    '/posts/:MM/:dd/:slug/comments',
    '/posts/:yyyy/:MM/:dd/:slug/comments',
    '/post-:slug-page.html/comments',
    '/post/:slug/comments'
  ];

  const renderBackToPost = async (res: Response, post: Post, error: string): Promise<void> => {
    const site = await ctx.config.get();
    res.redirect(`${postUrl(post, site.permalink)}?comment_error=${encodeURIComponent(error)}`);
  };

  const submitComment: RequestHandler = async (req, res) => {
    try {
      const cfg = await readConfig();
      const siteConfig = await ctx.config.get();
      const { slug, id } = resolvePostParams(req.params as Record<string, string | undefined>, siteConfig.permalink);
      const posts = ctx.posts;
      const post = id ? await posts.findById(id) : await posts.findBySlug(slug ?? '');
      if (!post || post.status !== 'published') { res.status(404).render('error', { title: '未找到', message: '文章不存在或尚未发布。' }); return; }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const content = String(body.content ?? '');
      const isGuest = !req.session.userId;
      const clientIp = detectClientIp(req);

      if (isGuest && cfg.requireName) {
        const name = text(body.guest_name);
        if (!name) { await renderBackToPost(res, post, '未登录用户评论时必须填写姓名。'); return; }
      }
      if (content.trim().length < 2) { await renderBackToPost(res, post, '评论内容过短。'); return; }
      if (text(body.guest_name).length > 80 || String(body.guest_email ?? '').length > 160) {
        await renderBackToPost(res, post, '姓名或邮箱过长。'); return;
      }
      if (content.length > 5000 || countChars(content) > cfg.maxLength) {
        await renderBackToPost(res, post, `评论内容不能超过 ${cfg.maxLength} 字。`); return;
      }
      const limitError = isGuest ? await reserveRateLimit(clientIp, cfg) : null;
      if (limitError) { await renderBackToPost(res, post, limitError); return; }

      const location = await resolveLocation(clientIp, db);

      const comment = await ctx.comments.create({
        postId: post.id,
        userId: req.session.userId,
        guestName: isGuest ? text(body.guest_name) : undefined,
        guestEmail: body.guest_email as string | undefined,
        content,
        ip: clientIp
      });

      const now = new Date().toISOString();
      if (isGuest) {
        await db.run('INSERT OR REPLACE INTO ac_comment_meta(comment_id,ip,location,created_at) VALUES(?,?,?,?)', comment.id, clientIp, location, now);
        invalidateMetaCache();
      }

      const site = await ctx.config.get();
      res.redirect(`${postUrl(post, site.permalink)}?notice=comment-pending`);
    } catch (error) {
      res.status(400).render('error', { title: '评论未提交', message: messageOf(error) });
    }
  };
  for (const pattern of commentPatterns) web.register('post', pattern, submitComment);

  // 把 redirect 携带的 comment_error 注入 res.locals，供覆盖后的 post 视图展示。
  web.middleware((req, res, next) => { res.locals.acCommentError = String(req.query.comment_error ?? ''); next(); });

  /* --------------------------------------------- site locals injection */

  // 评论归属地缓存：site:locals 每请求触发，全表查询以 TTL + 写入失效控制成本。
  const META_TTL_MS = 15_000;
  let metaCache: { at: number; data: Record<string, { ip: string; location: string }> } | null = null;
  const invalidateMetaCache = (): void => { metaCache = null; };
  const loadMeta = async (): Promise<Record<string, { ip: string; location: string }>> => {
    if (metaCache && Date.now() - metaCache.at < META_TTL_MS) return metaCache.data;
    let data: Record<string, { ip: string; location: string }> = {};
    try {
      const rows = await db.all<{ comment_id: number; ip: string; location: string }>('SELECT comment_id,ip,location FROM ac_comment_meta');
      // 隐私脱敏：前台仅展示部分 IP（IPv4 保留前两段 / IPv6 保留前两组），完整 IP 只存库不下发。
      const maskIp = (ip: string): string => ip.replace(/^(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}$/, '$1.*.*').replace(/^([0-9A-Fa-f]{1,4}:[0-9A-Fa-f]{1,4}):.+$/, '$1:*');
      for (const row of rows) data[row.comment_id] = { ip: maskIp(row.ip), location: row.location };
    } catch { data = {}; }
    metaCache = { at: Date.now(), data };
    return data;
  };

  hooks.on('site:locals', async (locals: Record<string, unknown>) => {
    const cfg = await readConfig();
    const meta = await loadMeta();
    return {
      ...locals,
      advancedCommentsPartial: path.join(PLUGIN_DIR, 'views/partials/advanced-comments.ejs'),
      acCommentError: locals.acCommentError ?? '',
      ac: {
        config: cfg,
        meta,
        renderComment: (content: string) => renderComment(content, cfg),
        api: API_EMOJI,
        emojiEnabled: cfg.emojiEnabled,
        isGuest: !locals.currentUser
      }
    };
  });

  /* ------------------------------------------------------- admin: menu */

  hooks.on('admin:menu', (menu: Array<{ title: string; link: string }>) => [
    ...menu,
    { title: '高级评论', link: `${ADMIN_BASE}/settings` }
  ]);

  /* ---------------------------------------------------- settings page */

  const parseYes = (v: unknown): boolean => v === 'on' || v === true;

  web.register('get', `${ADMIN_BASE}/settings`, requireAuth, checkPermission('advanced-comments:manage'), wrap(async (_req, res) => {
    await readConfig();
    res.render('admin/ac-comments-settings', {
      title: '高级评论设置',
      config,
      notice: ''
    });
  }));
  web.register('post', `${ADMIN_BASE}/settings`, requireAuth, checkPermission('advanced-comments:manage'), wrap(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const next: AdvancedCommentsConfig = {
      perMinute: Number(body.perMinute) || DEFAULT_CONFIG.perMinute,
      perTenMinutes: Number(body.perTenMinutes) || DEFAULT_CONFIG.perTenMinutes,
      perHour: Number(body.perHour) || DEFAULT_CONFIG.perHour,
      rateLimitEnabled: parseYes(body.rateLimitEnabled),
      requireName: parseYes(body.requireName),
      maxLength: Number(body.maxLength) || DEFAULT_CONFIG.maxLength,
      markdownEnabled: parseYes(body.markdownEnabled),
      emojiEnabled: parseYes(body.emojiEnabled)
    };
    await saveConfig(normalizeConfig(next));
    res.render('admin/ac-comments-settings', { title: '高级评论设置', config, notice: '设置已保存。' });
  }));

  /* ------------------------------------------------- emoji API (frontend) */

  web.register('get', API_EMOJI, async (_req, res) => {
    res.json({ ok: true, data: emojiStore });
  });

  /* -------------------------------------------- custom emoji admin page */

  const manage: RequestHandler[] = [requireAuth, checkPermission('advanced-comments:manage')];
  // 允许通过 registerCustomSetting 在插件卡片上暴露“自定义表情”入口。
  ctx.admin.registerCustomSetting({ label: '自定义表情', link: EMOJI_BASE });

  web.register('get', EMOJI_BASE, ...manage, async (req, res) => {
    const tab = ['text', 'single', 'album'].includes(param(req.query.tab)) ? param(req.query.tab) : 'text';
    const [texts, singles, albums, albumEmojis] = await Promise.all([
      db.all<TextRow>('SELECT id,name,content FROM ac_text_emoji ORDER BY created_at'),
      db.all<SingleRow>('SELECT id,name,image_path,created_at FROM ac_single_emoji ORDER BY created_at'),
      db.all<AlbumRow>('SELECT id,name,cover_path,description,created_at FROM ac_album ORDER BY created_at'),
      db.all<AlbumEmojiRow>('SELECT id,album_id,image_path,name,position FROM ac_album_emoji ORDER BY album_id,position')
    ]);
    const albumList = albums.map((album) => {
      const emojis = albumEmojis
        .filter((e) => e.album_id === album.id)
        .sort((a, b) => a.position - b.position)
        .map((e) => ({ ...e, url: fileUrl(e.image_path) }));
      return { ...album, cover: fileUrl(album.cover_path), emojis };
    });
    res.render('admin/ac-comments-emoji', {
      title: '自定义表情',
      tab,
      texts,
      singles: singles.map((s) => ({ ...s, url: fileUrl(s.image_path) })),
      albums: albumList,
      notice: param(req.query.notice)
    });
  });

  /* --- 颜文字 */
  web.register('post', `${EMOJI_BASE}/text/add`, ...manage, wrap(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const content = text(body.content);
    if (!content) { res.redirect(`${EMOJI_BASE}?tab=text&notice=${encodeURIComponent('颜文字内容不能为空。')}`); return; }
    const name = text(body.name) || content.slice(0, 20);
    const id = await generateUniqueId('TXT', (cand) => Promise.resolve(db.get<unknown>('SELECT 1 FROM ac_text_emoji WHERE id=?', cand)).then(Boolean));
    await db.run('INSERT INTO ac_text_emoji(id,name,content,created_at) VALUES(?,?,?,?)', id, name, content, new Date().toISOString());
    await reloadEmoji();
    res.redirect(`${EMOJI_BASE}?tab=text&notice=已添加颜文字。`);
  }));
  web.register('post', `${EMOJI_BASE}/text/:id/delete`, ...manage, wrap(async (req, res) => {
    await db.run('DELETE FROM ac_text_emoji WHERE id=?', param(req.params.id));
    await reloadEmoji();
    res.redirect(`${EMOJI_BASE}?tab=text&notice=已删除。`);
  }));

  /* --- 单个表情 */
  web.register('post', `${EMOJI_BASE}/single/add`, ...manage, wrap(async (req, res) => {
    const parsed = await parseUpload(req);
    const file = parsed.files[0];
    const name = text(parsed.fields.name);
    if (!file || !file.data.length) { res.redirect(`${EMOJI_BASE}?tab=single&notice=${encodeURIComponent('请上传表情图片。')}`); return; }
    if (!name) { res.redirect(`${EMOJI_BASE}?tab=single&notice=${encodeURIComponent('请填写表情配文。')}`); return; }
    const filename = await saveImage(file.data, file.filename);
    const id = await generateUniqueId('SIN', (cand) => Promise.resolve(db.get<unknown>('SELECT 1 FROM ac_single_emoji WHERE id=?', cand)).then(Boolean));
    await db.run('INSERT INTO ac_single_emoji(id,name,image_path,created_at) VALUES(?,?,?,?)', id, name, filename, new Date().toISOString());
    await reloadEmoji();
    res.redirect(`${EMOJI_BASE}?tab=single&notice=已添加单个表情。`);
  }));
  web.register('post', `${EMOJI_BASE}/single/:id/delete`, ...manage, wrap(async (req, res) => {
    await db.run('DELETE FROM ac_single_emoji WHERE id=?', param(req.params.id));
    await reloadEmoji();
    res.redirect(`${EMOJI_BASE}?tab=single&notice=已删除。`);
  }));

  /* --- 表情专辑 */
  web.register('post', `${EMOJI_BASE}/album/add`, ...manage, wrap(async (req, res) => {
    const parsed = await parseUpload(req);
    const cover = parsed.files.find((f) => f.name === 'cover');
    const name = text(parsed.fields.name);
    const description = text(parsed.fields.description) || null;
    const emojiFiles = parsed.files.filter((f) => f.name.startsWith('emoji_'));
    if (!cover || !cover.data.length) { res.redirect(`${EMOJI_BASE}?tab=album&notice=${encodeURIComponent('请上传专辑封面图。')}`); return; }
    if (!name) { res.redirect(`${EMOJI_BASE}?tab=album&notice=${encodeURIComponent('请填写专辑名称。')}`); return; }
    if (!emojiFiles.length) { res.redirect(`${EMOJI_BASE}?tab=album&notice=${encodeURIComponent('请至少上传一张表情图片。')}`); return; }
    // 校验每张表情都有自己的配文
    for (const f of emojiFiles) {
      const caption = text(parsed.fields[`caption_${f.name}`]);
      if (!caption) { res.redirect(`${EMOJI_BASE}?tab=album&notice=${encodeURIComponent('每张表情都需要配文。')}`); return; }
    }
    const albumId = await generateUniqueId('COL', (cand) => Promise.resolve(db.get<unknown>('SELECT 1 FROM ac_album WHERE id=?', cand)).then(Boolean));
    const albumCode = albumId.slice(4);
    const coverPath = await saveImage(cover.data, cover.filename);
    await db.run('INSERT INTO ac_album(id,name,cover_path,description,created_at) VALUES(?,?,?,?,?)', albumId, name, coverPath, description, new Date().toISOString());
    let position = 1;
    for (const f of emojiFiles) {
      const caption = text(parsed.fields[`caption_${f.name}`]);
      const imagePath = await saveImage(f.data, f.filename);
      const emojiId = `COL_${albumCode}_${position}`;
      await db.run('INSERT INTO ac_album_emoji(id,album_id,image_path,name,position) VALUES(?,?,?,?,?)', emojiId, albumId, imagePath, caption, position);
      position++;
    }
    await reloadEmoji();
    res.redirect(`${EMOJI_BASE}?tab=album&notice=已添加表情专辑。`);
  }));
  web.register('post', `${EMOJI_BASE}/album/:id/delete`, ...manage, wrap(async (req, res) => {
    const albumId = param(req.params.id);
    await db.run('DELETE FROM ac_album_emoji WHERE album_id=?', albumId);
    await db.run('DELETE FROM ac_album WHERE id=?', albumId);
    await reloadEmoji();
    res.redirect(`${EMOJI_BASE}?tab=album&notice=已删除专辑。`);
  }));

  /* ------------------------------------------------------- maintenance */

  // 定时清理：限频日志保留 2 天（窗口最长 1 小时），IP 归属地缓存上限 5000 条。
  ctx.effect(() => {
    const timer = setInterval(() => {
      void (async () => {
        try {
          const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
          await db.run('DELETE FROM ac_comment_log WHERE created_at<?', cutoff);
          const count = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ac_ip_cache');
          if (Number(count?.n ?? 0) > 5000) {
            // Explicit primary keys work on both SQLite and MySQL (no rowid).
            const stale = await db.all<{ ip: string }>('SELECT ip FROM ac_ip_cache ORDER BY ip LIMIT ?', Math.min(Number(count!.n) - 5000, 500));
            if (stale.length) await db.run(`DELETE FROM ac_ip_cache WHERE ip IN (${stale.map(() => '?').join(',')})`, ...stale.map(row => row.ip));
          }
        } catch { /* 清理失败不影响主流程 */ }
      })();
    }, 60 * 60 * 1000);
    timer.unref?.();
    return () => clearInterval(timer);
  });

  ctx.logger.info('activated');
}



/** 解析 multipart 请求体（文本字段 + 文件）。 */
async function parseUpload(req: Request): Promise<{ fields: Record<string, string>; files: Array<{ name: string; filename: string; data: Buffer }> }> {
  const contentType = String(req.headers['content-type'] || '');
  const body = await readRawBody(req, MAX_UPLOAD);
  return parseMultipart(body, contentType);
}

/** 允许上传的图片扩展名（禁止 .html/.svg 等可执行内容同源托管）。 */
const IMAGE_EXT_WHITELIST = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/** 校验并保存上传图片，返回存储文件名。 */
async function saveImage(data: Buffer, filename: string): Promise<string> {
  if (!data.length) throw new Error('图片内容为空');
  const ext = path.extname(filename).toLowerCase();
  if (!IMAGE_EXT_WHITELIST.has(ext)) throw new Error('仅支持 PNG/JPG/GIF/WebP 图片。');
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  await fs.writeFile(path.join(FILES_DIR, name), data, { flag: 'wx' });
  return name;
}
