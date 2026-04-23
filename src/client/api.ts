import type { EsphomeProject } from '../parser/types';
import type { ProjectListEntry } from '../server/projectScanner';
import type { EditOp } from '../editor/mutation';

export async function fetchProjects(): Promise<ProjectListEntry[]> {
  const res = await fetch('/__lvgl/projects');
  if (!res.ok) throw new Error(`failed to list projects: ${res.status}`);
  return res.json();
}

export async function fetchProject(name: string): Promise<EsphomeProject> {
  const res = await fetch(`/__lvgl/project/${encodeURIComponent(name)}`);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error ?? ''; } catch { /* ignore */ }
    throw new Error(detail || `failed to load project ${name}: ${res.status}`);
  }
  return res.json();
}

/**
 * Stage edits against the server's in-memory CST. Returns the list of files
 * that became dirty as a result (for the UI's save indicator). Nothing is
 * written to disk until `commitProject` is called.
 */
export async function postEdit(project: string, ops: EditOp[]): Promise<{ dirty: string[] }> {
  const res = await fetch('/__lvgl/edit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project, ops }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `edit failed: ${res.status}`);
  return body;
}

/** Flush every dirty file for this project to disk (atomic write). */
export async function commitProject(project: string): Promise<{ written: string[] }> {
  const res = await fetch('/__lvgl/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `commit failed: ${res.status}`);
  return body;
}
