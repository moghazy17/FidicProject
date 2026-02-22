import apiClient from './apiClient';
import type {
  Conversation,
  SendMessageResponse,
  MultiContractConversation,
  MultiContractClauseComparison,
  SearchResult,
  EmbeddingType,
} from '../types';

export const conversationService = {
  async createConversation(
    contextType: string,
    contractId?: number,
    templateId?: number,
    analysisJobId?: number,
    title?: string,
    initialMessage?: string
  ): Promise<Conversation> {
    const body: Record<string, unknown> = { context_type: contextType };
    if (contractId !== undefined) body.contract_id = contractId;
    if (templateId !== undefined) body.template_id = templateId;
    if (analysisJobId !== undefined) body.analysis_job_id = analysisJobId;
    if (title) body.title = title;
    if (initialMessage) body.initial_message = initialMessage;

    const response = await apiClient.post('/conversations', body);
    return response.data;
  },

  async getConversation(conversationId: string): Promise<Conversation> {
    const response = await apiClient.get(`/conversations/${conversationId}`);
    return response.data;
  },

  async sendMessage(
    conversationId: string,
    content: string,
    clauseCode?: string
  ): Promise<SendMessageResponse> {
    const body: Record<string, unknown> = { content };
    if (clauseCode) body.clause_code = clauseCode;

    const response = await apiClient.post(
      `/conversations/${conversationId}/messages`,
      body
    );
    return response.data;
  },

  async listConversations(
    skip?: number,
    limit?: number,
    contextType?: string,
    isActive?: boolean
  ): Promise<{ conversations: Conversation[]; total: number }> {
    const params: Record<string, string | number | boolean> = {};
    if (skip !== undefined) params.skip = skip;
    if (limit !== undefined) params.limit = limit;
    if (contextType) params.context_type = contextType;
    if (isActive !== undefined) params.is_active = isActive;

    const response = await apiClient.get('/conversations', { params });
    return response.data;
  },

  // Multi-contract endpoints
  async createMultiContractSession(
    contractIds: number[],
    templateId?: number,
    title?: string,
    initialMessage?: string
  ): Promise<MultiContractConversation> {
    const body: Record<string, unknown> = { contract_ids: contractIds };
    if (templateId !== undefined) body.template_id = templateId;
    if (title) body.title = title;
    if (initialMessage) body.initial_message = initialMessage;

    const response = await apiClient.post('/multi-contract/conversations', body);
    return response.data;
  },

  async compareClauseMultiContract(
    conversationId: string,
    clauseCode: string,
    includeTemplate?: boolean
  ): Promise<MultiContractClauseComparison> {
    const params: Record<string, boolean> = {};
    if (includeTemplate !== undefined) params.include_template = includeTemplate;

    const response = await apiClient.get(
      `/multi-contract/conversations/${conversationId}/compare-clause/${encodeURIComponent(clauseCode)}`,
      { params }
    );
    return response.data;
  },

  async searchMultiContract(
    conversationId: string,
    query: string,
    embeddingType?: EmbeddingType,
    topK?: number,
    minSimilarity?: number
  ): Promise<SearchResult[]> {
    const body: Record<string, unknown> = { query };
    if (embeddingType) body.embedding_type = embeddingType;
    if (topK !== undefined) body.top_k = topK;
    if (minSimilarity !== undefined) body.min_similarity = minSimilarity;

    const response = await apiClient.post(
      `/multi-contract/conversations/${conversationId}/search`,
      body
    );
    return response.data;
  },

  async sendMultiContractMessage(
    conversationId: string,
    content: string,
    clauseCode?: string
  ): Promise<SendMessageResponse> {
    const body: Record<string, unknown> = { content };
    if (clauseCode) body.clause_code = clauseCode;

    const response = await apiClient.post(
      `/multi-contract/conversations/${conversationId}/messages`,
      body
    );
    return response.data;
  },
};
