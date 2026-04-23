import { useEffect, useState, type RefObject } from 'react';
import { useEditorStore } from '../editor/store';

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * DOM overlay drawn on top of the canvas with the selected widget's outline.
 * Kept out of the canvas so the rendered image stays clean (useful for future
 * PNG export) and to avoid invalidating the paint cycle for a selection change.
 */
export function SelectionOverlay({ canvasRef }: Props) {
  const selectedWidgetId = useEditorStore((s) => s.selectedWidgetId);
  const hitList = useEditorStore((s) => s.hitList);
  const [scale, setScale] = useState({ x: 1, y: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setScale({ x: rect.width / canvas.width, y: rect.height / canvas.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [canvasRef]);

  if (!selectedWidgetId) return null;
  const entry = hitList.find((h) => h.widgetId === selectedWidgetId);
  if (!entry) return null;

  const { box } = entry;
  return (
    <div
      className="selection-overlay"
      style={{
        left: `${box.x * scale.x}px`,
        top: `${box.y * scale.y}px`,
        width: `${box.width * scale.x}px`,
        height: `${box.height * scale.y}px`,
      }}
    />
  );
}
