/*
 * LinearPress Default View
 *
 * Implements the default view module for LinearPress.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@gmail.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';

/** Upgrade only Base's unextended view. Theme web/post remains authoritative;
 * themes include advancedCommentsPartial explicitly. No global post override.
 */
export function defaultPostFallback(fallback: string): RequestHandler {
  return (_req, res, next) => {
    const render = res.render.bind(res);
    res.render = ((view: string, ...args: unknown[]) => {
      if (view === 'web/post') {
        const dirs = res.app.get('views');
        const paths: string[] = Array.isArray(dirs) ? dirs : [dirs];
        const resolved = paths.map(dir => path.resolve(dir, 'web/post.ejs')).find(file => fs.existsSync(file));
        if (resolved === path.resolve(process.cwd(), 'src/views/web/post.ejs')) {
          // Profiles may have activated before us; request locals, not load order,
          // decide which Base-only article fallback composes the shared partial.
          view = typeof res.locals.colorfulProfilesPostView === 'string' ? res.locals.colorfulProfilesPostView : fallback;
        }
      }
      return (render as (...args: unknown[]) => unknown)(view, ...args);
    }) as typeof res.render;
    next();
  };
}
