// ============================================================
// Auth
// ============================================================

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

// ============================================================
// Templates
// ============================================================

export interface Template {
  id: number;
  name: string;
  fidic_book: string;
  edition_year: number;
  created_at: string;
  clause_count: number;
}

export interface TemplateClause {
  id: number;
  clause_code: string;
  title: string;
  content: string;
  level: number;
  parent_clause_id: number | null;
}

// ============================================================
// Contracts
// ============================================================

export interface Contract {
  id: number;
  name: string;
  template_id: number;
  uploaded_at: string;
  clause_count: number;
}

export interface ContractDetail extends Contract {
  clauses: ContractClause[];
}

export interface ContractClause {
  id: number;
  clause_code: string;
  title: string;
  content: string;
  level: number;
  template_clause_id: number | null;
  risk_level: RiskLevel | null;
  risk_reason: string | null;
  comparison_status: ComparisonStatus | null;
}

// ============================================================
// Enums
// ============================================================

export type ComparisonStatus = 'UNCHANGED' | 'REPLACED' | 'ADDED' | 'DELETED';

export type RiskLevel = 'low' | 'medium' | 'high';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AnalysisPhase =
  | 'queued'
  | 'extracting'
  | 'storing'
  | 'embedding'
  | 'analyzing'
  | 'completed'
  | 'failed';

export type EmbeddingType = 'content' | 'hierarchical' | 'composite';

// ============================================================
// Analysis Jobs
// ============================================================

export interface AnalysisJob {
  id: number;
  job_id: string;
  contract_id: number;
  template_id: number;
  status: JobStatus;
  progress: number;
  phase: AnalysisPhase;
  current_step: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ============================================================
// Comparison
// ============================================================

export interface DiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface ClauseComparisonResult {
  clause_code: string;
  template_content: string;
  contract_content: string;
  comparison_status: ComparisonStatus;
  diff: DiffSegment[];
  risk_level: RiskLevel | null;
  risk_reason: string | null;
  final_text: string | null;
}

export interface DocumentComparisonResult {
  doc_a_id: number;
  doc_b_id: number;
  clause_comparisons: ClauseComparisonResult[];
  summary: {
    total_clauses: number;
    matched: number;
    added: number;
    unchanged: number;
    changed: number;
    replaced: number;
    deleted_by_instruction: number;
    high_risk: number;
    medium_risk: number;
    low_risk: number;
  };
}

// ============================================================
// Clause Editing
// ============================================================

export interface SuggestEditRequest {
  clause_id: number;
  instruction: string;
  target_type: 'template' | 'contract';
  include_risk_assessment?: boolean;
  context?: string;
}

export interface SuggestEditResponse {
  suggestion_id: string;
  clause_id: number;
  clause_code: string;
  original_text: string;
  suggested_text: string;
  explanation: string;
  risk_assessment: {
    risk_level: RiskLevel;
    risk_reason: string;
    risk_category: string;
    recommendations: string[];
  } | null;
  diff: DiffSegment[];
}

// ============================================================
// Search
// ============================================================

export interface SearchRequest {
  query: string;
  embedding_type?: EmbeddingType;
  contract_id?: number;
  template_id?: number;
  limit?: number;
  min_similarity?: number;
}

export interface SearchResult {
  clause_code: string;
  title: string;
  content: string;
  similarity_score: number;
  template_id: number | null;
  template_name: string | null;
}

// ============================================================
// Conversations
// ============================================================

export interface ConversationMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  clause_code: string | null;
  tool_calls: ToolCall[] | null;
  created_at: string;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
}

export interface Conversation {
  id: number;
  conversation_id: string;
  context_type: string;
  contract_id: number | null;
  template_id: number | null;
  analysis_job_id: number | null;
  title: string | null;
  is_active: boolean;
  created_at: string;
  messages: ConversationMessage[];
}

export interface CreateConversationRequest {
  context_type: string;
  contract_id?: number;
  template_id?: number;
  analysis_job_id?: number;
  title?: string;
  initial_message?: string;
}

export interface SendMessageResponse {
  user_message: ConversationMessage;
  assistant_message: ConversationMessage;
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

// ============================================================
// Risk Assessment
// ============================================================

export interface RiskAssessmentRequest {
  clause_code: string;
  original_content: string;
  modified_content: string;
  instruction_type: string;
  instruction?: string;
}

export interface RiskAssessmentResult {
  clause_code: string;
  risk_level: RiskLevel;
  risk_reason: string;
  risk_category: string;
  recommendations: string[];
}

// ============================================================
// Multi-Contract
// ============================================================

export interface MultiContractConversation {
  id: number;
  conversation_id: string;
  context_type: string;
  contract_ids: number[];
  template_id: number | null;
  title: string | null;
  is_active: boolean;
  created_at: string;
}

export interface MultiContractClauseComparison {
  clause_code: string;
  template_content: string | null;
  contract_contents: Record<number, string>;
  comparisons: Record<number, ClauseComparisonResult>;
}

// ============================================================
// Document Comparison (matches POST /comparison/documents response)
// ============================================================

export interface DocumentInfo {
  type: string;
  id: number;
  name: string;
}

export interface DocumentComparisonClause {
  clause_code: string;
  clause_a_text: string | null;
  clause_b_text: string | null;
  status: 'matched' | 'only_in_a' | 'only_in_b';
  diff_type: ComparisonStatus;
  diff_summary: string | null;
  final_text: string | null;
}

export interface DocumentComparisonResponse {
  document_a: DocumentInfo;
  document_b: DocumentInfo;
  total_clauses: number;
  matched: number;
  only_in_a: number;
  only_in_b: number;
  changed: number;
  unchanged: number;
  results: DocumentComparisonClause[];
}

// ============================================================
// Upload Progress (frontend-only tracking)
// ============================================================

export type UploadJobType = 'contract' | 'template';

export type UploadStage =
  | 'uploading'
  | 'parsing'
  | 'analyzing'
  | 'processing'
  | 'completed'
  | 'failed';

export interface UploadJob {
  id: string;
  type: UploadJobType;
  name: string;
  stage: UploadStage;
  uploadProgress: number;
  analysisProgress: number;
  analysisJobId: string | null;
  contractId: number | null;
  templateId: number | null;
  errorMessage: string | null;
  createdAt: number;
  dismissed: boolean;
  /** Backend analysis phase (contract uploads only) */
  phase: AnalysisPhase | null;
  /** Human-readable step detail from backend */
  currentStep: string | null;
}

// ============================================================
// Error
// ============================================================

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
