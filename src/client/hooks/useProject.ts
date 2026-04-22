import { useCallback, useEffect, useState } from 'react';
import { fetchProject } from '../api';
import type { EsphomeProject } from '../../parser/types';
import { useHmrReload } from './useHmrReload';

export function useProject(name: string | undefined): {
  data: EsphomeProject | null;
  error: string | null;
  loading: boolean;
} {
  const [data, setData] = useState<EsphomeProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    if (!name) { setData(null); setError(null); return; }
    setLoading(true);
    fetchProject(name)
      .then((d) => { setData(d); setError(null); })
      .catch((e: Error) => { setData(null); setError(e.message); })
      .finally(() => setLoading(false));
  }, [name]);

  useEffect(() => { refetch(); }, [refetch]);
  useHmrReload(refetch);

  return { data, error, loading };
}
