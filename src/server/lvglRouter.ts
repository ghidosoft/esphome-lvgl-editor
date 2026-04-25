import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { existsSync, writeFileSync, renameSync } from 'node:fs';
import { loadProject } from '../parser/loader.js';
import { FileRegistry } from '../parser/fileRegistry.js';
import type { EsphomeProject } from '../parser/types.js';
import { listProjects } from './projectScanner.js';

export interface LvglRouterOptions {
  /** Absolute path to the directory containing top-level *.yaml ESPHome configs. */
  esphomeDir: string;
}

export interface LvglRouter {
  /** Connect/Express-style handler. Replies only when req.url starts with /__lvgl. */
  handle: (req: IncomingMessage, res: ServerResponse, next?: () => void) => void;
  /** Drop the in-memory CST cache (specific file or everything). */
  invalidate: (absPath?: string) => boolean;
  /** True if the path was just written by us (commit) and the FS event should be swallowed. */
  isSelfWrite: (absPath: string) => boolean;
  /** Push a `lvgl:changed` event to all connected SSE clients. */
  notifyChange: (absPath: string) => void;
}

interface CacheEntry {
  project: EsphomeProject;
  registry: FileRegistry;
}

interface EditOp {
  file: string;
  yamlPath: (string | number)[];
  op: 'set' | 'delete';
  newValue?: string | number | boolean | null;
}

export function createLvglRouter({ esphomeDir }: LvglRouterOptions): LvglRouter {
  const cache = new Map<string, CacheEntry>();
  const suppress = new Map<string, number>();
  const sseClients = new Set<ServerResponse>();

  function invalidate(absPath?: string): boolean {
    if (absPath === undefined) {
      const had = cache.size > 0;
      cache.clear();
      return had;
    }
    // We key cache by project path, but a change to any included file can
    // affect any cached project, so the safe behavior is to clear all.
    if (cache.size === 0) return false;
    cache.clear();
    return true;
  }

  function isSelfWrite(absPath: string): boolean {
    const norm = absPath.replace(/\\/g, '/');
    const until = suppress.get(norm);
    if (!until) return false;
    if (Date.now() >= until) {
      suppress.delete(norm);
      return false;
    }
    return true;
  }

  function notifyChange(absPath: string): void {
    if (sseClients.size === 0) return;
    const norm = absPath.replace(/\\/g, '/');
    const payload = `event: lvgl:changed\ndata: ${JSON.stringify({ file: norm })}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        // Client gone; let the 'close' handler prune it.
      }
    }
  }

  function handleProjectsList(_req: IncomingMessage, res: ServerResponse) {
    try {
      const projects = listProjects(esphomeDir);
      sendJson(res, 200, projects);
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  }

  function handleProjectGet(req: IncomingMessage, res: ServerResponse, rawName: string) {
    if (req.method && req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
    const name = decodeURIComponent(rawName.split('?')[0]);
    if (!name || /[/\\]/.test(name) || name.includes('..')) {
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
  }

  async function handleEdit(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
    const body = await readJson(req);
    const projectName = String(body.project ?? '');
    const ops: EditOp[] = Array.isArray(body.ops) ? body.ops : [];
    const projectPath = resolve(esphomeDir, `${projectName}.yaml`);
    const entry = cache.get(projectPath);
    if (!entry) return sendJson(res, 400, { error: `project not loaded: ${projectName}` });

    const appliedFiles = new Set<string>();
    for (const op of ops) {
      const abs = resolve(op.file);
      const safe =
        abs.startsWith(esphomeDir + '/') ||
        abs.startsWith(esphomeDir + '\\') ||
        abs === esphomeDir;
      if (!safe) return sendJson(res, 400, { error: `path outside esphomeDir: ${abs}` });
      if (!entry.registry.has(abs))
        return sendJson(res, 400, { error: `file not in project: ${abs}` });
      if (!Array.isArray(op.yamlPath) || op.yamlPath.length === 0) {
        return sendJson(res, 400, { error: 'yamlPath must be a non-empty array' });
      }
      const fileEntry = entry.registry.get(abs)!;
      const opKind: 'set' | 'delete' = op.op === 'delete' ? 'delete' : 'set';
      try {
        if (opKind === 'delete') {
          fileEntry.doc.deleteIn(op.yamlPath);
        } else {
          fileEntry.doc.setIn(op.yamlPath, op.newValue);
        }
      } catch (e) {
        return sendJson(res, 500, {
          error: `${opKind} failed for ${abs}: ${(e as Error).message}`,
        });
      }
      entry.registry.markDirty(abs);
      appliedFiles.add(abs);
    }
    sendJson(res, 200, {
      ok: true,
      dirty: entry.registry.dirtyFiles(),
      applied: [...appliedFiles],
    });
  }

  async function handleCommit(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
    const body = await readJson(req);
    const projectName = String(body.project ?? '');
    const projectPath = resolve(esphomeDir, `${projectName}.yaml`);
    const entry = cache.get(projectPath);
    if (!entry) return sendJson(res, 400, { error: `project not loaded: ${projectName}` });

    const written: string[] = [];
    for (const path of entry.registry.dirtyFiles()) {
      const fileEntry = entry.registry.get(path)!;
      let text = fileEntry.doc.toString({
        flowCollectionPadding: false,
        lineWidth: 0,
      });
      if (/\\u[0-9A-Fa-f]{4}/.test(fileEntry.raw)) {
        const PUA_RE = new RegExp('[\\uE000-\\uF8FF]', 'g');
        text = text.replace(
          PUA_RE,
          (ch: string) => '\\u' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'),
        );
      }
      // Suppress watcher events for this path long enough for the FS event to
      // arrive (debounced) before clearing the suppression.
      suppress.set(path.replace(/\\/g, '/'), Date.now() + 1500);
      const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tmp, text, 'utf8');
      renameSync(tmp, path);
      fileEntry.raw = text;
      written.push(path);
    }
    cache.delete(projectPath);
    sendJson(res, 200, { ok: true, written });
  }

  function handleEvents(req: IncomingMessage, res: ServerResponse) {
    if (req.method && req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
    res.statusCode = 200;
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    // Initial comment to flush headers and confirm the stream is live.
    res.write(': connected\n\n');

    sseClients.add(res);
    const cleanup = () => {
      sseClients.delete(res);
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
  }

  function handle(req: IncomingMessage, res: ServerResponse, next?: () => void): void {
    const url = req.url ?? '';
    if (!url.startsWith('/__lvgl')) {
      if (next) next();
      return;
    }

    // /__lvgl/projects
    if (url === '/__lvgl/projects' || url.startsWith('/__lvgl/projects?')) {
      return handleProjectsList(req, res);
    }
    // /__lvgl/project/<name>
    if (url.startsWith('/__lvgl/project/')) {
      const rawName = url.slice('/__lvgl/project/'.length);
      return handleProjectGet(req, res, rawName);
    }
    // /__lvgl/edit
    if (url === '/__lvgl/edit' || url.startsWith('/__lvgl/edit?')) {
      handleEdit(req, res).catch((e: unknown) => sendJson(res, 500, { error: (e as Error).message }));
      return;
    }
    // /__lvgl/commit
    if (url === '/__lvgl/commit' || url.startsWith('/__lvgl/commit?')) {
      handleCommit(req, res).catch((e: unknown) => sendJson(res, 500, { error: (e as Error).message }));
      return;
    }
    // /__lvgl/events  (SSE)
    if (url === '/__lvgl/events' || url.startsWith('/__lvgl/events?')) {
      return handleEvents(req, res);
    }

    sendJson(res, 404, { error: `unknown lvgl endpoint: ${url}` });
  }

  return { handle, invalidate, isSelfWrite, notifyChange };
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}
