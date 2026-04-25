import { COMMON_SCHEMA, COMMON_STATE_GROUPS } from './common';
import { LABEL_SCHEMA } from './label';
import { SLIDER_SCHEMA } from './slider';
import { SPINNER_SCHEMA } from './spinner';

/**
 * Widget-type → editable property metadata. Keeps UI controls decoupled from
 * widget rendering and from the free-form `LvglWidget.props` bag.
 *
 * Scope (MVP): text/colors, geometry (x/y/width/height/align/radius),
 * padding and borders. Anything not in the schema falls through to a
 * read-only raw row in the property panel.
 *
 * Groups (`SchemaGroup`) model LVGL "part selectors" that ESPHome spells as
 * nested YAML blocks (e.g. `slider.indicator: { bg_color: ... }`). In the
 * editor, group children are keyed by a dotted string (`"indicator.bg_color"`)
 * and share that same dotted form across the store, source map, and edit ops.
 */
export type PropKind = 'string' | 'number' | 'size' | 'color' | 'enum' | 'align' | 'bool';

export interface SchemaEntry {
  key: string;
  kind: PropKind;
  enum?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

export interface SchemaGroup {
  key: string;
  kind: 'group';
  label?: string;
  entries: SchemaEntry[];
}

export type SchemaItem = SchemaEntry | SchemaGroup;
export type PropertySchema = SchemaItem[];

export function isGroup(item: SchemaItem): item is SchemaGroup {
  return (item as SchemaGroup).kind === 'group';
}

/**
 * Returns the composed schema for a given widget type. Common props come
 * first (so they appear at the top of the panel), then type-specific.
 */
export function getSchema(widgetType: string): PropertySchema {
  const specific = SPECIFIC_SCHEMAS[widgetType] ?? [];
  return [...COMMON_SCHEMA, ...specific, ...COMMON_STATE_GROUPS];
}

const SPECIFIC_SCHEMAS: Record<string, PropertySchema> = {
  label: LABEL_SCHEMA,
  slider: SLIDER_SCHEMA,
  spinner: SPINNER_SCHEMA,
};
