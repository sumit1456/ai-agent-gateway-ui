import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { login as loginApi, register as registerApi } from '../api';

const USER_STORAGE_KEY = 'agentgateway_user';

export function useAuthUser() {
  return useQuery({
    queryKey: ['auth', 'user'],
    queryFn: () => {
      // Check session storage on every query
      const stored = window.sessionStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error('Failed to parse session user', e);
          window.sessionStorage.removeItem(USER_STORAGE_KEY);
        }
      }
      return null;
    },
    staleTime: Infinity, // User data doesn't go stale until explicitly logged out
    gcTime: Infinity, // Keep in cache permanently
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ email, password }) => loginApi(email, password),
    onSuccess: (userData) => {
      // Save to session storage
      window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
      // Update query cache
      queryClient.setQueryData(['auth', 'user'], userData);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (credentials) => registerApi(credentials),
    onSuccess: (userData) => {
      // Save to session storage
      window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
      // Update query cache
      queryClient.setQueryData(['auth', 'user'], userData);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      // Clear session storage
      window.sessionStorage.removeItem(USER_STORAGE_KEY);
      // Invalidate all queries
      await queryClient.invalidateQueries();
    },
    onSuccess: () => {
      // Clear user from cache
      queryClient.setQueryData(['auth', 'user'], null);
    },
  });
}
