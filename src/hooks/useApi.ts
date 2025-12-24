import { useState, useCallback } from 'react';
import { ApiResponse } from '@/services/api';

interface UseApiState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

interface UseApiReturn<T, Args extends any[]> extends UseApiState<T> {
  execute: (...args: Args) => Promise<ApiResponse<T>>;
  reset: () => void;
}

export function useApi<T, Args extends any[]>(
  apiFunction: (...args: Args) => Promise<ApiResponse<T>>
): UseApiReturn<T, Args> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: Args): Promise<ApiResponse<T>> => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await apiFunction(...args);

        if (response.success) {
          setState({
            data: response.data || null,
            isLoading: false,
            error: null,
          });
        } else {
          setState({
            data: null,
            isLoading: false,
            error: response.error || 'Une erreur est survenue',
          });
        }

        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue';
        setState({
          data: null,
          isLoading: false,
          error: errorMessage,
        });
        return { success: false, error: errorMessage };
      }
    },
    [apiFunction]
  );

  const reset = useCallback(() => {
    setState({
      data: null,
      isLoading: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

export default useApi;
