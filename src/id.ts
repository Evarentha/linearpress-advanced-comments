/*
 * Prefixed Unique ID Generator
 *
 * Collision-checked random identifiers for the custom emoji records.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@gmail.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Builds record IDs from a caller-supplied prefix (TXT_, SIN_, COL_) plus a
 * 6-character uppercase alphanumeric code, retrying with a fresh code when a
 * candidate already exists in storage.
 * @since 1.0.0
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;

/** 生成 6 位大写字母+数字随机码。 */
export function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

/** 生成带前缀的唯一 ID（TXT_/SIN_/COL_ 等），检测到已存在则重试。 */
export async function generateUniqueId(
  prefix: string,
  exists: (id: string) => Promise<boolean> | boolean,
  attempts = 32
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const id = `${prefix}_${generateCode()}`;
    if (!(await exists(id))) return id;
  }
  throw new Error(`无法生成唯一 ID（前缀 ${prefix}）`);
}
