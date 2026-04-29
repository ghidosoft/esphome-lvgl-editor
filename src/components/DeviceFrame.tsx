import type { ReactNode } from 'react';
import { useEditorStore } from '../editor/store';

interface DeviceFrameProps {
  width: number;
  height: number;
  children: ReactNode;
}

/**
 * Visual frame around the canvas. The inner area matches the display's pixel
 * dimensions; CSS `max-width` shrinks it to fit the viewport while preserving
 * aspect ratio.
 */
export function DeviceFrame({ width, height, children }: DeviceFrameProps) {
  const showHidden = useEditorStore((s) => s.showHidden);
  const setShowHidden = useEditorStore((s) => s.setShowHidden);
  return (
    <div className="device-frame" style={{ aspectRatio: `${width} / ${height}` }}>
      <div className="device-frame__bezel">{children}</div>
      <div className="device-frame__caption">
        <span>
          {width}×{height}
        </span>
        <label className="device-frame__toggle">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Show hidden widgets
        </label>
      </div>
    </div>
  );
}
