import { useState } from 'react';
import {
  UploadIcon, XIcon, CheckCircle, AlertTriangleIcon,
  LoaderIcon, ChevronUpIcon, ChevronDownIcon, FileIcon, FileTextIcon,
} from 'lucide-react';
import { useUploadProgress } from '../../context/UploadProgressContext';
import type { UploadJob, AnalysisPhase } from '../../types';

const PHASE_LABELS: Record<AnalysisPhase, string> = {
  queued:      'Queued...',
  extracting:  'Extracting clauses...',
  storing:     'Storing clauses...',
  embedding:   'Generating embeddings...',
  analyzing:   'Analyzing clauses...',
  completed:   'Complete',
  failed:      'Failed',
};

function getOverallProgress(job: UploadJob): number {
  if (job.stage === 'completed') return 100;
  if (job.stage === 'failed') return 100;

  if (job.type === 'contract') {
    // Upload POST is now instant — use backend progress directly
    if (job.stage === 'uploading') return 0;
    return job.analysisProgress;
  }

  // template: uploading = 0-80%, processing = 80-100%
  if (job.stage === 'uploading') return Math.round(job.uploadProgress * 0.8);
  if (job.stage === 'processing') return 90;
  return 0;
}

function getStageLabel(job: UploadJob): string {
  if (job.stage === 'completed') return 'Complete';
  if (job.stage === 'failed') return job.errorMessage || 'Failed';

  // Contract uploads: use phase-based labels from backend
  if (job.type === 'contract' && job.phase) {
    return PHASE_LABELS[job.phase] || job.phase;
  }

  switch (job.stage) {
    case 'uploading': return 'Uploading...';
    case 'parsing': return 'Parsing document...';
    case 'analyzing': return `Analyzing... ${job.analysisProgress}%`;
    case 'processing': return 'Processing...';
    default: return '';
  }
}

function getStageDetail(job: UploadJob): string | null {
  if (job.type === 'contract' && job.currentStep && job.stage === 'analyzing') {
    return job.currentStep;
  }
  return null;
}

function getProgressBarColor(stage: UploadJob['stage']): string {
  if (stage === 'completed') return 'bg-green-500';
  if (stage === 'failed') return 'bg-red-500';
  return 'bg-blue-600';
}

function JobRow({ job, onDismiss }: { job: UploadJob; onDismiss: () => void }) {
  const progress = getOverallProgress(job);
  const label = getStageLabel(job);
  const detail = getStageDetail(job);
  const barColor = getProgressBarColor(job.stage);
  const isTerminal = job.stage === 'completed' || job.stage === 'failed';

  return (
    <div className="px-3 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {job.stage === 'completed' && <CheckCircle size={14} className="text-green-500 shrink-0" />}
          {job.stage === 'failed' && <AlertTriangleIcon size={14} className="text-red-500 shrink-0" />}
          {!isTerminal && <LoaderIcon size={14} className="animate-spin text-blue-500 shrink-0" />}

          {job.type === 'contract'
            ? <FileIcon size={14} className="text-gray-400 shrink-0" />
            : <FileTextIcon size={14} className="text-gray-400 shrink-0" />
          }
          <span className="text-sm font-medium text-gray-800 dark:text-white truncate">
            {job.name}
          </span>
        </div>
        {isTerminal && (
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2 shrink-0"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs truncate ${
          job.stage === 'completed' ? 'text-green-600 dark:text-green-400 font-medium' :
          job.stage === 'failed' ? 'text-red-600 dark:text-red-400' :
          'text-gray-500 dark:text-gray-400'
        }`}>
          {label}
        </span>
        {!isTerminal && (
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400 ml-2 shrink-0">
            {progress}%
          </span>
        )}
      </div>

      {detail && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mb-1">
          {detail}
        </p>
      )}

      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function UploadProgressFloat() {
  const { jobs, dismissJob, clearCompleted, hasActiveJobs } = useUploadProgress();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const visibleJobs = jobs.filter(j => !j.dismissed);
  if (visibleJobs.length === 0) return null;

  const activeCount = visibleJobs.filter(j =>
    j.stage === 'uploading' || j.stage === 'analyzing' || j.stage === 'parsing' || j.stage === 'processing'
  ).length;
  const completedCount = visibleJobs.filter(j => j.stage === 'completed' || j.stage === 'failed').length;

  return (
    <>
      <div className="fixed bottom-6 left-6 z-[9998] w-80 shadow-xl rounded-lg overflow-hidden animate-[slideInUp_0.3s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800 dark:bg-gray-900 text-white border-b border-gray-700">
          <div className="flex items-center gap-2">
            <UploadIcon size={16} />
            <span className="text-sm font-medium">
              Uploads{hasActiveJobs ? ` (${activeCount} active)` : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {completedCount > 0 && (
              <button
                onClick={clearCompleted}
                className="text-gray-400 hover:text-white transition-colors p-0.5"
                title="Clear completed"
              >
                <XIcon size={14} />
              </button>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-gray-400 hover:text-white transition-colors p-0.5"
            >
              {isCollapsed ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
            </button>
          </div>
        </div>

        {/* Job list */}
        {!isCollapsed && (
          <div className="bg-white dark:bg-gray-800 max-h-80 overflow-y-auto">
            {visibleJobs.map(job => (
              <JobRow key={job.id} job={job} onDismiss={() => dismissJob(job.id)} />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
