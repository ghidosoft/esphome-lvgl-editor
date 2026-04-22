import type { ReactNode } from 'react';

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
  return (
    <div
      className="device-frame"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <div className="device-frame__bezel">{children}</div>
      <div className="device-frame__caption">{width}×{height}</div>
    </div>
  );
}
