import type { PropertySchema, SchemaEntry } from './index';

const PART_STYLE_ENTRIES: SchemaEntry[] = [
  { key: 'bg_color', kind: 'color' },
  { key: 'bg_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'border_color', kind: 'color' },
  { key: 'border_width', kind: 'number', min: 0, unit: 'px' },
  { key: 'border_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'radius', kind: 'number', min: 0, unit: 'px' },
];

export const BAR_SCHEMA: PropertySchema = [
  { key: 'value', kind: 'number' },
  { key: 'min_value', kind: 'number' },
  { key: 'max_value', kind: 'number' },
  { key: 'start_value', kind: 'number' },
  { key: 'mode', kind: 'enum', enum: ['NORMAL', 'SYMMETRICAL', 'RANGE'] },
  { key: 'orientation', kind: 'enum', enum: ['AUTO', 'HORIZONTAL', 'VERTICAL'] },
  { key: 'indicator', kind: 'group', label: 'Indicator', entries: PART_STYLE_ENTRIES },
];
