import type { PropertySchema, SchemaEntry } from './index';

const PART_STYLE_ENTRIES: SchemaEntry[] = [
  { key: 'bg_color', kind: 'color' },
  { key: 'bg_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'border_color', kind: 'color' },
  { key: 'border_width', kind: 'number', min: 0, unit: 'px' },
  { key: 'border_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'radius', kind: 'number', min: 0, unit: 'px' },
];

const KNOB_PART_ENTRIES: SchemaEntry[] = [
  ...PART_STYLE_ENTRIES,
  { key: 'pad_all', kind: 'number', unit: 'px' },
];

export const SWITCH_SCHEMA: PropertySchema = [
  { key: 'indicator', kind: 'group', label: 'Indicator', entries: PART_STYLE_ENTRIES },
  { key: 'knob', kind: 'group', label: 'Knob', entries: KNOB_PART_ENTRIES },
];
