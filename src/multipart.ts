/*
 * Multipart Form-Data Parser
 *
 * Dependency-free multipart/form-data parsing for the plugin's admin uploads.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Minimal multipart/form-data parser handling text fields and binary files,
 * sufficient for admin emoji images and album covers. Also provides a raw
 * request-body reader that enforces an upload size limit.
 * @since 1.0.0
 */

export interface MultipartFile {
  /** 表单字段名 */
  name: string;
  /** 上传文件名 */
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface MultipartResult {
  fields: Record<string, string>;
  files: MultipartFile[];
}

/** 从请求读取原始 body（带大小上限）。 */
export async function readRawBody(req: AsyncIterable<Buffer | string>, maxSize: number): Promise<Buffer> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > maxSize) throw new Error('上传内容过大');
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

export function parseMultipart(body: Buffer, contentType: string): MultipartResult {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error('上传请求缺少 multipart boundary');
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const result: MultipartResult = { fields: {}, files: [] };
  let cursor = body.indexOf(boundary);
  while (cursor !== -1) {
    const start = cursor + boundary.length;
    const next = body.indexOf(boundary, start);
    if (next === -1) break;
    const part = body.subarray(start, next);
    // 去掉结尾的 CRLF（part 末尾为 \r\n--boundary）
    const raw = part.length > 2 ? part.subarray(0, part.length - 2) : part;
    const headerEnd = raw.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) { cursor = next; continue; }
    const headerText = raw.subarray(0, headerEnd).toString('utf8');
    const content = raw.subarray(headerEnd + 4);
    const disposition = headerText.match(/content-disposition:[^\r\n]*?name="([^"]*)"(?:[^\r\n]*?filename="([^"]*)")?/i);
    if (!disposition) { cursor = next; continue; }
    const name = disposition[1] ?? '';
    const filename = disposition[2];
    if (filename !== undefined) {
      const type = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream';
      result.files.push({ name, filename, contentType: type, data: content });
    } else {
      result.fields[name] = content.toString('utf8').trim();
    }
    cursor = next;
  }
  return result;
}
