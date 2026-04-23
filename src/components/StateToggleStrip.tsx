import type { LvglWidget } from '../parser/types';
import type { WidgetState } from '../editor/store';
import { STATE_KEYS } from '../editor/schema/common';

interface Props {
  widget: LvglWidget;
  activeState: WidgetState;
  onChange: (next: WidgetState) => void;
}

/**
 * Chromium DevTools–style pill strip for forcing the selected widget into a
 * specific LVGL state. Single-select: clicking an inactive pill activates it,
 * clicking the active pill returns to default.
 *
 * A small dot marks pills whose corresponding YAML block actually defines
 * overrides on this widget — so the user sees at a glance which states are
 * "wired up" without having to scroll the panel.
 */
export function StateToggleStrip({ widget, activeState, onChange }: Props) {
  return (
    <div className="state-strip" role="group" aria-label="Force widget state">
      {STATE_KEYS.map((state) => {
        const defined = hasStateBlock(widget, state);
        const active = activeState === state;
        return (
          <button
            key={state}
            type="button"
            className={[
              'state-strip__pill',
              active ? 'state-strip__pill--active' : '',
              defined ? '' : 'state-strip__pill--empty',
            ].join(' ').trim()}
            aria-pressed={active}
            title={
              defined
                ? `Force :${state}`
                : `Force :${state} (no overrides defined — preview matches default)`
            }
            onClick={() => onChange(active ? 'default' : state)}
          >
            <span className="state-strip__pseudo">:</span>
            {state}
            {defined && <span className="state-strip__dot" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

function hasStateBlock(widget: LvglWidget, key: string): boolean {
  const v = widget.props[key];
  return (
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v as Record<string, unknown>).length > 0
  );
}
