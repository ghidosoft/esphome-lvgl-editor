/**
 * LVGL color conventions encountered in ESPHome YAML:
 *   - "0xRRGGBB"  (most common)
 *   - "#RRGGBB"
 *   - common LVGL named colors: black, white, red, green, blue, etc.
 *
 * Returns a CSS color string ("#rrggbb"). Falls back to fallback on parse failure.
 */
export function parseColor(value: unknown, fallback = '#000000'): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (v.startsWith('0x') || v.startsWith('0X')) {
    const hex = v.slice(2);
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toLowerCase()}`;
    if (/^[0-9a-fA-F]{3}$/.test(hex)) return `#${hex.toLowerCase()}`;
  }
  if (v.startsWith('#')) return v.toLowerCase();
  const named = NAMED_COLORS[v.toLowerCase()];
  if (named) return named;
  return fallback;
}

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  aqua: '#00ffff',
  teal: '#008080',
  navy: '#000080',
  fuchsia: '#ff00ff',
  purple: '#800080',
};

/**
 * LVGL opacity enum → 0..1.  TRANSP, COVER and 0..255 numeric also accepted.
 */
export function parseOpacity(value: unknown, fallback = 1): number {
  if (value == null) return fallback;
  if (typeof value === 'number') {
    if (value <= 1) return Math.max(0, Math.min(1, value));
    return Math.max(0, Math.min(1, value / 255));
  }
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toUpperCase();
  if (v === 'TRANSP') return 0;
  if (v === 'COVER') return 1;
  if (v.endsWith('%')) {
    const n = parseFloat(v.slice(0, -1));
    if (!Number.isNaN(n)) return Math.max(0, Math.min(1, n / 100));
  }
  const n = Number(v);
  if (!Number.isNaN(n)) {
    if (n <= 1) return Math.max(0, Math.min(1, n));
    return Math.max(0, Math.min(1, n / 255));
  }
  return fallback;
}

/** Apply alpha to a "#rrggbb" hex producing rgba(...). */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.replace(/^#/, '');
  if (hex.length !== 6) return color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
