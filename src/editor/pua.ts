/**
 * Material Symbols and similar icon fonts live in the Unicode Private Use Area
 * (U+E000–U+F8FF). In our <input> text fields these codepoints render as tofu
 * because the sidebar's CSS font doesn't cover that range. We sidestep the
 * problem by displaying the escape form `\uXXXX` and accepting either form as
 * input — so users can read and type codepoints directly while the underlying
 * string kept in the store is still the raw glyph (unchanged for the canvas
 * and the YAML round-trip).
 */

const PUA_RE = /[-]/g;
const ESC_RE = /\\u([eEfF][0-9a-fA-F]{3})/g;

export function encodePua(s: string): string {
  return s.replace(
    PUA_RE,
    (ch) => '\\u' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'),
  );
}

export function decodePua(s: string): string {
  return s.replace(ESC_RE, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}
