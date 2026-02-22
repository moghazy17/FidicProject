import { useState, useCallback } from 'react';

interface UseFileUploadResult {
  uploadProgress: number;
  isUploading: boolean;
  error: Error | null;
  upload: (fn: (onProgress: (progress: number) => void) => Promise<void>) => Promise<void>;
  reset: () => void;
}

export function useFileUpload(): UseFileUploadResult {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setUploadProgress(0);
    setIsUploading(false);
    setError(null);
  }, []);

  const upload = useCallback(
    async (fn: (onProgress: (progress: number) => void) => Promise<void>) => {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      try {
        await fn((progress: number) => {
          setUploadProgress(progress);
        });
        setUploadProgress(100);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  return { uploadProgress, isUploading, error, upload, reset };
}
