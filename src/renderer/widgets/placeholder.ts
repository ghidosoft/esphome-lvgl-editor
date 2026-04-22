import type { LvglWidget } from '../../parser/types';
import type { Box, RenderContext } from '../context';

/**
 * Fallback for widget types we haven't implemented yet (or for sources we
 * can't render — !lambda, async_online_image, etc.). Draws a dashed outline
 * with a small diagnostic label so the user can see *where* the gap is.
 */
export function renderPlaceholder(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const c = ctx.ctx;
  c.save();
  c.setLineDash([4, 4]);
  c.strokeStyle = '#ff9f0a';
  c.fillStyle = 'rgba(255, 159, 10, 0.05)';
  c.lineWidth = 1;
  c.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
  c.fillRect(box.x, box.y, box.width, box.height);
  c.setLineDash([]);

  c.fillStyle = '#ff9f0a';
  c.font = '10px Montserrat, sans-serif';
  c.textBaseline = 'top';
  c.textAlign = 'left';
  const label = `⚠ ${w.type}`;
  c.fillText(label, box.x + 4, box.y + 4);
  c.restore();
  return box;
}
