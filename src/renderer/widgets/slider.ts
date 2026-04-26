import type { LvglWidget } from '../../parser/types';
import { contentBox } from '../boxes';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolvePartProp, resolveProp } from '../styles';
import { roundedRectPath } from './obj';

/**
 * Approximate horizontal slider: track + indicator (filled portion) + knob.
 * Each part honors its own `bg_color`, `bg_opa`, `border_color`,
 * `border_width`, `border_opa`, `radius` — matching LVGL's part selectors.
 * Border defaults to invisible (border_opa: 0), like obj.
 */
export function renderSlider(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const theme = ctx.theme;
  const min = num(resolveProp(w, 'min_value', styles, theme), 0);
  const max = num(resolveProp(w, 'max_value', styles, theme), 100);
  const value = num(resolveProp(w, 'value', styles, theme), min);
  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  const trackRadius = num(resolveProp(w, 'radius', styles, theme), Math.min(box.height, 8));
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
  // Padding insets the indicator and knob from the track edges (LVGL
  // semantics: pad_* on the slider's main style affect the indicator's
  // available range). The track fills the outer box.
  const inner = contentBox(box, w, styles, theme);

  // LVGL knob default is a circle (radius ≥ half the knob's short side).
  const knobHalf = inner.height * 0.9;
  const kn: PartStyle = {
    fill: parseColor(resolvePartProp(w, 'knob', 'bg_color', styles, theme), '#2196f3'),
    fillOpa: parseOpacity(resolvePartProp(w, 'knob', 'bg_opa', styles, theme), 1),
    borderColor: parseColor(resolvePartProp(w, 'knob', 'border_color', styles, theme), '#000000'),
    borderWidth: num(resolvePartProp(w, 'knob', 'border_width', styles, theme), 0),
    borderOpa: parseOpacity(resolvePartProp(w, 'knob', 'border_opa', styles, theme), 0),
    radius: num(resolvePartProp(w, 'knob', 'radius', styles, theme), knobHalf),
  };

  const c = ctx.ctx;
  c.save();
  // Track on the outer box.
  fillRect(c, box.x, box.y, box.width, box.height, track);
  // Indicator inset by padding.
  const indWidth = inner.width * ratio;
  if (indWidth > 0) {
    fillRect(c, inner.x, inner.y, indWidth, inner.height, ind);
  }
  // Knob — a rounded square centered on the indicator edge. Radius clamps to
  // half the side, so the default (knobHalf) still gives a circle.
  const knobSide = knobHalf * 2;
  const knobX = inner.x + indWidth - knobHalf;
  const knobY = inner.y + inner.height / 2 - knobHalf;
  fillRect(c, knobX, knobY, knobSide, knobSide, kn);
  c.restore();
  return box;
}

interface PartStyle {
  fill: string;
  fillOpa: number; // 0..1
  borderColor: string;
  borderWidth: number;
  borderOpa: number; // 0..1
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
