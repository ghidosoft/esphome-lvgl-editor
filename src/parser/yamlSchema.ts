import { parseDocument as yamlParseDocument, Document, Scalar } from 'yaml';
import type { CollectionTag, ScalarTag } from 'yaml';
import type { OpaqueTag } from './types.js';

/**
 * ESPHome custom scalar tags: `!include`, `!secret`, `!lambda`. The `yaml`
 * package gives each a Scalar whose `tag` is the literal string, and we mirror
 * it to our { __tag, value } shape when flattening to a plain tree.
 *
 * We keep the CST form (Document) alongside a plain projection so edits can
 * round-trip with comments and formatting preserved (goal of the round-trip
 * save feature).
 */
/**
 * Register `!include`, `!secret`, `!lambda` as known tags so the parser
 * doesn't warn on them. We intentionally don't set `identify` or `stringify`
 * — the default string serializer preserves block literals (`|-`, `|+`),
 * plain/quoted style, and the tag itself, which is what round-trip editing
 * needs. Providing a custom `stringify` here forced every tagged scalar
 * inline and destroyed `!lambda |-` multi-line bodies.
 */
const ESPHOME_TAGS: Array<ScalarTag | CollectionTag> = (
  ['!include', '!secret', '!lambda'] as const
).map(
  (tag): ScalarTag => ({
    tag,
    resolve: (value: string) => value,
  }),
);

export function parseDocument(source: string): Document.Parsed {
  return yamlParseDocument(source, {
    customTags: ESPHOME_TAGS,
    // Preserve source tokens on every node so nodes that weren't touched by an
    // edit round-trip byte-for-byte on `toString()`; without this, any `setIn`
    // triggers a full re-stringify of the Document and invents cosmetic
    // differences far from the edit site.
    keepSourceTokens: true,
    merge: false,
  });
}

/** True when `scalar.tag` matches one of the ESPHome opaque tags. */
export function isOpaqueScalar(node: unknown): node is Scalar & { tag: OpaqueTag['__tag'] } {
  if (!(node instanceof Scalar)) return false;
  const tag = (node as Scalar).tag;
  return tag === '!include' || tag === '!secret' || tag === '!lambda';
}

/** Build the `{ __tag, value }` marker from a tagged scalar. */
export function toOpaqueMarker(scalar: Scalar): OpaqueTag {
  return { __tag: scalar.tag as OpaqueTag['__tag'], value: String(scalar.value ?? '') };
}
