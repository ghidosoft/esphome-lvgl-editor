import { COMMON_SCHEMA } from './common';
import { LAYOUT_SCHEMA } from './layout';

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
  // Layout container (parent-side; nested under widget.props.layout)
  'layout.type': 'layout',
  'layout.grid_rows': 'layout',
  'layout.grid_columns': 'layout',
  'layout.grid_row_align': 'layout',
  'layout.grid_column_align': 'layout',
  'layout.flex_flow': 'layout',
  'layout.flex_align_main': 'layout',
  'layout.flex_align_cross': 'layout',
  'layout.flex_align_track': 'layout',
  'layout.pad_row': 'layout',
  'layout.pad_column': 'layout',
  // Layout placement (per-child; gated on the parent's layout.type)
  grid_cell_row_pos: 'layout',
  grid_cell_column_pos: 'layout',
  grid_cell_row_span: 'layout',
  grid_cell_column_span: 'layout',
  grid_cell_x_align: 'layout',
  grid_cell_y_align: 'layout',
  flex_grow: 'layout',
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

/**
 * Dev-only invariant: every COMMON_SCHEMA entry must have a SECTION_MAP
 * mapping. Common props are widget-agnostic styling (Layout/Spacing/Background/
 * Border/Shape/Text); falling through to "Widget" silently would scatter
 * universal props into the per-widget bucket. Widget-specific schemas (label,
 * slider, …) are exempt — they're allowed to fall back to "Widget".
 *
 * Runs once at module load. No-op in production.
 */
function checkCommonSchemaCoverage(): void {
  const missing: string[] = [];
  for (const item of [...COMMON_SCHEMA, ...LAYOUT_SCHEMA]) {
    if ('kind' in item && item.kind === 'group') continue;
    if (!(item.key in SECTION_MAP)) missing.push(item.key);
  }
  if (missing.length > 0) {
    console.error(
      '[inspector] COMMON/LAYOUT schema entries missing in SECTION_MAP — they will fall back to the "Widget" section: ' +
        missing.join(', '),
    );
  }
  // Keep STATE_AWARE_KEYS and SECTION_MAP in sync: every state-aware key must
  // resolve to a known section. If someone adds a state-aware key without a
  // section, STATE_AWARE_SECTIONS would silently drop it.
  for (const k of STATE_AWARE_KEYS) {
    if (!(k in SECTION_MAP)) {
      console.error(
        `[inspector] STATE_AWARE key "${k}" missing in SECTION_MAP — its section pill won't appear.`,
      );
    }
  }
}

if (import.meta.env?.DEV) {
  checkCommonSchemaCoverage();
}
