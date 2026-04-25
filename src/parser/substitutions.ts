import type { ParseError } from './types.js';
import { isOpaqueTag } from './types.js';
import {
  isOriginLeaf,
  stampOrigin,
  readOrigin,
  type OriginNode,
  type OriginLeaf,
} from './sourceMap.js';

const VAR_RE = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
/** Matches a scalar that is exactly one `${var}` and nothing else. */
const PURE_VAR_RE = /^\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/;

/**
 * Walk the plain tree + origin tree in lockstep. Replace `${var}` in every
 * string scalar with its value from `subs`, and annotate the origin leaf with:
 *   - `viaVariable: name` when the scalar was exactly `${name}` (round-trip can
 *     update the variable instead of writing a literal)
 *   - `template: true` when the scalar is a mixed template like `"prefix-${x}"`
 *     (read-only in MVP)
 * Missing vars are left literal and recorded as non-fatal warnings.
 */
export function applySubstitutions(
  plain: unknown,
  origin: OriginNode,
  subs: Record<string, string>,
  errors: ParseError[],
): { plain: unknown; origin: OriginNode } {
  if (typeof plain === 'string') {
    return applyToString(plain, origin, subs, errors);
  }
  if (Array.isArray(plain)) {
    const originArr = Array.isArray(origin) ? origin : [];
    const outPlain: unknown[] = [];
    const outOrigin: OriginNode[] = [];
    for (let i = 0; i < plain.length; i++) {
      const child = applySubstitutions(
        plain[i],
        originArr[i] ?? fallbackLeaf(origin, i),
        subs,
        errors,
      );
      outPlain.push(child.plain);
      outOrigin.push(child.origin);
    }
    const containerOrigin = readOrigin(origin);
    if (containerOrigin) stampOrigin(outOrigin, containerOrigin);
    return { plain: outPlain, origin: outOrigin };
  }
  if (plain && typeof plain === 'object' && !isOpaqueTag(plain)) {
    const originMap =
      origin && typeof origin === 'object' && !Array.isArray(origin) && !isOriginLeaf(origin)
        ? origin
        : {};
    const outPlain: Record<string, unknown> = {};
    const outOrigin: Record<string, OriginNode> = {};
    for (const [k, v] of Object.entries(plain as Record<string, unknown>)) {
      const child = applySubstitutions(v, originMap[k] ?? fallbackLeaf(origin, k), subs, errors);
      outPlain[k] = child.plain;
      outOrigin[k] = child.origin;
    }
    const containerOrigin = readOrigin(origin);
    if (containerOrigin) stampOrigin(outOrigin, containerOrigin);
    return { plain: outPlain, origin: outOrigin };
  }
  return { plain, origin };
}

function applyToString(
  value: string,
  origin: OriginNode,
  subs: Record<string, string>,
  errors: ParseError[],
): { plain: string; origin: OriginLeaf } {
  const pure = value.match(PURE_VAR_RE);
  const leaf: OriginLeaf = isOriginLeaf(origin) ? { ...origin } : { file: '', yamlPath: [] };

  if (pure) {
    const name = pure[1];
    if (name in subs) {
      return { plain: subs[name], origin: { ...leaf, viaVariable: name } };
    }
    errors.push({
      kind: 'SubstitutionMissing',
      message: `unknown substitution \${${name}}`,
      variable: name,
    });
    return { plain: value, origin: { ...leaf, viaVariable: name } };
  }

  let hasMatch = false;
  const replaced = value.replace(VAR_RE, (match, name) => {
    hasMatch = true;
    if (name in subs) return subs[name];
    errors.push({
      kind: 'SubstitutionMissing',
      message: `unknown substitution \${${name}}`,
      variable: name,
    });
    return match;
  });

  if (hasMatch) {
    return { plain: replaced, origin: { ...leaf, template: true } };
  }
  return { plain: replaced, origin: leaf };
}

/** When an origin branch is missing (e.g. default-filled plain value), synthesize
 * a leaf that inherits the nearest container's origin. Keeps the tree walkable. */
function fallbackLeaf(origin: OriginNode, segment: string | number): OriginLeaf {
  const containerOrigin = readOrigin(origin);
  if (containerOrigin) {
    return { file: containerOrigin.file, yamlPath: [...containerOrigin.yamlPath, segment] };
  }
  return { file: '', yamlPath: [] };
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
