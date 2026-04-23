import type { EsphomeProject, WidgetId } from '../parser/types';

/**
 * Wire format for server-side edits. The server looks up the corresponding
 * `yaml.Document` in the FileRegistry and calls `doc.setIn(yamlPath, newValue)`
 * to mutate the CST in place.
 */
export interface EditOp {
  file: string;
  yamlPath: (string | number)[];
  newValue: string | number | boolean | null;
}

export interface EditBuildResult {
  ops: EditOp[];
  /** Pending edits that cannot be applied yet (reason explains why). */
  skipped: Array<{ widgetId?: WidgetId; propKey?: string; varName?: string; reason: string }>;
}

/**
 * Translate pending overrides into an ordered list of server edit ops.
 *
 * Sources of ops:
 *   - Widget overrides on literal props → write to the widget's own file.
 *   - Var overrides (from VariablesPanel or implicitly from editing a
 *     var-backed prop) → write to the substitution's definition file.
 *
 * Template props, props with no source-map entry, and new props (not yet in
 * YAML) are surfaced as `skipped` with a reason so the UI can explain.
 */
export function buildEditOps(
  project: EsphomeProject,
  widgetOverrides: Record<WidgetId, Record<string, unknown>>,
  varOverrides: Record<string, string>,
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
        skipped.push({ widgetId, propKey, reason: 'property not in source file (adding new keys is P5)' });
        continue;
      }
      if (propSource.template) {
        skipped.push({ widgetId, propKey, reason: 'mixed template strings are read-only' });
        continue;
      }
      if (propSource.viaVariable) {
        // Defensive: store normally routes these to varOverrides, but if a
        // widget override sneaks in for a var-backed prop we still prefer the
        // variable write-back for consistency.
        skipped.push({
          widgetId,
          propKey,
          reason: `var-backed (\${${propSource.viaVariable}}) — edit via Variables`,
        });
        continue;
      }
      ops.push({
        file: propSource.file,
        yamlPath: propSource.yamlPath,
        newValue: coerceScalar(value),
      });
    }
  }

  for (const [varName, newValue] of Object.entries(varOverrides)) {
    const entry = project.substitutions?.[varName];
    if (!entry || !entry.file) {
      skipped.push({ varName, reason: 'substitution has no recorded origin file' });
      continue;
    }
    ops.push({
      file: entry.file,
      yamlPath: entry.yamlPath,
      newValue: coerceScalar(newValue),
    });
  }

  return { ops, skipped };
}

/** Narrow an unknown override value to a JSON-safe scalar for the wire. */
function coerceScalar(v: unknown): EditOp['newValue'] {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
}
