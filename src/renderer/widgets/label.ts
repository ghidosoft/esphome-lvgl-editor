import type { LvglWidget } from '../../parser/types';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolveFont } from '../fonts';
import { resolveProp } from '../styles';

/**
 * Single-line label render. We stick to fillText (no word wrap, no recolor)
 * which matches every label in the current project.
 */
export function renderLabel(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const text = String(resolveProp(w, 'text', styles) ?? '');
  if (text === '') return box;

  const color = parseColor(resolveProp(w, 'text_color', styles), '#ffffff');
  const opa = parseOpacity(resolveProp(w, 'text_opa', styles), 1);
  const fontId = resolveProp<string>(w, 'text_font', styles);
  const font = resolveFont(fontId, ctx.project.fonts);

  const align = String(resolveProp(w, 'align', styles) ?? 'TOP_LEFT').toUpperCase();

  const c = ctx.ctx;
  c.save();
  c.font = font;
  c.fillStyle = opa < 1 ? withAlpha(color, opa) : color;
  c.textBaseline = 'top';

  // ESPHome aligns the label's own anchor — TOP_MID centres horizontally and
  // anchors vertically to the top, RIGHT_MID anchors right-middle, etc.
  // Decompose into independent X and Y axes.
  const { hAlign, vAlign } = decomposeAlign(align);
  c.textAlign = hAlign;
  const xPos =
    hAlign === 'right' ? box.x + box.width : hAlign === 'center' ? box.x + box.width / 2 : box.x;
  // Two different heights at play:
  //  - lineHeight (ascent+descent): matches LVGL's `font.line_height`, used for
  //    SIZE_CONTENT and the returned hit-test rect.
  //  - emSize (CSS px): the em box where Canvas's vector web-font actually
  //    renders the glyph. For icon fonts LVGL's bitmap glyph fills the full
  //    line-box, but our Canvas glyph fills only the em box — so we position
  //    the text by em to keep the ink visually centered like the device, even
  //    though the widget's logical height is lineHeight.
  const lineHeight = fontHeight(c);
  const emSize = parseEmSize(font);
  const yPos =
    vAlign === 'bottom'
      ? box.y + box.height - emSize
      : vAlign === 'middle'
        ? box.y + (box.height - emSize) / 2
        : box.y;

  c.fillText(text, xPos, yPos);

  // Return the measured content rectangle instead of the (often oversized)
  // parent-sized box — the CanvasStage uses this for hit-testing, and we want
  // clicks on a label to select the label, not the whole card. Height is the
  // line-box (what LVGL treats as the widget's height).
  const measuredWidth = c.measureText(text).width;
  c.restore();

  const contentX =
    hAlign === 'right'
      ? xPos - measuredWidth
      : hAlign === 'center'
        ? xPos - measuredWidth / 2
        : xPos;
  const drawnY =
    vAlign === 'bottom'
      ? box.y + box.height - lineHeight
      : vAlign === 'middle'
        ? box.y + (box.height - lineHeight) / 2
        : box.y;
  return { x: contentX, y: drawnY, width: measuredWidth, height: lineHeight };
}

function decomposeAlign(align: string): {
  hAlign: 'left' | 'center' | 'right';
  vAlign: 'top' | 'middle' | 'bottom';
} {
  switch (align) {
    case 'TOP_LEFT':
      return { hAlign: 'left', vAlign: 'top' };
    case 'TOP_MID':
      return { hAlign: 'center', vAlign: 'top' };
    case 'TOP_RIGHT':
      return { hAlign: 'right', vAlign: 'top' };
    case 'BOTTOM_LEFT':
      return { hAlign: 'left', vAlign: 'bottom' };
    case 'BOTTOM_MID':
      return { hAlign: 'center', vAlign: 'bottom' };
    case 'BOTTOM_RIGHT':
      return { hAlign: 'right', vAlign: 'bottom' };
    case 'LEFT_MID':
      return { hAlign: 'left', vAlign: 'middle' };
    case 'RIGHT_MID':
      return { hAlign: 'right', vAlign: 'middle' };
    case 'CENTER':
      return { hAlign: 'center', vAlign: 'middle' };
    default:
      return { hAlign: 'left', vAlign: 'top' };
  }
}

/**
 * Font line-height (ascent + descent), matching LVGL's `font.line_height`.
 * The CSS font's nominal `px` size is the em box; real fonts — especially
 * icon fonts like Material Symbols — report an ascent+descent noticeably
 * larger than the em (≈1.2× for Material Symbols). LVGL uses line_height to
 * decide overflow/scroll, so we must too.
 *
 * Caller must set `c.font` before calling.
 */
function fontHeight(c: CanvasRenderingContext2D): number {
  const m = c.measureText('M');
  const a = m.fontBoundingBoxAscent;
  const d = m.fontBoundingBoxDescent;
  if (typeof a === 'number' && typeof d === 'number') return a + d;
  return 14;
}

/** CSS em size (the `<n>px` token from the resolved font string). */
function parseEmSize(font: string): number {
  const m = /(\d+)px/.exec(font);
  return m ? parseInt(m[1], 10) : 14;
}

/**
 * Measure a label without drawing. Used by the intrinsic-size pass to resolve
 * `SIZE_CONTENT` on labels and on containers whose children include labels.
 */
export function measureLabel(w: LvglWidget, ctx: RenderContext): { width: number; height: number } {
  const text = String(resolveProp(w, 'text', ctx.project.styles) ?? '');
  if (text === '') return { width: 0, height: 0 };
  const fontId = resolveProp<string>(w, 'text_font', ctx.project.styles);
  const font = resolveFont(fontId, ctx.project.fonts);
  const c = ctx.ctx;
  c.save();
  c.font = font;
  const width = c.measureText(text).width;
  const height = fontHeight(c);
  c.restore();
  return { width, height };
}
