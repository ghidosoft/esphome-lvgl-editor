#!/usr/bin/env node
import http from 'node:http';
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import sirv from 'sirv';
import chokidar from 'chokidar';
import { createLvglRouter } from '../dist/cli/server/lvglRouter.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distClient = resolve(packageRoot, 'dist');
const samplesDir = resolve(packageRoot, 'samples');
const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));

const argv = parseArgs(process.argv.slice(2));

if (argv.help) {
  printHelp();
  process.exit(0);
}
if (argv.version) {
  process.stdout.write(`${pkg.name} ${pkg.version}\n`);
  process.exit(0);
}

const esphomeDir = argv.demo
  ? samplesDir
  : resolve(process.cwd(), argv.path ?? '.');

if (!existsSync(esphomeDir) || !statSync(esphomeDir).isDirectory()) {
  process.stderr.write(`error: not a directory: ${esphomeDir}\n`);
  process.exit(1);
}

const yamlCount = countTopLevelYaml(esphomeDir);
if (yamlCount === 0) {
  process.stderr.write(
    `warning: no *.yaml files found in ${esphomeDir} (server will start anyway; drop files in to load them)\n`,
  );
}

if (!existsSync(distClient) || !existsSync(resolve(distClient, 'index.html'))) {
  process.stderr.write(
    `error: built client not found at ${distClient}. Did you run "npm run build"?\n`,
  );
  process.exit(1);
}

const router = createLvglRouter({ esphomeDir });
const serveStatic = sirv(distClient, { single: true, dev: false });

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/__lvgl')) return router.handle(req, res);
  serveStatic(req, res);
});

const watcher = chokidar.watch(esphomeDir, {
  ignoreInitial: true,
  ignored: (p) => {
    const norm = p.replace(/\\/g, '/');
    return (
      norm.includes('/.esphome/') ||
      norm.includes('/merged/') ||
      norm.endsWith('/secrets.yaml')
    );
  },
});
watcher.on('all', (_evt, file) => {
  const norm = file.replace(/\\/g, '/');
  if (!norm.endsWith('.yaml')) return;
  if (router.isSelfWrite(file)) return;
  router.invalidate(file);
  router.notifyChange(file);
});

const host = argv.host ?? '127.0.0.1';
listen(server, argv.port ?? 5371, host)
  .then((boundPort) => {
    const url = `http://${host}:${boundPort}`;
    process.stdout.write(`${pkg.name} → ${url}\n`);
    process.stdout.write(`  esphome dir: ${esphomeDir}\n`);
    process.stdout.write(`  yaml files:  ${yamlCount}\n`);
    if (argv.open) openBrowser(url);
  })
  .catch((err) => {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  });

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  watcher.close().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---------- helpers ----------

function parseArgs(args) {
  const out = { path: undefined, port: undefined, host: undefined, demo: false, open: false, help: false, version: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '-v' || a === '--version') out.version = true;
    else if (a === '--demo') out.demo = true;
    else if (a === '--open') out.open = true;
    else if (a === '-p' || a === '--port') {
      const v = args[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        process.stderr.write(`error: invalid --port value: ${v}\n`);
        process.exit(1);
      }
      out.port = n;
    } else if (a === '--host') {
      out.host = args[++i];
    } else if (a.startsWith('--port=')) {
      out.port = Number(a.slice(7));
    } else if (a.startsWith('--host=')) {
      out.host = a.slice(7);
    } else if (a.startsWith('-')) {
      process.stderr.write(`error: unknown option: ${a}\n`);
      process.exit(1);
    } else if (out.path === undefined) {
      out.path = a;
    } else {
      process.stderr.write(`error: unexpected argument: ${a}\n`);
      process.exit(1);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(
    `${pkg.name} — preview & edit ESPHome LVGL configs in the browser\n\n` +
      `Usage: ${pkg.name} [path] [options]\n\n` +
      `Arguments:\n` +
      `  path              Directory containing top-level *.yaml ESPHome configs (default: cwd)\n\n` +
      `Options:\n` +
      `  -p, --port <n>    HTTP port (default: 5371; tries next free if taken)\n` +
      `      --host <h>    Bind host (default: 127.0.0.1)\n` +
      `      --demo        Use the bundled samples/ directory instead of [path]\n` +
      `      --open        Open the browser on start\n` +
      `  -h, --help        Show this help and exit\n` +
      `  -v, --version     Show version and exit\n`,
  );
}

function countTopLevelYaml(dir) {
  try {
    return readdirSync(dir).filter(
      (f) => f.endsWith('.yaml') && f !== 'secrets.yaml',
    ).length;
  } catch {
    return 0;
  }
}

function listen(server, startPort, host) {
  return new Promise((resolveP, rejectP) => {
    const tryPort = (port, attemptsLeft) => {
      const onError = (err) => {
        if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
          server.removeListener('error', onError);
          tryPort(port + 1, attemptsLeft - 1);
        } else {
          rejectP(err);
        }
      };
      server.once('error', onError);
      server.listen(port, host, () => {
        server.removeListener('error', onError);
        resolveP(port);
      });
    };
    tryPort(startPort, 10);
  });
}

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // Best-effort; user can copy the URL from the printed line.
  }
}
