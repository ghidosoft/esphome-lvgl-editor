import type { PropertySchema, SchemaEntry } from './index';

/**
 * Per-cell (`LV_PART_ITEMS`) style props. ESPHome exposes these under a
 * top-level `items:` block on the buttonmatrix widget; the renderer reads
 * them via resolvePartProp(w, 'items', ...).
 */
const ITEMS_ENTRIES: SchemaEntry[] = [
  { key: 'bg_color', kind: 'color' },
  { key: 'bg_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'text_color', kind: 'color' },
  { key: 'text_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'border_color', kind: 'color' },
  { key: 'border_width', kind: 'number', min: 0, unit: 'px' },
  { key: 'border_opa', kind: 'number', min: 0, max: 255, slider: { min: 0, max: 255 } },
  { key: 'radius', kind: 'number', min: 0, unit: 'px' },
  { key: 'pad_all', kind: 'number', min: 0, unit: 'px' },
];

/**
 * `rows` / `buttons` aren't exposed here — they're a nested array per cell
 * with their own `control` flag block, too data-heavy for the current
 * row-oriented panel. They fall through to the existing read-only raw-row
 * display until a dedicated cells editor lands.
 */
export const BUTTONMATRIX_SCHEMA: PropertySchema = [
  { key: 'one_checked', kind: 'bool' },
  { key: 'pad_row', kind: 'number', min: 0, unit: 'px' },
  { key: 'pad_column', kind: 'number', min: 0, unit: 'px' },
  { key: 'items', kind: 'group', label: 'Cells', entries: ITEMS_ENTRIES },
];
