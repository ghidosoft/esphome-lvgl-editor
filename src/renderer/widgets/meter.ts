import type { LvglWidget } from '../../parser/types';
import { contentBox } from '../boxes';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolveFont } from '../fonts';
import { resolvePartProp, resolveProp } from '../styles';
import { renderObj } from './obj';

/**
 * ESPHome `meter:` widget. The YAML schema is the historical v8 `lv_meter`
 * shape, but ESPHome's code-gen actually compiles it to LVGL 9's `lv_scale`
 * (which replaced `lv_meter` in 9.4+). The two are visually equivalent for
 * the cases ESPHome exposes: ESPHome forces `LV_SCALE_MODE_ROUND_INNER`
 * (ticks pointing toward the centre), the angle convention is identical
 * (0° = 3 o'clock, clockwise), default rotation is the same, and the
 * mapping is 1:1:
 *   - ticks → lv_scale_set_total_tick_count + length/width/color
 *   - major → lv_scale_set_major_tick_every
 *   - arc indicator → lv_scale_add_section + ARC style on INDICATOR part
 *   - line indicator → lv_scale_set_line_needle_value
 *   - tick_style indicator → lv_scale_add_section + style on ITEMS part
 *
 * So this renderer is described in v8 `lv_meter` terms (closer to the YAML
 * keys), but the runtime LVGL it mirrors is 9.x `lv_scale`. A meter holds
 * one or more circular `scales:`, each with:
 *   - a tick ladder (count, length, width, color) with optional `major:`
 *     overrides every Nth tick (and labels for those);
 *   - a list of `indicators:`, each one of `arc:`, `line:` (needle),
 *     `tick_style:` (recolours/widens ticks in a value range, applied inline
 *     during the tick loop) or `image:` (rotated raster needle — TODO).
 *
 * Angles follow LVGL: 0° = 3 o'clock, growing clockwise. The default
 * rotation is `90 + (360 - angle_range)/2` so a 270° scale starts at 135°,
 * matching LVGL's stock semicircle gauge layout.
 *
 * Draw order is `arcs → ticks → needles` (LVGL's `draw_ticks_on_top: false`
 * order). ESPHome defaults that flag to `true` (ticks last), but the
 * cookbook examples — analog clock, gauges — only look right with needles
 * on top, so we use the `false` order for now and treat the flag as a TODO.
 */
export function renderMeter(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  // Background + border via the standard obj path. The default theme styles
  // the meter as a circular card; ESPHome cookbook examples opt out via
  // `bg_opa: 0` when they want a bare gauge.
  renderObj(w, box, ctx);

  const styles = ctx.project.styles;
  const theme = ctx.theme;
  const inner = contentBox(box, w, styles, theme);

  const scales = w.props.scales;
  if (!Array.isArray(scales) || scales.length === 0) return box;

  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  const rEdge = Math.max(0, Math.min(inner.width, inner.height) / 2);

  for (const rawScale of scales) {
    if (!rawScale || typeof rawScale !== 'object' || Array.isArray(rawScale)) continue;
    drawScale(ctx, w, rawScale as Record<string, unknown>, cx, cy, rEdge);
  }

  drawPivotDot(ctx, w, cx, cy);
  return box;
}

/**
 * Central pivot dot — LVGL's meter draws this on `LV_EVENT_DRAW_MAIN` as a
 * rect (rendered as a circle thanks to `radius: LV_RADIUS_CIRCLE` from the
 * theme) with size, colour and opacity taken from the INDICATOR part. The
 * default theme sets size=15, bg_color=text_color, bg_opa=COVER, which is
 * what produces the small dark dot at the rotation centre of the needles.
 *
 * Drawn after the scales so it sits on top of the needle origins.
 */
function drawPivotDot(ctx: RenderContext, w: LvglWidget, cx: number, cy: number) {
  const styles = ctx.project.styles;
  const theme = ctx.theme;
  const bgOpa = parseOpacity(resolvePartProp(w, 'indicator', 'bg_opa', styles, theme), 1);
  if (bgOpa <= 0) return;
  const width = num(resolvePartProp(w, 'indicator', 'width', styles, theme), 0);
  const height = num(resolvePartProp(w, 'indicator', 'height', styles, theme), width);
  if (width <= 0 || height <= 0) return;
  const bgColor = parseColor(resolvePartProp(w, 'indicator', 'bg_color', styles, theme), '#212121');
  const c = ctx.ctx;
  c.save();
  c.fillStyle = bgOpa < 1 ? withAlpha(bgColor, bgOpa) : bgColor;
  c.beginPath();
  // The theme fixes radius to LV_RADIUS_CIRCLE, which on a width=height bbox
  // produces a circle. We always treat the pivot as circular (using the
  // smaller of the two halves as the radius) — meter pivots that aren't
  // round don't appear in any cookbook example.
  c.ellipse(cx, cy, width / 2, height / 2, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

interface ScaleParsed {
  rangeFrom: number;
  rangeTo: number;
  angleRange: number;
  rotation: number;
}

function parseScale(scale: Record<string, unknown>): ScaleParsed {
  const rangeFrom = num(scale.range_from, 0);
  const rangeTo = num(scale.range_to, 100);
  const angleRange = num(scale.angle_range, 270);
  // LVGL default rotation centres the scale on the bottom: a 270° scale
  // starts at 135° (south-west), a 180° scale at 180° (west), etc.
  const rotationDefault = 90 + (360 - angleRange) / 2;
  const rotation = num(scale.rotation, rotationDefault);
  return { rangeFrom, rangeTo, angleRange, rotation };
}

function drawScale(
  ctx: RenderContext,
  w: LvglWidget,
  scale: Record<string, unknown>,
  cx: number,
  cy: number,
  rEdge: number,
) {
  const c = ctx.ctx;
  const parsed = parseScale(scale);
  const indicators = Array.isArray(scale.indicators) ? scale.indicators : [];

  // Tick-style indicators recolour/widen ticks rather than draw their own
  // geometry, so collect them up-front and apply during the tick loop.
  const tickStyleOverrides: TickStyleOverride[] = [];
  for (const ind of indicators) {
    if (!ind || typeof ind !== 'object' || Array.isArray(ind)) continue;
    const ts = (ind as Record<string, unknown>).tick_style;
    if (!ts || typeof ts !== 'object' || Array.isArray(ts)) continue;
    tickStyleOverrides.push(parseTickStyle(ts as Record<string, unknown>, parsed));
  }

  // Arcs first (drawn underneath ticks and needles).
  for (const ind of indicators) {
    if (!ind || typeof ind !== 'object' || Array.isArray(ind)) continue;
    const obj = ind as Record<string, unknown>;
    if (obj.arc && typeof obj.arc === 'object' && !Array.isArray(obj.arc)) {
      drawArcIndicator(c, obj.arc as Record<string, unknown>, parsed, cx, cy, rEdge);
    }
  }

  const ticksRaw = scale.ticks;
  if (ticksRaw && typeof ticksRaw === 'object' && !Array.isArray(ticksRaw)) {
    drawTicks(
      ctx,
      w,
      ticksRaw as Record<string, unknown>,
      parsed,
      tickStyleOverrides,
      cx,
      cy,
      rEdge,
    );
  }

  // Needles on top.
  for (const ind of indicators) {
    if (!ind || typeof ind !== 'object' || Array.isArray(ind)) continue;
    const obj = ind as Record<string, unknown>;
    if (obj.line && typeof obj.line === 'object' && !Array.isArray(obj.line)) {
      drawNeedleLine(c, obj.line as Record<string, unknown>, parsed, cx, cy, rEdge);
    }
    if (obj.image && typeof obj.image === 'object' && !Array.isArray(obj.image)) {
      drawNeedleImagePlaceholder(c, obj.image as Record<string, unknown>, parsed, cx, cy, rEdge);
    }
  }
}

interface TickStyleOverride {
  startValue: number;
  endValue: number;
  widthMod: number;
  colorStart: string;
  colorEnd: string;
  local: boolean;
}

function parseTickStyle(ts: Record<string, unknown>, scale: ScaleParsed): TickStyleOverride {
  const startValue = num(ts.start_value, num(ts.value, scale.rangeFrom));
  const endValue = num(ts.end_value, num(ts.value, scale.rangeTo));
  // ESPHome's `width` here maps to LVGL's `width_mod` — added to each
  // affected tick's width, not a replacement. Default 4 matches ESPHome's
  // schema (gives the affected ticks a visible "highlight" out of the box).
  const widthMod = num(ts.width, 4);
  const colorStart = parseColor(ts.color_start, '#000000');
  const colorEnd = parseColor(ts.color_end ?? ts.color_start, colorStart);
  const local = bool(ts.local, false);
  return { startValue, endValue, widthMod, colorStart, colorEnd, local };
}

function drawTicks(
  ctx: RenderContext,
  w: LvglWidget,
  ticks: Record<string, unknown>,
  scale: ScaleParsed,
  overrides: TickStyleOverride[],
  cx: number,
  cy: number,
  rEdge: number,
) {
  const c = ctx.ctx;
  const count = Math.max(2, Math.floor(num(ticks.count, 12)));
  const tickWidth = num(ticks.width, 2);
  const tickLength = num(ticks.length, 10);
  const tickColor = parseColor(ticks.color, '#808080');
  const radialOffset = num(ticks.radial_offset, 0);

  const majorRaw = ticks.major;
  const major =
    majorRaw && typeof majorRaw === 'object' && !Array.isArray(majorRaw)
      ? (majorRaw as Record<string, unknown>)
      : null;
  const stride = major ? Math.max(1, Math.floor(num(major.stride, 3))) : 0;
  const majorWidth = major ? num(major.width, 5) : tickWidth;
  const majorLength = major ? num(major.length, 12) : tickLength;
  const majorColor = major ? parseColor(major.color, '#000000') : tickColor;
  const majorRadialOffset = major ? num(major.radial_offset, radialOffset) : radialOffset;
  const labelGap = major ? num(major.label_gap, 4) : 0;

  // Major-tick labels read `text_font` and `text_color` from the MAIN part
  // (or the theme fallback). `major.color` only paints the tick line itself,
  // not the label glyphs — that's why the cookbook clock can have grey ticks
  // (`color: 0xC0C0C0`) but black numbers (`text_color: 0x000000`).
  const fontId = resolveProp<string>(w, 'text_font', ctx.project.styles, ctx.theme);
  const font = resolveFont(fontId, ctx.project.fonts);
  const labelColor = parseColor(
    resolveProp(w, 'text_color', ctx.project.styles, ctx.theme),
    '#212121',
  );

  // Note on full-circle wrap: when angle_range is a multiple of 360°, the
  // tick at i=count-1 lands on the same pixel as i=0. LVGL (both v8 meter
  // and v9 scale) draws both; we mirror that behaviour for fidelity. If you
  // want a clean clock face, use a scale without `major:` for the ticks
  // (drives the needles only) and a separate label-bearing scale dimensioned
  // to avoid the wrap (e.g. count=12, angle_range=330) — that's what the
  // ESPHome analog-clock cookbook does.
  c.save();
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const value = scale.rangeFrom + t * (scale.rangeTo - scale.rangeFrom);
    const angleRad = ((scale.rotation + t * scale.angleRange) * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const isMajor = stride > 0 && i % stride === 0;
    let lineWidth = isMajor ? majorWidth : tickWidth;
    const lineLength = isMajor ? majorLength : tickLength;
    let lineColor = isMajor ? majorColor : tickColor;
    const offset = isMajor ? majorRadialOffset : radialOffset;

    for (const ov of overrides) {
      const lo = Math.min(ov.startValue, ov.endValue);
      const hi = Math.max(ov.startValue, ov.endValue);
      if (value < lo || value > hi) continue;
      lineWidth += ov.widthMod;
      const span = ov.local ? hi - lo : scale.rangeTo - scale.rangeFrom;
      const base = ov.local ? lo : scale.rangeFrom;
      const ratio = span !== 0 ? Math.max(0, Math.min(1, (value - base) / span)) : 0;
      lineColor = mixColor(ov.colorStart, ov.colorEnd, ratio);
    }

    if (lineWidth <= 0 || lineLength <= 0) continue;

    const rOuter = rEdge - offset;
    const rInner = rOuter - lineLength;
    c.beginPath();
    c.moveTo(cx + cos * rOuter, cy + sin * rOuter);
    c.lineTo(cx + cos * rInner, cy + sin * rInner);
    c.strokeStyle = lineColor;
    c.lineWidth = lineWidth;
    c.lineCap = 'butt';
    c.stroke();

    if (isMajor && major) {
      const rText = rInner - labelGap;
      c.font = font;
      c.fillStyle = labelColor;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(formatTickLabel(value), cx + cos * rText, cy + sin * rText);
    }
  }
  c.restore();
}

function drawArcIndicator(
  c: CanvasRenderingContext2D,
  arc: Record<string, unknown>,
  scale: ScaleParsed,
  cx: number,
  cy: number,
  rEdge: number,
) {
  const width = num(arc.width, 4);
  const color = parseColor(arc.color, '#000000');
  const opa = parseOpacity(arc.opa, 1);
  const rMod = num(arc.r_mod, 0);
  // `value` collapses start/end to a single point in LVGL; if both endpoints
  // are missing we draw the full range, which matches the typical "fill the
  // dial" use case for an arc indicator.
  const startVal = num(arc.start_value, num(arc.value, scale.rangeFrom));
  const endVal = num(arc.end_value, num(arc.value, scale.rangeTo));
  if (opa <= 0 || width <= 0) return;
  const startRad = valueToRad(startVal, scale);
  const endRad = valueToRad(endVal, scale);
  const r = Math.max(0, rEdge + rMod);
  c.save();
  c.lineWidth = width;
  c.lineCap = 'butt';
  c.strokeStyle = opa < 1 ? withAlpha(color, opa) : color;
  c.beginPath();
  // Always sweep clockwise from start to end — LVGL's lv_draw_arc convention.
  c.arc(cx, cy, r, startRad, endRad, false);
  c.stroke();
  c.restore();
}

function drawNeedleLine(
  c: CanvasRenderingContext2D,
  line: Record<string, unknown>,
  scale: ScaleParsed,
  cx: number,
  cy: number,
  rEdge: number,
) {
  const width = num(line.width, 4);
  const color = parseColor(line.color, '#000000');
  const opa = parseOpacity(line.opa, 1);
  const rounded = bool(line.rounded, true);
  const rMod = num(line.r_mod, 0);
  // ESPHome adds `length` to the needle-line schema as a direct override of
  // the outer radius — the cookbook analog clock uses it for hour/minute
  // hands. Falls back to LVGL's `r_edge + r_mod` formula when absent.
  const lengthRaw = line.length;
  const r =
    lengthRaw != null ? Math.max(0, parseLengthPx(lengthRaw, rEdge)) : Math.max(0, rEdge + rMod);
  const value = num(line.value, scale.rangeFrom);
  const angleRad = valueToRad(value, scale);
  if (opa <= 0 || width <= 0) return;
  c.save();
  c.lineWidth = width;
  c.lineCap = rounded ? 'round' : 'butt';
  c.strokeStyle = opa < 1 ? withAlpha(color, opa) : color;
  // Optional dashed style (matches ESPHome `dash_width`/`dash_gap`).
  const dashWidth = num(line.dash_width, 0);
  const dashGap = num(line.dash_gap, 0);
  if (dashWidth > 0 && dashGap > 0) c.setLineDash([dashWidth, dashGap]);
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx + Math.cos(angleRad) * r, cy + Math.sin(angleRad) * r);
  c.stroke();
  c.restore();
}

/**
 * Raster-rotated needle — drawn as a thin line at the configured angle for
 * now. A proper implementation would resolve the image src against the
 * project's `image:` block (same flow as the image widget) and rotate the
 * bitmap around `pivot_x/pivot_y` via canvas transforms; left as TODO since
 * the cookbook examples we ship use line-based hands.
 */
function drawNeedleImagePlaceholder(
  c: CanvasRenderingContext2D,
  img: Record<string, unknown>,
  scale: ScaleParsed,
  cx: number,
  cy: number,
  rEdge: number,
) {
  const value = num(img.value, scale.rangeFrom);
  const opa = parseOpacity(img.opa, 1);
  if (opa <= 0) return;
  const angleRad = valueToRad(value, scale);
  c.save();
  c.lineWidth = 2;
  c.strokeStyle = opa < 1 ? withAlpha('#000000', opa) : '#000000';
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx + Math.cos(angleRad) * rEdge, cy + Math.sin(angleRad) * rEdge);
  c.stroke();
  c.restore();
}

function valueToRad(value: number, scale: ScaleParsed): number {
  const range = scale.rangeTo - scale.rangeFrom;
  const t = range !== 0 ? (value - scale.rangeFrom) / range : 0;
  return ((scale.rotation + t * scale.angleRange) * Math.PI) / 180;
}

function formatTickLabel(value: number): string {
  // LVGL's stock label printf is `%d` — round to integer, matching device.
  const rounded = Math.round(value);
  return String(rounded);
}

function mixColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${toHex2(r)}${toHex2(g)}${toHex2(bl)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return [0, 0, 0];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex2(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
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

function parseLengthPx(v: unknown, base: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed.endsWith('%')) {
      const n = Number(trimmed.slice(0, -1));
      if (!Number.isNaN(n)) return (base * n) / 100;
    }
    const n = Number(trimmed);
    if (!Number.isNaN(n)) return n;
  }
  return base;
}
