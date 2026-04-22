import type { EsphomeProject } from '../parser/types';
import type { ProjectListEntry } from '../server/projectScanner';

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
