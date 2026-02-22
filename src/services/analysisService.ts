import apiClient from './apiClient';
import type { AnalysisJob, JobStatus } from '../types';

export const analysisService = {
  async createJob(
    contractId: number,
    templateId: number
  ): Promise<AnalysisJob> {
    const response = await apiClient.post('/analysis/jobs', {
      contract_id: contractId,
      template_id: templateId,
    });
    return response.data;
  },

  async getJobStatus(jobId: string): Promise<AnalysisJob> {
    const response = await apiClient.get(`/analysis/jobs/${jobId}`);
    return response.data;
  },

  async getJobResult(jobId: string): Promise<unknown> {
    const response = await apiClient.get(`/analysis/jobs/${jobId}/result`);
    return response.data;
  },

  async listJobs(
    skip?: number,
    limit?: number,
    statusFilter?: JobStatus
  ): Promise<{ jobs: AnalysisJob[]; total: number }> {
    const params: Record<string, string | number> = {};
    if (skip !== undefined) params.skip = skip;
    if (limit !== undefined) params.limit = limit;
    if (statusFilter) params.status = statusFilter;

    const response = await apiClient.get('/analysis/jobs', { params });
    return response.data;
  },
};
