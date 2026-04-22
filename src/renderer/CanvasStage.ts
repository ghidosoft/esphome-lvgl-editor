import type { EsphomeProject, LvglPage, LvglWidget, StyleSpec } from '../parser/types';
import { alignChild } from './align';
import { parseColor } from './colors';
import type { Box, RenderContext } from './context';
import { buildGrid } from './layout/grid';
import { layoutFlex } from './layout/flex';
import { resolveProp } from './styles';
import { rendererFor } from './widgets';

/**
 * Owns a single <canvas> and renders a page from an EsphomeProject onto it.
 * Stateless across renders — each render() call clears + repaints from the AST.
 *
 * Async resources (images) call requestRepaint when they finish loading; the
 * stage debounces those into the next animation frame.
 */
export class CanvasStage {
  private canvas: HTMLCanvasElement | null = null;
  private currentPage: LvglPage | null = null;
  private currentProject: EsphomeProject | null = null;
  private repaintScheduled = false;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    // Web fonts (Montserrat, Material Symbols) may not be ready on first paint —
    // once they settle, request a repaint so icon glyphs appear at the right size.
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(() => this.requestRepaint()).catch(() => {});
    }
  }

  detach(): void {
    this.canvas = null;
    this.currentPage = null;
    this.currentProject = null;
  }

  render(project: EsphomeProject, page: LvglPage): void {
    if (!this.canvas) return;
    this.currentProject = project;
    this.currentPage = page;
    this.paint();
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
    for (const widget of page.widgets) {
      renderWidget(widget, root, undefined, ctx);
    }
  }
}

/** Inset an absolute box by a per-side padding amount. */
function applyPadding(
  box: Box,
  widget: LvglWidget,
  styles: Record<string, StyleSpec>,
): Box {
  const padAll = numProp(resolveProp(widget, 'pad_all', styles), 0);
  const padTop = numProp(resolveProp(widget, 'pad_top', styles), padAll);
  const padRight = numProp(resolveProp(widget, 'pad_right', styles), padAll);
  const padBottom = numProp(resolveProp(widget, 'pad_bottom', styles), padAll);
  const padLeft = numProp(resolveProp(widget, 'pad_left', styles), padAll);
  return {
    x: box.x + padLeft,
    y: box.y + padTop,
    width: Math.max(0, box.width - padLeft - padRight),
    height: Math.max(0, box.height - padTop - padBottom),
  };
}

/**
 * Render a single widget at its computed box, then recurse into children
 * (laying them out via grid/flex if the parent declares one).
 *
 * `parentSlot` is the slot allocated to this widget by its parent's layout
 * engine, in absolute coordinates. When undefined, the widget positions itself
 * inside the parent box via align + x/y.
 */
function renderWidget(
  widget: LvglWidget,
  parentBox: Box,
  parentSlot: Box | undefined,
  ctx: RenderContext,
): void {
  const box = computeBox(widget, parentBox, parentSlot, ctx.project.styles);
  const drawn = rendererFor(widget.type)(widget, box, ctx);
  const inner = applyPadding(drawn, widget, ctx.project.styles);

  if (widget.children.length === 0) return;

  if (widget.layout?.kind === 'grid') {
    const grid = buildGrid(widget.layout.spec, { width: inner.width, height: inner.height });
    for (const child of widget.children) {
      const cell = grid.cellFor(child);
      const slot: Box = { x: inner.x + cell.x, y: inner.y + cell.y, width: cell.width, height: cell.height };
      renderWidget(child, inner, slot, ctx);
    }
    return;
  }

  if (widget.layout?.kind === 'flex') {
    const slots = layoutFlex(widget.layout.spec, { width: inner.width, height: inner.height }, widget.children);
    for (let i = 0; i < widget.children.length; i++) {
      const s = slots[i];
      const slot: Box = { x: inner.x + s.x, y: inner.y + s.y, width: s.width, height: s.height };
      renderWidget(widget.children[i], inner, slot, ctx);
    }
    return;
  }

  for (const child of widget.children) {
    renderWidget(child, inner, undefined, ctx);
  }
}

/**
 * Compute the absolute box of a widget given its parent inner box and an
 * optional layout slot. Two cases:
 *
 *   1. Parent has a layout engine ⇒ slot is provided. The widget fills the
 *      slot (STRETCH align), or shrinks to its declared width/height and
 *      centres within the slot.
 *   2. Parent has no layout engine ⇒ the widget uses props.{width,height} and
 *      anchors with props.align + props.x/y inside the parent inner box.
 */
function computeBox(
  widget: LvglWidget,
  parent: Box,
  slot: Box | undefined,
  styles: Record<string, StyleSpec>,
): Box {
  // width/height/align/x/y can come from styles too (e.g. style_accent_dot
  // declares width/height) — go through resolveProp so they cascade.
  const widthProp = resolveProp(widget, 'width', styles);
  const heightProp = resolveProp(widget, 'height', styles);
  const declaredW = sizeProp(widthProp, parent.width);
  const declaredH = sizeProp(heightProp, parent.height);
  const hasDeclaredW = widthProp != null;
  const hasDeclaredH = heightProp != null;

  if (slot) {
    const xAlignRaw = resolveProp<string>(widget, 'grid_cell_x_align', styles);
    const yAlignRaw = resolveProp<string>(widget, 'grid_cell_y_align', styles);
    const xAlign = String(xAlignRaw ?? 'STRETCH').toUpperCase();
    const yAlign = String(yAlignRaw ?? 'STRETCH').toUpperCase();
    const w = xAlign === 'STRETCH' || !hasDeclaredW ? slot.width : Math.min(slot.width, declaredW);
    const h = yAlign === 'STRETCH' || !hasDeclaredH ? slot.height : Math.min(slot.height, declaredH);
    const x = xAlign === 'STRETCH' || !hasDeclaredW
      ? slot.x
      : xAlign === 'END' ? slot.x + slot.width - w
      : xAlign === 'START' ? slot.x
      : slot.x + (slot.width - w) / 2;
    const y = yAlign === 'STRETCH' || !hasDeclaredH
      ? slot.y
      : yAlign === 'END' ? slot.y + slot.height - h
      : yAlign === 'START' ? slot.y
      : slot.y + (slot.height - h) / 2;
    return { x, y, width: w, height: h };
  }

  const dx = numProp(resolveProp(widget, 'x', styles), 0);
  const dy = numProp(resolveProp(widget, 'y', styles), 0);
  const alignRaw = resolveProp<string>(widget, 'align', styles);
  const align = typeof alignRaw === 'string' ? alignRaw : 'TOP_LEFT';
  // Widgets without an explicit width/height fall back to filling the parent
  // (LVGL's typical behaviour for child obj's used as containers).
  const w = hasDeclaredW ? declaredW : parent.width;
  const h = hasDeclaredH ? declaredH : parent.height;
  const offset = alignChild(align, parent, { width: w, height: h }, dx, dy);
  return { x: parent.x + offset.x, y: parent.y + offset.y, width: w, height: h };
}

function numProp(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

/**
 * Width/height resolver. Supports raw numbers, percentage strings ("100%"),
 * and the literal "SIZE_CONTENT" (treated as parent width — a coarse fallback
 * since we don't have child measurements at compute time).
 */
function sizeProp(v: unknown, parentSize: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed.endsWith('%')) {
      const pct = parseFloat(trimmed.slice(0, -1));
      if (!Number.isNaN(pct)) return (parentSize * pct) / 100;
    }
    if (trimmed.toUpperCase() === 'SIZE_CONTENT') return parentSize;
    const n = Number(trimmed);
    if (!Number.isNaN(n)) return n;
  }
  return parentSize;
}
