import type { Plugin, ViteDevServer } from 'vite';
import { createLvglRouter, type LvglRouterOptions } from './lvglRouter.js';

export type LvglPluginOptions = LvglRouterOptions;

/**
 * Vite plugin adapter around the framework-agnostic LVGL router.
 *
 * In dev mode this:
 *  - mounts the router on Vite's connect middleware stack so `/__lvgl/*`
 *    routes work alongside the SPA;
 *  - bridges Vite's chokidar watcher to the router's cache invalidation;
 *  - forwards file-change events over Vite's WebSocket as `lvgl:changed`,
 *    so the client's `import.meta.hot` listener can refresh queries.
 *
 * The router itself also exposes an SSE endpoint (`/__lvgl/events`) used by
 * the standalone `bin/cli.mjs`; in dev that endpoint is reachable too, but
 * the client prefers `import.meta.hot` when available.
 */
export function lvglPlugin({ esphomeDir }: LvglPluginOptions): Plugin {
  const router = createLvglRouter({ esphomeDir });

  return {
    name: 'lvgl-editor',
    configureServer(server: ViteDevServer) {
      server.watcher.add(esphomeDir);

      const onFsEvent = (file: string) => {
        const norm = file.replace(/\\/g, '/');
        if (!norm.endsWith('.yaml')) return;
        if (norm.endsWith('/secrets.yaml')) return;
        if (norm.includes('/.esphome/') || norm.includes('/merged/')) return;
        if (router.isSelfWrite(file)) return;
        router.invalidate(file);
        router.notifyChange(file);
        server.ws.send({ type: 'custom', event: 'lvgl:changed', data: { file: norm } });
      };
      server.watcher.on('change', onFsEvent);
      server.watcher.on('add', onFsEvent);
      server.watcher.on('unlink', onFsEvent);

      // Mount with no path prefix; the router filters by URL itself and
      // calls next() for non-/__lvgl requests.
      server.middlewares.use(router.handle);
    },
  };
}
