import { useState, useEffect, useRef, useCallback } from 'react';

interface UsePollingOptions<T> {
  fetcher: () => Promise<T>;
  interval?: number;
  shouldStop?: (data: T) => boolean;
  enabled?: boolean;
}

interface UsePollingResult<T> {
  data: T | null;
  error: Error | null;
  isPolling: boolean;
  startPolling: () => void;
  stopPolling: () => void;
}

export function usePolling<T>({
  fetcher,
  interval = 2000,
  shouldStop,
  enabled = false,
}: UsePollingOptions<T>): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetcherRef = useRef(fetcher);
  const shouldStopRef = useRef(shouldStop);

  fetcherRef.current = fetcher;
  shouldStopRef.current = shouldStop;

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const doFetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);

      if (shouldStopRef.current?.(result)) {
        stopPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    setIsPolling(true);
    setError(null);

    // Immediate first fetch
    doFetch();

    intervalRef.current = setInterval(doFetch, interval);
  }, [doFetch, interval, stopPolling]);

  useEffect(() => {
    if (enabled) {
      startPolling();
    }
    return () => stopPolling();
  }, [enabled, startPolling, stopPolling]);

  return { data, error, isPolling, startPolling, stopPolling };
}
