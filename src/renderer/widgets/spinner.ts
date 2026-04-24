import type { LvglWidget } from '../../parser/types';
import { parseColor } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolveProp } from '../styles';

/**
 * Static spinner: draw a 270° arc and a faint full-circle track.
 * No animation — the preview only shows one frame.
 */
export function renderSpinner(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const arcColor = parseColor(resolveProp(w, 'arc_color', styles), '#3aa0ff');
  const trackColor = parseColor(
    resolveProp(w, 'arc_color_track', styles) ?? resolveProp(w, 'bg_color', styles),
    '#1f2433',
  );
  const arcWidth = num(resolveProp(w, 'arc_width', styles), 6);

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = Math.max(0, Math.min(box.width, box.height) / 2 - arcWidth / 2);

  const c = ctx.ctx;
  c.save();
  c.lineCap = 'round';
  c.lineWidth = arcWidth;
  c.strokeStyle = trackColor;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.stroke();

  c.strokeStyle = arcColor;
  c.beginPath();
  c.arc(cx, cy, r, -Math.PI / 2, Math.PI);
  c.stroke();
  c.restore();
  return box;
}

function num(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}
