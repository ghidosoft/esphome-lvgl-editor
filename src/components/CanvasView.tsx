import { useEffect, useRef } from 'react';
import { CanvasStage } from '../renderer/CanvasStage';
import type { EsphomeProject, LvglPage } from '../parser/types';

interface CanvasViewProps {
  project: EsphomeProject;
  page: LvglPage;
}

/**
 * Bridge between React (data, lifecycle) and the imperative CanvasStage
 * (canvas + render loop). The stage is created once and re-targeted whenever
 * project/page change.
 */
export function CanvasView({ project, page }: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<CanvasStage | null>(null);

  useEffect(() => {
    const stage = new CanvasStage();
    stageRef.current = stage;
    if (canvasRef.current) stage.attach(canvasRef.current);
    return () => { stage.detach(); stageRef.current = null; };
  }, []);

  useEffect(() => {
    stageRef.current?.render(project, page);
  }, [project, page]);

  return (
    <canvas
      ref={canvasRef}
      className="canvas-view"
      width={project.display.width}
      height={project.display.height}
    />
  );
}
