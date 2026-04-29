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

export interface HitEntry {
  widgetId: WidgetId;
  box: Box;
  depth: number;
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

    const { activeState, activeStateWidgetId, showHidden } = this.currentOptions;
    const ctx: RenderContext = {
      ctx: c,
      project,
      theme,
      requestRepaint: this.requestRepaint,
      frameTimeMs: performance.now(),
      activeState,
      activeStateWidgetId,
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

  if (widget.widgetId) {
    hits.push({ widgetId: widget.widgetId, box: drawn, depth });
  }

  if (widget.children.length === 0) return;

  const c = ctx.ctx;
  c.save();
  c.beginPath();
  c.rect(drawn.x, drawn.y, drawn.width, drawn.height);
  c.clip();

  try {
    if (widget.layout?.kind === 'grid') {
      const grid = buildGrid(widget.layout.spec, { width: inner.width, height: inner.height });
      for (const child of widget.children) {
        const cell = grid.cellFor(child);
        const slot: Box = {
          x: inner.x + cell.x,
          y: inner.y + cell.y,
          width: cell.width,
          height: cell.height,
        };
        renderWidget(child, inner, slot, ctx, hits, depth + 1, showHidden);
      }
      return;
    }

    if (widget.layout?.kind === 'flex') {
      // Resolve each child's declared width/height (including SIZE_CONTENT and
      // percentages) before handing them to the flex engine — it doesn't know
      // how to expand those on its own.
      const childSizes = widget.children.map((child) => resolveChildSize(child, inner, ctx));
      const slots = layoutFlex(
        widget.layout.spec,
        { width: inner.width, height: inner.height },
        childSizes,
      );
      for (let i = 0; i < widget.children.length; i++) {
        const s = slots[i];
        const slot: Box = { x: inner.x + s.x, y: inner.y + s.y, width: s.width, height: s.height };
        renderWidget(widget.children[i], inner, slot, ctx, hits, depth + 1, showHidden);
      }
      return;
    }

    for (const child of widget.children) {
      renderWidget(child, inner, undefined, ctx, hits, depth + 1, showHidden);
    }
  } finally {
    c.restore();
  }
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
