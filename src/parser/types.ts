/**
 * Parsed and normalized representation of an ESPHome project, focused on
 * the LVGL subset relevant to preview rendering. JSON-serializable.
 */

export interface EsphomeProject {
  name: string;
  sourcePath: string;
  hasLvgl: boolean;
  display: { width: number; height: number };
  fonts: Record<string, FontSpec>;
  styles: Record<string, StyleSpec>;
  pages: LvglPage[];
  errors: ParseError[];
}

export interface FontSpec {
  family?: string;
  size?: number;
  weight?: number | string;
  /** Free-form so unknown ESPHome fields survive round-trip. */
  raw: Record<string, unknown>;
}

export interface StyleSpec {
  id: string;
  /** Anything except `id` — colors, radius, padding, opacities, etc. */
  props: Record<string, unknown>;
}

export interface LvglPage {
  id: string;
  bg_color?: string;
  /** Whether ESPHome marks the page as `skip: true` (not auto-shown). Just metadata for now. */
  skip: boolean;
  widgets: LvglWidget[];
}

export type LvglLayout =
  | { kind: 'grid'; spec: GridLayoutSpec }
  | { kind: 'flex'; spec: FlexLayoutSpec };

export interface GridLayoutSpec {
  rows: TrackSize[];
  columns: TrackSize[];
  pad_row?: number;
  pad_column?: number;
}

export interface FlexLayoutSpec {
  flow: 'ROW' | 'COLUMN' | 'ROW_WRAP' | 'COLUMN_WRAP';
  pad_row?: number;
  pad_column?: number;
  flex_align_main?: string;
  flex_align_cross?: string;
  flex_align_track?: string;
}

export type TrackSize =
  | { kind: 'fr'; value: number }     // fr(N)
  | { kind: 'px'; value: number }     // numeric literal
  | { kind: 'content' };              // "content"

export interface LvglWidget {
  type: string;
  /** Free-form widget properties: align, x, y, width, height, text, text_color, etc. */
  props: Record<string, unknown>;
  layout?: LvglLayout;
  /** Style ids referenced via `styles:` (string or list). */
  styles: string[];
  children: LvglWidget[];
}

export type ParseError =
  | { kind: 'ProjectLoadError'; message: string; path?: string }
  | { kind: 'WidgetSkipped'; message: string; widgetType: string; path?: string }
  | { kind: 'SubstitutionMissing'; message: string; variable: string; path?: string }
  | { kind: 'IncludeMissing'; message: string; path: string };

/** Marker preserved by the YAML schema for unresolved ESPHome custom tags. */
export interface OpaqueTag {
  __tag: '!include' | '!secret' | '!lambda';
  value: string;
}

export function isOpaqueTag(v: unknown): v is OpaqueTag {
  return (
    typeof v === 'object' &&
    v !== null &&
    '__tag' in v &&
    typeof (v as { __tag: unknown }).__tag === 'string' &&
    (v as { __tag: string }).__tag.startsWith('!')
  );
}
