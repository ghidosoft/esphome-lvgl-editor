import type { PropertySchema, SchemaEntry } from './index';

const ARC_PART_ENTRIES: SchemaEntry[] = [
  { key: 'arc_color', kind: 'color' },
  { key: 'arc_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'arc_width', kind: 'number', min: 0, unit: 'px' },
  { key: 'arc_rounded', kind: 'enum', enum: ['true', 'false'] },
  { key: 'arc_image_src', kind: 'string' },
];

const KNOB_PART_ENTRIES: SchemaEntry[] = [
  { key: 'bg_color', kind: 'color' },
  { key: 'bg_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'border_color', kind: 'color' },
  { key: 'border_width', kind: 'number', min: 0, unit: 'px' },
  { key: 'border_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'pad_all', kind: 'number', min: 0, unit: 'px' },
];

export const ARC_SCHEMA: PropertySchema = [
  { key: 'value', kind: 'number' },
  { key: 'min_value', kind: 'number' },
  { key: 'max_value', kind: 'number' },
  { key: 'rotation', kind: 'number', unit: 'deg' },
  { key: 'start_angle', kind: 'number', unit: 'deg' },
  { key: 'end_angle', kind: 'number', unit: 'deg' },
  { key: 'angle_range', kind: 'number', unit: 'deg' },
  { key: 'mode', kind: 'enum', enum: ['NORMAL', 'REVERSE', 'SYMMETRICAL'] },
  { key: 'adjustable', kind: 'enum', enum: ['true', 'false'] },
  ...ARC_PART_ENTRIES,
  { key: 'indicator', kind: 'group', label: 'Indicator', entries: ARC_PART_ENTRIES },
  { key: 'knob', kind: 'group', label: 'Knob', entries: KNOB_PART_ENTRIES },
];
