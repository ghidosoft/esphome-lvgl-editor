import type { LvglWidget } from '../../parser/types';
import { renderObj } from './obj';
import type { Box, RenderContext } from '../context';

/**
 * In LVGL a button is essentially an obj with a different default style
 * (rounded background + slight padding). For preview purposes we render it
 * exactly like obj — the actual look comes from the `styles:` reference
 * (e.g. style_card_button) defined in the project.
 *
 * `pressed:`/`checked:` state blocks in the YAML are intentionally ignored —
 * we always render the default state.
 */
export function renderButton(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  return renderObj(w, box, ctx);
}
