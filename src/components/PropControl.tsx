import type { SchemaEntry } from '../editor/schema';
import { BoolToggle } from './inspector/fields/BoolToggle';
import { ColorSwatch } from './inspector/fields/ColorSwatch';
import { EnumSelect } from './inspector/fields/EnumSelect';
import { NumericField } from './inspector/fields/NumericField';
import { SizeInput } from './inspector/fields/SizeInput';
import { StringInput } from './inspector/fields/StringInput';

interface Props {
  entry: SchemaEntry;
  value: unknown;
  onChange: (newValue: unknown) => void;
  disabled?: boolean;
}

/**
 * Dispatch to the right editor control for a schema entry. Each field
 * component owns its own draft/commit lifecycle via `useDraftCommit`.
 */
export function PropControl({ entry, value, onChange, disabled }: Props) {
  switch (entry.kind) {
    case 'string':
      return <StringInput value={value} onChange={onChange} disabled={disabled} />;
    case 'number':
      return (
        <NumericField
          value={value}
          onChange={onChange}
          disabled={disabled}
          min={entry.min}
          max={entry.max}
          unit={entry.unit}
        />
      );
    case 'size':
      return <SizeInput value={value} onChange={onChange} disabled={disabled} />;
    case 'color':
      return <ColorSwatch value={value} onChange={onChange} disabled={disabled} />;
    case 'enum':
    case 'align':
      return (
        <EnumSelect
          value={value}
          options={entry.enum ?? []}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'bool':
      return <BoolToggle value={value} onChange={onChange} disabled={disabled} />;
  }
}
