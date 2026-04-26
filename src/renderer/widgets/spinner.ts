import type { LvglWidget } from '../../parser/types';
import { contentBox } from '../boxes';
import { parseColor, parseOpacity, withAlpha } from '../colors';
import type { Box, RenderContext } from '../context';
import { resolvePartProp, resolveProp } from '../styles';

/**
 * LVGL v9.5 spinner: extends arc, with MAIN as the background track and
 * INDICATOR as the sweeping arc. Both parts read the arc_* style group;
 * sweep size comes from `arc_length` (default 60°). The indicator rotates
 * clockwise once per `spin_time` with smoothstep easing — matches LVGL's
 * `lv_anim_path_ease_in_out` on the start angle. CanvasStage drives this via
 * a RAF loop while the page contains any spinner; `ctx.frameTimeMs` provides
 * the monotonic clock.
 *
 * `arc_image_src` is acknowledged but image-masked arcs aren't drawn here.
 */
export function renderSpinner(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const theme = ctx.theme;

  // Top-level arc_* keys are MAIN-part shorthand in ESPHome — fall back to them
  // when no explicit `main:` block is present.
  const mainProp = (key: string): unknown =>
    resolvePartProp(w, 'main', key, styles, theme) ?? resolveProp(w, key, styles, theme);

  const mainColor = parseColor(mainProp('arc_color'), '#e0e0e0');
  const mainOpa = parseOpacity(mainProp('arc_opa'), 1);
  const mainWidth = num(mainProp('arc_width'), 10);
  const mainRounded = bool(mainProp('arc_rounded'), true);

  // Indicator falls back to main values for width/rounded so an unset YAML
  // looks the same on both arcs (LVGL inheritance behaviour).
  const indColor = parseColor(
    resolvePartProp(w, 'indicator', 'arc_color', styles, theme),
    '#2196f3',
  );
  const indOpa = parseOpacity(resolvePartProp(w, 'indicator', 'arc_opa', styles, theme), 1);
  const indWidth = num(resolvePartProp(w, 'indicator', 'arc_width', styles, theme), mainWidth);
  const indRounded = bool(
    resolvePartProp(w, 'indicator', 'arc_rounded', styles, theme),
    mainRounded,
  );

  const sweepDeg = parseAngleDeg(resolveProp(w, 'arc_length', styles, theme), 60);
  const spinTimeMs = parseDurationMs(resolveProp(w, 'spin_time', styles, theme), 1000);
  const phase = spinTimeMs > 0 ? (ctx.frameTimeMs % spinTimeMs) / spinTimeMs : 0;
  const eased = phase * phase * (3 - 2 * phase); // smoothstep, mirrors lv_anim_path_ease_in_out
  const rotationRad = eased * Math.PI * 2;

  // Padding insets the arc circle from the widget's outer box (LVGL arc
  // semantics: pad_* on the main style shrinks the drawn radius).
  const inner = contentBox(box, w, styles, theme);
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  const maxStroke = Math.max(mainWidth, indWidth);
  const r = Math.max(0, Math.min(inner.width, inner.height) / 2 - maxStroke / 2);

  const c = ctx.ctx;
  c.save();

  // Track: full circle.
  if (mainOpa > 0 && mainWidth > 0) {
    c.lineCap = mainRounded ? 'round' : 'butt';
    c.lineWidth = mainWidth;
    c.strokeStyle = mainOpa < 1 ? withAlpha(mainColor, mainOpa) : mainColor;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
  }

  // Indicator: sweep `sweepDeg` degrees from -90° (top), clockwise, rotated
  // by the eased phase so it spins once per spin_time.
  if (indOpa > 0 && indWidth > 0 && sweepDeg > 0) {
    const startRad = -Math.PI / 2 + rotationRad;
    const endRad = startRad + (sweepDeg * Math.PI) / 180;
    c.lineCap = indRounded ? 'round' : 'butt';
    c.lineWidth = indWidth;
    c.strokeStyle = indOpa < 1 ? withAlpha(indColor, indOpa) : indColor;
    c.beginPath();
    c.arc(cx, cy, r, startRad, endRad);
    c.stroke();
  }

  c.restore();
  return box;
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

function parseAngleDeg(v: unknown, fallback: number): number {
  let n: number | undefined;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const s = v.trim().toLowerCase().replace(/deg$/, '').trim();
    const parsed = Number(s);
    if (!Number.isNaN(parsed)) n = parsed;
  }
  if (n === undefined) n = fallback;
  return Math.max(0, Math.min(360, n));
}

/** ESPHome durations: "1s", "500ms", "2.5s", or a bare number (ms). */
function parseDurationMs(v: unknown, fallback: number): number {
  if (typeof v === 'number') return Math.max(0, v);
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    const m = /^(-?\d+(?:\.\d+)?)\s*(ms|s|min)?$/.exec(s);
    if (m) {
      const n = Number(m[1]);
      const unit = m[2] ?? 'ms';
      const ms = unit === 's' ? n * 1000 : unit === 'min' ? n * 60_000 : n;
      return Math.max(0, ms);
    }
  }
  return fallback;
}
