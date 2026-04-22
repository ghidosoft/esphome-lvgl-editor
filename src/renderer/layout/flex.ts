import type { FlexLayoutSpec, LvglWidget } from '../../parser/types';

export interface FlexSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Lay children out along main axis with `pad_row`/`pad_column` as gap.
 * Each child must declare its own width/height — we don't support
 * content-sized children here (good enough for the current YAML).
 *
 * Cross axis: children are centered.
 *
 * `flex_align_main` understood values: START (default), CENTER, END,
 * SPACE_BETWEEN, SPACE_EVENLY, SPACE_AROUND.
 */
export function layoutFlex(
  spec: FlexLayoutSpec,
  parentInner: { width: number; height: number },
  children: LvglWidget[],
): FlexSlot[] {
  const isRow = spec.flow.startsWith('ROW');
  const mainTotal = isRow ? parentInner.width : parentInner.height;
  const crossTotal = isRow ? parentInner.height : parentInner.width;
  const gap = (isRow ? spec.pad_column : spec.pad_row) ?? 0;

  const sizes = children.map((c) => ({
    main: numProp(isRow ? c.props.width : c.props.height, 0),
    cross: numProp(isRow ? c.props.height : c.props.width, 0),
  }));
  const sumMain = sizes.reduce((a, b) => a + b.main, 0);
  const totalGap = gap * Math.max(0, children.length - 1);
  const free = Math.max(0, mainTotal - sumMain - totalGap);

  let mainStart = 0;
  let extraGap = 0;
  switch ((spec.flex_align_main ?? 'START').toUpperCase()) {
    case 'CENTER':
      mainStart = free / 2; break;
    case 'END':
      mainStart = free; break;
    case 'SPACE_BETWEEN':
      extraGap = children.length > 1 ? free / (children.length - 1) : 0; break;
    case 'SPACE_EVENLY':
      extraGap = free / (children.length + 1); mainStart = extraGap; break;
    case 'SPACE_AROUND':
      extraGap = free / children.length; mainStart = extraGap / 2; break;
    case 'START':
    default:
      mainStart = 0; break;
  }

  const slots: FlexSlot[] = [];
  let cursor = mainStart;
  for (let i = 0; i < children.length; i++) {
    const s = sizes[i];
    const crossOffset = (crossTotal - s.cross) / 2;
    if (isRow) {
      slots.push({ x: cursor, y: crossOffset, width: s.main, height: s.cross });
    } else {
      slots.push({ x: crossOffset, y: cursor, width: s.cross, height: s.main });
    }
    cursor += s.main + gap + extraGap;
  }
  return slots;
}

function numProp(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}
