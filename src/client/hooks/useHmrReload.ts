import { useEffect } from 'react';

/**
 * Subscribe to the custom 'lvgl:changed' event emitted by the Vite plugin
 * whenever a watched ESPHome YAML file changes on disk. The callback fires
 * once per event — invoke it to refetch whatever this view depends on.
 */
export function useHmrReload(onChange: () => void): void {
  useEffect(() => {
    if (!import.meta.hot) return;
    const handler = () => onChange();
    import.meta.hot.on('lvgl:changed', handler);
    return () => {
      import.meta.hot?.off('lvgl:changed', handler);
    };
  }, [onChange]);
}
