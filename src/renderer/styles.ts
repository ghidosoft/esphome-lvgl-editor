import type { LvglWidget, StyleSpec } from '../parser/types';
import type { DefaultTheme } from './defaultTheme';

/**
 * Resolve the effective property value for a widget by walking, in order:
 *   1. inline widget.props
 *   2. each style id in widget.styles (in order — last wins per LVGL docs)
 *   3. the default theme's entry for `widget.type` ("main" part)
 *
 * Returns undefined if no source defines the key.
 *
 * NOTE: LVGL semantics actually have "inline overrides style"; we honour that
 * by preferring widget.props over styles.
 */
export function resolveProp<T = unknown>(
  widget: LvglWidget,
  key: string,
  styles: Record<string, StyleSpec>,
  theme?: DefaultTheme,
): T | undefined {
  if (key in widget.props && widget.props[key] != null) {
    return widget.props[key] as T;
  }
  for (let i = widget.styles.length - 1; i >= 0; i--) {
    const styleId = widget.styles[i];
    const style = styles[styleId];
    if (!style) continue;
    if (key in style.props && style.props[key] != null) {
      return style.props[key] as T;
    }
  }
  if (theme) {
    const main = theme[widget.type]?.main;
    if (main && key in main && main[key] != null) {
      return main[key] as T;
    }
  }
  return undefined;
}

/**
 * Resolve a sub-part property (e.g. slider's `indicator.bg_color`). Walks:
 *   1. widget.props[part]?.[key] — the inline nested object
 *   2. theme[widget.type]?.[part]?.[key]
 *
 * `styles:` references aren't part-aware in this codebase yet — they only feed
 * the main part. If/when they become part-aware, slot the lookup in here.
 */
export function resolvePartProp<T = unknown>(
  widget: LvglWidget,
  part: string,
  key: string,
  _styles: Record<string, StyleSpec>,
  theme?: DefaultTheme,
): T | undefined {
  const inline = widget.props[part];
  if (inline && typeof inline === 'object' && !Array.isArray(inline)) {
    const bag = inline as Record<string, unknown>;
    if (key in bag && bag[key] != null) return bag[key] as T;
  }
  if (theme) {
    const partBag = theme[widget.type]?.[part];
    if (partBag && key in partBag && partBag[key] != null) {
      return partBag[key] as T;
    }
  }
  return undefined;
}
