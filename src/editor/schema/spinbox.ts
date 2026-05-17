import type { PropertySchema } from './index';

/**
 * Spinbox-specific props. Mirrors the ESPHome `SPINBOX_SCHEMA` (validator in
 * `esphome/components/lvgl/widgets/spinbox.py`): `step` is intentionally
 * absent — upstream rejects it and derives the step from `selected_digit`.
 *
 * The renderer ignores `selected_digit` and `rollover` (focus-gated cursor
 * and interaction are out of scope for the static preview), but the keys are
 * exposed so the inspector can edit them for YAML round-trip.
 */
export const SPINBOX_SCHEMA: PropertySchema = [
  { key: 'value', kind: 'number' },
  { key: 'range_from', kind: 'number' },
  { key: 'range_to', kind: 'number' },
  { key: 'digits', kind: 'number', min: 1, max: 10 },
  { key: 'decimal_places', kind: 'number', min: 0, max: 6 },
  { key: 'selected_digit', kind: 'number', min: 0 },
  { key: 'rollover', kind: 'bool' },
  { key: 'text_align', kind: 'enum', enum: ['LEFT', 'CENTER', 'RIGHT', 'AUTO'] },
];
