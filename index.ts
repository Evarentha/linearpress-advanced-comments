/*
 * Advanced Comments Plugin Entry Point
 *
 * Comment rules (rate limits, length, required name), Markdown, emoji picker and optional IP region display.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p>Works through the core comment pipeline instead of replacing the comment
 * route or the post template: a <code>comment</code> guard enforces length
 * and guest rate limits, the <code>comment.content</code> filter renders
 * Markdown and emoji, slots add the toolbar and the region label.</p>
 * <p>IP region lookup sends visitor IPs to a third-party service, so it is off
 * by default and runs after the comment is saved (never delays posting).</p>
 *
 * @since 1.0.0
 */

import fs from 'fs-extra';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Context } from 'cordis';
import { checkPermission, requireAuth, route, text, readMultipart, UploadError, messageOf, placeholders, utcNow } from 'linearpress/plugin-api';
import type { DisplayComment } from 'linearpress/plugin-api';
import { DEFAULT_CONFIG, normalizeConfig, parseConfigBody, type AdvancedCommentsConfig } from './src/config.js';
import { generateUniqueId } from './src/id.js';
import { lookupRegion } from './src/ip.js';
import { countChars, renderMarkdown } from './src/markdown.js';
import { createRateLimiter } from './src/rate-limit.js';

const PLUGIN_ID = 'advanced-comments';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(DIR, 'views', PLUGIN_ID);
const FILES = path.join(process.cwd(), 'uploads', PLUGIN_ID);
const LEGACY_FILES = path.join(DIR, 'public', 'ac-files');
const FILE_ROUTE = '/advanced-comments/emoji';
const ADMIN = '/admin/advanced-comments';
const MAX_IMAGE = 2 * 1024 * 1024;
const IMAGE_TYPES: Array<[string, (b: Buffer) => boolean]> = [
  ['.png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['.jpg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['.gif', (b) => b.subarray(0, 4).toString('latin1') === 'GIF8'],
  ['.webp', (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP']
];

interface Emoji { id: string; name: string; url: string; }
interface Album { id: string; name: string; cover: string; description: string | null; emojis: Array<Emoji & { position: number }>; }
interface Store { singles: Emoji[]; texts: Array<{ id: string; name: string; content: string }>; albums: Album[]; }

const fileUrl = (name: string) => `${FILE_ROUTE}/${encodeURIComponent(name)}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]!));

export default async function advancedComments(ctx: Context): Promise<void> {
  const { web, ui, admin, auth, hooks } = ctx.linearpress;
  const db = () => ctx.databaseService;
  const mysql = db().dialect === 'mysql';

  /* ---------- schema ---------- */
  const text255 = mysql ? 'VARCHAR(255)' : 'TEXT';
  const key = mysql ? 'VARCHAR(64)' : 'TEXT';
  await db().exec([
    `CREATE TABLE IF NOT EXISTS ac_comment_log (id ${mysql ? 'INT AUTO_INCREMENT' : 'INTEGER'} PRIMARY KEY${mysql ? '' : ' AUTOINCREMENT'}, ip ${mysql ? 'VARCHAR(64)' : 'TEXT'} NOT NULL, created_at ${mysql ? 'VARCHAR(40)' : 'TEXT'} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ac_comment_meta (comment_id ${mysql ? 'INT' : 'INTEGER'} PRIMARY KEY, ip ${mysql ? 'VARCHAR(64)' : 'TEXT'} NOT NULL, location ${text255} NOT NULL, created_at ${mysql ? 'VARCHAR(40)' : 'TEXT'} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ac_ip_cache (ip ${mysql ? 'VARCHAR(64)' : 'TEXT'} PRIMARY KEY, location ${text255} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ac_text_emoji (id ${key} PRIMARY KEY, name ${text255} NOT NULL, content ${mysql ? 'TEXT' : 'TEXT'} NOT NULL, created_at ${mysql ? 'VARCHAR(40)' : 'TEXT'} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ac_single_emoji (id ${key} PRIMARY KEY, name ${text255} NOT NULL, image_path ${text255} NOT NULL, created_at ${mysql ? 'VARCHAR(40)' : 'TEXT'} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ac_album (id ${key} PRIMARY KEY, name ${text255} NOT NULL, cover_path ${text255} NOT NULL, description ${mysql ? 'TEXT' : 'TEXT'}, created_at ${mysql ? 'VARCHAR(40)' : 'TEXT'} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ac_album_emoji (id ${key} PRIMARY KEY, album_id ${key} NOT NULL, image_path ${text255} NOT NULL, name ${text255} NOT NULL, position INT NOT NULL)`
  ].join(';\n'));
  if (!mysql) await db().exec('CREATE INDEX IF NOT EXISTS ac_comment_log_ip_time ON ac_comment_log(ip, created_at)');

  /* ---------- files: moved out of the plugin folder so updates cannot delete them ---------- */
  await fs.ensureDir(FILES);
  if (await fs.pathExists(LEGACY_FILES)) {
    for (const name of await fs.readdir(LEGACY_FILES)) if (!await fs.pathExists(path.join(FILES, name))) await fs.copy(path.join(LEGACY_FILES, name), path.join(FILES, name));
  }

  /* ---------- config (3.x kept it in ac_config) ---------- */
  let stored = await ctx.plugins.getConfig<Partial<AdvancedCommentsConfig>>(PLUGIN_ID);
  if (stored == null && await db().hasTable('ac_config')) {
    try { const row = await db().get<{ value: string }>(`SELECT value FROM ac_config WHERE ${mysql ? '`key`' : 'key'} = ?`, PLUGIN_ID); if (row?.value) stored = JSON.parse(row.value); } catch { /* defaults */ }
  }
  let config = normalizeConfig(stored);
  if (stored == null) await ctx.plugins.setConfig(PLUGIN_ID, config);

  /* ---------- emoji store ---------- */
  let store: Store = { singles: [], texts: [], albums: [] };
  const urlById = new Map<string, string>();
  async function reloadEmoji() {
    const [singles, texts, albums, albumEmojis] = await Promise.all([
      db().all<{ id: string; name: string; image_path: string }>('SELECT id, name, image_path FROM ac_single_emoji ORDER BY created_at'),
      db().all<{ id: string; name: string; content: string }>('SELECT id, name, content FROM ac_text_emoji ORDER BY created_at'),
      db().all<{ id: string; name: string; cover_path: string; description: string | null }>('SELECT id, name, cover_path, description FROM ac_album ORDER BY created_at'),
      db().all<{ id: string; album_id: string; image_path: string; name: string; position: number }>('SELECT id, album_id, image_path, name, position FROM ac_album_emoji ORDER BY album_id, position')
    ]);
    urlById.clear();
    const single = singles.map((row) => { const url = fileUrl(row.image_path); urlById.set(row.id, url); return { id: row.id, name: row.name, url }; });
    const albumList = albums.map((album) => ({
      id: album.id, name: album.name, cover: fileUrl(album.cover_path), description: album.description,
      emojis: albumEmojis.filter((row) => row.album_id === album.id).map((row) => { const url = fileUrl(row.image_path); urlById.set(row.id, url); return { id: row.id, name: row.name, url, position: Number(row.position) }; })
    }));
    store = { singles: single, texts, albums: albumList };
  }
  await reloadEmoji();
  const emojiUrl = (id: string) => urlById.get(id) ?? null;

  /* ---------- posting rules ---------- */
  const reserve = createRateLimiter(db());
  auth.guard('comment', {
    id: PLUGIN_ID,
    order: 50,
    async before({ fields, user }) {
      const content = String(fields.content ?? '');
      const length = countChars(content.trim());
      if (length < config.minLength) return { deny: `评论至少需要 ${config.minLength} 个字`, field: 'content' };
      if (length > config.maxLength) return { deny: `评论最多 ${config.maxLength} 字，现在有 ${length} 字`, field: 'content' };
      if (!user && config.requireName && !String(fields.guest_name ?? '').trim()) return { deny: '请填写称呼', field: 'guest_name' };
    }
  });
  // Rate limits count only comments that are actually being created (after every other check passed).
  hooks.on('comment:beforeCreate', async (draft) => {
    if (!draft.userId) { const limited = await reserve(draft.ip ?? '', config); if (limited) throw new Error(limited); }
    return draft;
  });
  ui.filter('comments.guestNameRequired', (value: boolean) => value || config.requireName);

  /* ---------- display ---------- */
  ui.filter('comment.content', (html: string, comment: { content?: string }) => config.markdownEnabled
    ? renderMarkdown(String(comment?.content ?? ''), emojiUrl)
    : String(html).replace(/:emoji:([A-Z0-9_]+)/g, (token, id: string) => { const url = emojiUrl(id); return url ? `<img class="ac-emoji-img" src="${url}" alt="表情" loading="lazy">` : token; }));
  ui.slot('comment.form.toolbar', {
    render: () => {
      const parts = [
        config.emojiEnabled ? '<button type="button" class="btn btn-ghost btn-sm" data-ac-emoji aria-haspopup="dialog">☺ 表情</button>' : '',
        config.markdownEnabled ? '<a class="ac-hint" href="https://commonmark.org/help/" target="_blank" rel="noopener" title="支持 **粗体**、*斜体*、`代码`、链接、列表和引用">支持 Markdown</a>' : '',
        `<span class="ac-count num" data-ac-count data-max="${config.maxLength}" aria-live="polite"></span>`
      ];
      return `<span class="cluster ac-toolbar" data-lp-plugin="${PLUGIN_ID}">${parts.join('')}</span>`;
    }
  });
  hooks.on('comments:decorate', async (payload) => {
    if (!config.showLocation || !payload.comments.length) return payload;
    const ids = payload.comments.map((comment) => comment.id);
    const rows = await db().all<{ comment_id: number; location: string }>(`SELECT comment_id, location FROM ac_comment_meta WHERE comment_id IN (${placeholders(ids.length)})`, ...ids);
    const byId = new Map(rows.map((row) => [Number(row.comment_id), row.location]));
    for (const comment of payload.comments) { const location = byId.get(comment.id); if (location) comment.extra.region = location; }
    return payload;
  });
  ui.slot('comment.meta', {
    render: ({ args }) => {
      const region = (args.comment as DisplayComment | undefined)?.extra?.region;
      return config.showLocation && typeof region === 'string' && region ? `<span class="muted ac-region" data-lp-plugin="${PLUGIN_ID}">IP 属地：${escapeHtml(region)}</span>` : '';
    }
  });
  hooks.on('comment:afterCreate', async (comment) => {
    if (config.showLocation && comment.ip) {
      // Background lookup: posting never waits for the third-party service.
      void lookupRegion(comment.ip, db()).then((location) => db().upsert('ac_comment_meta', { comment_id: comment.id, ip: comment.ip!, location, created_at: utcNow() }, ['comment_id'], ['location'])).catch((error) => ctx.logger.warn('region lookup failed:', messageOf(error)));
    }
    return comment;
  });

  /* ---------- emoji API and files ---------- */
  web.register('get', '/api/advanced-comments/emoji', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ ok: true, data: config.emojiEnabled ? store : { singles: [], texts: [], albums: [] } });
  });
  web.register('get', `${FILE_ROUTE}/:file`, (req, res) => {
    const name = path.basename(String(req.params.file));
    if (!/^[\w.-]+\.(png|jpe?g|gif|webp)$/i.test(name)) return void res.status(404).end();
    res.sendFile(name, { root: FILES, maxAge: '30d', headers: { 'X-Content-Type-Options': 'nosniff' } }, (error) => { if (error && !res.headersSent) res.status(404).end(); });
  });

  /* ---------- admin ---------- */
  admin.registerMenu({ title: '评论设置', link: ADMIN, group: 'community', order: 20, permission: 'advanced-comments:manage' });
  admin.registerSettings({ label: '评论规则与表情', link: ADMIN, description: '限频、字数、Markdown、表情和 IP 属地' });
  const manage = [requireAuth, checkPermission('advanced-comments:manage')];
  const back = (tab: string) => `${ADMIN}?tab=${tab}`;

  web.register('get', ADMIN, ...manage, route(async (req, res) => {
    const tab = ['rules', 'text', 'single', 'album'].includes(text(req.query.tab)) ? text(req.query.tab) : 'rules';
    res.render(`${PLUGIN_ID}/settings`, { pageTitle: '评论设置', tab, config, defaults: DEFAULT_CONFIG, store });
  }));
  web.register('post', `${ADMIN}/rules`, ...manage, route(async (req, res) => {
    config = normalizeConfig({ ...config, ...parseConfigBody(req.body ?? {}) });
    await ctx.plugins.setConfig(PLUGIN_ID, config);
    req.flash('success', '评论规则已保存，立即生效。');
    res.redirect(303, back('rules'));
  }));

  const saveImage = async (data: Buffer): Promise<string> => {
    if (!data.length) throw new UploadError('图片是空的');
    if (data.length > MAX_IMAGE) throw new UploadError('单张图片不能超过 2MB');
    const ext = IMAGE_TYPES.find(([, test]) => test(data))?.[0];
    if (!ext) throw new UploadError('只支持 PNG、JPG、GIF、WebP 图片');
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}${ext}`;
    await fs.writeFile(path.join(FILES, name), data, { flag: 'wx' });
    return name;
  };
  const removeFiles = async (names: string[]) => { for (const name of names) await fs.remove(path.join(FILES, path.basename(name))).catch(() => undefined); };
  const exists = (table: string) => async (id: string) => Boolean(await db().get(`SELECT 1 AS ok FROM ${table} WHERE id = ?`, id));
  const withFlash = (tab: string, fn: (req: import('express').Request) => Promise<string>) => route(async (req, res) => {
    try { req.flash('success', await fn(req)); }
    catch (error) { req.flash('danger', messageOf(error)); }
    res.redirect(303, back(tab));
  });

  web.register('post', `${ADMIN}/text`, ...manage, withFlash('text', async (req) => {
    const content = text(req.body.content).slice(0, 200);
    if (!content) throw new Error('请填写颜文字');
    const id = await generateUniqueId('TXT', exists('ac_text_emoji'));
    await db().run('INSERT INTO ac_text_emoji (id, name, content, created_at) VALUES (?, ?, ?, ?)', id, text(req.body.name).slice(0, 60) || content.slice(0, 20), content, utcNow());
    await reloadEmoji();
    return `已添加颜文字 ${content}`;
  }));
  web.register('post', `${ADMIN}/single`, ...manage, withFlash('single', async (req) => {
    const form = await readMultipart(req, { maxBytes: MAX_IMAGE + 64 * 1024, maxFiles: 1, maxParts: 8 });
    const file = form.files[0];
    if (!file) throw new Error('请选择一张图片');
    const name = text(form.fields.name).slice(0, 60) || path.parse(file.filename).name.slice(0, 60);
    const saved = await saveImage(file.data);
    const id = await generateUniqueId('SIN', exists('ac_single_emoji'));
    await db().run('INSERT INTO ac_single_emoji (id, name, image_path, created_at) VALUES (?, ?, ?, ?)', id, name, saved, utcNow());
    await reloadEmoji();
    return `已添加表情「${name}」`;
  }));
  web.register('post', `${ADMIN}/album`, ...manage, withFlash('album', async (req) => {
    const form = await readMultipart(req, { maxBytes: 24 * 1024 * 1024, maxFiles: 61, maxParts: 80 });
    const name = text(form.fields.name).slice(0, 60);
    const cover = form.files.find((file) => file.field === 'cover');
    const images = form.files.filter((file) => file.field === 'emojis');
    if (!name) throw new Error('请填写专辑名称');
    if (!cover) throw new Error('请选择专辑封面');
    if (!images.length) throw new Error('请至少选择一张表情图片');
    const written: string[] = [];
    try {
      const coverPath = await saveImage(cover.data); written.push(coverPath);
      const paths: string[] = [];
      for (const image of images) { const saved = await saveImage(image.data); written.push(saved); paths.push(saved); }
      const albumId = await generateUniqueId('COL', exists('ac_album'));
      const code = albumId.slice(4);
      await db().transaction(async () => {
        await db().run('INSERT INTO ac_album (id, name, cover_path, description, created_at) VALUES (?, ?, ?, ?, ?)', albumId, name, coverPath, text(form.fields.description).slice(0, 200) || null, utcNow());
        for (const [index, image] of images.entries()) await db().run('INSERT INTO ac_album_emoji (id, album_id, image_path, name, position) VALUES (?, ?, ?, ?, ?)', `COL_${code}_${index + 1}`, albumId, paths[index], path.parse(image.filename).name.slice(0, 60) || `${index + 1}`, index + 1);
      });
    } catch (error) { await removeFiles(written); throw error; }
    await reloadEmoji();
    return `已添加专辑「${name}」（${images.length} 张）`;
  }));
  web.register('post', `${ADMIN}/:kind/:id/delete`, ...manage, route(async (req, res) => {
    const id = String(req.params.id);
    const kind = String(req.params.kind);
    if (kind === 'text') await db().run('DELETE FROM ac_text_emoji WHERE id = ?', id);
    else if (kind === 'single') {
      const row = await db().get<{ image_path: string }>('SELECT image_path FROM ac_single_emoji WHERE id = ?', id);
      await db().run('DELETE FROM ac_single_emoji WHERE id = ?', id);
      if (row) await removeFiles([row.image_path]);
    } else if (kind === 'album') {
      const rows = await db().all<{ image_path: string }>('SELECT image_path FROM ac_album_emoji WHERE album_id = ?', id);
      const album = await db().get<{ cover_path: string }>('SELECT cover_path FROM ac_album WHERE id = ?', id);
      await db().transaction(async () => { await db().run('DELETE FROM ac_album_emoji WHERE album_id = ?', id); await db().run('DELETE FROM ac_album WHERE id = ?', id); });
      await removeFiles([...rows.map((row) => row.image_path), ...(album ? [album.cover_path] : [])]);
    } else return void res.status(404).end();
    await reloadEmoji();
    req.flash('success', '已删除。已经发出的评论里，这个表情会显示为文字代码。');
    res.redirect(303, back(kind));
  }));

  /* ---------- housekeeping ---------- */
  ctx.effect(() => {
    const timer = setInterval(() => {
      void db().run('DELETE FROM ac_comment_log WHERE created_at < ?', new Date(Date.now() - 2 * 86400_000).toISOString()).catch(() => undefined);
    }, 3600_000);
    timer.unref?.();
    return () => clearInterval(timer);
  });

  ctx.logger.info('activated');
}
