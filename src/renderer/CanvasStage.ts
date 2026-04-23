import type { EsphomeProject, LvglPage, LvglWidget, WidgetId } from '../parser/types';
import { parseColor } from './colors';
import type { Box, RenderContext } from './context';
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
export class CanvasStage {
  private canvas: HTMLCanvasElement | null = null;
  private currentPage: LvglPage | null = null;
  private currentProject: EsphomeProject | null = null;
  private repaintScheduled = false;
  private hitList: HitEntry[] = [];
  private onHitListCb?: (list: HitEntry[]) => void;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(() => this.requestRepaint()).catch(() => {});
    }
  }

  detach(): void {
    this.canvas = null;
    this.currentPage = null;
    this.currentProject = null;
    this.hitList = [];
  }

  render(project: EsphomeProject, page: LvglPage): void {
    if (!this.canvas) return;
    this.currentProject = project;
    this.currentPage = page;
    this.paint();
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

  private paint(): void {
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

    const bg = parseColor(page.bg_color, '#000000');
    c.fillStyle = bg;
    c.fillRect(0, 0, width, height);

    const ctx: RenderContext = { ctx: c, project, requestRepaint: this.requestRepaint };
    const root: Box = { x: 0, y: 0, width, height };
    const hits: HitEntry[] = [];
    for (const widget of page.widgets) {
      renderWidget(widget, root, undefined, ctx, hits, 0);
    }
    this.hitList = hits;
    this.onHitListCb?.(hits);
  }
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
): void {
  // Memoise the intrinsic measure so both axes share one traversal.
  let memo: { width: number; height: number } | undefined;
  const getMeasure = () => (memo ??= measureContent(widget, ctx));
  const box = computeBox(widget, parentBox, parentSlot, ctx.project.styles, {
    width: () => getMeasure().width,
    height: () => getMeasure().height,
  });
  const drawn = rendererFor(widget.type)(widget, box, ctx);
  const inner = applyPadding(drawn, widget, ctx.project.styles);

  if (widget.widgetId) {
    hits.push({ widgetId: widget.widgetId, box: drawn, depth });
  }

  if (widget.children.length === 0) return;

  if (widget.layout?.kind === 'grid') {
    const grid = buildGrid(widget.layout.spec, { width: inner.width, height: inner.height });
    for (const child of widget.children) {
      const cell = grid.cellFor(child);
      const slot: Box = { x: inner.x + cell.x, y: inner.y + cell.y, width: cell.width, height: cell.height };
      renderWidget(child, inner, slot, ctx, hits, depth + 1);
    }
    return;
  }

  if (widget.layout?.kind === 'flex') {
    // Resolve each child's declared width/height (including SIZE_CONTENT and
    // percentages) before handing them to the flex engine — it doesn't know
    // how to expand those on its own.
    const childSizes = widget.children.map((child) => resolveChildSize(child, inner, ctx));
    const slots = layoutFlex(widget.layout.spec, { width: inner.width, height: inner.height }, childSizes);
    for (let i = 0; i < widget.children.length; i++) {
      const s = slots[i];
      const slot: Box = { x: inner.x + s.x, y: inner.y + s.y, width: s.width, height: s.height };
      renderWidget(widget.children[i], inner, slot, ctx, hits, depth + 1);
    }
    return;
  }

  for (const child of widget.children) {
    renderWidget(child, inner, undefined, ctx, hits, depth + 1);
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
  const wProp = resolveProp(child, 'width', styles);
  const hProp = resolveProp(child, 'height', styles);
  let memo: { width: number; height: number } | undefined;
  const m = () => (memo ??= measureContent(child, ctx));
  return {
    width: sizeProp(wProp, parentInner.width, () => m().width),
    height: sizeProp(hProp, parentInner.height, () => m().height),
  };
}
