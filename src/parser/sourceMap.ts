import type { YamlPath, WidgetId } from './types';

/**
 * Source-map layer for the plain tree produced by the loader. We keep a second
 * tree with the same shape as the plain AST, where every leaf carries the
 * `{ file, yamlPath }` it came from. Collections are mirrored as plain
 * objects/arrays so walking both trees in lockstep is trivial.
 *
 * Collections themselves get a `__origin` marker on a non-enumerable property
 * so we can retrieve the source location of (e.g.) a widget mapping or an
 * array of pages — not only of leaf scalars.
 */

export interface Origin {
  file: string;
  yamlPath: YamlPath;
}

/** Leaf node in the origin tree (scalar values). */
export interface OriginLeaf extends Origin {
  viaVariable?: string;
  /** Mixed template like `"prefix-${var}"` — read-only in MVP. */
  template?: boolean;
}

export type OriginNode = OriginLeaf | OriginNode[] | { [key: string]: OriginNode };

const ORIGIN_KEY = Symbol.for('lvgl-editor.origin');

/** Stamp an origin on a container (object or array), without making the property enumerable. */
export function stampOrigin<T extends object>(node: T, origin: Origin): T {
  Object.defineProperty(node, ORIGIN_KEY, {
    value: origin,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return node;
}

export function readOrigin(node: unknown): Origin | undefined {
  if (!node || (typeof node !== 'object' && typeof node !== 'function')) return undefined;
  return (node as Record<symbol, Origin | undefined>)[ORIGIN_KEY];
}

export function isOriginLeaf(node: unknown): node is OriginLeaf {
  return (
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    'file' in node &&
    'yamlPath' in node &&
    typeof (node as { file: unknown }).file === 'string' &&
    Array.isArray((node as { yamlPath: unknown }).yamlPath)
  );
}

/** Retrieve the origin node at a given path inside a parallel origin tree. */
export function getOriginAt(
  root: OriginNode | undefined,
  path: (string | number)[],
): OriginNode | undefined {
  if (!root) return undefined;
  let cur: OriginNode | undefined = root;
  for (const segment of path) {
    if (!cur) return undefined;
    if (Array.isArray(cur)) {
      if (typeof segment !== 'number') return undefined;
      cur = cur[segment];
    } else if (typeof cur === 'object' && !isOriginLeaf(cur)) {
      cur = cur[String(segment)];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Allocate a stable WidgetId. Prefer an explicit `id:` key (survives reorders);
 * fall back to the page id and the structural index path inside that page.
 */
export function makeWidgetId(pageId: string, indexPath: number[], declaredId?: string): WidgetId {
  if (declaredId) return `id:${declaredId}`;
  return `${pageId}/${indexPath.join('/')}`;
}
