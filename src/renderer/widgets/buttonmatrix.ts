import type { LvglWidget, StyleSpec } from '../../parser/types';
import { contentBox } from '../boxes';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import type { DefaultTheme } from '../defaultTheme';
import { resolveFont } from '../fonts';
import { lvLineHeight, parseEmSize } from '../fontMetrics';
import { resolvePartProp, resolveProp } from '../styles';
import { renderObj, roundedRectPath } from './obj';

/**
 * LVGL v9.5 buttonmatrix widget. A single LvglWidget renders a grid of cells
 * laid out per `rows: [{ buttons: [{ text, width, control } ] }]`. Layout
 * mirrors `lv_buttonmatrix.c`: rows are equal-height, per-row widths split
 * proportionally by each button's `width` (1..15, default 1), with `pad_row`
 * vertical gaps and `pad_column` horizontal gaps between cells. Integer math
 * matches LVGL's pixel-stable allocation.
 *
 * Per-cell visuals come from the `items` part (resolved via resolvePartProp);
 * the state-specific colors come from synthetic theme parts `items_checked`
 * and `items_disabled` — these aren't real LVGL parts but slot into the same
 * `theme[widget][part]` map so we don't need a richer cascade just for this.
 *
 * Out of scope for v1: click interaction (no widget reacts to clicks yet),
 * popover, focus ring, `LV_BORDER_SIDE_INTERNAL` (shared cell borders) and
 * `#RRGGBB` recolor markup in text.
 */
export function renderButtonmatrix(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  renderObj(w, box, ctx);

  const rows = Array.isArray(w.props.rows) ? (w.props.rows as unknown[]) : [];
  if (rows.length === 0) return box;

  const styles = ctx.project.styles;
  const theme = ctx.theme;
  const inner = contentBox(box, w, styles, theme);
  if (inner.width <= 0 || inner.height <= 0) return box;

  const padRow = num(resolveProp(w, 'pad_row', styles, theme), 0);
  const padColumn = num(resolveProp(w, 'pad_column', styles, theme), 0);

  const totalGapY = padRow * Math.max(0, rows.length - 1);
  const usableH = Math.max(0, inner.height - totalGapY);
  const rowH = Math.floor(usableH / rows.length);

  const c = ctx.ctx;
  c.save();

  for (let r = 0; r < rows.length; r++) {
    const rowEntry = rows[r];
    if (!rowEntry || typeof rowEntry !== 'object' || Array.isArray(rowEntry)) continue;
    const buttons = (rowEntry as Record<string, unknown>).buttons;
    if (!Array.isArray(buttons) || buttons.length === 0) continue;

    const rowY = inner.y + r * (rowH + padRow);
    const totalGapX = padColumn * (buttons.length - 1);
    const availW = Math.max(0, inner.width - totalGapX);

    const units: number[] = buttons.map((b) => clampWidth(buttonWidthUnits(b)));
    const totalUnits = units.reduce((a, n) => a + n, 0) || buttons.length;

    let cumUnits = 0;
    for (let i = 0; i < buttons.length; i++) {
      const x1 = inner.x + Math.floor((availW * cumUnits) / totalUnits) + i * padColumn;
      cumUnits += units[i];
      const x2 = inner.x + Math.floor((availW * cumUnits) / totalUnits) + i * padColumn;
      const cellW = Math.max(0, x2 - x1);

      drawCell(
        c,
        buttons[i],
        { x: x1, y: rowY, width: cellW, height: rowH },
        w,
        styles,
        theme,
        ctx,
      );
    }
  }
  c.restore();
  return box;
}

function drawCell(
  c: CanvasRenderingContext2D,
  rawBtn: unknown,
  cell: Box,
  widget: LvglWidget,
  styles: Record<string, StyleSpec>,
  theme: DefaultTheme | undefined,
  ctx: RenderContext,
) {
  if (cell.width <= 0 || cell.height <= 0) return;
  const btn =
    rawBtn && typeof rawBtn === 'object' && !Array.isArray(rawBtn)
      ? (rawBtn as Record<string, unknown>)
      : {};

  if (cellFlag(btn, 'hidden')) return;
  const checked = cellFlag(btn, 'checked');
  const disabled = cellFlag(btn, 'disabled');
  const statePart = checked ? 'items_checked' : disabled ? 'items_disabled' : null;

  const bgColor = parseColor(
    statePartProp(widget, statePart, 'bg_color', styles, theme) ??
      resolvePartProp(widget, 'items', 'bg_color', styles, theme),
    '#e0e0e0',
  );
  const bgOpa = parseOpacity(
    statePartProp(widget, statePart, 'bg_opa', styles, theme) ??
      resolvePartProp(widget, 'items', 'bg_opa', styles, theme),
    1,
  );
  const borderColor = parseColor(
    statePartProp(widget, statePart, 'border_color', styles, theme) ??
      resolvePartProp(widget, 'items', 'border_color', styles, theme),
    '#000000',
  );
  const borderWidth = num(
    statePartProp(widget, statePart, 'border_width', styles, theme) ??
      resolvePartProp(widget, 'items', 'border_width', styles, theme),
    0,
  );
  const borderOpa = parseOpacity(
    statePartProp(widget, statePart, 'border_opa', styles, theme) ??
      resolvePartProp(widget, 'items', 'border_opa', styles, theme),
    0,
  );
  const radius = num(
    statePartProp(widget, statePart, 'radius', styles, theme) ??
      resolvePartProp(widget, 'items', 'radius', styles, theme),
    0,
  );

  const r = Math.max(0, Math.min(radius, cell.width / 2, cell.height / 2));
  if (bgOpa > 0) {
    roundedRectPath(c, cell.x, cell.y, cell.width, cell.height, r);
    c.fillStyle = bgOpa < 1 ? withAlpha(bgColor, bgOpa) : bgColor;
    c.fill();
  }
  if (borderOpa > 0 && borderWidth > 0) {
    roundedRectPath(
      c,
      cell.x + borderWidth / 2,
      cell.y + borderWidth / 2,
      Math.max(0, cell.width - borderWidth),
      Math.max(0, cell.height - borderWidth),
      Math.max(0, r - borderWidth / 2),
    );
    c.strokeStyle = borderOpa < 1 ? withAlpha(borderColor, borderOpa) : borderColor;
    c.lineWidth = borderWidth;
    c.stroke();
  }

  const text = typeof btn.text === 'string' ? btn.text : '';
  if (text === '') return;

  const textColor = parseColor(
    statePartProp(widget, statePart, 'text_color', styles, theme) ??
      resolvePartProp(widget, 'items', 'text_color', styles, theme),
    '#212121',
  );
  const textOpa = parseOpacity(
    statePartProp(widget, statePart, 'text_opa', styles, theme) ??
      resolvePartProp(widget, 'items', 'text_opa', styles, theme),
    1,
  );
  const fontId =
    (statePartProp(widget, statePart, 'text_font', styles, theme) as string | undefined) ??
    resolvePartProp<string>(widget, 'items', 'text_font', styles, theme) ??
    resolveProp<string>(widget, 'text_font', styles, theme);
  const fontStr = resolveFont(fontId, ctx.project.fonts);

  c.save();
  c.font = fontStr;
  c.fillStyle = textOpa < 1 ? withAlpha(textColor, textOpa) : textColor;
  c.textBaseline = 'top';
  c.textAlign = 'center';
  const emSize = parseEmSize(fontStr);
  const lineH = lvLineHeight(fontStr);
  // Center the glyph em-box on the cell midline so single-line ink sits where
  // the device draws it (line_height is the layout unit; em is the paint unit).
  const cx = cell.x + cell.width / 2;
  const cy = cell.y + (cell.height - emSize) / 2 - (lineH - emSize) / 2;
  c.fillText(text, cx, cy);
  c.restore();
}

/**
 * Read a state-specific override from a synthetic theme part (e.g.
 * `items_checked.bg_color`). Inline override wins via the nested
 * `items.checked.bg_color` form; falls back to the theme synthetic part.
 */
function statePartProp(
  widget: LvglWidget,
  statePart: 'items_checked' | 'items_disabled' | null,
  key: string,
  _styles: Record<string, StyleSpec>,
  theme: DefaultTheme | undefined,
): unknown {
  if (!statePart) return undefined;
  const stateName = statePart === 'items_checked' ? 'checked' : 'disabled';
  const items = widget.props.items;
  if (items && typeof items === 'object' && !Array.isArray(items)) {
    const sub = (items as Record<string, unknown>)[stateName];
    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
      const v = (sub as Record<string, unknown>)[key];
      if (v != null) return v;
    }
  }
  return theme?.buttonmatrix?.[statePart]?.[key];
}

function cellFlag(btn: Record<string, unknown>, name: 'hidden' | 'checked' | 'disabled'): boolean {
  const top = btn[name];
  if (typeof top === 'boolean') return top;
  const ctrl = btn.control;
  if (ctrl && typeof ctrl === 'object' && !Array.isArray(ctrl)) {
    const v = (ctrl as Record<string, unknown>)[name];
    if (typeof v === 'boolean') return v;
  }
  return false;
}

function buttonWidthUnits(btn: unknown): number {
  if (!btn || typeof btn !== 'object' || Array.isArray(btn)) return 1;
  const w = (btn as Record<string, unknown>).width;
  if (typeof w === 'number' && Number.isFinite(w)) return w;
  if (typeof w === 'string') {
    const n = Number(w);
    if (!Number.isNaN(n)) return n;
  }
  return 1;
}

function clampWidth(n: number): number {
  if (n <= 0) return 1;
  if (n > 15) return 15;
  return Math.floor(n);
}

function num(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}
