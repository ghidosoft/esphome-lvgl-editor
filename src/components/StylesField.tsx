import { useState } from 'react';
import type { EsphomeProject, PropSource } from '../parser/types';

interface Props {
  currentStyles: string[];
  availableStyles: string[];
  source?: PropSource;
  project: EsphomeProject;
  hasOverride: boolean;
  onChange: (styles: string[]) => void;
  onRevert: () => void;
}

/**
 * Chips UI for a widget's `styles:` list: one chip per currently applied
 * style, an "add" dropdown showing only styles not yet applied. Removing the
 * last chip sends an empty list (mutation.ts turns that into a YAML delete).
 */
export function StylesField({
  currentStyles,
  availableStyles,
  source,
  project,
  hasOverride,
  onChange,
  onRevert,
}: Props) {
  const [adding, setAdding] = useState(false);
  const addable = availableStyles.filter((id) => !currentStyles.includes(id));

  const remove = (id: string) => onChange(currentStyles.filter((x) => x !== id));
  const add = (id: string) => {
    if (!id || currentStyles.includes(id)) return;
    onChange([...currentStyles, id]);
    setAdding(false);
  };

  const sub = source?.viaVariable ? project.substitutions?.[source.viaVariable] : undefined;

  return (
    <div className={`prop-row prop-row--styles ${hasOverride ? 'prop-row--dirty' : ''}`}>
      <div className="prop-row__key">
        styles
        {hasOverride && <span className="prop-row__dirty-dot" title="unsaved change" />}
      </div>
      <div className="styles-field">
        {currentStyles.length === 0 && !adding && (
          <span className="styles-field__empty">— none</span>
        )}
        {currentStyles.map((id) => (
          <button
            type="button"
            key={id}
            className="styles-field__chip"
            title={project.styleSources?.[id] ? `Defined in ${shortFile(project.styleSources[id].self.file)}` : undefined}
            onClick={() => remove(id)}
          >
            {id}
            <span className="styles-field__chip-x">×</span>
          </button>
        ))}
        {addable.length > 0 && (
          adding ? (
            <select
              autoFocus
              className="prop-input styles-field__add-select"
              onChange={(e) => add(e.target.value)}
              onBlur={() => setAdding(false)}
              defaultValue=""
            >
              <option value="" disabled>pick a style…</option>
              {addable.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          ) : (
            <button type="button" className="styles-field__add" onClick={() => setAdding(true)}>
              + add
            </button>
          )
        )}
        {hasOverride && (
          <button type="button" className="prop-row__btn" title="Revert to source" onClick={onRevert}>
            ↺
          </button>
        )}
      </div>
      {source?.viaVariable && (
        <div className="prop-row__banner prop-row__banner--var">
          Bound to <code>${'{'}{source.viaVariable}{'}'}</code>
          {sub && (
            <>
              {' · '}edit affects {sub.usages.length} place{sub.usages.length === 1 ? '' : 's'}
            </>
          )}
        </div>
      )}
      {source && (
        <div className="prop-row__origin">
          from <code>{shortFile(source.file)}</code>
        </div>
      )}
    </div>
  );
}

function shortFile(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}
