import type {
  EsphomeProject,
  FontSpec,
  GridLayoutSpec,
  FlexLayoutSpec,
  LvglLayout,
  LvglPage,
  LvglWidget,
  ParseError,
  StyleSpec,
  TrackSize,
} from './types';

/**
 * Take a raw ESPHome doc (after package-merge + substitutions) and produce a
 * tidied, JSON-serializable EsphomeProject focused on what the renderer needs.
 *
 * Anything we don't understand is preserved on `widget.props` so future widget
 * implementations can pick it up without re-parsing.
 */
export function normalizeProject(args: {
  name: string;
  sourcePath: string;
  doc: Record<string, unknown>;
  errors: ParseError[];
}): EsphomeProject {
  const { name, sourcePath, doc, errors } = args;

  const display = readDisplaySize(doc);
  const lvgl = (doc.lvgl as Record<string, unknown> | undefined) ?? undefined;
  const hasLvgl = !!lvgl;

  const fonts = readFonts(doc);
  const styles = lvgl ? readStyles(lvgl) : {};
  const pages = lvgl ? readPages(lvgl, errors) : [];

  return { name, sourcePath, hasLvgl, display, fonts, styles, pages, errors };
}

function readDisplaySize(doc: Record<string, unknown>): { width: number; height: number } {
  const display = doc.display;
  const first =
    Array.isArray(display) && display.length > 0
      ? (display[0] as Record<string, unknown>)
      : undefined;
  const dims = first?.dimensions as Record<string, unknown> | undefined;
  const width = toNumber(dims?.width) ?? 480;
  const height = toNumber(dims?.height) ?? 480;
  return { width, height };
}

function readFonts(doc: Record<string, unknown>): Record<string, FontSpec> {
  const out: Record<string, FontSpec> = {};
  const fontList = doc.font;
  if (!Array.isArray(fontList)) return out;
  for (const entry of fontList) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === 'string' ? e.id : undefined;
    if (!id) continue;
    const file = e.file as Record<string, unknown> | undefined;
    out[id] = {
      family: typeof file?.family === 'string' ? (file.family as string) : undefined,
      size: toNumber(e.size),
      weight: (file?.weight as number | string | undefined) ?? undefined,
      raw: e,
    };
  }
  return out;
}

function readStyles(lvgl: Record<string, unknown>): Record<string, StyleSpec> {
  const out: Record<string, StyleSpec> = {};
  const list = lvgl.style_definitions;
  if (!Array.isArray(list)) return out;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === 'string' ? e.id : undefined;
    if (!id) continue;
    const { id: _drop, ...props } = e;
    out[id] = { id, props };
  }
  return out;
}

function readPages(lvgl: Record<string, unknown>, errors: ParseError[]): LvglPage[] {
  const pages = lvgl.pages;
  if (!Array.isArray(pages)) return [];
  const out: LvglPage[] = [];
  for (const raw of pages) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const obj = raw as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id : `page_${out.length}`;
    const bg_color = typeof obj.bg_color === 'string' ? (obj.bg_color as string) : undefined;
    const skip = obj.skip === true;
    const widgets = readWidgetList(obj.widgets, errors);
    out.push({ id, bg_color, skip, widgets });
  }
  return out;
}

function readWidgetList(value: unknown, errors: ParseError[]): LvglWidget[] {
  if (!Array.isArray(value)) return [];
  const out: LvglWidget[] = [];
  for (const item of value) {
    const w = readWidget(item, errors);
    if (w) out.push(w);
  }
  return out;
}

/**
 * ESPHome widget shape: each list item is a single-key object whose key is the
 * widget type. Example:
 *   - label:
 *       text: "Hi"
 *       align: CENTER
 */
function readWidget(item: unknown, errors: ParseError[]): LvglWidget | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const entries = Object.entries(item as Record<string, unknown>);
  if (entries.length !== 1) return null;
  const [type, raw] = entries[0];
  const body = (raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const { widgets, layout, styles, ...props } = body;
  const children = readWidgetList(widgets, errors);
  const styleIds = readStyles_field(styles);
  const layoutSpec = readLayout(layout, errors, type);

  return {
    type,
    props,
    layout: layoutSpec,
    styles: styleIds,
    children,
  };
}

function readStyles_field(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string');
  return [];
}

function readLayout(
  value: unknown,
  _errors: ParseError[],
  _ownerType: string,
): LvglLayout | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const rawType = typeof obj.type === 'string' ? obj.type.toLowerCase() : undefined;
  if (rawType === 'grid') {
    const spec: GridLayoutSpec = {
      rows: parseTracks(obj.grid_rows),
      columns: parseTracks(obj.grid_columns),
      pad_row: toNumber(obj.pad_row),
      pad_column: toNumber(obj.pad_column),
    };
    return { kind: 'grid', spec };
  }
  if (rawType === 'flex') {
    const flow = String(obj.flex_flow ?? 'ROW').toUpperCase() as FlexLayoutSpec['flow'];
    const spec: FlexLayoutSpec = {
      flow,
      pad_row: toNumber(obj.pad_row),
      pad_column: toNumber(obj.pad_column),
      flex_align_main: typeof obj.flex_align_main === 'string' ? obj.flex_align_main : undefined,
      flex_align_cross: typeof obj.flex_align_cross === 'string' ? obj.flex_align_cross : undefined,
      flex_align_track: typeof obj.flex_align_track === 'string' ? obj.flex_align_track : undefined,
    };
    return { kind: 'flex', spec };
  }
  return undefined;
}

function parseTracks(raw: unknown): TrackSize[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackSize[] = [];
  for (const item of raw) {
    if (typeof item === 'number') {
      out.push({ kind: 'px', value: item });
      continue;
    }
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed === 'content') {
      out.push({ kind: 'content' });
      continue;
    }
    const frMatch = /^fr\((\d+(?:\.\d+)?)\)$/i.exec(trimmed);
    if (frMatch) {
      out.push({ kind: 'fr', value: parseFloat(frMatch[1]) });
      continue;
    }
    const num = Number(trimmed);
    if (!Number.isNaN(num)) out.push({ kind: 'px', value: num });
  }
  return out;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}
