/**
 * LVGL ALIGN values (the subset actually used in this repo).
 * Each maps a child of size (cw, ch) inside a parent of size (pw, ph) to an
 * offset (dx, dy) of the child's TOP-LEFT corner.
 *
 * The widget's `x:` / `y:` props are then *added* to this offset (LVGL
 * semantics — they are deltas relative to the alignment anchor).
 *
 * https://docs.lvgl.io/master/widgets/obj/align.html
 */
export type AlignName =
  | 'TOP_LEFT'
  | 'TOP_MID'
  | 'TOP_RIGHT'
  | 'BOTTOM_LEFT'
  | 'BOTTOM_MID'
  | 'BOTTOM_RIGHT'
  | 'LEFT_MID'
  | 'RIGHT_MID'
  | 'CENTER'
  | 'OUT_TOP_LEFT'
  | 'OUT_TOP_MID'
  | 'OUT_TOP_RIGHT'
  | 'OUT_BOTTOM_LEFT'
  | 'OUT_BOTTOM_MID'
  | 'OUT_BOTTOM_RIGHT'
  | 'OUT_LEFT_TOP'
  | 'OUT_LEFT_MID'
  | 'OUT_LEFT_BOTTOM'
  | 'OUT_RIGHT_TOP'
  | 'OUT_RIGHT_MID'
  | 'OUT_RIGHT_BOTTOM';

export interface AlignedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function alignChild(
  align: string | undefined,
  parent: { width: number; height: number },
  child: { width: number; height: number },
  dx = 0,
  dy = 0,
): { x: number; y: number } {
  const a = (align ?? 'TOP_LEFT').toUpperCase();
  let x = 0;
  let y = 0;
  switch (a) {
    case 'TOP_LEFT':
      x = 0;
      y = 0;
      break;
    case 'TOP_MID':
      x = (parent.width - child.width) / 2;
      y = 0;
      break;
    case 'TOP_RIGHT':
      x = parent.width - child.width;
      y = 0;
      break;
    case 'BOTTOM_LEFT':
      x = 0;
      y = parent.height - child.height;
      break;
    case 'BOTTOM_MID':
      x = (parent.width - child.width) / 2;
      y = parent.height - child.height;
      break;
    case 'BOTTOM_RIGHT':
      x = parent.width - child.width;
      y = parent.height - child.height;
      break;
    case 'LEFT_MID':
      x = 0;
      y = (parent.height - child.height) / 2;
      break;
    case 'RIGHT_MID':
      x = parent.width - child.width;
      y = (parent.height - child.height) / 2;
      break;
    case 'CENTER':
      x = (parent.width - child.width) / 2;
      y = (parent.height - child.height) / 2;
      break;
    default:
      x = 0;
      y = 0;
      break;
  }
  return { x: x + dx, y: y + dy };
}
