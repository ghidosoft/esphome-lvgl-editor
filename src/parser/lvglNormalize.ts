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
  StylePropSources,
  TrackSize,
  WidgetId,
  WidgetPropSources,
  PropSource,
  SubstitutionEntry,
} from './types';
import {
  readOrigin,
  isOriginLeaf,
  makeWidgetId,
  type Origin,
  type OriginNode,
} from './sourceMap';

/**
 * Take a raw ESPHome doc (after package-merge + substitutions) plus its origin
 * tree, and produce a tidied, JSON-serializable EsphomeProject focused on what
 * the renderer needs.
 *
 * In addition to the runtime AST, this pass populates:
 *   - `project.sources`: `WidgetId → { self, props, styles?, layout? }`
 *   - `project.substitutions`: variable definitions + the widgets that consume them
 * Both feed the round-trip editing flow.
 */
export function normalizeProject(args: {
  name: string;
  sourcePath: string;
  doc: Record<string, unknown>;
  origin: OriginNode;
  subs: Record<string, string>;
  subsOrigin?: Origin;
  errors: ParseError[];
  files: string[];
}): EsphomeProject {
  const { name, sourcePath, doc, origin, subs, subsOrigin, errors, files } = args;

  const display = readDisplaySize(doc);
  const lvgl = (doc.lvgl as Record<string, unknown> | undefined) ?? undefined;
  const hasLvgl = !!lvgl;

  const originMap = origin && typeof origin === 'object' && !Array.isArray(origin) && !isOriginLeaf(origin)
    ? (origin as Record<string, OriginNode>)
    : {};
  const lvglOrigin = originMap.lvgl;

  const fonts = readFonts(doc);

  const sources: Record<WidgetId, WidgetPropSources> = {};
  const styleSources: Record<string, StylePropSources> = {};
  const usagesByVar: Record<string, SubstitutionEntry['usages']> = {};

  const lvglOriginMap =
    lvglOrigin && typeof lvglOrigin === 'object' && !Array.isArray(lvglOrigin) && !isOriginLeaf(lvglOrigin)
      ? (lvglOrigin as Record<string, OriginNode>)
      : {};

  const styles = lvgl ? readStyles(lvgl, lvglOriginMap.style_definitions, styleSources, usagesByVar) : {};

  const pages = lvgl
    ? readPages(lvgl, lvglOriginMap, errors, sources, usagesByVar)
    : [];

  const substitutions = buildSubstitutionEntries(subs, subsOrigin, usagesByVar);

  return {
    name,
    sourcePath,
    hasLvgl,
    display,
    fonts,
    styles,
    pages,
    errors,
    sources,
    styleSources,
    substitutions,
    files,
  };
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

function readStyles(
  lvgl: Record<string, unknown>,
  stylesOrigin: OriginNode | undefined,
  styleSources: Record<string, StylePropSources>,
  usagesByVar: Record<string, SubstitutionEntry['usages']>,
): Record<string, StyleSpec> {
  const out: Record<string, StyleSpec> = {};
  const list = lvgl.style_definitions;
  if (!Array.isArray(list)) return out;
  const originArr = Array.isArray(stylesOrigin) ? stylesOrigin : [];
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === 'string' ? e.id : undefined;
    if (!id) continue;
    const { id: _drop, ...props } = e;
    out[id] = { id, props };

    const entryOrigin = originArr[i];
    const entryOriginMap =
      entryOrigin && typeof entryOrigin === 'object' && !Array.isArray(entryOrigin) && !isOriginLeaf(entryOrigin)
        ? (entryOrigin as Record<string, OriginNode>)
        : {};
    const selfOrigin = readOrigin(entryOrigin as object);
    if (!selfOrigin) continue;

    const propSources: Record<string, PropSource> = {};
    for (const key of Object.keys(props)) {
      const leaf = entryOriginMap[key];
      const src = toPropSource(leaf);
      if (src) {
        propSources[key] = src;
        if (src.viaVariable) {
          (usagesByVar[src.viaVariable] ||= []).push({ kind: 'style', styleId: id, propKey: key });
        }
      }
    }
    styleSources[id] = {
      self: { file: selfOrigin.file, yamlPath: selfOrigin.yamlPath },
      props: propSources,
    };
  }
  return out;
}

function readPages(
  lvgl: Record<string, unknown>,
  lvglOrigin: Record<string, OriginNode>,
  errors: ParseError[],
  sources: Record<WidgetId, WidgetPropSources>,
  usagesByVar: Record<string, SubstitutionEntry['usages']>,
): LvglPage[] {
  const pages = lvgl.pages;
  if (!Array.isArray(pages)) return [];
  const pagesOrigin = lvglOrigin.pages;
  const pagesOriginArr = Array.isArray(pagesOrigin) ? pagesOrigin : [];
  const out: LvglPage[] = [];
  for (let i = 0; i < pages.length; i++) {
    const raw = pages[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const obj = raw as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id : `page_${out.length}`;
    const bg_color = typeof obj.bg_color === 'string' ? (obj.bg_color as string) : undefined;
    const skip = obj.skip === true;
    const pageOrigin = pagesOriginArr[i];
    const pageOriginMap =
      pageOrigin && typeof pageOrigin === 'object' && !Array.isArray(pageOrigin) && !isOriginLeaf(pageOrigin)
        ? (pageOrigin as Record<string, OriginNode>)
        : {};
    const widgets = readWidgetList(
      obj.widgets,
      pageOriginMap.widgets,
      errors,
      sources,
      usagesByVar,
      id,
      [],
    );
    out.push({ id, bg_color, skip, widgets });
  }
  return out;
}

function readWidgetList(
  value: unknown,
  originValue: OriginNode | undefined,
  errors: ParseError[],
  sources: Record<WidgetId, WidgetPropSources>,
  usagesByVar: Record<string, SubstitutionEntry['usages']>,
  pageId: string,
  indexChain: number[],
): LvglWidget[] {
  if (!Array.isArray(value)) return [];
  const originArr = Array.isArray(originValue) ? originValue : [];
  const out: LvglWidget[] = [];
  for (let i = 0; i < value.length; i++) {
    const path = [...indexChain, i];
    const w = readWidget(value[i], originArr[i], errors, sources, usagesByVar, pageId, path);
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
function readWidget(
  item: unknown,
  originItem: OriginNode | undefined,
  errors: ParseError[],
  sources: Record<WidgetId, WidgetPropSources>,
  usagesByVar: Record<string, SubstitutionEntry['usages']>,
  pageId: string,
  indexPath: number[],
): LvglWidget | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const entries = Object.entries(item as Record<string, unknown>);
  if (entries.length !== 1) return null;
  const [type, raw] = entries[0];
  const body = (raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const originMap =
    originItem && typeof originItem === 'object' && !Array.isArray(originItem) && !isOriginLeaf(originItem)
      ? (originItem as Record<string, OriginNode>)
      : {};
  const bodyOrigin = originMap[type];
  const bodyOriginMap =
    bodyOrigin && typeof bodyOrigin === 'object' && !Array.isArray(bodyOrigin) && !isOriginLeaf(bodyOrigin)
      ? (bodyOrigin as Record<string, OriginNode>)
      : {};

  const selfOrigin = readOrigin(originItem as object);

  const { widgets, layout, styles, ...props } = body;
  const declaredId = typeof body.id === 'string' ? (body.id as string) : undefined;
  const widgetId = makeWidgetId(pageId, indexPath, declaredId);

  // Populate sources for this widget.
  if (selfOrigin) {
    const propSources: Record<string, PropSource> = {};
    for (const key of Object.keys(props)) {
      const leaf = bodyOriginMap[key];
      const src = toPropSource(leaf);
      if (src) {
        propSources[key] = src;
        if (src.viaVariable) {
          (usagesByVar[src.viaVariable] ||= []).push({ kind: 'widget', widgetId, propKey: key });
        }
      }
    }
    const stylesNode = bodyOriginMap.styles;
    const stylesSrc = toPropSource(stylesNode);
    const layoutNode = bodyOriginMap.layout;
    const layoutSrc = toLayoutPropSources(layoutNode);
    sources[widgetId] = {
      self: { file: selfOrigin.file, yamlPath: selfOrigin.yamlPath, widgetType: type },
      props: propSources,
      styles: stylesSrc,
      layout: layoutSrc,
    };
  }

  const childrenOrigin = bodyOriginMap.widgets;
  const children = readWidgetList(
    widgets,
    childrenOrigin,
    errors,
    sources,
    usagesByVar,
    pageId,
    indexPath,
  );
  const styleIds = readStyles_field(styles);
  const layoutSpec = readLayout(layout, errors, type);

  return {
    type,
    props,
    layout: layoutSpec,
    styles: styleIds,
    children,
    widgetId,
  };
}

function toPropSource(leaf: OriginNode | undefined): PropSource | undefined {
  if (!leaf) return undefined;
  if (isOriginLeaf(leaf)) {
    const out: PropSource = { file: leaf.file, yamlPath: [...leaf.yamlPath] };
    if (leaf.viaVariable) out.viaVariable = leaf.viaVariable;
    if (leaf.template) out.template = true;
    return out;
  }
  // Containers: record their origin without viaVariable (only leaves carry that).
  const containerOrigin = readOrigin(leaf as object);
  if (containerOrigin) {
    return { file: containerOrigin.file, yamlPath: [...containerOrigin.yamlPath] };
  }
  return undefined;
}

function toLayoutPropSources(
  layoutOrigin: OriginNode | undefined,
): Record<string, PropSource> | undefined {
  if (!layoutOrigin) return undefined;
  if (isOriginLeaf(layoutOrigin) || Array.isArray(layoutOrigin)) return undefined;
  const out: Record<string, PropSource> = {};
  for (const [k, v] of Object.entries(layoutOrigin as Record<string, OriginNode>)) {
    const src = toPropSource(v);
    if (src) out[k] = src;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildSubstitutionEntries(
  subs: Record<string, string>,
  subsOrigin: Origin | undefined,
  usagesByVar: Record<string, SubstitutionEntry['usages']>,
): Record<string, SubstitutionEntry> {
  const out: Record<string, SubstitutionEntry> = {};
  const file = subsOrigin?.file ?? '';
  const basePath = subsOrigin?.yamlPath ?? ['substitutions'];
  for (const [name, value] of Object.entries(subs)) {
    out[name] = {
      value,
      file,
      yamlPath: [...basePath, name],
      usages: usagesByVar[name] ?? [],
    };
  }
  return out;
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
