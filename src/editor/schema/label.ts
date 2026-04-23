import type { PropertySchema } from './index';

/** Label-specific props (prepended by the common schema). */
export const LABEL_SCHEMA: PropertySchema = [
  { key: 'text', kind: 'string' },
  { key: 'text_color', kind: 'color' },
  {
    key: 'text_align',
    kind: 'enum',
    enum: ['LEFT', 'CENTER', 'RIGHT', 'AUTO'],
  },
];
