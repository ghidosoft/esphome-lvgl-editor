import { ARC_SCHEMA } from './arc';
import { BAR_SCHEMA } from './bar';
import { COMMON_SCHEMA } from './common';
import { LABEL_SCHEMA } from './label';
import { LAYOUT_SCHEMA } from './layout';
import { SLIDER_SCHEMA } from './slider';
import { SPINNER_SCHEMA } from './spinner';

/**
 * Widget-type → editable property metadata. Keeps UI controls decoupled from
 * widget rendering and from the free-form `LvglWidget.props` bag.
 *
 * Scope (MVP): text/colors, geometry (x/y/width/height/align/radius),
 * padding and borders. Anything not in the schema falls through to a
 * read-only raw row in the property panel.
 *
 * Groups (`SchemaGroup`) model LVGL "part selectors" that ESPHome spells as
 * nested YAML blocks (e.g. `slider.indicator: { bg_color: ... }`). In the
 * editor, group children are keyed by a dotted string (`"indicator.bg_color"`)
 * and share that same dotted form across the store, source map, and edit ops.
 */
export type PropKind =
  | 'string'
  | 'number'
  | 'size'
  | 'color'
  | 'enum'
  | 'align'
  | 'bool'
  | 'tracks';

export type IconId = 'pad' | 'radius' | 'border-width';

/**
 * Declarative visibility predicate. Entries are filtered out of the panel
 * when the referenced key (on `self` — the current widget — or on `parent`)
 * doesn't match `equals`. Used to gate GRID-only / FLEX-only fields and
 * per-child placement props (which only apply when the parent has a layout).
 */
export interface VisibleWhen {
  scope?: 'self' | 'parent';
  /** Dotted key into `widget.props` (e.g. "layout.type"). */
  key: string;
  equals: string | string[];
}

export interface SchemaEntry {
  key: string;
  kind: PropKind;
  enum?: string[];
  min?: number;
  max?: number;
  unit?: string;
  /** Short icon hint shown in the row label slot (Phase 3). */
  icon?: IconId;
  /** Override for the row label (e.g. "W" instead of "width" inside a 2-up grid). */
  label?: string;
  /** Hint that this row should be packed with adjacent inline siblings. */
  inline?: 'half' | 'quarter';
  /** Promotes a `number` kind to a numeric+slider combo. */
  slider?: { min: number; max: number; step?: number };
  /**
   * Marks this entry as part of a compound dimension control (currently used
   * for padding T/R/B/L). All entries sharing the same `linkedGroup` value in
   * one section render as a single DimensionGrid row with a lock toggle.
   */
  linkedGroup?: string;
  /** Hide the entry unless the referenced key matches. See {@link VisibleWhen}. */
  visibleWhen?: VisibleWhen;
}

export interface SchemaGroup {
  key: string;
  kind: 'group';
  label?: string;
  entries: SchemaEntry[];
}

export type SchemaItem = SchemaEntry | SchemaGroup;
export type PropertySchema = SchemaItem[];

export function isGroup(item: SchemaItem): item is SchemaGroup {
  return (item as SchemaGroup).kind === 'group';
}

/**
 * Returns the composed schema for a given widget type. Common props come
 * first (so they appear at the top of the panel), then type-specific. State
 * variants (pressed/checked/disabled) are no longer concatenated as separate
 * groups — the panel multiplexes the state-aware entries through the state
 * selector instead.
 */
export function getSchema(widgetType: string): PropertySchema {
  const specific = SPECIFIC_SCHEMAS[widgetType] ?? [];
  return [...COMMON_SCHEMA, ...LAYOUT_SCHEMA, ...specific];
}

const SPECIFIC_SCHEMAS: Record<string, PropertySchema> = {
  arc: ARC_SCHEMA,
  bar: BAR_SCHEMA,
  label: LABEL_SCHEMA,
  slider: SLIDER_SCHEMA,
  spinner: SPINNER_SCHEMA,
};
