import type { PropertySchema } from './index';

/** Alignment values shared by `grid_*_align` and `flex_align_*`. */
const TRACK_ALIGN_VALUES = [
  'START',
  'END',
  'CENTER',
  'STRETCH',
  'SPACE_EVENLY',
  'SPACE_AROUND',
  'SPACE_BETWEEN',
];

const CELL_ALIGN_VALUES = ['START', 'END', 'CENTER', 'STRETCH'];

const FLEX_FLOW_VALUES = ['ROW', 'COLUMN', 'ROW_WRAP', 'COLUMN_WRAP'];

/**
 * Layout container + per-child placement properties.
 *
 * Container fields use dotted keys (`layout.type`, `layout.pad_row`, …) and
 * land under the parsed `widget.props.layout` object — see the parser change
 * that keeps `layout` inside `props` so editing flows through the same
 * dotted-key path as everything else.
 *
 * Per-child fields (`grid_cell_*`, `flex_grow`) live at the top level of the
 * child's `widget.props`. They're gated by the parent's `layout.type` via
 * `visibleWhen.scope = 'parent'`.
 */
export const LAYOUT_SCHEMA: PropertySchema = [
  // --- Container: kind selector ---
  {
    key: 'layout.type',
    kind: 'enum',
    enum: ['GRID', 'FLEX'],
    label: 'layout',
  },

  // --- Container: GRID-only ---
  {
    key: 'layout.grid_rows',
    kind: 'tracks',
    label: 'rows',
    visibleWhen: { key: 'layout.type', equals: 'GRID' },
  },
  {
    key: 'layout.grid_columns',
    kind: 'tracks',
    label: 'columns',
    visibleWhen: { key: 'layout.type', equals: 'GRID' },
  },
  {
    key: 'layout.grid_row_align',
    kind: 'enum',
    enum: TRACK_ALIGN_VALUES,
    label: 'row align',
    visibleWhen: { key: 'layout.type', equals: 'GRID' },
  },
  {
    key: 'layout.grid_column_align',
    kind: 'enum',
    enum: TRACK_ALIGN_VALUES,
    label: 'column align',
    visibleWhen: { key: 'layout.type', equals: 'GRID' },
  },

  // --- Container: FLEX-only ---
  {
    key: 'layout.flex_flow',
    kind: 'enum',
    enum: FLEX_FLOW_VALUES,
    label: 'flow',
    visibleWhen: { key: 'layout.type', equals: 'FLEX' },
  },
  {
    key: 'layout.flex_align_main',
    kind: 'enum',
    enum: TRACK_ALIGN_VALUES,
    label: 'align main',
    visibleWhen: { key: 'layout.type', equals: 'FLEX' },
  },
  {
    key: 'layout.flex_align_cross',
    kind: 'enum',
    enum: TRACK_ALIGN_VALUES,
    label: 'align cross',
    visibleWhen: { key: 'layout.type', equals: 'FLEX' },
  },
  {
    key: 'layout.flex_align_track',
    kind: 'enum',
    enum: TRACK_ALIGN_VALUES,
    label: 'align track',
    visibleWhen: { key: 'layout.type', equals: 'FLEX' },
  },

  // --- Container: shared (GRID and FLEX) — row/column gap, NOT padding T/R/B/L ---
  {
    key: 'layout.pad_row',
    kind: 'number',
    min: 0,
    unit: 'px',
    inline: 'half',
    label: 'pad row',
    visibleWhen: { key: 'layout.type', equals: ['GRID', 'FLEX'] },
  },
  {
    key: 'layout.pad_column',
    kind: 'number',
    min: 0,
    unit: 'px',
    inline: 'half',
    label: 'pad col',
    visibleWhen: { key: 'layout.type', equals: ['GRID', 'FLEX'] },
  },

  // --- Per-child: GRID placement ---
  {
    key: 'grid_cell_row_pos',
    kind: 'number',
    min: 0,
    inline: 'half',
    label: 'row',
    visibleWhen: { scope: 'parent', key: 'layout.type', equals: 'GRID' },
  },
  {
    key: 'grid_cell_column_pos',
    kind: 'number',
    min: 0,
    inline: 'half',
    label: 'col',
    visibleWhen: { scope: 'parent', key: 'layout.type', equals: 'GRID' },
  },
  {
    key: 'grid_cell_row_span',
    kind: 'number',
    min: 1,
    inline: 'half',
    label: 'rspan',
    visibleWhen: { scope: 'parent', key: 'layout.type', equals: 'GRID' },
  },
  {
    key: 'grid_cell_column_span',
    kind: 'number',
    min: 1,
    inline: 'half',
    label: 'cspan',
    visibleWhen: { scope: 'parent', key: 'layout.type', equals: 'GRID' },
  },
  {
    key: 'grid_cell_x_align',
    kind: 'enum',
    enum: CELL_ALIGN_VALUES,
    label: 'x align',
    visibleWhen: { scope: 'parent', key: 'layout.type', equals: 'GRID' },
  },
  {
    key: 'grid_cell_y_align',
    kind: 'enum',
    enum: CELL_ALIGN_VALUES,
    label: 'y align',
    visibleWhen: { scope: 'parent', key: 'layout.type', equals: 'GRID' },
  },

  // --- Per-child: FLEX growth ---
  {
    key: 'flex_grow',
    kind: 'number',
    min: 0,
    label: 'flex grow',
    visibleWhen: { scope: 'parent', key: 'layout.type', equals: 'FLEX' },
  },
];
