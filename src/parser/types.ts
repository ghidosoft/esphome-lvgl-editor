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
  /** Source-map layer for round-trip editing. Undefined when loader doesn't build it. */
  sources?: Record<WidgetId, WidgetPropSources>;
  /** Substitution definitions + the widgets that consume each var. */
  substitutions?: Record<string, SubstitutionEntry>;
  /** Absolute file paths loaded by this project (for save whitelisting). */
  files?: string[];
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
  /** Stable id shared with `project.sources`. Set by the normalizer. */
  widgetId?: WidgetId;
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

/** Stable identifier for a widget within a project. Either `id:<yamlId>` when
 * the widget declares `id:`, or a structural path `<pageId>/<index>[/<index>]*`. */
export type WidgetId = string;

/** Path into a single file's CST (not the resolved tree). Keys or array indices. */
export type YamlPath = (string | number)[];

/** Where a widget's mapping lives in the source files. */
export interface WidgetSource {
  file: string;
  yamlPath: YamlPath;
  /** ESPHome widget type (e.g. "label", "obj"). Needed to route new-key writes
   * to `<yamlPath>/<widgetType>/<newKey>`. */
  widgetType: string;
  /** Set when the widget came from a `packages:` entry. */
  packageName?: string;
}

/** Where a single property value lives. If `viaVariable` is set, the file/path
 * point to the substitution's definition (not the widget itself). */
export interface PropSource {
  file: string;
  yamlPath: YamlPath;
  /** Set when the original scalar was exactly `${var}`. */
  viaVariable?: string;
  /** Set when the scalar is a mixed template like `"prefix-${var}"`. */
  template?: boolean;
}

export interface WidgetPropSources {
  self: WidgetSource;
  props: Record<string, PropSource>;
  styles?: PropSource;
  layout?: Record<string, PropSource>;
}

export interface SubstitutionUsage {
  widgetId: WidgetId;
  propKey: string;
}

export interface SubstitutionEntry {
  value: string;
  file: string;
  yamlPath: YamlPath;
  usages: SubstitutionUsage[];
}
