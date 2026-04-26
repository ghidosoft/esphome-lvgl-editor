interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  modifiedOnly: boolean;
  onModifiedOnlyChange: (v: boolean) => void;
}

/**
 * Search + filter strip that sits above the schema-driven sections. Search
 * filters property labels (case-insensitive substring) and forces sections
 * with matches to expand. The "modified only" toggle hides untouched
 * properties so the user can quickly audit pending changes.
 */
export function InspectorHeader({
  query,
  onQueryChange,
  modifiedOnly,
  onModifiedOnlyChange,
}: Props) {
  return (
    <div className="inspector-header">
      <input
        type="search"
        className="inspector-header__search"
        placeholder="Filter properties…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <button
        type="button"
        className={
          'inspector-header__filter' + (modifiedOnly ? ' inspector-header__filter--on' : '')
        }
        onClick={() => onModifiedOnlyChange(!modifiedOnly)}
        title={modifiedOnly ? 'Show all properties' : 'Show only modified properties'}
        aria-pressed={modifiedOnly}
      >
        Modified
      </button>
    </div>
  );
}
