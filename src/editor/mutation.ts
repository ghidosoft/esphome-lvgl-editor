import type { EsphomeProject, WidgetId } from '../parser/types';

/**
 * Wire format for server-side edits. The server looks up the corresponding
 * `yaml.Document` in the FileRegistry and calls either `doc.setIn` or
 * `doc.deleteIn` depending on `op`.
 */
export interface EditOp {
  file: string;
  yamlPath: (string | number)[];
  op: 'set' | 'delete';
  newValue?: string | number | boolean | null;
}

export interface EditBuildResult {
  ops: EditOp[];
  /** Pending edits that cannot be applied yet (reason explains why). */
  skipped: Array<{
    widgetId?: WidgetId;
    styleId?: string;
    propKey?: string;
    varName?: string;
    reason: string;
  }>;
}

/**
 * Translate pending overrides and deletions into an ordered list of server
 * edit ops.
 *
 * Sources of ops:
 *   - Widget/style overrides on literal props → `set` at the prop's yamlPath.
 *   - Overrides on props not yet in source → `set` at
 *     `<owner.yamlPath>/[widgetType]/<propKey>` (adds a new key).
 *   - Widget/style deletions → `delete` at the prop's yamlPath.
 *   - Var overrides → `set` at the substitution's definition file.
 */
export function buildEditOps(
  project: EsphomeProject,
  widgetOverrides: Record<WidgetId, Record<string, unknown>>,
  varOverrides: Record<string, string>,
  widgetDeletions: Record<WidgetId, string[]> = {},
  styleOverrides: Record<string, Record<string, unknown>> = {},
  styleDeletions: Record<string, string[]> = {},
): EditBuildResult {
  const ops: EditOp[] = [];
  const skipped: EditBuildResult['skipped'] = [];

  for (const [widgetId, patch] of Object.entries(widgetOverrides)) {
    const sources = project.sources?.[widgetId];
    if (!sources) {
      for (const key of Object.keys(patch)) {
        skipped.push({ widgetId, propKey: key, reason: 'no source map entry' });
      }
      continue;
    }
    for (const [propKey, value] of Object.entries(patch)) {
      const propSource = sources.props[propKey];
      if (!propSource) {
        ops.push({
          op: 'set',
          file: sources.self.file,
          yamlPath: [...sources.self.yamlPath, sources.self.widgetType, propKey],
          newValue: coerceScalar(value),
        });
        continue;
      }
      if (propSource.template) {
        skipped.push({ widgetId, propKey, reason: 'mixed template strings are read-only' });
        continue;
      }
      if (propSource.viaVariable) {
        skipped.push({
          widgetId,
          propKey,
          reason: `var-backed (\${${propSource.viaVariable}}) — edit via Variables`,
        });
        continue;
      }
      ops.push({
        op: 'set',
        file: propSource.file,
        yamlPath: propSource.yamlPath,
        newValue: coerceScalar(value),
      });
    }
  }

  for (const [widgetId, keys] of Object.entries(widgetDeletions)) {
    const sources = project.sources?.[widgetId];
    if (!sources) {
      for (const key of keys) skipped.push({ widgetId, propKey: key, reason: 'no source map entry' });
      continue;
    }
    for (const key of keys) {
      const propSource = sources.props[key];
      if (!propSource) continue; // already absent — nothing to delete on disk
      if (propSource.viaVariable) {
        skipped.push({ widgetId, propKey: key, reason: 'cannot remove a var-backed prop (P5 detach)' });
        continue;
      }
      ops.push({ op: 'delete', file: propSource.file, yamlPath: propSource.yamlPath });
    }
  }

  for (const [styleId, patch] of Object.entries(styleOverrides)) {
    const sources = project.styleSources?.[styleId];
    if (!sources) {
      for (const key of Object.keys(patch)) {
        skipped.push({ styleId, propKey: key, reason: 'no source map entry' });
      }
      continue;
    }
    for (const [propKey, value] of Object.entries(patch)) {
      const propSource = sources.props[propKey];
      if (!propSource) {
        ops.push({
          op: 'set',
          file: sources.self.file,
          yamlPath: [...sources.self.yamlPath, propKey],
          newValue: coerceScalar(value),
        });
        continue;
      }
      if (propSource.template) {
        skipped.push({ styleId, propKey, reason: 'mixed template strings are read-only' });
        continue;
      }
      if (propSource.viaVariable) {
        skipped.push({
          styleId,
          propKey,
          reason: `var-backed (\${${propSource.viaVariable}}) — edit via Variables`,
        });
        continue;
      }
      ops.push({
        op: 'set',
        file: propSource.file,
        yamlPath: propSource.yamlPath,
        newValue: coerceScalar(value),
      });
    }
  }

  for (const [styleId, keys] of Object.entries(styleDeletions)) {
    const sources = project.styleSources?.[styleId];
    if (!sources) {
      for (const key of keys) skipped.push({ styleId, propKey: key, reason: 'no source map entry' });
      continue;
    }
    for (const key of keys) {
      const propSource = sources.props[key];
      if (!propSource) continue;
      if (propSource.viaVariable) {
        skipped.push({ styleId, propKey: key, reason: 'cannot remove a var-backed prop (P5 detach)' });
        continue;
      }
      ops.push({ op: 'delete', file: propSource.file, yamlPath: propSource.yamlPath });
    }
  }

  for (const [varName, newValue] of Object.entries(varOverrides)) {
    const entry = project.substitutions?.[varName];
    if (!entry || !entry.file) {
      skipped.push({ varName, reason: 'substitution has no recorded origin file' });
      continue;
    }
    ops.push({
      op: 'set',
      file: entry.file,
      yamlPath: entry.yamlPath,
      newValue: coerceScalar(newValue),
    });
  }

  return { ops, skipped };
}

function coerceScalar(v: unknown): EditOp['newValue'] {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
}
