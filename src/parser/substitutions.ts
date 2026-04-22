import type { ParseError } from './types';
import { isOpaqueTag } from './types';

const VAR_RE = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/**
 * Walk the doc and replace `${var}` occurrences in every string scalar with
 * the corresponding value from `subs`. Missing vars are left literal and
 * recorded as non-fatal warnings.
 */
export function applySubstitutions(
  value: unknown,
  subs: Record<string, string>,
  errors: ParseError[],
): unknown {
  if (typeof value === 'string') {
    return value.replace(VAR_RE, (match, name) => {
      if (name in subs) return subs[name];
      errors.push({
        kind: 'SubstitutionMissing',
        message: `unknown substitution \${${name}}`,
        variable: name,
      });
      return match;
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => applySubstitutions(v, subs, errors));
  }
  if (value && typeof value === 'object' && !isOpaqueTag(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = applySubstitutions(v, subs, errors);
    }
    return out;
  }
  return value;
}

/**
 * Coerce all substitution values to strings (ESPHome's substitutions are
 * scalars; numbers like `radius_card: "12"` are quoted in YAML, but tolerate
 * unquoted numbers too).
 */
export function normalizeSubsMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null) continue;
    out[k] = String(v);
  }
  return out;
}
