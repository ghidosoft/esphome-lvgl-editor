import { parseDocument as yamlParseDocument, Document, Scalar } from 'yaml';
import type { CollectionTag, ScalarTag } from 'yaml';
import type { OpaqueTag } from './types';

/**
 * ESPHome custom scalar tags: `!include`, `!secret`, `!lambda`. The `yaml`
 * package gives each a Scalar whose `tag` is the literal string, and we mirror
 * it to our { __tag, value } shape when flattening to a plain tree.
 *
 * We keep the CST form (Document) alongside a plain projection so edits can
 * round-trip with comments and formatting preserved (goal of the round-trip
 * save feature).
 */
const ESPHOME_TAGS: Array<ScalarTag | CollectionTag> = (['!include', '!secret', '!lambda'] as const).map(
  (tag): ScalarTag => ({
    tag,
    resolve: (value: string) => value,
    identify: (v: unknown) => typeof v === 'object' && v !== null && (v as { __tag?: string }).__tag === tag,
    stringify: ({ value }) => String(value),
  }),
);

export function parseDocument(source: string): Document.Parsed {
  return yamlParseDocument(source, {
    customTags: ESPHOME_TAGS,
    // Keep source-token info for round-tripping.
    keepSourceTokens: false,
    // Resolve aliases explicitly so duplicate anchors don't conflate origins.
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
