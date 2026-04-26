/**
 * Maps schema entry keys to UI sections in the property inspector. The schema
 * stays a flat bag of entries; rendering re-buckets them into semantic groups
 * (Layout, Spacing, Background, …) so widgets with many props don't read as
 * one long undifferentiated list.
 *
 * Anything not mapped here lands in `widget` (per-type fallback). Group items
 * (`SchemaGroup` — slider's `indicator`/`knob`, etc.) are routed to `parts`.
 */
export type SectionId =
  | 'layout'
  | 'spacing'
  | 'background'
  | 'border'
  | 'shape'
  | 'text'
  | 'widget'
  | 'parts'
  | 'other';

export const SECTION_ORDER: SectionId[] = [
  'layout',
  'spacing',
  'background',
  'border',
  'shape',
  'text',
  'widget',
  'parts',
  'other',
];

export const SECTION_LABELS: Record<SectionId, string> = {
  layout: 'Layout',
  spacing: 'Spacing',
  background: 'Background',
  border: 'Border',
  shape: 'Shape',
  text: 'Text',
  widget: 'Widget',
  parts: 'Parts',
  other: 'Other',
};

const SECTION_MAP: Record<string, SectionId> = {
  // Layout
  align: 'layout',
  x: 'layout',
  y: 'layout',
  width: 'layout',
  height: 'layout',
  // Spacing
  pad_all: 'spacing',
  pad_top: 'spacing',
  pad_right: 'spacing',
  pad_bottom: 'spacing',
  pad_left: 'spacing',
  // Background
  bg_color: 'background',
  bg_opa: 'background',
  // Border
  border_color: 'border',
  border_width: 'border',
  border_opa: 'border',
  // Shape
  radius: 'shape',
  // Text
  text: 'text',
  text_color: 'text',
  text_align: 'text',
  text_opa: 'text',
};

/**
 * Style props that LVGL allows per-state — the ones that meaningfully change
 * a widget's look in `pressed`/`checked`/`disabled`. When the state selector
 * is active, these entries are read/written under the state-prefixed YAML
 * block (e.g. `pressed.bg_color`) instead of the bare key.
 */
const STATE_AWARE_KEYS = new Set<string>([
  'bg_color',
  'bg_opa',
  'border_color',
  'border_width',
  'border_opa',
  'radius',
  'text_color',
  'text_opa',
]);

/**
 * Sections whose contents should reflect the active LVGL state (and earn the
 * "S" pill in their header when state ≠ default). Derived once from
 * STATE_AWARE_KEYS so the two never drift.
 */
export const STATE_AWARE_SECTIONS: ReadonlySet<SectionId> = new Set(
  Array.from(STATE_AWARE_KEYS)
    .map((k) => SECTION_MAP[k])
    .filter((s): s is SectionId => !!s),
);

export function isStateAware(bareKey: string): boolean {
  return STATE_AWARE_KEYS.has(bareKey);
}

export function getSection(bareKey: string, fallback: SectionId = 'widget'): SectionId {
  return SECTION_MAP[bareKey] ?? fallback;
}
