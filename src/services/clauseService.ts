import apiClient from './apiClient';
import type { SuggestEditResponse } from '../types';

export const clauseService = {
  async suggestEdit(
    clauseId: number,
    instruction: string,
    targetType: 'template' | 'contract',
    includeRiskAssessment?: boolean,
    context?: string
  ): Promise<SuggestEditResponse> {
    const response = await apiClient.post('/clauses/suggest-edit', {
      clause_id: clauseId,
      instruction,
      target_type: targetType,
      include_risk_assessment: includeRiskAssessment ?? true,
      context,
    });
    return response.data;
  },

  async applyEdit(
    clauseId: number,
    suggestionId: string,
    suggestedText: string,
    targetType: 'template' | 'contract'
  ): Promise<void> {
    await apiClient.post(`/clauses/${clauseId}/apply-edit`, {
      suggestion_id: suggestionId,
      suggested_text: suggestedText,
    }, {
      params: { target_type: targetType },
    });
  },

  async directUpdate(
    clauseId: number,
    content: string,
    targetType?: 'template' | 'contract'
  ): Promise<void> {
    const params: Record<string, string> = {};
    if (targetType) params.target_type = targetType;

    await apiClient.put(`/clauses/${clauseId}`, { content }, { params });
  },
};
