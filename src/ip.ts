/*
 * Advanced Comments IP Region Lookup
 *
 * Resolves a commenter IP to a coarse region ("广东" / "日本"), cached in memory and in the database.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DatabaseService } from 'linearpress/plugin-api';

const memory = new Map<string, string>();
const remember = (ip: string, region: string) => {
  if (!memory.has(ip) && memory.size >= 2048) memory.delete(memory.keys().next().value!);
  memory.set(ip, region);
};

/** Private, loopback and link-local addresses never leave the server. */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/, '');
  return /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(v4) || /^172\.(1[6-9]|2\d|3[01])\./.test(v4) || ip === '::1' || /^f[cd]/i.test(ip) || /^fe80:/i.test(ip);
}

/** Province for mainland China, otherwise the country. Only coarse data is kept. */
export function formatRegion(data: { country?: string; regionName?: string }): string {
  const country = data.country?.trim() ?? '';
  const region = data.regionName?.trim().replace(/(省|市|自治区|特别行政区|壮族|回族|维吾尔)+$/g, '') ?? '';
  if (country === '中国' && region) return region;
  return country || '未知';
}

export async function lookupRegion(ip: string, db: DatabaseService, timeoutMs = 3000): Promise<string> {
  if (!ip || isPrivateIp(ip)) return '本地网络';
  const cached = memory.get(ip) ?? (await db.get<{ location: string }>('SELECT location FROM ac_ip_cache WHERE ip = ?', ip))?.location;
  if (cached) { remember(ip, cached); return cached; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let region = '未知';
  try {
    const response = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip.replace(/^::ffff:/, ''))}?lang=zh-CN&fields=status,country,regionName`, { signal: controller.signal, headers: { accept: 'application/json' } });
    const data = await response.json() as { status?: string; country?: string; regionName?: string };
    if (data.status === 'success') region = formatRegion(data);
  } finally { clearTimeout(timer); }
  remember(ip, region);
  if (region !== '未知') await db.upsert('ac_ip_cache', { ip, location: region }, ['ip'], ['location']);
  return region;
}
