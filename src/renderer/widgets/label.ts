import type { LvglWidget } from '../../parser/types';
import { contentBox } from '../boxes';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolveFont } from '../fonts';
import { resolveProp } from '../styles';

/**
 * Label render. Default is single-line via fillText. `long_mode` opts into
 * WRAP (word-wrap), BREAK (char-wrap), or DOT (single-line ellipsis).
 * SCROLL/SCROLL_CIRCULAR are out of scope (they require animation).
 */
export function renderLabel(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const theme = ctx.theme;
  const text = String(resolveProp(w, 'text', styles, theme) ?? '');
  if (text === '') return box;

  const color = parseColor(resolveProp(w, 'text_color', styles, theme), '#212121');
  const opa = parseOpacity(resolveProp(w, 'text_opa', styles, theme), 1);
  const fontId = resolveProp<string>(w, 'text_font', styles, theme);
  const font = resolveFont(fontId, ctx.project.fonts);

  const align = String(resolveProp(w, 'align', styles, theme) ?? 'TOP_LEFT').toUpperCase();
  const textAlign = String(resolveProp(w, 'text_align', styles, theme) ?? 'AUTO').toUpperCase();
  // CLIP is LVGL's default: single-line, no overflow handling. WRAP/BREAK
  // produce multiple lines; DOT truncates a single line with an ellipsis.
  const longMode = String(resolveProp(w, 'long_mode', styles, theme) ?? 'CLIP').toUpperCase();

  // Inset text positioning by border + padding — LVGL paints the label's
  // background/border on the outer box but its glyphs inside the content box.
  const inner = contentBox(box, w, styles, theme);

  const c = ctx.ctx;
  c.save();
  c.font = font;
  c.fillStyle = opa < 1 ? withAlpha(color, opa) : color;
  c.textBaseline = 'top';

  // ESPHome aligns the label's own anchor — TOP_MID centres horizontally and
  // anchors vertically to the top, RIGHT_MID anchors right-middle, etc.
  // Decompose into independent X and Y axes; `text_align` overrides hAlign.
  const { hAlign: anchorH, vAlign } = decomposeAlign(align);
  const hAlign = textAlignOverride(textAlign) ?? anchorH;
  c.textAlign = hAlign;
  const xPos =
    hAlign === 'right'
      ? inner.x + inner.width
      : hAlign === 'center'
        ? inner.x + inner.width / 2
        : inner.x;
  // Two different heights at play:
  //  - lineHeight (ascent+descent): matches LVGL's `font.line_height`, used for
  //    SIZE_CONTENT, multi-line stacking, and the returned hit-test rect.
  //  - emSize (CSS px): the em box where Canvas's vector web-font actually
  //    renders the glyph. For icon fonts LVGL's bitmap glyph fills the full
  //    line-box, but our Canvas glyph fills only the em box — so we position
  //    single-line text by em to keep the ink visually centered like the
  //    device, even though the widget's logical height is lineHeight.
  const lineHeight = fontHeight(c);
  const emSize = parseEmSize(font);

  const lines =
    longMode === 'WRAP'
      ? wrapLinesWord(text, inner.width, c)
      : longMode === 'BREAK'
        ? wrapLinesChar(text, inner.width, c)
        : longMode === 'DOT'
          ? [truncateWithEllipsis(text, inner.width, c)]
          : [text];
  const blockH = lines.length * lineHeight;

  // Single-line keeps the em-centered positioning; multi-line stacks line
  // boxes and centers the whole block (em offset within the first line is 0
  // for top/bottom and irrelevant for the block's vertical center).
  let firstLineY: number;
  if (lines.length === 1) {
    firstLineY =
      vAlign === 'bottom'
        ? inner.y + inner.height - emSize
        : vAlign === 'middle'
          ? inner.y + (inner.height - emSize) / 2
          : inner.y;
  } else {
    firstLineY =
      vAlign === 'bottom'
        ? inner.y + inner.height - blockH
        : vAlign === 'middle'
          ? inner.y + (inner.height - blockH) / 2
          : inner.y;
  }

  for (let i = 0; i < lines.length; i++) {
    c.fillText(lines[i], xPos, firstLineY + i * lineHeight);
  }

  const measuredWidth =
    lines.length === 1
      ? c.measureText(lines[0]).width
      : Math.max(...lines.map((l) => c.measureText(l).width));
  c.restore();

  // Return the measured content rectangle instead of the (often oversized)
  // parent-sized box — the CanvasStage uses this for hit-testing.
  const contentX =
    hAlign === 'right'
      ? xPos - measuredWidth
      : hAlign === 'center'
        ? xPos - measuredWidth / 2
        : xPos;
  const drawnY =
    lines.length === 1
      ? vAlign === 'bottom'
        ? inner.y + inner.height - lineHeight
        : vAlign === 'middle'
          ? inner.y + (inner.height - lineHeight) / 2
          : inner.y
      : vAlign === 'bottom'
        ? inner.y + inner.height - blockH
        : vAlign === 'middle'
          ? inner.y + (inner.height - blockH) / 2
          : inner.y;
  return {
    x: contentX,
    y: drawnY,
    width: measuredWidth,
    height: lines.length === 1 ? lineHeight : blockH,
  };
}

function textAlignOverride(value: string): 'left' | 'center' | 'right' | null {
  if (value === 'LEFT') return 'left';
  if (value === 'RIGHT') return 'right';
  if (value === 'CENTER') return 'center';
  return null;
}

function wrapLinesWord(text: string, maxWidth: number, c: CanvasRenderingContext2D): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = line + ' ' + words[i];
      if (c.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}

function wrapLinesChar(text: string, maxWidth: number, c: CanvasRenderingContext2D): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const ch of paragraph) {
      const candidate = line + ch;
      // Force at least one char per line so an over-wide glyph never deadlocks.
      if (line.length === 0 || c.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        out.push(line);
        line = ch;
      }
    }
    if (line.length > 0) out.push(line);
  }
  return out;
}

function truncateWithEllipsis(
  text: string,
  maxWidth: number,
  c: CanvasRenderingContext2D,
): string {
  if (c.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  // Binary search the largest prefix that still fits with the ellipsis.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (c.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + ellipsis;
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
 *
 * Always returns single-line dimensions: WRAP/BREAK can't be measured here
 * because they need a `maxWidth` that depends on the parent we're sizing
 * against. Matches LVGL — a WRAP label with SIZE_CONTENT width doesn't wrap.
 */
export function measureLabel(w: LvglWidget, ctx: RenderContext): { width: number; height: number } {
  const text = String(resolveProp(w, 'text', ctx.project.styles, ctx.theme) ?? '');
  if (text === '') return { width: 0, height: 0 };
  const fontId = resolveProp<string>(w, 'text_font', ctx.project.styles, ctx.theme);
  const font = resolveFont(fontId, ctx.project.fonts);
  const c = ctx.ctx;
  c.save();
  c.font = font;
  const width = c.measureText(text).width;
  const height = fontHeight(c);
  c.restore();
  return { width, height };
}
