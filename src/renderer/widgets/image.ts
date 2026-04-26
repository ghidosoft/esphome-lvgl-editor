import type { ImageSpec, LvglWidget } from '../../parser/types';
import { renderPlaceholder } from './placeholder';
import { resolveProp } from '../styles';
import { contentBox } from '../boxes';
import type { Box, RenderContext } from '../context';

/**
 * Draw an image inside its box. The `src` field in ESPHome refers to an
 * `image:` id (compiled into firmware). We don't have access to those bytes,
 * so for now we resolve to the original `file:` URL from the project's
 * `image:` block — works for the radar tile that points to a CartoDB URL.
 *
 * Lambda sources or local files we can't fetch fall back to a placeholder.
 */
const cache = new Map<string, HTMLImageElement>();

export function renderImage(w: LvglWidget, box: Box, ctx: RenderContext): Box {
  const styles = ctx.project.styles;
  const src = resolveProp(w, 'src', styles);
  const url = resolveImageUrl(src, ctx.project.images);
  if (!url) return renderPlaceholder(w, box, ctx);

  // Padding insets the bitmap from the widget's outer box, the same as in
  // LVGL — background/border (if any) still cover the full box.
  const inner = contentBox(box, w, styles, ctx.theme);

  let img = cache.get(url);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.addEventListener('load', () => ctx.requestRepaint());
    img.addEventListener('error', () => ctx.requestRepaint());
    cache.set(url, img);
  }
  if (img.complete && img.naturalWidth > 0) {
    ctx.ctx.drawImage(img, inner.x, inner.y, inner.width, inner.height);
  } else {
    // Loading: show muted placeholder rectangle.
    const c = ctx.ctx;
    c.save();
    c.fillStyle = 'rgba(255,255,255,0.04)';
    c.fillRect(inner.x, inner.y, inner.width, inner.height);
    c.restore();
  }
  return box;
}

function resolveImageUrl(src: unknown, images: Record<string, ImageSpec>): string | undefined {
  if (typeof src !== 'string') return undefined;
  if (isHttpUrl(src)) return src;
  const spec = images[src];
  if (spec && isHttpUrl(spec.file)) return spec.file;
  // Unknown id or local path — deferred until /__lvgl/asset/ exists.
  return undefined;
}

function isHttpUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://');
}
