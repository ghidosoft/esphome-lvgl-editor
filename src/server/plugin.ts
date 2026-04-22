import type { Plugin, ViteDevServer } from 'vite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadProject } from '../parser/loader';
import type { EsphomeProject } from '../parser/types';
import { listProjects } from './projectScanner';

export interface LvglPluginOptions {
  /** Absolute path to the directory containing top-level *.yaml ESPHome configs. */
  esphomeDir: string;
}

export function lvglPlugin({ esphomeDir }: LvglPluginOptions): Plugin {
  const cache = new Map<string, EsphomeProject>();

  return {
    name: 'lvgl-editor',
    configureServer(server: ViteDevServer) {
      // Reuse Vite's own watcher: it's already configured with the right
      // platform-specific settings (and handles editor atomic-save quirks).
      // We add our esphome dir to its watch list and filter events.
      server.watcher.add(esphomeDir);

      const onFsEvent = (file: string) => {
        const norm = file.replace(/\\/g, '/');
        if (!norm.endsWith('.yaml')) return;
        if (norm.endsWith('/secrets.yaml')) return;
        if (norm.includes('/.esphome/') || norm.includes('/merged/')) return;
        cache.clear();
        server.ws.send({ type: 'custom', event: 'lvgl:changed', data: { file: norm } });
      };
      server.watcher.on('change', onFsEvent);
      server.watcher.on('add', onFsEvent);
      server.watcher.on('unlink', onFsEvent);

      server.middlewares.use('/__lvgl/projects', (_req, res) => {
        try {
          const projects = listProjects(esphomeDir);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(projects));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });

      // GET /__lvgl/project/<name>
      server.middlewares.use('/__lvgl/project/', (req, res) => {
        const url = req.url ?? '';
        const name = decodeURIComponent(url.replace(/^\/+/, '').split('?')[0]);
        if (!name || /[\/\\]/.test(name) || name.includes('..')) {
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'invalid project name' }));
          return;
        }
        const path = resolve(esphomeDir, `${name}.yaml`);
        if (!existsSync(path)) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: `project not found: ${name}` }));
          return;
        }
        try {
          let project = cache.get(path);
          if (!project) {
            project = loadProject(path);
            cache.set(path, project);
          }
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(project));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}
