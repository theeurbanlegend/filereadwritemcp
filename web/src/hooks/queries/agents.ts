import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { AgentList } from '../../api/types';
import { queryKeys } from './keys';

export function useAgents({ fastPoll = false } = {}) {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => api.get<AgentList>('/api/agents'),
    refetchInterval: fastPoll ? 5000 : 30000,
  });
}
