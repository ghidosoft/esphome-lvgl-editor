import type { LvglWidget } from '../../parser/types';
import { contentBox } from '../boxes';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolveFont } from '../fonts';
import { lvLineHeight, parseEmSize } from '../fontMetrics';
import { resolvePartProp, resolveProp } from '../styles';
import { roundedRectPath } from './obj';

/**
 * LVGL v9.5 checkbox widget: a square indicator + label, side by side. Two
 * parts:
 *   - MAIN: container styling (background, padding, text colour for the label).
 *   - INDICATOR: the box. Default theme draws it with a card-coloured fill and
 *     a primary-coloured border at rest. When `LV_STATE_CHECKED` is set the
 *     fill flips to primary and a white tick mark is drawn on top — we
 *     approximate the LVGL `LV_SYMBOL_OK` glyph with a two-segment polyline so
 *     we don't depend on FontAwesome being loaded in the preview.
 *
 * Both width and height default to `SIZE_CONTENT`, matching LVGL — the widget
 * sizes itself to indicator + gap + text.
 */
export function renderCheckbox(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const theme = ctx.theme;
  const text = String(resolveProp(w, 'text', styles, theme) ?? '');
  const checked = isChecked(w, ctx);

  const inner = contentBox(box, w, styles, theme);

  const fontId = resolveProp<string>(w, 'text_font', styles, theme);
  const fontStr = resolveFont(fontId, ctx.project.fonts);
  const c = ctx.ctx;
  c.save();
  c.font = fontStr;
  const lineHeight = lvLineHeight(fontStr);
  const emSize = parseEmSize(fontStr);

  const indPad = num(resolvePartProp(w, 'indicator', 'pad_all', styles, theme), 3);
  const indSide = lineHeight + indPad * 2;
  const indRadius = num(resolvePartProp(w, 'indicator', 'radius', styles, theme), 4);
  const indBorderWidth = num(resolvePartProp(w, 'indicator', 'border_width', styles, theme), 2);

  const cardBg = checked ? primaryColor(theme) : cardColor(theme);
  const indBgRaw = resolvePartProp(w, 'indicator', 'bg_color', styles, theme);
  // The default theme distinguishes checked vs unchecked by swapping bg_color
  // (`bg_color_primary` is added on top of `cb_marker` only when checked).
  // Mirror that: explicit YAML wins, otherwise use the state-appropriate token.
  const indBg = parseColor(indBgRaw, cardBg);
  const indBgOpa = parseOpacity(resolvePartProp(w, 'indicator', 'bg_opa', styles, theme), 1);
  const indBorderColor = parseColor(
    resolvePartProp(w, 'indicator', 'border_color', styles, theme),
    primaryColor(theme),
  );
  const indBorderOpa = parseOpacity(
    resolvePartProp(w, 'indicator', 'border_opa', styles, theme),
    1,
  );

  // Lay out indicator + label horizontally inside the inner content box.
  // Vertical centering aligns the indicator with the label's em box (so a
  // 14 px font's caps sit visually on the indicator midline).
  const padColumn = num(resolveProp(w, 'pad_column', styles, theme), 8);
  const indX = inner.x;
  const indY = inner.y + Math.max(0, (inner.height - indSide) / 2);
  // Indicator background.
  if (indBgOpa > 0) {
    c.fillStyle = indBgOpa < 1 ? withAlpha(indBg, indBgOpa) : indBg;
    roundedRectPath(c, indX, indY, indSide, indSide, indRadius);
    c.fill();
  }
  if (indBorderOpa > 0 && indBorderWidth > 0) {
    c.strokeStyle = indBorderOpa < 1 ? withAlpha(indBorderColor, indBorderOpa) : indBorderColor;
    c.lineWidth = indBorderWidth;
    roundedRectPath(
      c,
      indX + indBorderWidth / 2,
      indY + indBorderWidth / 2,
      indSide - indBorderWidth,
      indSide - indBorderWidth,
      Math.max(0, indRadius - indBorderWidth / 2),
    );
    c.stroke();
  }
  if (checked) {
    drawCheckMark(c, indX, indY, indSide);
  }

  // Label.
  if (text !== '') {
    const textColor = parseColor(resolveProp(w, 'text_color', styles, theme), '#212121');
    const textOpa = parseOpacity(resolveProp(w, 'text_opa', styles, theme), 1);
    c.fillStyle = textOpa < 1 ? withAlpha(textColor, textOpa) : textColor;
    c.textBaseline = 'top';
    c.textAlign = 'left';
    const textX = indX + indSide + padColumn;
    const textY = inner.y + Math.max(0, (inner.height - emSize) / 2);
    c.fillText(text, textX, textY);
  }
  c.restore();
  return box;
}

/**
 * Intrinsic content size: indicator (font_h + 2*pad) + pad_column + label
 * width, height = max(indicator_side, line_height). Used by the SIZE_CONTENT
 * resolver in measure.ts.
 */
export function measureCheckbox(
  w: LvglWidget,
  ctx: RenderContext,
): { width: number; height: number } {
  const styles = ctx.project.styles;
  const theme = ctx.theme;
  const text = String(resolveProp(w, 'text', styles, theme) ?? '');
  const fontId = resolveProp<string>(w, 'text_font', styles, theme);
  const fontStr = resolveFont(fontId, ctx.project.fonts);
  const c = ctx.ctx;
  c.save();
  c.font = fontStr;
  const lineHeight = lvLineHeight(fontStr);
  const textWidth = text === '' ? 0 : c.measureText(text).width;
  c.restore();
  const indPad = num(resolvePartProp(w, 'indicator', 'pad_all', styles, theme), 3);
  const indSide = lineHeight + indPad * 2;
  const padColumn = num(resolveProp(w, 'pad_column', styles, theme), 8);
  return {
    width: indSide + (text === '' ? 0 : padColumn + textWidth),
    height: Math.max(indSide, lineHeight),
  };
}

function isChecked(w: LvglWidget, ctx: RenderContext): boolean {
  if (
    ctx.activeState === 'checked' &&
    ctx.activeStateWidgetId &&
    w.widgetId === ctx.activeStateWidgetId
  ) {
    return true;
  }
  const top = w.props.checked;
  if (typeof top === 'boolean') return top;
  const state = w.props.state;
  if (state && typeof state === 'object' && !Array.isArray(state)) {
    return bool((state as Record<string, unknown>).checked, false);
  }
  return false;
}

/**
 * Draws a white tick mark inside a square indicator, sized to roughly match
 * LVGL's LV_SYMBOL_OK glyph (offsets are eyeballed from the FontAwesome
 * checkmark used in the default theme).
 */
function drawCheckMark(c: CanvasRenderingContext2D, x: number, y: number, side: number) {
  c.save();
  c.strokeStyle = '#ffffff';
  c.lineWidth = Math.max(1.5, side * 0.12);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(x + side * 0.22, y + side * 0.52);
  c.lineTo(x + side * 0.42, y + side * 0.72);
  c.lineTo(x + side * 0.78, y + side * 0.32);
  c.stroke();
  c.restore();
}

function cardColor(theme: { obj?: { main?: Record<string, unknown> } }): string {
  const v = theme.obj?.main?.bg_color;
  return typeof v === 'string' ? v : '#ffffff';
}

function primaryColor(theme: { slider?: { indicator?: Record<string, unknown> } }): string {
  // The theme doesn't expose the raw `primary` token; pull it back out of a
  // place where it lands as-is. Slider.indicator.bg_color is set to
  // `t.primary` and never overridden by the renderer, so it's a safe proxy.
  const v = theme.slider?.indicator?.bg_color;
  return typeof v === 'string' ? v : '#2196f3';
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
