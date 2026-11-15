/*
 * Advanced Comments Configuration
 *
 * Settings shape, defaults and normalisation.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface AdvancedCommentsConfig {
  /** Guest rate limits (comments per window per IP). */
  perMinute: number;
  perTenMinutes: number;
  perHour: number;
  rateLimitEnabled: boolean;
  requireName: boolean;
  minLength: number;
  maxLength: number;
  markdownEnabled: boolean;
  emojiEnabled: boolean;
  /** Look up and show "IP 属地". Sends commenter IPs to ip-api.com, so off by default. */
  showLocation: boolean;
}

export const DEFAULT_CONFIG: AdvancedCommentsConfig = {
  perMinute: 2,
  perTenMinutes: 5,
  perHour: 10,
  rateLimitEnabled: true,
  requireName: true,
  minLength: 2,
  maxLength: 500,
  markdownEnabled: true,
  emojiEnabled: true,
  showLocation: false
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function normalizeConfig(raw: Partial<AdvancedCommentsConfig> | null | undefined): AdvancedCommentsConfig {
  const base = raw && typeof raw === 'object' ? raw : {};
  const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
  const config: AdvancedCommentsConfig = {
    perMinute: clampInt(base.perMinute, DEFAULT_CONFIG.perMinute, 1, 100),
    perTenMinutes: clampInt(base.perTenMinutes, DEFAULT_CONFIG.perTenMinutes, 1, 500),
    perHour: clampInt(base.perHour, DEFAULT_CONFIG.perHour, 1, 1000),
    rateLimitEnabled: bool(base.rateLimitEnabled, DEFAULT_CONFIG.rateLimitEnabled),
    requireName: bool(base.requireName, DEFAULT_CONFIG.requireName),
    minLength: clampInt(base.minLength, DEFAULT_CONFIG.minLength, 1, 100),
    maxLength: clampInt(base.maxLength, DEFAULT_CONFIG.maxLength, 10, 5000),
    markdownEnabled: bool(base.markdownEnabled, DEFAULT_CONFIG.markdownEnabled),
    emojiEnabled: bool(base.emojiEnabled, DEFAULT_CONFIG.emojiEnabled),
    showLocation: bool(base.showLocation, DEFAULT_CONFIG.showLocation)
  };
  // Wider windows can never allow fewer comments than narrower ones.
  config.perTenMinutes = Math.max(config.perTenMinutes, config.perMinute);
  config.perHour = Math.max(config.perHour, config.perTenMinutes);
  config.minLength = Math.min(config.minLength, config.maxLength);
  return config;
}

/** Read the settings form (checkboxes are absent when unchecked). */
export function parseConfigBody(body: Record<string, unknown>): Partial<AdvancedCommentsConfig> {
  const on = (value: unknown) => value === 'on' || value === true;
  return {
    perMinute: Number(body.perMinute), perTenMinutes: Number(body.perTenMinutes), perHour: Number(body.perHour),
    rateLimitEnabled: on(body.rateLimitEnabled), requireName: on(body.requireName),
    minLength: Number(body.minLength), maxLength: Number(body.maxLength),
    markdownEnabled: on(body.markdownEnabled), emojiEnabled: on(body.emojiEnabled), showLocation: on(body.showLocation)
  };
}
