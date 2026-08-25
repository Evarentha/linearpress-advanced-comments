/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

/** 插件全局配置默认值。限频与字数均可通过后台设置页调整。 */
export interface AdvancedCommentsConfig {
  /** 未登录用户限频上限：最近 1 分钟允许的评论条数 */
  perMinute: number;
  /** 最近 10 分钟允许的评论条数 */
  perTenMinutes: number;
  /** 最近 1 小时允许的评论条数 */
  perHour: number;
  /** 是否对未登录用户启用限频 */
  rateLimitEnabled: boolean;
  /** 未登录用户是否必须填写姓名 */
  requireName: boolean;
  /** 评论最大字数（含 Markdown 格式化字符） */
  maxLength: number;
  /** 评论是否启用 Markdown 渲染 */
  markdownEnabled: boolean;
  /** 是否启用表情面板 */
  emojiEnabled: boolean;
}

export const DEFAULT_CONFIG: AdvancedCommentsConfig = {
  perMinute: 1,
  perTenMinutes: 3,
  perHour: 5,
  rateLimitEnabled: true,
  requireName: true,
  maxLength: 300,
  markdownEnabled: true,
  emojiEnabled: true
};

export const CONFIG_KEY = 'advanced-comments';

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** 读取配置，缺失或非法字段回退默认值。 */
export function normalizeConfig(raw: Partial<AdvancedCommentsConfig> | null | undefined): AdvancedCommentsConfig {
  const base = raw ?? {};
  return {
    perMinute: clampInt(base.perMinute, DEFAULT_CONFIG.perMinute, 1, 100),
    perTenMinutes: clampInt(base.perTenMinutes, DEFAULT_CONFIG.perTenMinutes, 1, 100),
    perHour: clampInt(base.perHour, DEFAULT_CONFIG.perHour, 1, 1000),
    rateLimitEnabled: base.rateLimitEnabled ?? DEFAULT_CONFIG.rateLimitEnabled,
    requireName: base.requireName ?? DEFAULT_CONFIG.requireName,
    maxLength: clampInt(base.maxLength, DEFAULT_CONFIG.maxLength, 1, 10000),
    markdownEnabled: base.markdownEnabled ?? DEFAULT_CONFIG.markdownEnabled,
    emojiEnabled: base.emojiEnabled ?? DEFAULT_CONFIG.emojiEnabled
  };
}

/** 从表单 body 解析配置（供设置页提交使用）。 */
export function parseConfigBody(body: Record<string, unknown>): Partial<AdvancedCommentsConfig> {
  return {
    perMinute: clampInt(body.perMinute, DEFAULT_CONFIG.perMinute, 1, 100),
    perTenMinutes: clampInt(body.perTenMinutes, DEFAULT_CONFIG.perTenMinutes, 1, 100),
    perHour: clampInt(body.perHour, DEFAULT_CONFIG.perHour, 1, 1000),
    rateLimitEnabled: body.rateLimitEnabled === 'on' || body.rateLimitEnabled === true,
    requireName: body.requireName === 'on' || body.requireName === true,
    maxLength: clampInt(body.maxLength, DEFAULT_CONFIG.maxLength, 1, 10000),
    markdownEnabled: body.markdownEnabled === 'on' || body.markdownEnabled === true,
    emojiEnabled: body.emojiEnabled === 'on' || body.emojiEnabled === true
  };
}
