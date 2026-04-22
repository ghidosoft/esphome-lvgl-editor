import { isOpaqueTag } from './types';

/**
 * ESPHome `packages:` merge semantics: each value resolves to a YAML document
 * that is deep-merged into the host. Scalars from the host win; arrays from
 * the host replace; objects merge recursively.
 *
 * In our pipeline, `packages:` entries arrive already loaded (the loader resolves
 * `!include` first). The host doc has `packages: { name: <docObject> }`.
 */
export function mergePackages(doc: Record<string, unknown>): Record<string, unknown> {
  const packages = doc.packages;
  if (!packages || typeof packages !== 'object' || isOpaqueTag(packages)) return doc;

  let out: Record<string, unknown> = {};
  // Apply packages first (they form the base)
  for (const value of Object.values(packages as Record<string, unknown>)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out = deepMerge(out, value as Record<string, unknown>);
    }
  }
  // Then apply the host doc on top (host wins), minus the `packages:` key
  const hostWithoutPackages: Record<string, unknown> = { ...doc };
  delete hostWithoutPackages.packages;
  out = deepMerge(out, hostWithoutPackages);
  return out;
}

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    const prev = out[k];
    if (
      prev &&
      v &&
      typeof prev === 'object' &&
      typeof v === 'object' &&
      !Array.isArray(prev) &&
      !Array.isArray(v) &&
      !isOpaqueTag(prev) &&
      !isOpaqueTag(v)
    ) {
      out[k] = deepMerge(prev as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
