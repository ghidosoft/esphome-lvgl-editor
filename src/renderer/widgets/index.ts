import type { LvglWidget } from '../../parser/types';
import type { Box, RenderContext } from '../context';
import { renderObj } from './obj';
import { renderButton } from './button';
import { renderLabel } from './label';
import { renderImage } from './image';
import { renderSlider } from './slider';
import { renderSpinner } from './spinner';
import { renderPlaceholder } from './placeholder';

/**
 * Widget renderer signature: draw the widget at the given absolute box.
 * Returns the inner content box that children should be laid out within
 * (typically `box` minus borders/padding — most LVGL widgets use the same box).
 */
export type RenderFn = (w: LvglWidget, box: Box, ctx: RenderContext) => Box;

export const WIDGET_RENDERERS: Record<string, RenderFn> = {
  obj: renderObj,
  button: renderButton,
  label: renderLabel,
  image: renderImage,
  slider: renderSlider,
  spinner: renderSpinner,
};

export function rendererFor(type: string): RenderFn {
  return WIDGET_RENDERERS[type] ?? renderPlaceholder;
}
