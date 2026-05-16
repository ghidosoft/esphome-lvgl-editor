import type { LvglWidget } from '../../parser/types';
import { contentBox } from '../boxes';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolvePartProp, resolveProp } from '../styles';
import { roundedRectPath } from './obj';

/**
 * LVGL v9.5 bar widget: a value-driven progress bar with two parts — MAIN
 * (background track, fills the outer box) and INDICATOR (filled portion,
 * inset by padding).
 *
 * Bar is essentially a slider without the knob, plus a couple of extras:
 *   - `mode`: NORMAL fills from the start, SYMMETRICAL from the midpoint
 *     toward the value (so negative values fill the other half), RANGE fills
 *     between `start_value` and `value`.
 *   - `orientation`: AUTO (the LVGL default — horizontal when wider than tall,
 *     vertical otherwise), HORIZONTAL, VERTICAL. In vertical mode the
 *     indicator grows from the bottom upward, matching LVGL.
 */
export function renderBar(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const theme = ctx.theme;

  const min = num(resolveProp(w, 'min_value', styles, theme), 0);
  const max = num(resolveProp(w, 'max_value', styles, theme), 100);
  const value = num(resolveProp(w, 'value', styles, theme), min);
  const startValue = num(resolveProp(w, 'start_value', styles, theme), min);
  const mode = String(resolveProp(w, 'mode', styles, theme) ?? 'NORMAL').toUpperCase();
  const orientationRaw = String(
    resolveProp(w, 'orientation', styles, theme) ?? 'AUTO',
  ).toUpperCase();
  const vertical =
    orientationRaw === 'VERTICAL' || (orientationRaw === 'AUTO' && box.height > box.width);

  const trackRadius = num(
    resolveProp(w, 'radius', styles, theme),
    Math.min(box.height, box.width, 8),
  );
  const track: PartStyle = {
    fill: parseColor(resolveProp(w, 'bg_color', styles, theme), '#bbdefb'),
    fillOpa: parseOpacity(resolveProp(w, 'bg_opa', styles, theme), 1),
    borderColor: parseColor(resolveProp(w, 'border_color', styles, theme), '#000000'),
    borderWidth: num(resolveProp(w, 'border_width', styles, theme), 0),
    borderOpa: parseOpacity(resolveProp(w, 'border_opa', styles, theme), 0),
    radius: trackRadius,
  };
  const ind: PartStyle = {
    fill: parseColor(resolvePartProp(w, 'indicator', 'bg_color', styles, theme), '#2196f3'),
    fillOpa: parseOpacity(resolvePartProp(w, 'indicator', 'bg_opa', styles, theme), 1),
    borderColor: parseColor(
      resolvePartProp(w, 'indicator', 'border_color', styles, theme),
      '#000000',
    ),
    borderWidth: num(resolvePartProp(w, 'indicator', 'border_width', styles, theme), 0),
    borderOpa: parseOpacity(resolvePartProp(w, 'indicator', 'border_opa', styles, theme), 0),
    radius: num(resolvePartProp(w, 'indicator', 'radius', styles, theme), trackRadius),
  };

  // Padding insets the indicator from the track edges (matches LVGL: pad_* on
  // the bar's main style affects only the indicator's drawable area).
  const inner = contentBox(box, w, styles, theme);

  const c = ctx.ctx;
  c.save();
  fillRect(c, box.x, box.y, box.width, box.height, track);

  // Compute the indicator extent along the bar's main axis as a [a, b] pair
  // of fractions in [0, 1]. NORMAL: [0, ratio(value)]. SYMMETRICAL: spans
  // between the midpoint and ratio(value). RANGE: spans between
  // ratio(start_value) and ratio(value), order normalised.
  const range = max - min;
  const ratio = (v: number) => (range > 0 ? Math.max(0, Math.min(1, (v - min) / range)) : 0);
  let a: number;
  let b: number;
  if (mode === 'SYMMETRICAL') {
    const mid = range > 0 ? Math.max(0, Math.min(1, (0 - min) / range)) : 0.5;
    const v = ratio(value);
    a = Math.min(mid, v);
    b = Math.max(mid, v);
  } else if (mode === 'RANGE') {
    const s = ratio(startValue);
    const v = ratio(value);
    a = Math.min(s, v);
    b = Math.max(s, v);
  } else {
    a = 0;
    b = ratio(value);
  }

  if (b > a) {
    if (vertical) {
      // LVGL grows vertical bars from the bottom up.
      const ix = inner.x;
      const iy = inner.y + inner.height * (1 - b);
      const iw = inner.width;
      const ih = inner.height * (b - a);
      if (ih > 0) fillRect(c, ix, iy, iw, ih, ind);
    } else {
      const ix = inner.x + inner.width * a;
      const iy = inner.y;
      const iw = inner.width * (b - a);
      const ih = inner.height;
      if (iw > 0) fillRect(c, ix, iy, iw, ih, ind);
    }
  }

  c.restore();
  return box;
}

interface PartStyle {
  fill: string;
  fillOpa: number;
  borderColor: string;
  borderWidth: number;
  borderOpa: number;
  radius: number;
}

function fillRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  s: PartStyle,
) {
  const r = Math.min(s.radius, w / 2, h / 2);
  roundedRectPath(c, x, y, w, h, r);
  if (s.fillOpa > 0) {
    c.fillStyle = s.fillOpa < 1 ? withAlpha(s.fill, s.fillOpa) : s.fill;
    c.fill();
  }
  if (s.borderOpa > 0 && s.borderWidth > 0) {
    c.strokeStyle = s.borderOpa < 1 ? withAlpha(s.borderColor, s.borderOpa) : s.borderColor;
    c.lineWidth = s.borderWidth;
    c.stroke();
  }
}

function num(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}
