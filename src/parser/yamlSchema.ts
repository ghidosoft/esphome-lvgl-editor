import yaml from 'js-yaml';
import type { OpaqueTag } from './types';

/**
 * js-yaml schema that recognizes ESPHome's custom scalar tags.
 * Each tag is preserved as { __tag, value } so a later pass can resolve it
 * with full filesystem context (parent directory, project root).
 *
 * Mirrors the schema in scripts/merge-lvgl.mjs.
 */
const opaque = (tag: OpaqueTag['__tag']) =>
  new yaml.Type(tag, {
    kind: 'scalar',
    construct: (data: string): OpaqueTag => ({ __tag: tag, value: data }),
  });

export const ESPHOME_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
  opaque('!include'),
  opaque('!secret'),
  opaque('!lambda'),
]);

export function parseYaml(source: string): unknown {
  return yaml.load(source, { schema: ESPHOME_SCHEMA });
}
