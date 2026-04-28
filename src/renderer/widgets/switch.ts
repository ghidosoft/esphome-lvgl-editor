import type { LvglWidget } from '../../parser/types';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolvePartProp, resolveProp } from '../styles';
import { roundedRectPath } from './obj';

/**
 * LVGL v9.5 switch widget: a two-state toggle with three parts —
 *   - MAIN (track): full-radius pill, grey by default.
 *   - INDICATOR: same pill drawn on top of the track, primary colour, only
 *     visible when `LV_STATE_CHECKED` is set.
 *   - KNOB: a circle that snaps left/right with the state. Default theme
 *     applies `pad_all: -4` to the knob, which insets it inside the track
 *     (negative pads are interpreted as inset, not outset, by `lv_switch.c`'s
 *     `knob_area.x1 -= knob_left` formula — positive `pad` makes the knob
 *     smaller).
 *
 * "Checked" is sourced from `state.checked: true` (ESPHome canonical form)
 * unless the inspector is forcing the `checked` preview state on this widget.
 */
export function renderSwitch(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const theme = ctx.theme;
  const checked = isChecked(w, ctx);

  const trackRadius = num(resolveProp(w, 'radius', styles, theme), 9999);
  const track: PartStyle = {
    fill: parseColor(resolveProp(w, 'bg_color', styles, theme), '#9e9e9e'),
    fillOpa: parseOpacity(resolveProp(w, 'bg_opa', styles, theme), 1),
    borderColor: parseColor(resolveProp(w, 'border_color', styles, theme), '#000000'),
    borderWidth: num(resolveProp(w, 'border_width', styles, theme), 0),
    borderOpa: parseOpacity(resolveProp(w, 'border_opa', styles, theme), 0),
    radius: trackRadius,
  };
  const ind: PartStyle = {
    fill: parseColor(resolvePartProp(w, 'indicator', 'bg_color', styles, theme), '#2196f3'),
    fillOpa: parseOpacity(resolvePartProp(w, 'indicator', 'bg_opa', styles, theme), 1),
    borderColor: parseColor(
      resolvePartProp(w, 'indicator', 'border_color', styles, theme),
      '#000000',
    ),
    borderWidth: num(resolvePartProp(w, 'indicator', 'border_width', styles, theme), 0),
    borderOpa: parseOpacity(resolvePartProp(w, 'indicator', 'border_opa', styles, theme), 0),
    radius: num(resolvePartProp(w, 'indicator', 'radius', styles, theme), trackRadius),
  };

  const c = ctx.ctx;
  c.save();
  fillRect(c, box.x, box.y, box.width, box.height, track);
  if (checked) {
    fillRect(c, box.x, box.y, box.width, box.height, ind);
  }

  // Knob geometry. Base size = track height (LVGL: `knob_size = lv_obj_get_height(obj)`).
  // The knob is then expanded outward by `pad_*` — LVGL's switch uses
  // `knob_area.x1 -= pad_left`, so a *positive* pad grows the knob outward
  // and a *negative* pad shrinks it (opposite of pad-as-inset on containers).
  // Default theme: pad_all: -4, producing the iOS look where the knob is
  // slightly smaller than the track.
  const padAll = num(resolvePartProp(w, 'knob', 'pad_all', styles, theme), -4);
  const padTop = num(resolvePartProp(w, 'knob', 'pad_top', styles, theme), padAll);
  const padBottom = num(resolvePartProp(w, 'knob', 'pad_bottom', styles, theme), padAll);
  const padLeft = num(resolvePartProp(w, 'knob', 'pad_left', styles, theme), padAll);
  const padRight = num(resolvePartProp(w, 'knob', 'pad_right', styles, theme), padAll);
  const baseSize = box.height;
  // Knob bbox: square of side `baseSize`, anchored at left or right depending
  // on state, then expanded (or shrunk, if pad < 0) on each side.
  const left = checked ? box.x + box.width - baseSize : box.x;
  const top = box.y;
  const knobX = left - padLeft;
  const knobY = top - padTop;
  const knobW = Math.max(0, baseSize + padLeft + padRight);
  const knobH = Math.max(0, baseSize + padTop + padBottom);

  const knobRadius = num(
    resolvePartProp(w, 'knob', 'radius', styles, theme),
    Math.min(knobW, knobH) / 2,
  );
  const knob: PartStyle = {
    fill: parseColor(resolvePartProp(w, 'knob', 'bg_color', styles, theme), '#ffffff'),
    fillOpa: parseOpacity(resolvePartProp(w, 'knob', 'bg_opa', styles, theme), 1),
    borderColor: parseColor(
      resolvePartProp(w, 'knob', 'border_color', styles, theme),
      '#000000',
    ),
    borderWidth: num(resolvePartProp(w, 'knob', 'border_width', styles, theme), 0),
    borderOpa: parseOpacity(resolvePartProp(w, 'knob', 'border_opa', styles, theme), 0),
    radius: knobRadius,
  };
  if (knobW > 0 && knobH > 0) {
    fillRect(c, knobX, knobY, knobW, knobH, knob);
  }
  c.restore();
  return box;
}

function isChecked(w: LvglWidget, ctx: RenderContext): boolean {
  if (
    ctx.activeState === 'checked' &&
    ctx.activeStateWidgetId &&
    w.widgetId === ctx.activeStateWidgetId
  ) {
    return true;
  }
  // ESPHome accepts both `checked: true` (top-level shorthand, used by some
  // cookbook samples) and `state: { checked: true }` (canonical form). The
  // top-level `checked:` is also overloaded as a state-styling block; we only
  // treat its boolean form as the toggle state.
  const top = w.props.checked;
  if (typeof top === 'boolean') return top;
  const state = w.props.state;
  if (state && typeof state === 'object' && !Array.isArray(state)) {
    return bool((state as Record<string, unknown>).checked, false);
  }
  return false;
}

interface PartStyle {
  fill: string;
  fillOpa: number;
  borderColor: string;
  borderWidth: number;
  borderOpa: number;
  radius: number;
}

function fillRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  s: PartStyle,
) {
  const r = Math.min(s.radius, w / 2, h / 2);
  roundedRectPath(c, x, y, w, h, r);
  if (s.fillOpa > 0) {
    c.fillStyle = s.fillOpa < 1 ? withAlpha(s.fill, s.fillOpa) : s.fill;
    c.fill();
  }
  if (s.borderOpa > 0 && s.borderWidth > 0) {
    c.strokeStyle = s.borderOpa < 1 ? withAlpha(s.borderColor, s.borderOpa) : s.borderColor;
    c.lineWidth = s.borderWidth;
    c.stroke();
  }
}

function num(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  }
  return fallback;
}
