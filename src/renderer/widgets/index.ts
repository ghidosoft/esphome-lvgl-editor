import type { LvglWidget } from '../../parser/types';
import type { Box, RenderContext } from '../context';
import { renderArc } from './arc';
import { renderBar } from './bar';
import { renderButtonmatrix } from './buttonmatrix';
import { renderCheckbox } from './checkbox';
import { renderObj } from './obj';
import { renderButton } from './button';
import { renderLabel } from './label';
import { renderImage } from './image';
import { renderMeter } from './meter';
import { renderSlider } from './slider';
import { renderSpinner } from './spinner';
import { renderSwitch } from './switch';
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
  buttonmatrix: renderButtonmatrix,
  label: renderLabel,
  image: renderImage,
  arc: renderArc,
  bar: renderBar,
  checkbox: renderCheckbox,
  meter: renderMeter,
  slider: renderSlider,
  spinner: renderSpinner,
  switch: renderSwitch,
};

export function rendererFor(type: string): RenderFn {
  return WIDGET_RENDERERS[type] ?? renderPlaceholder;
}
