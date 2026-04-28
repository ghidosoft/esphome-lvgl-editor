import type { PropertySchema, SchemaEntry } from './index';

const INDICATOR_ENTRIES: SchemaEntry[] = [
  { key: 'bg_color', kind: 'color' },
  { key: 'bg_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'border_color', kind: 'color' },
  { key: 'border_width', kind: 'number', min: 0, unit: 'px' },
  { key: 'border_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'radius', kind: 'number', min: 0, unit: 'px' },
  { key: 'pad_all', kind: 'number', min: 0, unit: 'px' },
];

export const CHECKBOX_SCHEMA: PropertySchema = [
  { key: 'text', kind: 'string' },
  { key: 'indicator', kind: 'group', label: 'Indicator', entries: INDICATOR_ENTRIES },
];
