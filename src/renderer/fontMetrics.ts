/**
 * Shared font metric helpers. LVGL's `font.line_height` (Montserrat: em × 8/7)
 * is the canonical unit for vertical layout and intrinsic sizing, while the
 * CSS em size matches the actual glyph box Canvas paints into. Keeping the two
 * apart matters in checkbox/buttonmatrix/etc. so single-line glyphs sit on the
 * em midline (matching the device) without inflating the line-box used for
 * SIZE_CONTENT / overflow checks.
 */

/** CSS em size in pixels (the `<n>px` token from a resolved canvas font string). */
export function parseEmSize(font: string): number {
  const m = /(\d+)px/.exec(font);
  return m ? parseInt(m[1], 10) : 14;
}

/** LVGL Montserrat line-height: em × 8/7 (14→16, 18→21). */
export function lvLineHeight(font: string): number {
  return Math.round((parseEmSize(font) * 8) / 7);
}
