import type { LvglWidget } from '../../parser/types';
import { parseColor } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolveProp } from '../styles';
import { roundedRectPath } from './obj';

/**
 * Approximate horizontal slider: track + indicator (filled portion) + knob.
 * Each part honors its own `bg_color`, `bg_opa`, `border_color`,
 * `border_width`, `radius` — matching LVGL's part selectors.
 */
export function renderSlider(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const min = num(resolveProp(w, 'min_value', styles), 0);
  const max = num(resolveProp(w, 'max_value', styles), 100);
  const value = num(resolveProp(w, 'value', styles), min);
  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  const indicator = partBag(w, 'indicator');
  const knob = partBag(w, 'knob');

  const trackRadius = num(resolveProp(w, 'radius', styles), Math.min(box.height, 8));
  const track: PartStyle = {
    fill: parseColor(resolveProp(w, 'bg_color', styles), '#333333'),
    fillOpa: opa(resolveProp(w, 'bg_opa', styles), 255),
    borderColor: parseColor(resolveProp(w, 'border_color', styles), '#000000'),
    borderWidth: num(resolveProp(w, 'border_width', styles), 0),
    radius: trackRadius,
  };
  const ind: PartStyle = {
    fill: parseColor(indicator?.bg_color, '#3aa0ff'),
    fillOpa: opa(indicator?.bg_opa, 255),
    borderColor: parseColor(indicator?.border_color, '#000000'),
    borderWidth: num(indicator?.border_width, 0),
    radius: num(indicator?.radius, trackRadius),
  };
  // LVGL knob default is a circle (radius ≥ half the knob's short side).
  const knobHalf = box.height * 0.9;
  const kn: PartStyle = {
    fill: parseColor(knob?.bg_color, '#ffffff'),
    fillOpa: opa(knob?.bg_opa, 255),
    borderColor: parseColor(knob?.border_color, '#000000'),
    borderWidth: num(knob?.border_width, 0),
    radius: num(knob?.radius, knobHalf),
  };

  const c = ctx.ctx;
  c.save();
  // Track
  fillRect(c, box.x, box.y, box.width, box.height, track);
  // Indicator
  const indWidth = box.width * ratio;
  if (indWidth > 0) {
    fillRect(c, box.x, box.y, indWidth, box.height, ind);
  }
  // Knob — a rounded square centered on the indicator edge. Radius clamps to
  // half the side, so the default (knobHalf) still gives a circle.
  const knobSide = knobHalf * 2;
  const knobX = box.x + indWidth - knobHalf;
  const knobY = box.y + box.height / 2 - knobHalf;
  fillRect(c, knobX, knobY, knobSide, knobSide, kn);
  c.restore();
  return box;
}

interface PartStyle {
  fill: string;
  fillOpa: number;
  borderColor: string;
  borderWidth: number;
  radius: number;
}

function fillRect(
  c: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  s: PartStyle,
) {
  const r = Math.min(s.radius, w / 2, h / 2);
  roundedRectPath(c, x, y, w, h, r);
  if (s.fillOpa > 0) {
    c.save();
    c.globalAlpha = s.fillOpa / 255;
    c.fillStyle = s.fill;
    c.fill();
    c.restore();
  }
  if (s.borderWidth > 0) {
    c.save();
    c.lineWidth = s.borderWidth;
    c.strokeStyle = s.borderColor;
    c.stroke();
    c.restore();
  }
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

function opa(v: unknown, fallback: number): number {
  const n = num(v, fallback);
  return Math.max(0, Math.min(255, n));
}
