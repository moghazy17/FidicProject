import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { contractService, analysisService, templateService } from '../services';
import type { UploadJob, UploadStage, Template } from '../types';
import { UploadProgressFloat } from '../components/ui/UploadProgressFloat';

interface ContractUploadParams {
  file: File;
  name: string;
  templateId: number;
  pageStart?: number;
  pageEnd?: number;
  onComplete?: (contractId: number) => void;
}

interface TemplateUploadParams {
  file: File;
  name: string;
  fidicBook: string;
  editionYear: number;
  pageStart?: number;
  pageEnd?: number;
  onComplete?: (template: Template) => void;
}

interface UploadProgressContextType {
  jobs: UploadJob[];
  addContractUpload: (params: ContractUploadParams) => string;
  addTemplateUpload: (params: TemplateUploadParams) => string;
  dismissJob: (jobId: string) => void;
  clearCompleted: () => void;
  hasActiveJobs: boolean;
}

const UploadProgressContext = createContext<UploadProgressContextType | undefined>(undefined);

export const useUploadProgress = () => {
  const context = useContext(UploadProgressContext);
  if (!context) {
    throw new Error('useUploadProgress must be used within an UploadProgressProvider');
  }
  return context;
};

export const UploadProgressProvider = ({ children }: { children: ReactNode }) => {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const onCompleteCallbacksRef = useRef<Map<string, (arg: number | Template) => void>>(new Map());

  const updateJob = useCallback((id: string, patch: Partial<UploadJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j));
  }, []);

  const createJob = useCallback((type: UploadJob['type'], name: string): UploadJob => ({
    id: crypto.randomUUID(),
    type,
    name,
    stage: 'uploading' as UploadStage,
    uploadProgress: 0,
    analysisProgress: 0,
    analysisJobId: null,
    contractId: null,
    templateId: null,
    errorMessage: null,
    createdAt: Date.now(),
    dismissed: false,
    phase: null,
    currentStep: null,
  }), []);

  const addContractUpload = useCallback(({ file, name, templateId, pageStart, pageEnd, onComplete }: ContractUploadParams) => {
    const job = createJob('contract', name);
    setJobs(prev => [...prev, job]);

    if (onComplete) {
      onCompleteCallbacksRef.current.set(job.id, onComplete as (arg: number | Template) => void);
    }

    (async () => {
      try {
        const result = await contractService.uploadContract(
          file, name, templateId, pageStart, pageEnd,
          (progress) => updateJob(job.id, { uploadProgress: progress })
        );

        updateJob(job.id, {
          stage: 'analyzing',
          uploadProgress: 100,
          analysisJobId: result.analysis_job_id,
          contractId: result.contract_id,
        });
      } catch (err) {
        updateJob(job.id, {
          stage: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Upload failed',
        });
      }
    })();

    return job.id;
  }, [createJob, updateJob]);

  const addTemplateUpload = useCallback(({ file, name, fidicBook, editionYear, pageStart, pageEnd, onComplete }: TemplateUploadParams) => {
    const job = createJob('template', name);
    setJobs(prev => [...prev, job]);

    if (onComplete) {
      onCompleteCallbacksRef.current.set(job.id, onComplete as (arg: number | Template) => void);
    }

    (async () => {
      try {
        const template = await templateService.uploadTemplate(
          file, name, fidicBook, editionYear, pageStart, pageEnd,
          (progress) => updateJob(job.id, { uploadProgress: progress })
        );

        updateJob(job.id, {
          stage: 'processing',
          uploadProgress: 100,
          templateId: template.id,
        });

        // Template upload is synchronous on the backend (returns template data).
        // Embedding generation happens in background with no tracking endpoint.
        // Brief delay to show processing state, then mark complete.
        setTimeout(() => {
          updateJob(job.id, { stage: 'completed' });
          const cb = onCompleteCallbacksRef.current.get(job.id);
          if (cb) {
            cb(template);
            onCompleteCallbacksRef.current.delete(job.id);
          }
        }, 500);
      } catch (err) {
        updateJob(job.id, {
          stage: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Upload failed',
        });
      }
    })();

    return job.id;
  }, [createJob, updateJob]);

  // Poll active analysis jobs
  useEffect(() => {
    const analyzingJobs = jobs.filter(j => j.stage === 'analyzing' && j.analysisJobId);
    if (analyzingJobs.length === 0) return;

    const poll = async () => {
      for (const job of analyzingJobs) {
        if (!job.analysisJobId) continue;
        try {
          const status = await analysisService.getJobStatus(job.analysisJobId);

          if (status.status === 'completed') {
            updateJob(job.id, {
              stage: 'completed',
              analysisProgress: 100,
              phase: 'completed',
              currentStep: null,
            });
            const cb = onCompleteCallbacksRef.current.get(job.id);
            if (cb && job.contractId) {
              cb(job.contractId);
              onCompleteCallbacksRef.current.delete(job.id);
            }
          } else if (status.status === 'failed') {
            updateJob(job.id, {
              stage: 'failed',
              phase: 'failed',
              errorMessage: status.error_message || 'Analysis failed',
            });
          } else {
            updateJob(job.id, {
              analysisProgress: status.progress,
              phase: status.phase,
              currentStep: status.current_step,
            });
          }
        } catch {
          // Ignore individual polling errors
        }
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [jobs, updateJob]);

  const dismissJob = useCallback((jobId: string) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, dismissed: true } : j));
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs(prev => prev.filter(j => j.stage !== 'completed' && j.stage !== 'failed'));
  }, []);

  const hasActiveJobs = jobs.some(j =>
    j.stage === 'uploading' || j.stage === 'analyzing' || j.stage === 'parsing' || j.stage === 'processing'
  );

  return (
    <UploadProgressContext.Provider value={{ jobs, addContractUpload, addTemplateUpload, dismissJob, clearCompleted, hasActiveJobs }}>
      {children}
      <UploadProgressFloat />
    </UploadProgressContext.Provider>
  );
};
