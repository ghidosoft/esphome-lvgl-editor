/**
 * Helpers for one-level-nested prop keys.
 *
 * ESPHome exposes LVGL "part selectors" as nested blocks (e.g. a slider has
 * `indicator: { bg_color: ... }` and `knob: { bg_color: ... }`). The editor
 * keeps overrides and sources keyed by a flat dotted string like
 * `"indicator.bg_color"` — these helpers split that back into a segment list
 * and apply it to a plain object as needed.
 *
 * The depth is limited to two segments on purpose: ESPHome doesn't nest
 * part selectors further, so generalising would just add a model without a
 * real use case.
 */

export function splitKey(key: string): string[] {
  return key.includes('.') ? key.split('.') : [key];
}

export function getNested(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Returns a new object with `value` set at `path`. Clones only the segments
 * along the way — unrelated branches keep their reference identity.
 */
export function setNested(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  if (rest.length === 0) return { ...obj, [head]: value };
  const child = obj[head];
  const childObj =
    child && typeof child === 'object' && !Array.isArray(child)
      ? (child as Record<string, unknown>)
      : {};
  return { ...obj, [head]: setNested(childObj, rest, value) };
}

/**
 * Returns a new object with `path` pruned. Parent blocks that become empty
 * are removed as well — a nicer outcome for YAML write-back.
 */
export function deleteNested(
  obj: Record<string, unknown>,
  path: string[],
): Record<string, unknown> {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  if (rest.length === 0) {
    if (!(head in obj)) return obj;
    const { [head]: _drop, ...next } = obj;
    return next;
  }
  const child = obj[head];
  if (!child || typeof child !== 'object' || Array.isArray(child)) return obj;
  const nextChild = deleteNested(child as Record<string, unknown>, rest);
  if (Object.keys(nextChild).length === 0) {
    const { [head]: _drop, ...next } = obj;
    return next;
  }
  return { ...obj, [head]: nextChild };
}
