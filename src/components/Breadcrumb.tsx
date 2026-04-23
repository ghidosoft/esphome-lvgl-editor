import type { EsphomeProject, WidgetId } from '../parser/types';
import { findAncestorChain } from '../editor/widgetTree';
import { useEditorStore } from '../editor/store';

interface Props {
  project: EsphomeProject;
  widgetId: WidgetId;
}

/**
 * Page-to-widget path shown above the property panel. Each segment selects the
 * corresponding ancestor — useful when the selected widget tightly wraps its
 * parent (e.g. SIZE_CONTENT card around a label) and a click on the canvas can
 * only reach the innermost one.
 */
export function Breadcrumb({ project, widgetId }: Props) {
  const setSelected = useEditorStore((s) => s.setSelected);
  const chain = findAncestorChain(project, widgetId);
  if (chain.length === 0) return null;

  return (
    <nav className="breadcrumb" aria-label="widget ancestry">
      {chain.map((entry, i) => {
        const isLast = i === chain.length - 1;
        const isPage = entry.id == null;
        return (
          <span key={`${entry.id ?? 'page'}-${i}`} className="breadcrumb__row">
            {i > 0 && <span className="breadcrumb__sep" aria-hidden>›</span>}
            <button
              type="button"
              className={
                'breadcrumb__seg' +
                (isLast ? ' breadcrumb__seg--current' : '') +
                (isPage ? ' breadcrumb__seg--page' : '')
              }
              disabled={isLast || isPage}
              onClick={() => entry.id && setSelected(entry.id)}
              title={isPage ? 'page root — not a widget' : entry.label}
            >
              {entry.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
