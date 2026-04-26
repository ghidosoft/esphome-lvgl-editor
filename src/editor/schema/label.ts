import type { PropertySchema } from './index';

/**
 * Label-specific props. `text_color` / `text_opa` come from COMMON_SCHEMA so
 * any widget (e.g. a button cascading to a child label) can style them.
 */
export const LABEL_SCHEMA: PropertySchema = [
  { key: 'text', kind: 'string' },
  {
    key: 'text_align',
    kind: 'enum',
    enum: ['LEFT', 'CENTER', 'RIGHT', 'AUTO'],
  },
];
