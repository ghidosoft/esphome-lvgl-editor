/**
 * Map ESPHome font ids to a CSS canvas font shorthand.
 * The convention in this repo's YAML is `font_<size>_<weight>` for Montserrat
 * and `font_icon_<size>` for Material Symbols Outlined.
 *
 * If we don't recognize the id we fall back to a sensible default so unknown
 * fonts still render text instead of nothing.
 */
import type { FontSpec } from '../parser/types';

export function resolveFont(id: string | undefined, fonts: Record<string, FontSpec>): string {
  if (!id) return DEFAULT_FONT;

  // Heuristic mapping based on naming convention used in the repo.
  if (id.startsWith('font_icon_')) {
    const size = parseInt(id.slice('font_icon_'.length), 10);
    if (!Number.isNaN(size)) return `${size}px "Material Symbols Outlined"`;
  }
  const m = /^font_(\d+)(?:_(light|medium|regular|bold))?$/i.exec(id);
  if (m) {
    const size = parseInt(m[1], 10);
    const weight = WEIGHTS[(m[2] ?? 'regular').toLowerCase()] ?? 400;
    return `${weight} ${size}px Montserrat`;
  }

  // Fall back to whatever the parser captured.
  const spec = fonts[id];
  if (spec?.size) {
    const weight = WEIGHTS[String(spec.weight ?? 'regular').toLowerCase()] ?? 400;
    const family = spec.family ?? 'Montserrat';
    return `${weight} ${spec.size}px ${family}`;
  }
  return DEFAULT_FONT;
}

const DEFAULT_FONT = '400 14px Montserrat';

const WEIGHTS: Record<string, number> = {
  light: 300,
  regular: 400,
  '400': 400,
  medium: 500,
  bold: 700,
};
