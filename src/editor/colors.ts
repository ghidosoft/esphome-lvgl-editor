/**
 * ESPHome color values in YAML come as either `0xRRGGBB` or `#rrggbb`. The
 * native `<input type="color">` in browsers only speaks `#rrggbb`, so these
 * helpers bridge between the two representations.
 */

/** Convert an ESPHome color (`0xRRGGBB` or `#rrggbb`) to CSS `#rrggbb`, or `null` if unrecognised. */
export function toHexColor(v: string): string | null {
  const t = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  const m = /^0x([0-9a-fA-F]{6})$/.exec(t);
  return m ? `#${m[1].toLowerCase()}` : null;
}

/** CSS `#rrggbb` → `0xRRGGBB` (uppercase) to match existing YAML conventions. */
export function toLvglHex(cssHex: string): string {
  return `0x${cssHex.replace(/^#/, '').toUpperCase()}`;
}

export function isColorLike(v: unknown): v is string {
  return typeof v === 'string' && toHexColor(v) != null;
}
