import type { LvglWidget } from '../../parser/types';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolveProp } from '../styles';

/**
 * The base container widget. Draws background fill + rounded border.
 *
 * Returns the inner box for child layout. We treat border_width as inset
 * (children sit inside the stroke).
 */
export function renderObj(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;

  const bgColor = parseColor(resolveProp(w, 'bg_color', styles), '#000000');
  const bgOpa = parseOpacity(resolveProp(w, 'bg_opa', styles), 1);
  const borderColor = parseColor(resolveProp(w, 'border_color', styles), '#000000');
  const borderOpa = parseOpacity(resolveProp(w, 'border_opa', styles), 0);
  const borderWidth = num(resolveProp(w, 'border_width', styles), 0);
  const radius = num(resolveProp(w, 'radius', styles), 0);

  const c = ctx.ctx;
  c.save();
  // Background
  if (bgOpa > 0) {
    c.fillStyle = bgOpa < 1 ? withAlpha(bgColor, bgOpa) : bgColor;
    roundedRectPath(c, box.x, box.y, box.width, box.height, radius);
    c.fill();
  }
  // Border
  if (borderOpa > 0 && borderWidth > 0) {
    c.strokeStyle = borderOpa < 1 ? withAlpha(borderColor, borderOpa) : borderColor;
    c.lineWidth = borderWidth;
    roundedRectPath(c, box.x + borderWidth / 2, box.y + borderWidth / 2,
                    box.width - borderWidth, box.height - borderWidth, Math.max(0, radius - borderWidth / 2));
    c.stroke();
  }
  c.restore();

  // Inner box for children — inset by border width.
  const inset = borderWidth;
  return {
    x: box.x + inset,
    y: box.y + inset,
    width: Math.max(0, box.width - 2 * inset),
    height: Math.max(0, box.height - 2 * inset),
  };
}

export function roundedRectPath(
  c: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
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
}

function num(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}
