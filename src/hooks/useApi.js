import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api';

/**
 * Common query hooks for API endpoints
 */

// Providers
export function useProviders() {
  return useQuery({
    queryKey: ['providers', 'configured'],
    queryFn: () => api.listConfiguredProviders(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useProviderCatalog() {
  return useQuery({
    queryKey: ['providers', 'catalog'],
    queryFn: () => api.listProviderCatalog(),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useAddProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.addProvider(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers', 'configured'] });
    },
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, payload }) => api.updateProvider(providerId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers', 'configured'] });
    },
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId) => api.deleteProvider(providerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers', 'configured'] });
    },
  });
}

// Agents
export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => api.listAgents(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.createAgent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, payload }) => api.updateAgent(agentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId) => api.deleteAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

// Workflows
export function useWorkflowPresets() {
  return useQuery({
    queryKey: ['workflows', 'presets'],
    queryFn: () => api.listWorkflowPresets(),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useWorkflows() {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: () => api.listWorkflows(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.createWorkflow(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, payload }) => api.updateWorkflow(workflowId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workflowId) => api.deleteWorkflow(workflowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export function useCreateWorkflowFromPreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (presetId) => api.createWorkflowFromPreset(presetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export function useGenerateWorkflowDraft() {
  return useMutation({
    mutationFn: (payload) => api.generateConfigurationDraft(payload),
  });
}

// Runs
export function useRuns(limit = 50) {
  return useQuery({
    queryKey: ['runs', limit],
    queryFn: () => api.listRuns(limit),
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: (query) => query.state.data?.runs?.some(
      (run) => !['done', 'failed', 'cancelled'].includes(run.status),
    ) ? 2000 : false,
  });
}

export function useRun(runId) {
  return useQuery({
    queryKey: ['runs', runId],
    queryFn: () => api.getRun(runId),
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return !runId || ['done', 'failed', 'cancelled'].includes(status) ? false : 2000;
    },
  });
}

export function useRunAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, input, endUserId, sessionId }) => 
      api.runAgent(agentId, input, endUserId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}

// Tools
export function useCustomTools() {
  return useQuery({
    queryKey: ['tools', 'custom'],
    queryFn: () => api.listCustomTools(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useBuiltinTools() {
  return useQuery({
    queryKey: ['tools', 'builtin'],
    queryFn: () => api.listBuiltinTools(),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useCreateCustomTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.createCustomTool(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools', 'custom'] });
    },
  });
}

export function useUpdateCustomTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ toolId, payload }) => api.updateCustomTool(toolId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools', 'custom'] });
    },
  });
}

export function useDeleteCustomTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (toolId) => api.deleteCustomTool(toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools', 'custom'] });
    },
  });
}

export function useTestCustomTool() {
  return useMutation({
    mutationFn: (payload) => api.testCustomTool(payload),
  });
}

// Knowledge Bases
export function useKnowledgeBases() {
  return useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: () => api.listKnowledgeBases(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useCreateKnowledgeBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.createKnowledgeBase(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
    },
  });
}

export function useUpdateKnowledgeBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kbId, payload }) => api.updateKnowledgeBase(kbId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
    },
  });
}

export function useDeleteKnowledgeBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kbId) => api.deleteKnowledgeBase(kbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
    },
  });
}

// API Keys
export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.createApiKey(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });
}

export function useApiKeys() {
  return useQuery({
    queryKey: ['apiKeys'],
    queryFn: () => api.listApiKeys(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
