import { toText, useDraftCommit } from '../useDraftCommit';

interface SliderConfig {
  min: number;
  max: number;
  step?: number;
}

interface Props {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** When set, renders a range track alongside the numeric input. */
  slider?: SliderConfig;
}

export function NumericField({ value, onChange, disabled, min, max, step, unit, slider }: Props) {
  const { draft, setDraft, commit } = useDraftCommit(
    value,
    toText,
    (s) => (s === '' ? undefined : Number(s)),
    onChange,
  );

  const numeric = typeof value === 'number' ? value : Number(toText(value));
  const sliderValue = Number.isFinite(numeric) ? numeric : (slider?.min ?? 0);

  return (
    <div className="prop-input-group">
      {slider && (
        <input
          type="range"
          className="prop-input__range"
          value={sliderValue}
          disabled={disabled}
          min={slider.min}
          max={slider.max}
          step={slider.step ?? 1}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
      <input
        type="number"
        className="prop-input prop-input--number"
        value={draft}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {unit && <span className="prop-input__unit">{unit}</span>}
    </div>
  );
}
