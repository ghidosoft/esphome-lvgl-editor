import type { LvglWidget, StyleSpec } from '../parser/types';

/**
 * Resolve the effective property value for a widget by walking, in order:
 *   1. inline widget.props
 *   2. each style id in widget.styles (in order — last wins per LVGL docs)
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
  return undefined;
}
