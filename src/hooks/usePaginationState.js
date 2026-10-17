import { useState, useCallback } from 'react';

const PAGINATION_STORAGE_PREFIX = 'agentgateway_pagination_';

/**
 * Persist and restore pagination state (page, limit, sorting) for a specific page
 * @param {string} pageKey - Unique identifier for the page (e.g., 'agents', 'workflows')
 * @param {object} defaults - Default values { page: 1, limit: 10, sortBy: 'name', sortOrder: 'asc' }
 * @returns {object} - { page, limit, sortBy, sortOrder, setPagination, reset }
 */
export function usePaginationState(pageKey, defaults = {}) {
  const storageKey = `${PAGINATION_STORAGE_PREFIX}${pageKey}`;
  
  const [state, setState] = useState(() => {
    // Try to load from session storage
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.warn(`Failed to parse pagination state for ${pageKey}`, e);
      }
    }
    
    // Fall back to defaults
    return {
      page: defaults.page ?? 1,
      limit: defaults.limit ?? 10,
      sortBy: defaults.sortBy ?? 'name',
      sortOrder: defaults.sortOrder ?? 'asc',
    };
  });

  const setPagination = useCallback((updates) => {
    setState((prev) => {
      const next = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates };
      // Persist to session storage
      window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  const reset = useCallback(() => {
    const defaultState = {
      page: defaults.page ?? 1,
      limit: defaults.limit ?? 10,
      sortBy: defaults.sortBy ?? 'name',
      sortOrder: defaults.sortOrder ?? 'asc',
    };
    window.sessionStorage.removeItem(storageKey);
    setState(defaultState);
  }, [storageKey, defaults]);

  return {
    ...state,
    setPagination,
    reset,
  };
}

/**
 * Persist and restore any key-value page state
 * @param {string} pageKey - Unique identifier for the page
 * @param {object} defaultState - Default state values
 * @returns {object} - { state, setState, reset }
 */
export function usePageState(pageKey, defaultState = {}) {
  const storageKey = `agentgateway_pagestate_${pageKey}`;

  const [state, setState] = useState(() => {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.warn(`Failed to parse page state for ${pageKey}`, e);
      }
    }
    return defaultState;
  });

  const setPageState = (updates) => {
    setState((prev) => {
      const next = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates };
      window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const reset = () => {
    window.sessionStorage.removeItem(storageKey);
    setState(defaultState);
  };

  return {
    state,
    setState: setPageState,
    reset,
  };
}
