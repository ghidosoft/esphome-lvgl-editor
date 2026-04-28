import type { FlexLayoutSpec } from '../../parser/types';

export interface FlexSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Lay children out along main axis with `pad_row`/`pad_column` as gap.
 *
 * `childSizes` are the already-resolved widths/heights of each child
 * (SIZE_CONTENT and percentages expanded by the caller). The engine treats
 * them as given.
 *
 * `flex_align_main` understood values: START (default), CENTER, END,
 * SPACE_BETWEEN, SPACE_EVENLY, SPACE_AROUND.
 * `flex_align_cross` understood values: START, CENTER (LVGL default), END.
 */
export function layoutFlex(
  spec: FlexLayoutSpec,
  parentInner: { width: number; height: number },
  childSizes: { width: number; height: number }[],
): FlexSlot[] {
  const isRow = spec.flow.startsWith('ROW');
  const mainTotal = isRow ? parentInner.width : parentInner.height;
  const crossTotal = isRow ? parentInner.height : parentInner.width;
  const gap = (isRow ? spec.pad_column : spec.pad_row) ?? 0;

  const sizes = childSizes.map((c) => ({
    main: isRow ? c.width : c.height,
    cross: isRow ? c.height : c.width,
  }));
  const sumMain = sizes.reduce((a, b) => a + b.main, 0);
  const totalGap = gap * Math.max(0, childSizes.length - 1);
  const free = Math.max(0, mainTotal - sumMain - totalGap);

  let mainStart = 0;
  let extraGap = 0;
  switch ((spec.flex_align_main ?? 'START').toUpperCase()) {
    case 'CENTER':
      mainStart = free / 2;
      break;
    case 'END':
      mainStart = free;
      break;
    case 'SPACE_BETWEEN':
      extraGap = childSizes.length > 1 ? free / (childSizes.length - 1) : 0;
      break;
    case 'SPACE_EVENLY':
      extraGap = free / (childSizes.length + 1);
      mainStart = extraGap;
      break;
    case 'SPACE_AROUND':
      extraGap = free / childSizes.length;
      mainStart = extraGap / 2;
      break;
    case 'START':
    default:
      mainStart = 0;
      break;
  }

  const crossAlign = (spec.flex_align_cross ?? 'CENTER').toUpperCase();
  const slots: FlexSlot[] = [];
  let cursor = mainStart;
  for (let i = 0; i < childSizes.length; i++) {
    const s = sizes[i];
    const crossOffset =
      crossAlign === 'START'
        ? 0
        : crossAlign === 'END'
          ? crossTotal - s.cross
          : (crossTotal - s.cross) / 2;
    if (isRow) {
      slots.push({ x: cursor, y: crossOffset, width: s.main, height: s.cross });
    } else {
      slots.push({ x: crossOffset, y: cursor, width: s.cross, height: s.main });
    }
    cursor += s.main + gap + extraGap;
  }
  return slots;
}

/**
 * Intrinsic content size for a flex container given its children's intrinsic
 * sizes. Sum on the main axis (plus gaps), max on the cross axis. Used by the
 * measure pass to resolve SIZE_CONTENT on the parent.
 */
export function measureFlexContent(
  spec: FlexLayoutSpec,
  childSizes: { width: number; height: number }[],
): { width: number; height: number } {
  if (childSizes.length === 0) return { width: 0, height: 0 };
  const isRow = spec.flow.startsWith('ROW');
  const gap = (isRow ? spec.pad_column : spec.pad_row) ?? 0;
  const gaps = gap * Math.max(0, childSizes.length - 1);
  let main = 0;
  let cross = 0;
  for (const c of childSizes) {
    const m = isRow ? c.width : c.height;
    const x = isRow ? c.height : c.width;
    main += m;
    cross = Math.max(cross, x);
  }
  main += gaps;
  return isRow ? { width: main, height: cross } : { width: cross, height: main };
}
