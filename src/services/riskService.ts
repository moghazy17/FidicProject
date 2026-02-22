import apiClient from './apiClient';
import type { RiskAssessmentResult } from '../types';

export const riskService = {
  async assessRisk(
    clauseCode: string,
    originalContent: string,
    modifiedContent: string,
    instructionType: string,
    instruction?: string
  ): Promise<RiskAssessmentResult> {
    const response = await apiClient.post('/risk/assess', {
      clause_code: clauseCode,
      original_content: originalContent,
      modified_content: modifiedContent,
      instruction_type: instructionType,
      instruction,
    });
    return response.data;
  },
};
