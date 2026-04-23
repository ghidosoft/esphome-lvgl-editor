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
    hAlign === 'right' ? box.x + box.width :
    hAlign === 'center' ? box.x + box.width / 2 :
    box.x;
  const fontSize = parseFontSize(font);
  const yPos =
    vAlign === 'bottom' ? box.y + box.height - fontSize :
    vAlign === 'middle' ? box.y + (box.height - fontSize) / 2 :
    box.y;

  c.fillText(text, xPos, yPos);

  // Return the measured content rectangle instead of the (often oversized)
  // parent-sized box — the CanvasStage uses this for hit-testing, and we want
  // clicks on a label to select the label, not the whole card.
  const measuredWidth = c.measureText(text).width;
  c.restore();

  const contentX =
    hAlign === 'right' ? xPos - measuredWidth :
    hAlign === 'center' ? xPos - measuredWidth / 2 :
    xPos;
  return { x: contentX, y: yPos, width: measuredWidth, height: fontSize };
}

function decomposeAlign(align: string): { hAlign: 'left' | 'center' | 'right'; vAlign: 'top' | 'middle' | 'bottom' } {
  switch (align) {
    case 'TOP_LEFT': return { hAlign: 'left', vAlign: 'top' };
    case 'TOP_MID': return { hAlign: 'center', vAlign: 'top' };
    case 'TOP_RIGHT': return { hAlign: 'right', vAlign: 'top' };
    case 'BOTTOM_LEFT': return { hAlign: 'left', vAlign: 'bottom' };
    case 'BOTTOM_MID': return { hAlign: 'center', vAlign: 'bottom' };
    case 'BOTTOM_RIGHT': return { hAlign: 'right', vAlign: 'bottom' };
    case 'LEFT_MID': return { hAlign: 'left', vAlign: 'middle' };
    case 'RIGHT_MID': return { hAlign: 'right', vAlign: 'middle' };
    case 'CENTER': return { hAlign: 'center', vAlign: 'middle' };
    default: return { hAlign: 'left', vAlign: 'top' };
  }
}

function parseFontSize(font: string): number {
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
  c.restore();
  return { width, height: parseFontSize(font) };
}
