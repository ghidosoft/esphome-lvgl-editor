import type { EsphomeProject, LvglPage, LvglWidget, WidgetId } from '../parser/types';

export interface AncestorEntry {
  widget: LvglWidget | null; // null for the page-level entry
  page: LvglPage;
  id: WidgetId | null;       // page root has no widgetId
  /** Human-friendly label shown in the breadcrumb. */
  label: string;
}

/**
 * Walk from the root page down to the widget with the given id, returning
 * every step including the page itself. Returns an empty array if the id
 * isn't found on any page.
 */
export function findAncestorChain(
  project: EsphomeProject,
  widgetId: WidgetId,
): AncestorEntry[] {
  for (const page of project.pages) {
    const chain: AncestorEntry[] = [{ widget: null, page, id: null, label: page.id }];
    if (walk(page.widgets, widgetId, chain, page)) return chain;
  }
  return [];
}

function walk(
  siblings: LvglWidget[],
  target: WidgetId,
  chain: AncestorEntry[],
  page: LvglPage,
): boolean {
  for (let i = 0; i < siblings.length; i++) {
    const w = siblings[i];
    chain.push({ widget: w, page, id: w.widgetId ?? null, label: labelFor(w, i) });
    if (w.widgetId === target) return true;
    if (walk(w.children, target, chain, page)) return true;
    chain.pop();
  }
  return false;
}

/**
 * Prefer the declared `id:` when present (it's the one handle ESPHome users
 * already know), otherwise fall back to the widget type plus its sibling
 * index so the segment still disambiguates.
 */
function labelFor(w: LvglWidget, index: number): string {
  const declaredId = typeof w.props.id === 'string' ? (w.props.id as string) : undefined;
  return declaredId ?? `${w.type}[${index}]`;
}
