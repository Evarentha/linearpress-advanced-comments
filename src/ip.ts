/*
 * Client IP Detection and Geolocation
 *
 * Trust-aware client IP extraction and best-effort IP location lookup.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@gmail.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Detects the visitor's IP, trusting X-Real-IP / X-Forwarded-For only when a
 * trusted reverse proxy is explicitly enabled so forged headers cannot bypass
 * rate limiting or pollute the location cache. Resolves best-effort IP
 * geolocation through a pluggable provider with a two-tier memory + SQLite
 * cache, falling back to an "unknown" placeholder on failure.
 * @since 1.0.0
 */

/**
 * 从请求中取客户端 IP。
 * 仅当站点显式开启 TRUST_PROXY=1（存在可信反向代理）时才信任 X-Real-IP / X-Forwarded-For，
 * 否则一律使用 Express 解析的 socket 地址，防止伪造请求头绕过限频、污染归属地缓存。
 */
export function detectClientIp(req: { headers?: Record<string, unknown>; ip?: string; app?: { get(name: string): unknown } }): string {
  const trusted = process.env.TRUST_PROXY === '1' || Boolean(req.app?.get?.('trust proxy'));
  if (trusted) {
    const headers = req.headers ?? {};
    const real = headers['x-real-ip'];
    if (typeof real === 'string' && real.trim()) return real.trim();
    const forwarded = headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      const first = forwarded.split(',')[0]?.trim();
      if (first) return first;
    }
  }
  return req.ip ?? '0.0.0.0';
}


const UNKNOWN = '未知';

/** 从 API 返回 country / regionName / city 拼出归属地字符串。 */
function formatLocation(data: { country?: string; regionName?: string; city?: string }): string | null {
  const country = data.country?.trim();
  const region = data.regionName?.trim();
  const city = data.city?.trim();
  if (!country && !region && !city) return null;
  return [country, region, city].filter(Boolean).join(' ');
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'accept': 'application/json' } });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 尽力解析 IP 归属地。带内存缓存 + SQLite 持久缓存，失败时回退“未知”。
 * provider 可被替换以适配不同在线接口或接入本地 IP 库。
 */
export async function resolveLocation(
  ip: string,
  db: { get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> | T | undefined; run(sql: string, ...params: unknown[]): unknown },
  provider: (ip: string, timeoutMs: number) => Promise<string> = defaultProvider,
  timeoutMs = 2500
): Promise<string> {
  if (!ip || ip === '0.0.0.0' || /^127\./.test(ip) || ip === '::1' || ip === 'localhost') return '本机';
  // 内存缓存
  if (memoryCache.has(ip)) return memoryCache.get(ip)!;
  // SQLite 缓存
  try {
    const row = await db.get<{ location: string }>('SELECT location FROM ac_ip_cache WHERE ip=?', ip);
    if (row?.location) {
      cacheLocation(ip, row.location);
      return row.location;
    }
  } catch { /* ignore */ }
  let location = UNKNOWN;
  try {
    location = await provider(ip, timeoutMs);
  } catch { location = UNKNOWN; }
  cacheLocation(ip, location);
  try {
    await db.run('INSERT OR REPLACE INTO ac_ip_cache(ip, location) VALUES(?,?)', ip, location);
  } catch { /* ignore */ }
  return location;
}

/** 默认在线解析 provider（ip-api.com，免费无 Key，返回中文区域名）。 */
export async function defaultProvider(ip: string, timeoutMs: number): Promise<string> {
  const res = await fetchWithTimeout(`http://ip-api.com/json/${ip}?lang=zh-CN&fields=country,regionName,city,status`, timeoutMs);
  if (!res.ok) return UNKNOWN;
  const data = await res.json() as { status?: string; country?: string; regionName?: string; city?: string };
  if (data.status !== 'success') return UNKNOWN;
  return formatLocation(data) ?? UNKNOWN;
}

const memoryCache = new Map<string, string>();
function cacheLocation(ip: string, location: string): void {
  // Bounded FIFO cache: a stream of distinct guest IPs cannot grow memory forever.
  if (!memoryCache.has(ip) && memoryCache.size >= 2048) memoryCache.delete(memoryCache.keys().next().value!);
  memoryCache.set(ip, location);
}
