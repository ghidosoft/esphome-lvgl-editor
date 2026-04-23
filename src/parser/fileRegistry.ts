import type { Document } from 'yaml';

/**
 * Per-project cache of parsed YAML Documents (CST-preserving). Lives only on
 * the server; holds enough state to write back edits with comments/formatting
 * intact.
 *
 * One registry per loaded project. When the watcher invalidates a project,
 * throw the whole thing away — the next request rebuilds from disk.
 */
export interface FileEntry {
  /** Absolute path of the file. */
  path: string;
  /** Parsed CST Document. Mutated in place when edits arrive. */
  doc: Document.Parsed;
  /** File mtime at load time (ms). Used for conflict detection before commit. */
  mtime: number;
  /** Original file source (for `mtime + contentEquals` checks). */
  raw: string;
  /** True when an in-memory edit has been applied but not yet flushed to disk. */
  dirty: boolean;
}

export class FileRegistry {
  private map = new Map<string, FileEntry>();

  register(entry: Omit<FileEntry, 'dirty'>): void {
    this.map.set(entry.path, { ...entry, dirty: false });
  }

  get(path: string): FileEntry | undefined {
    return this.map.get(path);
  }

  has(path: string): boolean {
    return this.map.has(path);
  }

  markDirty(path: string): void {
    const e = this.map.get(path);
    if (e) e.dirty = true;
  }

  dirtyFiles(): string[] {
    const out: string[] = [];
    for (const [path, e] of this.map) if (e.dirty) out.push(path);
    return out;
  }

  allPaths(): string[] {
    return [...this.map.keys()];
  }
}
