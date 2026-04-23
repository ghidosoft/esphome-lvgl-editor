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
  /** Overrides that were skipped because MVP doesn't support them yet. */
  skipped: Array<{ widgetId: WidgetId; propKey: string; reason: string }>;
}

/**
 * Translate pending overrides into an ordered list of server edit ops.
 *
 * P3 scope: only edit prop values whose source is a literal scalar (no
 * `viaVariable`, no `template`). Variable-backed props are surfaced as
 * `skipped` so the UI can disable the control or show a tooltip; P4 will
 * route them to the substitution definition instead.
 */
export function buildEditOps(
  project: EsphomeProject,
  overrides: Record<WidgetId, Record<string, unknown>>,
): EditBuildResult {
  const ops: EditOp[] = [];
  const skipped: EditBuildResult['skipped'] = [];

  for (const [widgetId, patch] of Object.entries(overrides)) {
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
        skipped.push({ widgetId, propKey, reason: 'property not in source file (adding new keys is P4)' });
        continue;
      }
      if (propSource.template) {
        skipped.push({ widgetId, propKey, reason: 'mixed template strings are read-only' });
        continue;
      }
      if (propSource.viaVariable) {
        skipped.push({ widgetId, propKey, reason: `var-backed (\${${propSource.viaVariable}}) — P4` });
        continue;
      }
      ops.push({
        file: propSource.file,
        yamlPath: propSource.yamlPath,
        newValue: coerceScalar(value),
      });
    }
  }

  return { ops, skipped };
}

/** Narrow an unknown override value to a JSON-safe scalar for the wire. */
function coerceScalar(v: unknown): EditOp['newValue'] {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
}
