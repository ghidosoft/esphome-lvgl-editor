import { useEffect, useRef } from 'react';
import { CanvasStage, type HitEntry } from '../renderer/CanvasStage';
import type { EsphomeProject, LvglPage } from '../parser/types';
import { useEditorStore, hitTest } from '../editor/store';
import { SelectionOverlay } from './SelectionOverlay';

interface CanvasViewProps {
  project: EsphomeProject;
  page: LvglPage;
}

/**
 * Bridge between React (data, lifecycle) and the imperative CanvasStage
 * (canvas + render loop). The stage is created once and re-targeted whenever
 * project/page change. Canvas clicks are forwarded to the editor store via
 * hit-testing on the stage's latest hit list.
 */
export function CanvasView({ project, page }: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<CanvasStage | null>(null);
  const setHitList = useEditorStore((s) => s.setHitList);
  const setSelected = useEditorStore((s) => s.setSelected);
  const activeState = useEditorStore((s) => s.activeState);
  const selectedWidgetId = useEditorStore((s) => s.selectedWidgetId);
  const showHidden = useEditorStore((s) => s.showHidden);
  const scrollOffsets = useEditorStore((s) => s.scrollOffsets);
  const setScrollOffset = useEditorStore((s) => s.setScrollOffset);
  const clearScrollOffsets = useEditorStore((s) => s.clearScrollOffsets);

  useEffect(() => {
    const stage = new CanvasStage();
    stage.onHitList(setHitList);
    stageRef.current = stage;
    if (canvasRef.current) stage.attach(canvasRef.current);
    return () => {
      stage.detach();
      stageRef.current = null;
    };
  }, [setHitList]);

  useEffect(() => {
    stageRef.current?.render(project, page, {
      activeState: activeState === 'default' ? undefined : activeState,
      activeStateWidgetId: selectedWidgetId ?? undefined,
      showHidden,
      scrollOffsets,
    });
  }, [project, page, activeState, selectedWidgetId, showHidden, scrollOffsets]);

  // Clear selection + scroll positions when the page changes (widget ids aren't
  // guaranteed to exist on the new page, and scroll state is page-local).
  useEffect(() => {
    setSelected(null);
    clearScrollOffsets();
  }, [page.id, setSelected, clearScrollOffsets]);

  const toCanvasCoords = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    // Canvas is rendered at device-pixel size but CSS-scaled; convert click
    // coords from CSS-px back to device-px before hit-testing.
    const xScale = canvas.width / rect.width;
    const yScale = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * xScale,
      y: (e.clientY - rect.top) * yScale,
    };
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = toCanvasCoords(e);
    if (!pt) return;
    const hit = hitTest(stageRef.current?.getHitList() ?? [], pt.x, pt.y);
    setSelected(hit?.widgetId ?? null);
  };

  // Bind wheel through addEventListener with `passive: false` so we can call
  // preventDefault — React's synthetic onWheel attaches passively in modern
  // versions and a passive listener can't cancel page-level scroll.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      const pt = toCanvasCoords(e);
      if (!pt) return;
      const target = findScrollTarget(
        stageRef.current?.getHitList() ?? [],
        pt.x,
        pt.y,
        e.deltaX,
        e.deltaY,
      );
      if (!target) return;
      e.preventDefault();
      const { entry, dx, dy } = target;
      // Defensive: scroll info is only set when overflow exists — assert
      // before reading it so we don't compute against stale numbers.
      if (!entry.scroll) return;
      const maxX = Math.max(0, entry.scroll.contentWidth - entry.scroll.inner.width);
      const maxY = Math.max(0, entry.scroll.contentHeight - entry.scroll.inner.height);
      const nextX = Math.max(0, Math.min(maxX, entry.scroll.scrollX + dx));
      const nextY = Math.max(0, Math.min(maxY, entry.scroll.scrollY + dy));
      setScrollOffset(entry.widgetId, nextX, nextY);
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [setScrollOffset]);

  return (
    <div className="canvas-view-wrapper">
      <canvas
        ref={canvasRef}
        className="canvas-view"
        width={project.display.width}
        height={project.display.height}
        onClick={onClick}
      />
      <SelectionOverlay canvasRef={canvasRef} />
    </div>
  );
}

/**
 * Pick the topmost scrollable hit-entry under (x,y) that can absorb at least
 * part of the requested wheel delta. "Absorb" means: the entry's `scroll_dir`
 * permits the requested axis AND the current offset isn't already pinned at
 * the matching edge. If the deepest scrollable is at the edge, we bubble up
 * to its ancestors — same as native browser scroll chaining.
 *
 * Returns the entry plus the per-axis deltas filtered by `scroll_dir` (so a
 * `VER`-only container ignores horizontal wheel input even while it's the
 * topmost scrollable).
 */
function findScrollTarget(
  hits: HitEntry[],
  x: number,
  y: number,
  deltaX: number,
  deltaY: number,
): { entry: HitEntry; dx: number; dy: number } | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (!h.scroll) continue;
    if (x < h.box.x || x >= h.box.x + h.box.width) continue;
    if (y < h.box.y || y >= h.box.y + h.box.height) continue;
    const allowX = h.scroll.dir === 'HOR' || h.scroll.dir === 'ALL';
    const allowY = h.scroll.dir === 'VER' || h.scroll.dir === 'ALL';
    const dx = allowX ? deltaX : 0;
    const dy = allowY ? deltaY : 0;
    if (dx === 0 && dy === 0) continue;
    const maxX = Math.max(0, h.scroll.contentWidth - h.scroll.inner.width);
    const maxY = Math.max(0, h.scroll.contentHeight - h.scroll.inner.height);
    const canAbsorbX =
      dx !== 0 && ((dx < 0 && h.scroll.scrollX > 0) || (dx > 0 && h.scroll.scrollX < maxX));
    const canAbsorbY =
      dy !== 0 && ((dy < 0 && h.scroll.scrollY > 0) || (dy > 0 && h.scroll.scrollY < maxY));
    if (!canAbsorbX && !canAbsorbY) continue;
    return { entry: h, dx, dy };
  }
  return null;
}
