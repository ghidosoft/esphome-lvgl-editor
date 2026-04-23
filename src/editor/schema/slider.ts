import type { PropertySchema, SchemaEntry } from './index';

const PART_STYLE_ENTRIES: SchemaEntry[] = [
  { key: 'bg_color', kind: 'color' },
  { key: 'bg_opa', kind: 'number', min: 0, max: 255 },
  { key: 'border_color', kind: 'color' },
  { key: 'border_width', kind: 'number', min: 0, unit: 'px' },
  { key: 'border_opa', kind: 'number', min: 0, max: 255 },
  { key: 'radius', kind: 'number', min: 0, unit: 'px' },
];

export const SLIDER_SCHEMA: PropertySchema = [
  { key: 'min_value', kind: 'number' },
  { key: 'max_value', kind: 'number' },
  { key: 'value', kind: 'number' },
  { key: 'indicator', kind: 'group', label: 'Indicator', entries: PART_STYLE_ENTRIES },
  { key: 'knob', kind: 'group', label: 'Knob', entries: PART_STYLE_ENTRIES },
];
