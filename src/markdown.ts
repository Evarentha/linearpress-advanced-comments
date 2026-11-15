/*
 * Safe Markdown Comment Renderer
 *
 * Lightweight Markdown-to-HTML renderer for comment content, XSS-safe by design.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Lightweight Markdown renderer supporting fenced code blocks, headings,
 * blockquotes, unordered/ordered lists, horizontal rules, paragraphs, inline
 * code, images, links, bold, italic, strikethrough, and :emoji:ID tokens.
 * Input is HTML-escaped before any markup is applied, guaranteeing XSS safety.
 * @since 1.0.0
 */

/** 转义 HTML 特殊字符，防止 XSS。 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface EmojiUrlResolver {
  /** 由表情 ID（SIN_xxx / COL_xxx_n）返回静态资源 URL，未知返回 null */
  (id: string): string | null;
}

/** 链接地址协议白名单：http/https/mailto 及相对地址；其余一律降级为 '#'。 */
function safeUrl(url: string): string {
  const value = String(url ?? '');
  if (/^https?:\/\//i.test(value)) return value;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return value;
  if (value.startsWith('/') || value.startsWith('#') || value.startsWith('./')) return value;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return value; // 无协议的普通文本
  return '#';
}

/**
 * One line of inline Markdown. Generated tags (emoji, images, code, links) are
 * parked as placeholders before emphasis runs, so `_` and `*` inside URLs or
 * attributes are never turned into <em>.
 */
function renderInline(raw: string, emojiUrl: EmojiUrlResolver | null): string {
  const parked: string[] = [];
  const park = (html: string) => `\u0000${parked.push(html) - 1}\u0000`;
  let text = escapeHtml(raw.replace(/\u0000/g, ''));
  text = text.replace(/`([^`]+)`/g, (_m, code: string) => park(`<code>${code}</code>`));
  if (emojiUrl) {
    text = text.replace(/:emoji:([A-Z0-9_]+)/g, (full, id: string) => {
      const url = emojiUrl(String(id));
      return url ? park(`<img class="ac-emoji-img" src="${url}" alt="表情" loading="lazy">`) : full;
    });
  }
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    const src = safeUrl(url);
    return /^(https?:\/\/|\/)/i.test(src) ? park(`<img class="ac-md-img" src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`) : alt;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => `${park(`<a href="${safeUrl(url)}" target="_blank" rel="nofollow noopener noreferrer">`)}${label}${park('</a>')}`);
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return text.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => parked[Number(index)] ?? '');
}

/** Consecutive plain lines form one paragraph; each line is rendered on its own, then joined with <br>. */
function renderParagraph(lines: string[], emojiUrl: EmojiUrlResolver | null): string {
  const rendered = lines.map((line) => line.trim()).filter(Boolean).map((line) => renderInline(line, emojiUrl));
  return rendered.length ? `<p>${rendered.join('<br>')}</p>` : '';
}
export function renderMarkdown(
  text: string,
  emojiUrl: EmojiUrlResolver | null = null
): string {
  const rawLines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(renderParagraph(paragraph, emojiUrl));
      paragraph = [];
    }
  };

  while (i < rawLines.length) {
    const line = rawLines[i];

    // 围栏代码块 ```lang
    if (/^\s*```/.test(line)) {
      flushParagraph();
      const lang = line.replace(/^\s*```\s*/, '').trim();
      const codeLines: string[] = [];
      i++;
      while (i < rawLines.length && !/^\s*```\s*$/.test(rawLines[i])) {
        codeLines.push(rawLines[i]);
        i++;
      }
      i++; // 跳过结束围栏
      const code = escapeHtml(codeLines.join('\n'));
      out.push(`<pre class="ac-md-code"><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${code}</code></pre>`);
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < rawLines.length && /^>\s?/.test(rawLines[i])) {
        quoteLines.push(rawLines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderParagraph(quoteLines, emojiUrl)}</blockquote>`);
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      // Comment headings must not compete with the page outline: render as a bold line.
      out.push(`<p class="ac-md-heading" data-level="${level}"><strong>${renderInline(heading[2], emojiUrl)}</strong></p>`);
      i++;
      continue;
    }

    // 分隔线
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      flushParagraph();
      out.push('<hr>');
      i++;
      continue;
    }

    // 有序列表
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph();
      out.push('<ol>');
      while (i < rawLines.length && /^\s*\d+[.)]\s+/.test(rawLines[i])) {
        out.push(`<li>${renderInline(rawLines[i].replace(/^\s*\d+[.)]\s+/, ''), emojiUrl)}</li>`);
        i++;
      }
      out.push('</ol>');
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      out.push('<ul>');
      while (i < rawLines.length && /^\s*[-*+]\s+/.test(rawLines[i])) {
        out.push(`<li>${renderInline(rawLines[i].replace(/^\s*[-*+]\s+/, ''), emojiUrl)}</li>`);
        i++;
      }
      out.push('</ul>');
      continue;
    }

    // 普通行：收集到段落
    paragraph.push(line);
    i++;
  }
  flushParagraph();
  return out.join('\n');
}

/** 统计字数（含 Markdown 格式化字符）。 */
export function countChars(text: string): number {
  return Array.from(String(text ?? '')).length;
}
