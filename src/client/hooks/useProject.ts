import { useQuery } from '@tanstack/react-query';
import { fetchProject } from '../api';
import type { EsphomeProject } from '../../parser/types';

export function useProject(name: string | undefined): {
  data: EsphomeProject | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: ['lvgl', 'project', name],
    queryFn: () => fetchProject(name!),
    enabled: !!name,
  });

  return {
    data: query.data ?? null,
    error: query.error ? query.error.message : null,
    loading: !!name && query.isPending,
    refetch: () => void query.refetch(),
  };
}
