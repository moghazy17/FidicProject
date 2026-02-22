import apiClient from './apiClient';
import type { Template, TemplateClause } from '../types';

export const templateService = {
  async getTemplates(): Promise<{ templates: Template[]; total: number }> {
    const response = await apiClient.get('/templates');
    return response.data;
  },

  async getTemplate(id: number): Promise<Template> {
    const response = await apiClient.get(`/templates/${id}`);
    return response.data;
  },

  async getTemplateClauses(
    id: number,
    skip?: number,
    limit?: number
  ): Promise<TemplateClause[]> {
    const params: Record<string, number> = {};
    if (skip !== undefined) params.skip = skip;
    if (limit !== undefined) params.limit = limit;

    const response = await apiClient.get(`/templates/${id}/clauses`, { params });
    return response.data;
  },

  async getClauseByCode(templateId: number, clauseCode: string): Promise<TemplateClause> {
    const response = await apiClient.get(
      `/templates/${templateId}/clauses/${encodeURIComponent(clauseCode)}`
    );
    return response.data;
  },

  async uploadTemplate(
    file: File,
    name: string,
    fidicBook: string,
    editionYear: number,
    pageStart?: number,
    pageEnd?: number,
    onProgress?: (progress: number) => void
  ): Promise<Template> {
    const formData = new FormData();
    formData.append('file', file);

    const params: Record<string, string | number> = {
      name,
      fidic_book: fidicBook,
      edition_year: editionYear,
    };
    if (pageStart !== undefined) params.page_start = pageStart;
    if (pageEnd !== undefined) params.page_end = pageEnd;

    const response = await apiClient.post('/templates/upload', formData, {
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
};
