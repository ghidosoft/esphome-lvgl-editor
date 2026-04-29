import type { EsphomeProject, LvglPage, LvglWidget, WidgetId } from '../parser/types';
import { parseColor } from './colors';
import type { Box, PreviewState, RenderContext } from './context';
import { defaultScreenBg, getDefaultTheme, THEME_STATES } from './defaultTheme';
import { buildGrid } from './layout/grid';
import { layoutFlex } from './layout/flex';
import { rendererFor } from './widgets';
import { applyPadding, computeBox, sizeProp } from './boxes';
import { measureContent } from './measure';
import { resolveProp } from './styles';

export type ScrollDir = 'NONE' | 'VER' | 'HOR' | 'ALL';

export interface HitEntry {
  widgetId: WidgetId;
  box: Box;
  depth: number;
  /**
   * Present only on widgets that are scrollable AND have content overflowing
   * the inner box on at least one axis the `scroll_dir` allows. The wheel
   * handler uses this to find which container should absorb a scroll event,
   * and to clamp the requested offset against `contentWidth/Height`.
   */
  scroll?: {
    dir: ScrollDir;
    /** Inner box (post border + padding) where children are laid out. */
    inner: Box;
    contentWidth: number;
    contentHeight: number;
    scrollX: number;
    scrollY: number;
  };
}

/**
 * Owns a single <canvas> and renders a page from an EsphomeProject onto it.
 * Stateless across renders — each render() call clears + repaints from the AST.
 *
 * Async resources (images) call requestRepaint when they finish loading; the
 * stage debounces those into the next animation frame.
 *
 * Alongside painting, every render() accumulates a `hitList` (flat list of
 * `{widgetId, box, depth}` entries) used by the click-to-select layer. It is
 * consumed via `getHitList()` / the `onHitList` callback.
 */
export interface RenderOptions {
  /** Forced LVGL state for the preview. Undefined / 'default' means no forcing. */
  activeState?: PreviewState;
  /** Which widget the `activeState` applies to. Scoped per Chromium DevTools. */
  activeStateWidgetId?: WidgetId;
  /**
   * Render widgets marked `hidden: true` instead of skipping them. Off by
   * default so the preview matches the LVGL runtime — flipping it on is the
   * editor escape hatch for working on widgets (e.g. modal overlays) that are
   * normally invisible at startup.
   */
  showHidden?: boolean;
  /**
   * Per-widget scroll positions. Forwarded into `RenderContext.scrollOffsets`
   * so the renderer can offset child layout. Unset keys default to {0, 0}.
   */
  scrollOffsets?: Record<WidgetId, { x: number; y: number }>;
}

export class CanvasStage {
  private canvas: HTMLCanvasElement | null = null;
  private currentPage: LvglPage | null = null;
  private currentProject: EsphomeProject | null = null;
  private currentOptions: RenderOptions = {};
  private repaintScheduled = false;
  private hitList: HitEntry[] = [];
  private onHitListCb?: (list: HitEntry[]) => void;
  private animationRafId: number | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(() => this.requestRepaint()).catch(() => {});
    }
  }

  detach(): void {
    this.stopAnimation();
    this.canvas = null;
    this.currentPage = null;
    this.currentProject = null;
    this.currentOptions = {};
    this.hitList = [];
  }

  render(project: EsphomeProject, page: LvglPage, options: RenderOptions = {}): void {
    if (!this.canvas) return;
    this.currentProject = project;
    this.currentPage = page;
    this.currentOptions = options;
    this.paint();
    this.syncAnimationLoop();
  }

  /** Latest hit-list (widgetId + absolute box), ordered by paint order (root first). */
  getHitList(): HitEntry[] {
    return this.hitList;
  }

  onHitList(cb: (list: HitEntry[]) => void): void {
    this.onHitListCb = cb;
  }

  private requestRepaint = (): void => {
    if (this.repaintScheduled || !this.canvas) return;
    this.repaintScheduled = true;
    requestAnimationFrame(() => {
      this.repaintScheduled = false;
      this.paint();
    });
  };

  /**
   * Animation frame loop: runs while the current page contains any animated
   * widget (today: spinner). Geometry doesn't change frame-to-frame, so the
   * hit-list is left alone — the loop only repaints pixels.
   */
  private syncAnimationLoop(): void {
    const needs = this.currentPage ? hasAnimatedWidgets(this.currentPage.widgets) : false;
    if (needs && this.animationRafId === null) {
      const tick = () => {
        if (!this.canvas || !this.currentPage) {
          this.animationRafId = null;
          return;
        }
        this.paint({ skipHitNotify: true });
        this.animationRafId = requestAnimationFrame(tick);
      };
      this.animationRafId = requestAnimationFrame(tick);
    } else if (!needs && this.animationRafId !== null) {
      this.stopAnimation();
    }
  }

  private stopAnimation(): void {
    if (this.animationRafId !== null) {
      cancelAnimationFrame(this.animationRafId);
      this.animationRafId = null;
    }
  }

  private paint(opts: { skipHitNotify?: boolean } = {}): void {
    const canvas = this.canvas;
    const project = this.currentProject;
    const page = this.currentPage;
    if (!canvas || !project || !page) return;

    const c = canvas.getContext('2d');
    if (!c) return;

    const { width, height } = project.display;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const darkMode = project.theme?.darkMode ?? false;
    const theme = getDefaultTheme(darkMode);
    const bg = parseColor(page.bg_color, defaultScreenBg(darkMode));
    c.fillStyle = bg;
    c.fillRect(0, 0, width, height);

    const { activeState, activeStateWidgetId, showHidden, scrollOffsets } = this.currentOptions;
    const ctx: RenderContext = {
      ctx: c,
      project,
      theme,
      requestRepaint: this.requestRepaint,
      frameTimeMs: performance.now(),
      activeState,
      activeStateWidgetId,
      scrollOffsets,
    };
    const root: Box = { x: 0, y: 0, width, height };
    const hits: HitEntry[] = [];
    for (const widget of page.widgets) {
      renderWidget(widget, root, undefined, ctx, hits, 0, showHidden ?? false);
    }
    this.hitList = hits;
    if (!opts.skipHitNotify) this.onHitListCb?.(hits);
  }
}

/**
 * Walks the widget tree to detect any widget that needs the per-frame loop.
 * Currently spinner is the only animated widget; extend here when others (e.g.
 * page-transition animations) need the same treatment.
 */
function hasAnimatedWidgets(widgets: LvglWidget[]): boolean {
  for (const w of widgets) {
    if (w.type === 'spinner') return true;
    if (w.children.length > 0 && hasAnimatedWidgets(w.children)) return true;
  }
  return false;
}

/**
 * Render a single widget at its computed box, then recurse into children
 * (laying them out via grid/flex if the parent declares one). Also appends a
 * hit-test entry for the widget.
 */
function renderWidget(
  widget: LvglWidget,
  parentBox: Box,
  parentSlot: Box | undefined,
  ctx: RenderContext,
  hits: HitEntry[],
  depth: number,
  showHidden: boolean,
): void {
  // LVGL `hidden: true` removes the widget (and its subtree) from rendering and
  // hit-testing. `showHidden` is the editor override that draws them anyway.
  if (!showHidden && isHidden(widget)) return;
  // If this is the selected widget and a state is forced, shallow-merge the
  // corresponding `pressed:` / `checked:` / `disabled:` block onto props so
  // every resolveProp() call downstream reads the state-scoped value without
  // the renderers having to know anything about states.
  const effective = maybeForceState(widget, ctx);
  // Memoise the intrinsic measure so both axes share one traversal.
  let memo: { width: number; height: number } | undefined;
  const getMeasure = () => (memo ??= measureContent(effective, ctx));
  const box = computeBox(
    effective,
    parentBox,
    parentSlot,
    ctx.project.styles,
    {
      width: () => getMeasure().width,
      height: () => getMeasure().height,
    },
    ctx.theme,
  );
  const drawn = rendererFor(effective.type)(effective, box, ctx);
  const inner = applyPadding(drawn, effective, ctx.project.styles, ctx.theme);

  // Hit entry pushed before children so the parent appears earlier than its
  // descendants — the wheel handler scans deepest-first via end-to-start.
  const hitIndex = widget.widgetId ? hits.length : -1;
  if (widget.widgetId) {
    hits.push({ widgetId: widget.widgetId, box: drawn, depth });
  }

  if (widget.children.length === 0) return;

  // Compute child slots in inner-local coordinates. We need them up-front
  // (rather than lazily during the recurse loop) so we can measure the
  // bounding box of the children — that's `contentWidth/Height` for scroll.
  const localSlots = computeChildSlots(widget, inner, ctx);

  const scrollable = isScrollable(widget);
  const dir = getScrollDir(widget);
  let scrollX = 0;
  let scrollY = 0;
  let contentW = inner.width;
  let contentH = inner.height;
  if (scrollable && dir !== 'NONE') {
    const bounds = boundsOfSlots(localSlots);
    contentW = Math.max(bounds.width, inner.width);
    contentH = Math.max(bounds.height, inner.height);
    const stored = widget.widgetId ? ctx.scrollOffsets?.[widget.widgetId] : undefined;
    const allowX = dir === 'HOR' || dir === 'ALL';
    const allowY = dir === 'VER' || dir === 'ALL';
    scrollX = allowX ? clamp(stored?.x ?? 0, 0, contentW - inner.width) : 0;
    scrollY = allowY ? clamp(stored?.y ?? 0, 0, contentH - inner.height) : 0;
    // Only enrich the hit entry when there's actually overflow to consume —
    // keeps the wheel handler from absorbing events on non-scrollable areas.
    if (hitIndex >= 0 && (contentW > inner.width || contentH > inner.height)) {
      hits[hitIndex] = {
        ...hits[hitIndex],
        scroll: { dir, inner, contentWidth: contentW, contentHeight: contentH, scrollX, scrollY },
      };
    }
  }

  const childInner: Box = { ...inner, x: inner.x - scrollX, y: inner.y - scrollY };

  const c = ctx.ctx;
  c.save();
  c.beginPath();
  c.rect(drawn.x, drawn.y, drawn.width, drawn.height);
  c.clip();

  try {
    if (widget.layout?.kind === 'grid' || widget.layout?.kind === 'flex') {
      for (let i = 0; i < widget.children.length; i++) {
        const s = localSlots[i];
        const slot: Box = {
          x: childInner.x + s.x,
          y: childInner.y + s.y,
          width: s.width,
          height: s.height,
        };
        renderWidget(widget.children[i], childInner, slot, ctx, hits, depth + 1, showHidden);
      }
    } else {
      for (const child of widget.children) {
        renderWidget(child, childInner, undefined, ctx, hits, depth + 1, showHidden);
      }
    }
    drawScrollbars(ctx.ctx, drawn, inner, dir, contentW, contentH, scrollX, scrollY, widget);
  } finally {
    c.restore();
  }
}

/**
 * Children slot rectangles in coordinates LOCAL to the parent's inner box
 * (origin at inner.x/y). For absolute children we resolve each child's box and
 * subtract the inner origin; for flex/grid we delegate to the layout engines
 * which already produce local coordinates.
 *
 * Computing this once up-front lets us measure the content bounding box for
 * scroll while the renderer reuses the same slots for paint — avoiding a
 * double traversal.
 */
function computeChildSlots(parent: LvglWidget, inner: Box, ctx: RenderContext): Box[] {
  if (parent.layout?.kind === 'grid') {
    const grid = buildGrid(parent.layout.spec, { width: inner.width, height: inner.height });
    return parent.children.map((child) => grid.cellFor(child));
  }
  if (parent.layout?.kind === 'flex') {
    const childSizes = parent.children.map((child) => resolveChildSize(child, inner, ctx));
    return layoutFlex(
      parent.layout.spec,
      { width: inner.width, height: inner.height },
      childSizes,
    );
  }
  // Absolute layout: resolve each child's box against the unscrolled inner
  // and convert to local coords. This duplicates the work `computeBox` does
  // during paint — acceptable given child count is typically small (~10s).
  return parent.children.map((child) => {
    let memo: { width: number; height: number } | undefined;
    const m = () => (memo ??= measureContent(child, ctx));
    const box = computeBox(
      child,
      inner,
      undefined,
      ctx.project.styles,
      { width: () => m().width, height: () => m().height },
      ctx.theme,
    );
    return { x: box.x - inner.x, y: box.y - inner.y, width: box.width, height: box.height };
  });
}

function boundsOfSlots(slots: Box[]): { width: number; height: number } {
  let w = 0;
  let h = 0;
  for (const s of slots) {
    if (s.x + s.width > w) w = s.x + s.width;
    if (s.y + s.height > h) h = s.y + s.height;
  }
  return { width: w, height: h };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Concrete width/height of a child, as seen by the flex/grid engine that needs
 * to size its slots. Delegates to `sizeProp` so SIZE_CONTENT (via measure) and
 * percentages are expanded consistently with the single-widget path.
 */
function resolveChildSize(
  child: LvglWidget,
  parentInner: Box,
  ctx: RenderContext,
): { width: number; height: number } {
  const styles = ctx.project.styles;
  const wProp = resolveProp(child, 'width', styles, ctx.theme);
  const hProp = resolveProp(child, 'height', styles, ctx.theme);
  let memo: { width: number; height: number } | undefined;
  const m = () => (memo ??= measureContent(child, ctx));
  return {
    width: sizeProp(wProp, parentInner.width, () => m().width),
    height: sizeProp(hProp, parentInner.height, () => m().height),
  };
}

/**
 * If `widget` is the one the user asked to preview in a forced LVGL state,
 * return a clone whose `props` has that state's block shallow-merged on top.
 * Otherwise the original is returned unchanged (reference-identical).
 *
 * Scope: only the selected widget is affected — children keep their defaults,
 * matching Chromium DevTools' per-element state toggles.
 */
function maybeForceState(widget: LvglWidget, ctx: RenderContext): LvglWidget {
  const { activeState, activeStateWidgetId } = ctx;
  if (!activeState || !activeStateWidgetId) return widget;
  if (widget.widgetId !== activeStateWidgetId) return widget;
  const themeBag = THEME_STATES[widget.type]?.[activeState];
  const inline = widget.props[activeState];
  const inlineBag =
    inline && typeof inline === 'object' && !Array.isArray(inline)
      ? (inline as Record<string, unknown>)
      : undefined;
  if (!themeBag && !inlineBag) return widget;
  return {
    ...widget,
    props: { ...widget.props, ...(themeBag ?? {}), ...(inlineBag ?? {}) },
  };
}

/**
 * True when the widget declares `hidden: true` in its YAML. Accepts both the
 * boolean (the usual yaml-parsed shape) and the explicit string "true" as a
 * defensive measure for hand-quoted configs.
 */
function isHidden(widget: LvglWidget): boolean {
  const v = widget.props.hidden;
  return v === true || v === 'true';
}

/**
 * LVGL sets `LV_OBJ_FLAG_SCROLLABLE` in the `lv_obj` constructor, so the
 * default for any widget is `true` — we only opt-out on explicit `false`.
 * Mirroring that here keeps the preview consistent with runtime behavior.
 */
function isScrollable(widget: LvglWidget): boolean {
  const v = widget.props.scrollable;
  return !(v === false || v === 'false');
}

/** Defaults to `ALL` (LVGL's `LV_DIR_ALL`). Unknown values fall back to ALL. */
function getScrollDir(widget: LvglWidget): ScrollDir {
  const v = widget.props.scroll_dir;
  if (typeof v !== 'string') return 'ALL';
  const u = v.toUpperCase();
  if (u === 'NONE' || u === 'VER' || u === 'HOR' || u === 'ALL') return u;
  return 'ALL';
}

type ScrollbarMode = 'OFF' | 'ON' | 'AUTO' | 'ACTIVE';

/** Defaults to `AUTO`. `ACTIVE` is treated as `AUTO` in the preview since the
 * editor has no concept of an in-progress drag gesture. */
function getScrollbarMode(widget: LvglWidget): ScrollbarMode {
  const v = widget.props.scrollbar_mode;
  if (typeof v !== 'string') return 'AUTO';
  const u = v.toUpperCase();
  if (u === 'OFF' || u === 'ON' || u === 'AUTO' || u === 'ACTIVE') return u;
  return 'AUTO';
}

const SCROLLBAR_THICKNESS = 5;
const SCROLLBAR_PAD = 4;
const SCROLLBAR_MIN_THUMB = 10;
const SCROLLBAR_COLOR = 'rgba(150, 150, 150, 0.5)';

/**
 * Paint vertical/horizontal scrollbar thumbs over the just-rendered container.
 * LVGL anchors them to the right (vertical) and bottom (horizontal) of the
 * outer box, padded inward, with thumb size proportional to viewport/content
 * and position proportional to scrollX/Y. Mode `OFF` skips entirely; `AUTO`
 * draws only when the corresponding axis overflows.
 */
function drawScrollbars(
  c: CanvasRenderingContext2D,
  drawn: Box,
  inner: Box,
  dir: ScrollDir,
  contentW: number,
  contentH: number,
  scrollX: number,
  scrollY: number,
  widget: LvglWidget,
): void {
  if (!isScrollable(widget) || dir === 'NONE') return;
  const mode = getScrollbarMode(widget);
  if (mode === 'OFF') return;
  const overflowX = contentW > inner.width;
  const overflowY = contentH > inner.height;
  const showVer = (dir === 'VER' || dir === 'ALL') && (mode === 'ON' || overflowY);
  const showHor = (dir === 'HOR' || dir === 'ALL') && (mode === 'ON' || overflowX);
  if (!showVer && !showHor) return;

  c.save();
  c.fillStyle = SCROLLBAR_COLOR;
  if (showVer) {
    const trackLen = drawn.height - 2 * SCROLLBAR_PAD;
    const ratio = overflowY ? inner.height / contentH : 1;
    const thumbLen = Math.max(SCROLLBAR_MIN_THUMB, trackLen * ratio);
    const maxScroll = Math.max(0, contentH - inner.height);
    const t = maxScroll > 0 ? scrollY / maxScroll : 0;
    const thumbY = drawn.y + SCROLLBAR_PAD + (trackLen - thumbLen) * t;
    const thumbX = drawn.x + drawn.width - SCROLLBAR_PAD - SCROLLBAR_THICKNESS;
    roundRectFill(c, thumbX, thumbY, SCROLLBAR_THICKNESS, thumbLen, SCROLLBAR_THICKNESS / 2);
  }
  if (showHor) {
    const trackLen = drawn.width - 2 * SCROLLBAR_PAD;
    const ratio = overflowX ? inner.width / contentW : 1;
    const thumbLen = Math.max(SCROLLBAR_MIN_THUMB, trackLen * ratio);
    const maxScroll = Math.max(0, contentW - inner.width);
    const t = maxScroll > 0 ? scrollX / maxScroll : 0;
    const thumbX = drawn.x + SCROLLBAR_PAD + (trackLen - thumbLen) * t;
    const thumbY = drawn.y + drawn.height - SCROLLBAR_PAD - SCROLLBAR_THICKNESS;
    roundRectFill(c, thumbX, thumbY, thumbLen, SCROLLBAR_THICKNESS, SCROLLBAR_THICKNESS / 2);
  }
  c.restore();
}

function roundRectFill(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  c.beginPath();
  c.moveTo(x + radius, y);
  c.lineTo(x + w - radius, y);
  c.arcTo(x + w, y, x + w, y + radius, radius);
  c.lineTo(x + w, y + h - radius);
  c.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  c.lineTo(x + radius, y + h);
  c.arcTo(x, y + h, x, y + h - radius, radius);
  c.lineTo(x, y + radius);
  c.arcTo(x, y, x + radius, y, radius);
  c.closePath();
  c.fill();
}
