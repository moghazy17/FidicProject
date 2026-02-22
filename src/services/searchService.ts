import apiClient from './apiClient';
import type { SearchResult, EmbeddingType } from '../types';

export const searchService = {
  async searchClauses(
    query: string,
    embeddingType?: EmbeddingType,
    contractId?: number,
    templateId?: number,
    limit?: number,
    minSimilarity?: number
  ): Promise<SearchResult[]> {
    const body: Record<string, unknown> = { query };
    if (embeddingType) body.embedding_type = embeddingType;
    if (contractId !== undefined) body.contract_id = contractId;
    if (templateId !== undefined) body.template_id = templateId;
    if (limit !== undefined) body.limit = limit;
    if (minSimilarity !== undefined) body.min_similarity = minSimilarity;

    const response = await apiClient.post('/search/clauses', body);
    return response.data;
  },

  async searchInTemplate(
    templateId: number,
    query: string,
    limit?: number
  ): Promise<SearchResult[]> {
    const params: Record<string, string | number> = { query };
    if (limit !== undefined) params.limit = limit;

    const response = await apiClient.get(`/search/templates/${templateId}/clauses`, { params });
    return response.data;
  },
};
