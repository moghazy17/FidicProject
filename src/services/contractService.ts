import apiClient from './apiClient';
import type { Contract, ContractDetail } from '../types';

export const contractService = {
  async getContracts(
    skip?: number,
    limit?: number
  ): Promise<{ contracts: Contract[]; total: number }> {
    const params: Record<string, number> = {};
    if (skip !== undefined) params.skip = skip;
    if (limit !== undefined) params.limit = limit;

    const response = await apiClient.get('/contracts', { params });
    return response.data;
  },

  async getContract(id: number): Promise<ContractDetail> {
    const response = await apiClient.get(`/contracts/${id}`);
    return response.data;
  },

  async uploadContract(
    file: File,
    name: string,
    templateId: number,
    pageStart?: number,
    pageEnd?: number,
    onProgress?: (progress: number) => void
  ): Promise<{ message: string; contract_id: number; analysis_job_id: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const params: Record<string, string | number> = {
      name,
      template_id: templateId,
    };
    if (pageStart !== undefined) params.page_start = pageStart;
    if (pageEnd !== undefined) params.page_end = pageEnd;

    const response = await apiClient.post('/contracts/upload', formData, {
      params,
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return response.data;
  },

  async deleteContract(id: number): Promise<void> {
    await apiClient.delete(`/contracts/${id}`);
  },

  async renameContract(id: number, name: string): Promise<Contract> {
    const response = await apiClient.patch(`/contracts/${id}`, { name });
    return response.data;
  },
};
