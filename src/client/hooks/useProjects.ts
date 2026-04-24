import { useCallback, useEffect, useState } from 'react';
import { fetchProjects } from '../api';
import type { ProjectListEntry } from '../../server/projectScanner';
import { useHmrReload } from './useHmrReload';

export function useProjects(): {
  data: ProjectListEntry[] | null;
  error: string | null;
  loading: boolean;
} {
  const [data, setData] = useState<ProjectListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchProjects()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // TODO: migrate to TanStack Query. `refetch()` calls `setLoading(true)`
    // synchronously, which is the cascading-render pattern the compiler flags.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
  }, [refetch]);
  useHmrReload(refetch);

  return { data, error, loading };
}
