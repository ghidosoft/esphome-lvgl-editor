import { useQuery } from '@tanstack/react-query';
import { fetchProjects } from '../api';
import type { ProjectListEntry } from '../../server/projectScanner';

export function useProjects(): {
  data: ProjectListEntry[] | null;
  error: string | null;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ['lvgl', 'projects'],
    queryFn: fetchProjects,
  });

  return {
    data: query.data ?? null,
    error: query.error ? query.error.message : null,
    loading: query.isPending,
  };
}
