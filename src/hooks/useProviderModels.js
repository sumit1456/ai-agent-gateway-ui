import { useQuery } from '@tanstack/react-query';
import { fetchProviderModels, getToken } from '../api';

function authCacheScope() {
  // Keep one user's provider catalog from being reused after an account switch,
  // without placing the API key itself in the query key.
  const token = getToken() || '';
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function useProviderModels(providerId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['provider-models', authCacheScope(), providerId],
    queryFn: async () => {
      const result = await fetchProviderModels(providerId);
      return Array.from(new Set((result.models || []).filter((model) => typeof model === 'string' && model)));
    },
    enabled: Boolean(providerId && getToken() && enabled),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}
