import type { Plugin, ViteDevServer } from 'vite';
import { resolve } from 'node:path';
import { existsSync, writeFileSync, renameSync } from 'node:fs';
import { loadProject } from '../parser/loader';
import { FileRegistry } from '../parser/fileRegistry';
import type { EsphomeProject } from '../parser/types';
import { listProjects } from './projectScanner';

export interface LvglPluginOptions {
  /** Absolute path to the directory containing top-level *.yaml ESPHome configs. */
  esphomeDir: string;
}

interface CacheEntry {
  project: EsphomeProject;
  /** CST registry for round-trip editing. Not serialized to the client. */
  registry: FileRegistry;
}

interface EditOp {
  file: string;
  yamlPath: (string | number)[];
  newValue: string | number | boolean | null;
}

export function lvglPlugin({ esphomeDir }: LvglPluginOptions): Plugin {
  const cache = new Map<string, CacheEntry>();
  // Suppress the watcher callback briefly for files we just wrote ourselves,
  // so a commit doesn't trigger its own HMR reload.
  const suppress = new Map<string, number>();

  return {
    name: 'lvgl-editor',
    configureServer(server: ViteDevServer) {
      server.watcher.add(esphomeDir);

      const onFsEvent = (file: string) => {
        const norm = file.replace(/\\/g, '/');
        if (!norm.endsWith('.yaml')) return;
        if (norm.endsWith('/secrets.yaml')) return;
        if (norm.includes('/.esphome/') || norm.includes('/merged/')) return;
        const until = suppress.get(norm);
        if (until && Date.now() < until) return;
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
        if (req.method && req.method !== 'GET') return undefined;
        const url = req.url ?? '';
        const name = decodeURIComponent(url.replace(/^\/+/, '').split('?')[0]);
        if (!name || /[\/\\]/.test(name) || name.includes('..')) {
          return sendJson(res, 400, { error: 'invalid project name' });
        }
        const path = resolve(esphomeDir, `${name}.yaml`);
        if (!existsSync(path)) return sendJson(res, 404, { error: `project not found: ${name}` });
        try {
          let entry = cache.get(path);
          if (!entry) {
            const registry = new FileRegistry();
            const project = loadProject(path, registry);
            entry = { project, registry };
            cache.set(path, entry);
          }
          sendJson(res, 200, entry.project);
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message });
        }
      });

      // POST /__lvgl/edit  { project, ops: EditOp[] }
      server.middlewares.use('/__lvgl/edit', async (req, res) => {
        if (req.method !== 'POST') return undefined;
        try {
          const body = await readJson(req);
          const projectName = String(body.project ?? '');
          const ops: EditOp[] = Array.isArray(body.ops) ? body.ops : [];
          const projectPath = resolve(esphomeDir, `${projectName}.yaml`);
          const entry = cache.get(projectPath);
          if (!entry) return sendJson(res, 400, { error: `project not loaded: ${projectName}` });

          const appliedFiles = new Set<string>();
          for (const op of ops) {
            const abs = resolve(op.file);
            const safe = abs.startsWith(esphomeDir + '/') || abs.startsWith(esphomeDir + '\\') || abs === esphomeDir;
            if (!safe) return sendJson(res, 400, { error: `path outside esphomeDir: ${abs}` });
            if (!entry.registry.has(abs)) return sendJson(res, 400, { error: `file not in project: ${abs}` });
            if (!Array.isArray(op.yamlPath) || op.yamlPath.length === 0) {
              return sendJson(res, 400, { error: 'yamlPath must be a non-empty array' });
            }
            const fileEntry = entry.registry.get(abs)!;
            try {
              fileEntry.doc.setIn(op.yamlPath as (string | number)[], op.newValue);
            } catch (e) {
              return sendJson(res, 500, { error: `setIn failed for ${abs}: ${(e as Error).message}` });
            }
            entry.registry.markDirty(abs);
            appliedFiles.add(abs);
          }
          sendJson(res, 200, { ok: true, dirty: entry.registry.dirtyFiles(), applied: [...appliedFiles] });
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message });
        }
      });

      // POST /__lvgl/commit  { project }
      server.middlewares.use('/__lvgl/commit', async (req, res) => {
        if (req.method !== 'POST') return undefined;
        try {
          const body = await readJson(req);
          const projectName = String(body.project ?? '');
          const projectPath = resolve(esphomeDir, `${projectName}.yaml`);
          const entry = cache.get(projectPath);
          if (!entry) return sendJson(res, 400, { error: `project not loaded: ${projectName}` });

          const written: string[] = [];
          for (const path of entry.registry.dirtyFiles()) {
            const fileEntry = entry.registry.get(path)!;
            let text = fileEntry.doc.toString();
            // eemeli/yaml writes PUA codepoints (Material Symbols glyphs etc.)
            // as literal UTF-8 characters. ESPHome YAML files conventionally
            // use `\uXXXX` escapes for these. If the original file did so,
            // re-escape them in our output to stay byte-compatible.
            if (/\\u[0-9A-Fa-f]{4}/.test(fileEntry.raw)) {
              const PUA_RE = new RegExp('[\\uE000-\\uF8FF]', 'g');
              text = text.replace(PUA_RE, (ch) =>
                '\\u' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
              );
            }
            // Suppress the watcher for this path long enough for the FS event
            // to arrive (debounced by Vite) before clearing the suppression.
            suppress.set(path.replace(/\\/g, '/'), Date.now() + 1500);
            const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
            writeFileSync(tmp, text, 'utf8');
            renameSync(tmp, path);
            fileEntry.raw = text;
            written.push(path);
          }
          // The source map now reflects the written files, but our cached
          // EsphomeProject does not (it was built from the pre-edit tree and
          // then mutated in the CST only). Invalidate so the next GET rebuilds.
          cache.delete(projectPath);
          sendJson(res, 200, { ok: true, written });
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message });
        }
      });
    },
  };
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}
