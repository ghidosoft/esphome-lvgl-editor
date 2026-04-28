import type { LvglWidget } from '../../parser/types';
import { contentBox } from '../boxes';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolvePartProp, resolveProp } from '../styles';

/**
 * LVGL v9.5 arc widget: a value-driven circular gauge with three parts —
 * MAIN (background track), INDICATOR (filled portion sweeping from the track
 * start by `(value - min) / (max - min)`), and KNOB (a small circle at the
 * indicator's end angle, shown when `adjustable: true` or when the YAML
 * provides an explicit `knob:` block).
 *
 * Angle conventions match LVGL: 0° points east (3 o'clock) and angles grow
 * clockwise — same as the Canvas 2D arc API. The track spans from
 * `bg_start_angle` (alias `start_angle`) to `bg_end_angle` (alias
 * `end_angle`), both offset by `rotation`. ESPHome also accepts
 * `angle_range` as shorthand for `end - start`.
 *
 * `arc_image_src` and `mode: REVERSE/SYMMETRICAL` are acknowledged for
 * forward-compat but only NORMAL mode is drawn.
 */
export function renderArc(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const theme = ctx.theme;

  // Top-level arc_* keys are MAIN-part shorthand in ESPHome — fall back to them
  // when no explicit `main:` block is present (same pattern as spinner).
  const mainProp = (key: string): unknown =>
    resolvePartProp(w, 'main', key, styles, theme) ?? resolveProp(w, key, styles, theme);

  const trackColor = parseColor(mainProp('arc_color'), '#e0e0e0');
  const trackOpa = parseOpacity(mainProp('arc_opa'), 1);
  const trackWidth = num(mainProp('arc_width'), 10);
  const trackRounded = bool(mainProp('arc_rounded'), true);

  const indColor = parseColor(
    resolvePartProp(w, 'indicator', 'arc_color', styles, theme),
    '#2196f3',
  );
  const indOpa = parseOpacity(resolvePartProp(w, 'indicator', 'arc_opa', styles, theme), 1);
  const indWidth = num(resolvePartProp(w, 'indicator', 'arc_width', styles, theme), trackWidth);
  const indRounded = bool(
    resolvePartProp(w, 'indicator', 'arc_rounded', styles, theme),
    trackRounded,
  );

  const min = num(resolveProp(w, 'min_value', styles, theme), 0);
  const max = num(resolveProp(w, 'max_value', styles, theme), 100);
  const value = num(resolveProp(w, 'value', styles, theme), min);
  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  // Track angles. LVGL's `lv_arc_create` defaults to a 270° gauge (135 → 45).
  // ESPHome accepts either bg_start_angle/bg_end_angle (full LVGL names),
  // start_angle/end_angle (aliases), or rotation+angle_range (shorthand).
  const rotation = num(resolveProp(w, 'rotation', styles, theme), 0);
  const startRaw =
    resolveProp(w, 'bg_start_angle', styles, theme) ??
    resolveProp(w, 'start_angle', styles, theme);
  const endRaw =
    resolveProp(w, 'bg_end_angle', styles, theme) ?? resolveProp(w, 'end_angle', styles, theme);
  const rangeRaw = resolveProp(w, 'angle_range', styles, theme);
  const trackStartDeg = num(startRaw, 135);
  const trackEndDeg =
    endRaw != null
      ? num(endRaw, 45)
      : rangeRaw != null
        ? trackStartDeg + num(rangeRaw, 270)
        : 45;
  // Normalise so end > start when expressed as a sweep (LVGL stores absolute
  // 0..360 and lets end < start mean "wraps past 0"). For drawing, we add 360
  // to the smaller end so the indicator sweep math stays monotonic.
  const span = wrapSweep(trackStartDeg, trackEndDeg);
  const startRad = degToRad(trackStartDeg + rotation);
  const endRad = startRad + degToRad(span);

  // Indicator: NORMAL mode sweeps from track start by `ratio * span`.
  const indSpanDeg = ratio * span;
  const indStartRad = startRad;
  const indEndRad = startRad + degToRad(indSpanDeg);

  // Padding insets the arc from the widget's outer box (LVGL semantics: pad_*
  // on the main style shrinks the drawn radius; matches what spinner does).
  const inner = contentBox(box, w, styles, theme);
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  const maxStroke = Math.max(trackWidth, indWidth);
  const r = Math.max(0, Math.min(inner.width, inner.height) / 2 - maxStroke / 2);

  const c = ctx.ctx;
  c.save();

  if (trackOpa > 0 && trackWidth > 0 && span > 0) {
    c.lineCap = trackRounded ? 'round' : 'butt';
    c.lineWidth = trackWidth;
    c.strokeStyle = trackOpa < 1 ? withAlpha(trackColor, trackOpa) : trackColor;
    c.beginPath();
    c.arc(cx, cy, r, startRad, endRad);
    c.stroke();
  }

  if (indOpa > 0 && indWidth > 0 && indSpanDeg > 0) {
    c.lineCap = indRounded ? 'round' : 'butt';
    c.lineWidth = indWidth;
    c.strokeStyle = indOpa < 1 ? withAlpha(indColor, indOpa) : indColor;
    c.beginPath();
    c.arc(cx, cy, r, indStartRad, indEndRad);
    c.stroke();
  }

  // Knob: always drawn at the indicator's end angle (LVGL's `lv_arc_event`
  // calls `draw_knob` on every DRAW_POST, regardless of `adjustable` —
  // `adjustable` only controls clickability/dragging, not visibility). Hide
  // it via `knob: { bg_opa: 0 }`.
  //
  // Diameter formula matches `lv_arc.c::get_knob_area`:
  //   diameter = indic_width + max(pad_top/right/bottom/left) + 2
  // (the +2 is LVGL's "extra" constant). Outline is approximated via
  // `border_*`. The knob's centre sits on the indicator's centreline — same
  // radius `r` we used for the arc strokes.
  if (indSpanDeg > 0) {
    const knobPad = num(resolvePartProp(w, 'knob', 'pad_all', styles, theme), 0);
    const padTop = num(resolvePartProp(w, 'knob', 'pad_top', styles, theme), knobPad);
    const padRight = num(resolvePartProp(w, 'knob', 'pad_right', styles, theme), knobPad);
    const padBottom = num(resolvePartProp(w, 'knob', 'pad_bottom', styles, theme), knobPad);
    const padLeft = num(resolvePartProp(w, 'knob', 'pad_left', styles, theme), knobPad);
    const maxPad = Math.max(padTop, padRight, padBottom, padLeft);
    const knobDiameter = indWidth + maxPad + 2;
    const knobRadius = Math.max(0, knobDiameter / 2);
    const knobBg = parseColor(resolvePartProp(w, 'knob', 'bg_color', styles, theme), indColor);
    const knobOpa = parseOpacity(resolvePartProp(w, 'knob', 'bg_opa', styles, theme), 1);
    const knobBorderColor = parseColor(
      resolvePartProp(w, 'knob', 'border_color', styles, theme),
      '#000000',
    );
    const knobBorderWidth = num(
      resolvePartProp(w, 'knob', 'border_width', styles, theme),
      0,
    );
    const knobBorderOpa = parseOpacity(
      resolvePartProp(w, 'knob', 'border_opa', styles, theme),
      0,
    );
    const kx = cx + r * Math.cos(indEndRad);
    const ky = cy + r * Math.sin(indEndRad);
    if (knobOpa > 0 && knobRadius > 0) {
      c.fillStyle = knobOpa < 1 ? withAlpha(knobBg, knobOpa) : knobBg;
      c.beginPath();
      c.arc(kx, ky, knobRadius, 0, Math.PI * 2);
      c.fill();
    }
    if (knobBorderOpa > 0 && knobBorderWidth > 0) {
      c.strokeStyle =
        knobBorderOpa < 1 ? withAlpha(knobBorderColor, knobBorderOpa) : knobBorderColor;
      c.lineWidth = knobBorderWidth;
      c.beginPath();
      c.arc(kx, ky, knobRadius, 0, Math.PI * 2);
      c.stroke();
    }
  }

  c.restore();
  return box;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * LVGL accepts arc angles in absolute 0..360 form where the end may be smaller
 * than the start (meaning the sweep wraps past 0°). Normalise to a positive
 * sweep in degrees, clamped to 360.
 */
function wrapSweep(startDeg: number, endDeg: number): number {
  let span = endDeg - startDeg;
  while (span < 0) span += 360;
  if (span > 360) span = 360;
  return span;
}

function num(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  }
  return fallback;
}
