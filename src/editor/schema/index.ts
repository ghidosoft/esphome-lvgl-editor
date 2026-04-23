import { COMMON_SCHEMA } from './common';
import { LABEL_SCHEMA } from './label';

/**
 * Widget-type → editable property metadata. Keeps UI controls decoupled from
 * widget rendering and from the free-form `LvglWidget.props` bag.
 *
 * Scope (MVP): text/colors, geometry (x/y/width/height/align/radius),
 * padding and borders. Anything not in the schema falls through to a
 * read-only raw row in the property panel.
 */
export type PropKind = 'string' | 'number' | 'size' | 'color' | 'enum' | 'align';

export interface SchemaEntry {
  key: string;
  kind: PropKind;
  enum?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

export type PropertySchema = SchemaEntry[];

/**
 * Returns the composed schema for a given widget type. Common props come
 * first (so they appear at the top of the panel), then type-specific.
 */
export function getSchema(widgetType: string): PropertySchema {
  const specific = SPECIFIC_SCHEMAS[widgetType] ?? [];
  return [...COMMON_SCHEMA, ...specific];
}

const SPECIFIC_SCHEMAS: Record<string, PropertySchema> = {
  label: LABEL_SCHEMA,
};
