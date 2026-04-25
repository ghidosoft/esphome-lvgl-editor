import { useEffect } from 'react';

/**
 * Subscribe to YAML file-change notifications coming from the server.
 *
 * In Vite dev mode, the LVGL plugin pushes a `lvgl:changed` event over the
 * Vite HMR WebSocket. In a production build (i.e. the published `npx`
 * server), `import.meta.hot` is undefined and we fall back to the SSE
 * stream exposed by the same router at `/__lvgl/events`.
 *
 * The callback fires once per event — invoke it to refetch whatever this
 * view depends on.
 */
export function useHmrReload(onChange: () => void): void {
  useEffect(() => {
    if (import.meta.hot) {
      const handler = () => onChange();
      import.meta.hot.on('lvgl:changed', handler);
      return () => {
        import.meta.hot?.off('lvgl:changed', handler);
      };
    }

    const es = new EventSource('/__lvgl/events');
    const handler = () => onChange();
    es.addEventListener('lvgl:changed', handler);
    return () => {
      es.removeEventListener('lvgl:changed', handler);
      es.close();
    };
  }, [onChange]);
}
