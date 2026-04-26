import type { PropertySchema } from './index';

/** LVGL alignment anchors accepted by the `align:` property. */
export const ALIGN_VALUES = [
  'TOP_LEFT',
  'TOP_MID',
  'TOP_RIGHT',
  'LEFT_MID',
  'CENTER',
  'RIGHT_MID',
  'BOTTOM_LEFT',
  'BOTTOM_MID',
  'BOTTOM_RIGHT',
  'OUT_TOP_LEFT',
  'OUT_TOP_MID',
  'OUT_TOP_RIGHT',
  'OUT_BOTTOM_LEFT',
  'OUT_BOTTOM_MID',
  'OUT_BOTTOM_RIGHT',
  'OUT_LEFT_TOP',
  'OUT_LEFT_MID',
  'OUT_LEFT_BOTTOM',
  'OUT_RIGHT_TOP',
  'OUT_RIGHT_MID',
  'OUT_RIGHT_BOTTOM',
];

/**
 * Properties shared by every widget (obj, button, label, image, etc.).
 * Order matches the panel layout: positioning first, then visual, then padding.
 */
export const COMMON_SCHEMA: PropertySchema = [
  { key: 'align', kind: 'align', enum: ALIGN_VALUES },
  { key: 'x', kind: 'number', unit: 'px' },
  { key: 'y', kind: 'number', unit: 'px' },
  { key: 'width', kind: 'size' },
  { key: 'height', kind: 'size' },
  { key: 'radius', kind: 'number', min: 0, unit: 'px' },
  { key: 'bg_color', kind: 'color' },
  { key: 'bg_opa', kind: 'number', min: 0, max: 255 },
  { key: 'border_color', kind: 'color' },
  { key: 'border_width', kind: 'number', min: 0, unit: 'px' },
  { key: 'border_opa', kind: 'number', min: 0, max: 255 },
  { key: 'pad_all', kind: 'number', min: 0, unit: 'px' },
  { key: 'pad_top', kind: 'number', min: 0, unit: 'px' },
  { key: 'pad_right', kind: 'number', min: 0, unit: 'px' },
  { key: 'pad_bottom', kind: 'number', min: 0, unit: 'px' },
  { key: 'pad_left', kind: 'number', min: 0, unit: 'px' },
];

/** Keys corresponding to LVGL states that the editor exposes. */
export const STATE_KEYS = ['pressed', 'checked', 'disabled'] as const;
