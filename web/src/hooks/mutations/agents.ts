import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { EnrollmentCode } from "../../api/types";
import { queryKeys } from "../queries/keys";

export function useRenameAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/api/agents/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
}

export function useRevokeAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/agents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
}

export function useCreateEnrollmentCode() {
  return useMutation({
    mutationFn: () => api.post<EnrollmentCode>("/api/enrollment-codes"),
  });
}
