import apiClient from './apiClient';
import type { DocumentComparisonResponse, ClauseComparisonResult } from '../types';

export const comparisonService = {
  async compareDocuments(
    docAType: string,
    docAId: number,
    docBType: string,
    docBId: number
  ): Promise<DocumentComparisonResponse> {
    const response = await apiClient.post('/comparison/documents', {
      document_a_type: docAType,
      document_a_id: docAId,
      document_b_type: docBType,
      document_b_id: docBId,
    });
    return response.data;
  },

  async compareClauses(
    templateContent: string,
    contractContent: string,
    clauseCode?: string
  ): Promise<ClauseComparisonResult> {
    const response = await apiClient.post('/comparison/clauses', {
      template_content: templateContent,
      contract_content: contractContent,
      clause_code: clauseCode,
    });
    return response.data;
  },
};
