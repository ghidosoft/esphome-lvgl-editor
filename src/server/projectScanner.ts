import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface ProjectListEntry {
  name: string;
  /** Heuristic: file contains a top-level `lvgl:` key. */
  hasLvgl: boolean;
}

/**
 * Cheap scan: enumerate `*.yaml` files at the top level of esphomeDir
 * (excluding secrets.yaml). We grep for `^lvgl:` instead of YAML-parsing each
 * file, since a full parse can fail on missing !include targets and we just
 * want the sidebar list.
 */
export function listProjects(esphomeDir: string): ProjectListEntry[] {
  let entries: string[];
  try {
    entries = readdirSync(esphomeDir);
  } catch {
    return [];
  }
  const out: ProjectListEntry[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.yaml')) continue;
    if (entry === 'secrets.yaml') continue;
    const full = join(esphomeDir, entry);
    let isFile = false;
    try {
      isFile = statSync(full).isFile();
    } catch {
      continue;
    }
    if (!isFile) continue;

    const name = entry.slice(0, -'.yaml'.length);
    let hasLvgl = false;
    try {
      const source = readFileSync(full, 'utf8');
      hasLvgl = /^lvgl\s*:/m.test(source);
    } catch {
      // ignore — entry still listed, just without LVGL flag
    }
    out.push({ name, hasLvgl });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
