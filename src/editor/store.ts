import { create } from 'zustand';
import type { WidgetId } from '../parser/types';
import type { HitEntry } from '../renderer/CanvasStage';

/**
 * Editor state shared by canvas, overlay, and side-panels. Kept deliberately
 * small; mutation/overrides come in P3. For now only selection + hit-list
 * (emitted by the CanvasStage after each paint).
 */
interface EditorState {
  selectedWidgetId: WidgetId | null;
  hitList: HitEntry[];
  setSelected: (id: WidgetId | null) => void;
  setHitList: (list: HitEntry[]) => void;
  /** Which tab of the right-side EditorPanel is active. */
  activeTab: 'properties' | 'variables';
  setActiveTab: (tab: 'properties' | 'variables') => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedWidgetId: null,
  hitList: [],
  setSelected: (id) => set({ selectedWidgetId: id }),
  setHitList: (list) => set({ hitList: list }),
  activeTab: 'properties',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));

/**
 * Returns the topmost (deepest) widget whose box contains the point, or null.
 * "Deepest" assumes the hit list was produced by paint order (root first);
 * scanning in reverse finds the child painted last, which visually sits on top.
 */
export function hitTest(hits: HitEntry[], x: number, y: number): HitEntry | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (x >= h.box.x && x < h.box.x + h.box.width && y >= h.box.y && y < h.box.y + h.box.height) {
      return h;
    }
  }
  return null;
}
