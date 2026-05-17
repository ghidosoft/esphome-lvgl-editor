import type { LvglWidget } from '../../parser/types';
import { contentBox, numProp } from '../boxes';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolveFont } from '../fonts';
import { lvLineHeight, parseEmSize } from '../fontMetrics';
import { resolveProp } from '../styles';
import { renderObj } from './obj';

/**
 * LVGL v9 spinbox widget. Extends `lv_textarea` upstream; we render it as a
 * static numeric display because the editor has no focus/input model. The
 * formatted string mirrors `lv_spinbox_updatevalue` from upstream
 * (`src/widgets/spinbox/lv_spinbox.c`):
 *
 *   1. value is an integer scaled by 10^decimal_places (LVGL stores it as
 *      int32_t — we round ESPHome's float input the same way).
 *   2. value clamped to [range_min, range_max] (lv_spinbox_set_value).
 *   3. Sign char ('+' or '-') is prepended only when range_min < 0,
 *      otherwise the sign is hidden.
 *   4. |value| is zero-padded to digit_count chars.
 *   5. If dec_point_pos > 0, a '.' is inserted at (digit_count - dec_point_pos)
 *      from the left of the digit string.
 *
 * Out of scope for v1: the cursor (LV_PART_CURSOR) is focus-gated upstream
 * and the editor has no focus state, so we never paint it. `selected_digit`
 * is accepted for YAML round-trip but currently ignored by the renderer.
 */
export function renderSpinbox(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  renderObj(w, box, ctx);

  const styles = ctx.project.styles;
  const theme = ctx.theme;
  const inner = contentBox(box, w, styles, theme);
  if (inner.width <= 0 || inner.height <= 0) return box;

  const digits = clampDigits(numProp(resolveProp(w, 'digits', styles, theme), 4));
  const decPoint = clampDecimalPlaces(
    numProp(resolveProp(w, 'decimal_places', styles, theme), 0),
    digits,
  );
  const rangeFrom = numProp(resolveProp(w, 'range_from', styles, theme), 0);
  const rangeTo = numProp(resolveProp(w, 'range_to', styles, theme), 100);
  const value = numProp(resolveProp(w, 'value', styles, theme), 0);

  const text = formatSpinboxValue(value, rangeFrom, rangeTo, digits, decPoint);
  if (text === '') return box;

  const color = parseColor(resolveProp(w, 'text_color', styles, theme), '#212121');
  const opa = parseOpacity(resolveProp(w, 'text_opa', styles, theme), 1);
  const fontId = resolveProp<string>(w, 'text_font', styles, theme);
  const font = resolveFont(fontId, ctx.project.fonts);
  const textAlign = String(resolveProp(w, 'text_align', styles, theme) ?? 'AUTO').toUpperCase();
  const hAlign = textAlignToCanvas(textAlign);

  const c = ctx.ctx;
  c.save();
  c.font = font;
  c.fillStyle = opa < 1 ? withAlpha(color, opa) : color;
  c.textBaseline = 'top';
  c.textAlign = hAlign;
  const emSize = parseEmSize(font);
  const lineH = lvLineHeight(font);
  // Centre the glyph em-box on the content midline (same trick as buttonmatrix
  // cells / checkbox label): line_height drives layout, em drives ink.
  const x =
    hAlign === 'right'
      ? inner.x + inner.width
      : hAlign === 'center'
        ? inner.x + inner.width / 2
        : inner.x;
  const y = inner.y + (inner.height - emSize) / 2 - (lineH - emSize) / 2;
  c.fillText(text, x, y);
  c.restore();

  return box;
}

/**
 * Mirror of `lv_spinbox_updatevalue`. Pure — exported for potential future
 * unit tests.
 */
export function formatSpinboxValue(
  value: number,
  rangeFrom: number,
  rangeTo: number,
  digits: number,
  decimalPlaces: number,
): string {
  const scale = Math.pow(10, decimalPlaces);
  const rangeMin = Math.round(Math.min(rangeFrom, rangeTo) * scale);
  const rangeMax = Math.round(Math.max(rangeFrom, rangeTo) * scale);
  let v = Math.round(value * scale);
  if (v > rangeMax) v = rangeMax;
  if (v < rangeMin) v = rangeMin;

  const sign = rangeMin < 0 ? (v >= 0 ? '+' : '-') : '';
  const absDigits = Math.abs(v).toString();
  // padStart with '0' to digit_count; if abs exceeds digit_count (range allows
  // more than digit_count can display) we mirror LVGL and let it overflow as-is.
  const padded = absDigits.length >= digits ? absDigits : absDigits.padStart(digits, '0');

  if (decimalPlaces <= 0) return sign + padded;
  const intLen = padded.length - decimalPlaces;
  const intPart = padded.slice(0, intLen);
  const fracPart = padded.slice(intLen);
  return sign + intPart + '.' + fracPart;
}

function clampDigits(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 10) return 10;
  return Math.floor(n);
}

function clampDecimalPlaces(n: number, digits: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  const f = Math.floor(n);
  if (f > 6) return Math.min(6, digits);
  return Math.min(f, digits);
}

function textAlignToCanvas(value: string): 'left' | 'center' | 'right' {
  if (value === 'CENTER') return 'center';
  if (value === 'RIGHT') return 'right';
  return 'left';
}
