import type { ReactNode } from 'react';

interface Props {
  label: string;
  children: ReactNode;
}

/**
 * Generic collapsible-section container for related properties. Phase 1 keeps
 * it always-open to match the existing nested part-selector layout (slider's
 * `indicator`/`knob`); Phase 2 will add open-state persistence and a modified
 * count chip.
 */
export function PropertyGroup({ label, children }: Props) {
  return (
    <div className="prop-group">
      <div className="prop-group__header">{label}</div>
      <div className="prop-group__rows">{children}</div>
    </div>
  );
}
