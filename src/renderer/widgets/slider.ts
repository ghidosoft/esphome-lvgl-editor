import type { LvglWidget } from '../../parser/types';
import { parseColor } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolveProp } from '../styles';
import { roundedRectPath } from './obj';

/**
 * Approximate horizontal slider: track + indicator (filled portion) + knob.
 * Uses the widget's `value`, `min_value`, `max_value` props if present.
 */
export function renderSlider(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const min = num(resolveProp(w, 'min_value', styles), 0);
  const max = num(resolveProp(w, 'max_value', styles), 100);
  const value = num(resolveProp(w, 'value', styles), min);
  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  const trackColor = parseColor(resolveProp(w, 'bg_color', styles), '#333333');
  const indicator = partBag(w, 'indicator');
  const knob = partBag(w, 'knob');
  const indicatorColor = parseColor(indicator?.bg_color, '#3aa0ff');
  const knobColor = parseColor(knob?.bg_color, '#ffffff');
  const radius = num(resolveProp(w, 'radius', styles), Math.min(box.height, 8));

  const c = ctx.ctx;
  c.save();
  // Track
  c.fillStyle = trackColor;
  roundedRectPath(c, box.x, box.y, box.width, box.height, radius);
  c.fill();
  // Indicator
  const indWidth = box.width * ratio;
  if (indWidth > 0) {
    c.fillStyle = indicatorColor;
    roundedRectPath(c, box.x, box.y, indWidth, box.height, radius);
    c.fill();
  }
  // Knob
  const knobR = box.height * 0.9;
  const knobX = box.x + indWidth;
  const knobY = box.y + box.height / 2;
  c.fillStyle = knobColor;
  c.beginPath();
  c.arc(knobX, knobY, knobR, 0, Math.PI * 2);
  c.fill();
  c.restore();
  return box;
}

function partBag(w: LvglWidget, key: string): Record<string, unknown> | undefined {
  const v = w.props[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function num(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}
