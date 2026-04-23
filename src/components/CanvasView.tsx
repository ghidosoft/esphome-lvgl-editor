import { useEffect, useRef } from 'react';
import { CanvasStage } from '../renderer/CanvasStage';
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

  useEffect(() => {
    const stage = new CanvasStage();
    stage.onHitList(setHitList);
    stageRef.current = stage;
    if (canvasRef.current) stage.attach(canvasRef.current);
    return () => { stage.detach(); stageRef.current = null; };
  }, [setHitList]);

  useEffect(() => {
    stageRef.current?.render(project, page, {
      activeState: activeState === 'default' ? undefined : activeState,
      activeStateWidgetId: selectedWidgetId ?? undefined,
    });
  }, [project, page, activeState, selectedWidgetId]);

  // Clear selection when the page changes (widget ids aren't guaranteed to
  // exist on the new page).
  useEffect(() => {
    setSelected(null);
  }, [page.id, setSelected]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Canvas is rendered at device-pixel size but CSS-scaled; convert click
    // coords from CSS-px back to device-px before hit-testing.
    const xScale = canvas.width / rect.width;
    const yScale = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * xScale;
    const y = (e.clientY - rect.top) * yScale;
    const hit = hitTest(stageRef.current?.getHitList() ?? [], x, y);
    setSelected(hit?.widgetId ?? null);
  };

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
