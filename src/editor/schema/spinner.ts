import type { PropertySchema, SchemaEntry } from './index';

const ARC_PART_ENTRIES: SchemaEntry[] = [
  { key: 'arc_color', kind: 'color' },
  { key: 'arc_opa', kind: 'number', min: 0, max: 255 },
  { key: 'arc_width', kind: 'number', min: 0, unit: 'px' },
  { key: 'arc_rounded', kind: 'enum', enum: ['true', 'false'] },
  { key: 'arc_image_src', kind: 'string' },
];

export const SPINNER_SCHEMA: PropertySchema = [
  { key: 'spin_time', kind: 'string' },
  { key: 'arc_length', kind: 'string' },
  ...ARC_PART_ENTRIES,
  { key: 'indicator', kind: 'group', label: 'Indicator', entries: ARC_PART_ENTRIES },
];
