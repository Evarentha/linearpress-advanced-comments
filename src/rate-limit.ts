/*
 * LinearPress Rate Limit
 *
 * Implements the rate limit module for LinearPress.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@gmail.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { AdvancedCommentsConfig } from './config.js';

interface RateDb {
  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> | T | undefined;
  run(sql: string, ...params: unknown[]): unknown;
}

/** Single-process atomic check + persistent reservation, even for asynchronous DBs.
 * Only the short DB section is serialized, not geolocation or comment creation.
 * Validated guest attempts consume quota even if later hooks/storage fail. Invalid
 * fields and rejected reservations do not. No per-IP in-memory map is retained.
 * Multiple application processes require a DB-level lock/transaction adapter.
 */
export function createRateLimiter(db: RateDb) {
  let tail: Promise<unknown> = Promise.resolve();
  let lastPrune = 0;
  return (ip: string, cfg: AdvancedCommentsConfig): Promise<string | null> => {
    if (!cfg.rateLimitEnabled) return Promise.resolve(null);
    const reservation = tail.then(async () => {
      const now = Date.now();
      if (now - lastPrune >= 60_000) {
        await db.run('DELETE FROM ac_comment_log WHERE created_at<?', new Date(now - 3_600_000).toISOString());
        lastPrune = now;
      }
      const windows: Array<[number, number, string]> = [
        [cfg.perMinute, 60_000, '1 分钟'],
        [cfg.perTenMinutes, 600_000, '10 分钟'],
        [cfg.perHour, 3_600_000, '1 小时']
      ];
      for (const [limit, ms, label] of windows) {
        const row = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ac_comment_log WHERE ip=? AND created_at>=?', ip, new Date(now - ms).toISOString());
        if (Number(row?.n ?? 0) >= limit) return `评论太频繁，请 ${label} 后再试。`;
      }
      await db.run('INSERT INTO ac_comment_log(ip,created_at) VALUES(?,?)', ip, new Date(now).toISOString());
      return null;
    });
    tail = reservation.then(() => undefined, () => undefined);
    return reservation;
  };
}
