import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowRightIcon, UploadIcon, FileIcon,
  XIcon, LoaderIcon,
  EditIcon, GitCommitIcon, SparklesIcon, CheckIcon,
  HistoryIcon, SearchIcon, FileTextIcon,
} from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import * as Diff from 'diff';
import { contractService, clauseService } from '../../../services';
import { useTemplates } from '../../../context/TemplateContext';
import { useToast } from '../../../context/ToastContext';
import { useAIAssistant } from '../../../context/AIAssistantContext';
import { useUploadProgress } from '../../../context/UploadProgressContext';
import type {
  Contract, ContractDetail, ContractClause,
  ComparisonStatus, RiskLevel, SuggestEditResponse,
} from '../../../types';

const STATUS_FILTER_OPTIONS: { value: ComparisonStatus; label: string; bg: string; text: string }[] = [
  { value: 'UNCHANGED', label: 'Unchanged', bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' },
  { value: 'REPLACED', label: 'Replaced', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-800 dark:text-amber-300' },
  { value: 'ADDED', label: 'Added', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-300' },
  { value: 'DELETED', label: 'Deleted', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300' },
];

const RISK_FILTER_OPTIONS: { value: RiskLevel; label: string; bg: string; text: string }[] = [
  { value: 'high', label: 'High Risk', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300' },
  { value: 'medium', label: 'Medium Risk', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-800 dark:text-amber-300' },
  { value: 'low', label: 'Low Risk', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-300' },
];

// Diff helpers
const stripHtml = (html: string): string => {
  if (!html || typeof html !== 'string') return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n');
  return tmp.textContent || tmp.innerText || '';
};

const generateDiff = (original: string, modified: string) => {
  const originalText = stripHtml(original || '');
  const modifiedText = stripHtml(modified || '');
  const changes = Diff.diffLines(originalText, modifiedText);
  const result: { type: string; content: string; oLine: number | null; mLine: number | null }[] = [];
  let originalLine = 1;
  let modifiedLine = 1;

  if (!changes) return result;

  changes.forEach((part) => {
    const lines = part.value.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    lines.forEach((line) => {
      if (part.added) {
        result.push({ type: 'added', content: line, oLine: null, mLine: modifiedLine++ });
      } else if (part.removed) {
        result.push({ type: 'removed', content: line, oLine: originalLine++, mLine: null });
      } else {
        result.push({ type: 'unchanged', content: line, oLine: originalLine++, mLine: modifiedLine++ });
      }
    });
  });

  return result;
};

export function UploadContractorDrafts({
  onContinue,
  language = 'english',
}: {
  onContinue: () => void;
  language?: string;
}) {
  const isRTL = language === 'arabic';
  const { templates } = useTemplates();
  const { showToast } = useToast();
  const { setAIContext, setClauseCode } = useAIAssistant();
  const { addContractUpload } = useUploadProgress();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [selectedContractDetail, setSelectedContractDetail] = useState<ContractDetail | null>(null);

  // Clause editing state
  const [selectedClause, setSelectedClause] = useState<ContractClause | null>(null);
  const [clauseContent, setClauseContent] = useState('');
  const [originalClauseContent, setOriginalClauseContent] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'diff'>('edit');

  // AI edit suggestion
  const [editSuggestion, setEditSuggestion] = useState<SuggestEditResponse | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [isRequestingSuggestion, setIsRequestingSuggestion] = useState(false);

  // Clause filters
  const [statusFilters, setStatusFilters] = useState<Set<ComparisonStatus>>(new Set());
  const [riskFilters, setRiskFilters] = useState<Set<RiskLevel>>(new Set());
  const [clauseSearchQuery, setClauseSearchQuery] = useState('');

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadContractName, setUploadContractName] = useState('');
  const [uploadTemplateId, setUploadTemplateId] = useState<number | null>(null);
  const [uploadPageStart, setUploadPageStart] = useState('');
  const [uploadPageEnd, setUploadPageEnd] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load contracts on mount
  useEffect(() => {
    loadContracts();
  }, []);

  // Auto-select first template for upload
  useEffect(() => {
    if (templates.length > 0 && uploadTemplateId === null) {
      setUploadTemplateId(templates[0].id);
    }
  }, [templates, uploadTemplateId]);

  // Push AI context for GlobalChatbot
  useEffect(() => {
    if (selectedContractId) {
      setAIContext({ contextType: 'contract', contextLabel: 'Upload Contractor Drafts', contractId: selectedContractId });
    } else {
      setAIContext({ contextType: 'general', contextLabel: 'Upload Contractor Drafts' });
    }
    return () => {
      setAIContext({ contextType: 'general', contextLabel: 'General' });
    };
  }, [setAIContext, selectedContractId]);

  // Push clause code for GlobalChatbot
  useEffect(() => {
    setClauseCode(selectedClause?.clause_code);
  }, [selectedClause, setClauseCode]);

  // Load contract detail when contract selection changes
  useEffect(() => {
    if (selectedContractId === null) {
      setSelectedContractDetail(null);
      setSelectedClause(null);
      return;
    }
    loadContractDetail(selectedContractId);
  }, [selectedContractId]);

  const loadContracts = async () => {
    setIsLoading(true);
    try {
      const data = await contractService.getContracts();
      setContracts(data.contracts);
      if (data.contracts.length > 0 && selectedContractId === null) {
        setSelectedContractId(data.contracts[0].id);
      }
    } catch {
      showToast('Failed to load contracts', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadContractDetail = async (contractId: number) => {
    try {
      const detail = await contractService.getContract(contractId);
      setSelectedContractDetail(detail);
      setSelectedClause(null);
      setClauseContent('');
      setOriginalClauseContent('');
      setEditSuggestion(null);
    } catch {
      showToast('Failed to load contract details', 'error');
    }
  };

  // Filtered clauses
  const filteredClauses = useMemo(() => {
    if (!selectedContractDetail) return [];
    let clauses = selectedContractDetail.clauses;

    if (statusFilters.size > 0) {
      clauses = clauses.filter(c => c.comparison_status && statusFilters.has(c.comparison_status));
    }

    if (riskFilters.size > 0) {
      clauses = clauses.filter(c => c.risk_level && riskFilters.has(c.risk_level));
    }

    if (clauseSearchQuery.trim()) {
      const q = clauseSearchQuery.toLowerCase();
      clauses = clauses.filter(c =>
        c.clause_code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q)
      );
    }

    return clauses;
  }, [selectedContractDetail, statusFilters, riskFilters, clauseSearchQuery]);

  const diffResult = generateDiff(originalClauseContent, clauseContent);

  const handleUploadClick = () => {
    setShowUploadModal(true);
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadContractName.trim() || !uploadTemplateId) {
      showToast('Please fill in all required fields', 'warning');
      return;
    }

    const name = uploadContractName;
    const tid = uploadTemplateId;
    const ps = uploadPageStart ? parseInt(uploadPageStart) : undefined;
    const pe = uploadPageEnd ? parseInt(uploadPageEnd) : undefined;

    // Close modal immediately and delegate to global progress context
    setShowUploadModal(false);
    setUploadContractName('');
    setUploadPageStart('');
    setUploadPageEnd('');

    addContractUpload({
      file,
      name,
      templateId: tid,
      pageStart: ps,
      pageEnd: pe,
      onComplete: (contractId: number) => {
        loadContracts();
        if (selectedContractId === contractId) {
          loadContractDetail(contractId);
        }
      },
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteContract = async (id: number) => {
    try {
      await contractService.deleteContract(id);
      showToast('Contract deleted', 'success');
      loadContracts();
      if (selectedContractId === id) {
        setSelectedContractId(null);
        setSelectedContractDetail(null);
        setSelectedClause(null);
      }
    } catch {
      showToast('Failed to delete contract', 'error');
    }
  };

  // Clause editing handlers
  const handleClauseSelect = (clause: ContractClause) => {
    setSelectedClause(clause);
    setClauseContent(clause.content);
    setOriginalClauseContent(clause.content);
    setEditSuggestion(null);
    setViewMode('edit');
  };

  const handleResetToOriginal = () => {
    if (selectedClause) {
      setClauseContent(originalClauseContent);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedClause) return;
    try {
      await clauseService.directUpdate(selectedClause.id, stripHtml(clauseContent), 'contract');
      setOriginalClauseContent(clauseContent);
      showToast('Clause saved successfully', 'success');
      if (selectedContractId) {
        const detail = await contractService.getContract(selectedContractId);
        setSelectedContractDetail(detail);
      }
    } catch {
      showToast('Failed to save clause', 'error');
    }
  };

  const handleSuggestEdit = async () => {
    if (!selectedClause || !editInstruction.trim()) return;
    setIsRequestingSuggestion(true);
    try {
      const suggestion = await clauseService.suggestEdit(
        selectedClause.id,
        editInstruction,
        'contract',
        true
      );
      setEditSuggestion(suggestion);
    } catch {
      showToast('Failed to get AI suggestion', 'error');
    } finally {
      setIsRequestingSuggestion(false);
    }
  };

  const handleAcceptSuggestion = async () => {
    if (!editSuggestion || !selectedClause) return;
    try {
      await clauseService.applyEdit(
        selectedClause.id,
        editSuggestion.suggestion_id,
        editSuggestion.suggested_text,
        'contract'
      );
      setClauseContent(editSuggestion.suggested_text);
      setOriginalClauseContent(editSuggestion.suggested_text);
      setEditSuggestion(null);
      setEditInstruction('');
      showToast('Suggestion applied', 'success');
    } catch {
      showToast('Failed to apply suggestion', 'error');
    }
  };

  const handleRejectSuggestion = () => {
    setEditSuggestion(null);
  };

  const toggleStatusFilter = (status: ComparisonStatus) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const toggleRiskFilter = (risk: RiskLevel) => {
    setRiskFilters(prev => {
      const next = new Set(prev);
      if (next.has(risk)) next.delete(risk);
      else next.add(risk);
      return next;
    });
  };

  const getStatusBadge = (status: ComparisonStatus | null) => {
    switch (status) {
      case 'UNCHANGED':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
      case 'REPLACED':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'ADDED':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'DELETED':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getRiskBadge = (level: RiskLevel | null) => {
    switch (level) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'medium':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      default:
        return '';
    }
  };

  const processedCount = contracts.filter((c) => c.clause_count > 0).length;

  return (
    <div className="space-y-4">
      <style>{`
        .dark .ql-toolbar.ql-snow { background-color: #1f2937; border-color: #374151; }
        .dark .ql-container.ql-snow { background-color: #111827; border-color: #374151; color: #d1d5db; }
        .dark .ql-snow .ql-stroke { stroke: #9ca3af; }
        .dark .ql-snow .ql-fill { fill: #9ca3af; }
        .dark .ql-snow .ql-picker { color: #d1d5db; }
        .dark .ql-snow .ql-picker-options { background-color: #1f2937; border-color: #374151; }
      `}</style>

      {/* Header info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
          {isRTL ? 'تحميل مسودات المقاولين' : 'Upload Contractor Drafts'}
        </h3>
        <p className="text-xs text-blue-700 dark:text-blue-300">
          {isRTL
            ? 'قم بتحميل مسودات العقود المقدمة من المقاولين. سيقوم النظام بمقارنتها مع قالب FIDIC الخاص بك.'
            : 'Upload contract drafts submitted by contractors. The system will compare them with your FIDIC template and extract key clauses.'}
        </p>
      </div>

      {/* Toolbar row */}
      <div className="flex justify-between items-center">
        <h3 className="text-base font-medium text-gray-800 dark:text-white">
          {isRTL ? 'مسودات المقاولين' : 'Contractor Drafts'}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUploadClick}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center transition-colors"
          >
            <UploadIcon size={16} className="mr-1.5" />
            {isRTL ? 'تحميل عقد' : 'Upload Contract'}
          </button>
          {contracts.length > 0 && (
            <button
              className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 rounded-lg hover:bg-blue-100 flex items-center"
              onClick={onContinue}
            >
              {isRTL ? 'المتابعة إلى المقارنة' : 'Continue to Comparison'}
              <ArrowRightIcon size={16} className="ml-2" />
            </button>
          )}
        </div>
      </div>

      {/* Contract selector */}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-sm">
          <select
            value={selectedContractId ?? ''}
            onChange={(e) => setSelectedContractId(Number(e.target.value) || null)}
            disabled={isLoading}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
          >
            <option value="">
              {isLoading ? 'Loading...' : (isRTL ? 'اختر عقدًا' : 'Select contract...')}
            </option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.clause_count} clauses)
              </option>
            ))}
          </select>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {processedCount} of {contracts.length} {isRTL ? 'تمت المعالجة' : 'processed'}
        </span>
        {selectedContractId && (
          <button
            onClick={() => handleDeleteContract(selectedContractId)}
            className="px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:text-red-800 flex items-center"
          >
            <XIcon size={14} className="mr-1" />
            {isRTL ? 'حذف' : 'Remove'}
          </button>
        )}
      </div>

      {/* Main content: clause list + editor */}
      {selectedContractDetail ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* LEFT: Clause tree with filters */}
          <div className="md:col-span-1">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex flex-col max-h-[650px]">
              <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-800 dark:text-white mb-2">
                  {isRTL ? 'البنود' : 'Clauses'}
                </h4>

                {/* Status filter chips */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {STATUS_FILTER_OPTIONS.map((opt) => {
                    const isActive = statusFilters.has(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => toggleStatusFilter(opt.value)}
                        className={`px-2 py-0.5 text-xs font-medium rounded-full border transition-colors ${
                          isActive
                            ? `${opt.bg} ${opt.text} border-current`
                            : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* Risk filter chips */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {RISK_FILTER_OPTIONS.map((opt) => {
                    const isActive = riskFilters.has(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => toggleRiskFilter(opt.value)}
                        className={`px-2 py-0.5 text-xs font-medium rounded-full border transition-colors ${
                          isActive
                            ? `${opt.bg} ${opt.text} border-current`
                            : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* Search input */}
                <div className="relative">
                  <SearchIcon size={14} className="absolute left-2.5 top-2 text-gray-400" />
                  <input
                    type="text"
                    placeholder={isRTL ? 'بحث في البنود...' : 'Filter clauses...'}
                    value={clauseSearchQuery}
                    onChange={(e) => setClauseSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                  {filteredClauses.length} of {selectedContractDetail.clauses.length} clauses
                  {(statusFilters.size > 0 || riskFilters.size > 0) && ' (filtered)'}
                </p>
              </div>

              {/* Clause list */}
              <div className="flex-1 overflow-y-auto">
                {filteredClauses.map((clause) => (
                  <ContractClauseItem
                    key={clause.id}
                    clause={clause}
                    isSelected={selectedClause?.id === clause.id}
                    onClick={() => handleClauseSelect(clause)}
                    getStatusBadge={getStatusBadge}
                    getRiskBadge={getRiskBadge}
                  />
                ))}
                {filteredClauses.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                    {clauseSearchQuery || statusFilters.size > 0 || riskFilters.size > 0
                      ? (isRTL ? 'لا توجد نتائج' : 'No clauses match your filters')
                      : (isRTL ? 'لا توجد بنود' : 'No clauses found')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Editor area */}
          <div className="md:col-span-2">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              {/* Editor toolbar */}
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center">
                  <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {selectedClause
                      ? `${selectedClause.clause_code} - ${selectedClause.title}`
                      : isRTL ? 'اختر بندًا للتحرير' : 'Select a clause to edit'}
                  </h3>
                  {selectedClause && (
                    <div className="ml-3 flex space-x-2">
                      <button
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center transition-colors duration-200 ${
                          viewMode === 'edit'
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                        }`}
                        onClick={() => setViewMode('edit')}
                      >
                        <EditIcon size={14} className="mr-1" />
                        {isRTL ? 'تحرير' : 'Edit'}
                      </button>
                      <button
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center transition-colors duration-200 ${
                          viewMode === 'diff'
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                        }`}
                        onClick={() => setViewMode('diff')}
                      >
                        <GitCommitIcon size={14} className="mr-1" />
                        {isRTL ? 'عرض التغييرات' : 'View Changes'}
                      </button>
                    </div>
                  )}
                </div>
                {selectedClause && (
                  <div className="flex space-x-2">
                    <button
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 flex items-center"
                      onClick={handleResetToOriginal}
                    >
                      <HistoryIcon size={14} className="mr-1" />
                      {isRTL ? 'إعادة تعيين' : 'Reset'}
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 flex items-center disabled:opacity-50"
                      onClick={handleSaveChanges}
                    >
                      <CheckIcon size={14} className="mr-1" />
                      {isRTL ? 'حفظ' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              {/* Editor / Diff / Placeholder */}
              {selectedClause ? (
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
                  {viewMode === 'edit' ? (
                    <ReactQuill
                      theme="snow"
                      value={clauseContent}
                      onChange={setClauseContent}
                      className="h-[350px] mb-12"
                      modules={{
                        toolbar: [
                          [{ header: [1, 2, 3, false] }],
                          ['bold', 'italic', 'underline', 'strike'],
                          [{ list: 'ordered' }, { list: 'bullet' }],
                          ['clean'],
                        ],
                      }}
                    />
                  ) : (
                    <div className="w-full h-[350px] text-sm text-gray-800 dark:text-gray-300 overflow-y-auto font-mono bg-white dark:bg-gray-900">
                      <div className="flex text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 p-2 border-b border-gray-200 dark:border-gray-700">
                        <GitCommitIcon size={14} className="mr-2" />
                        <span>{isRTL ? 'عرض التغييرات' : 'Changes'}</span>
                      </div>
                      {diffResult.map((line, index) => (
                        <div
                          key={index}
                          className={`flex border-b ${
                            line.type === 'removed'
                              ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30'
                              : line.type === 'added'
                              ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-gray-100 dark:border-gray-800'
                          }`}
                        >
                          <div className="w-12 flex-shrink-0 text-center text-gray-400 bg-gray-50 dark:bg-gray-800 py-1 px-2 select-none text-xs border-r border-gray-200 dark:border-gray-700">
                            {line.oLine || line.mLine}
                          </div>
                          <div className="flex-1 px-3 py-1 whitespace-pre-wrap break-words">
                            {line.type !== 'unchanged' && (
                              <span className={`font-bold mr-2 ${line.type === 'removed' ? 'text-red-600' : 'text-green-600'}`}>
                                {line.type === 'removed' ? '-' : '+'}
                              </span>
                            )}
                            {line.content || '\u00A0'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-gray-400 dark:text-gray-500 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                  <div className="text-center">
                    <FileTextIcon size={40} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      {isRTL ? 'اختر بندًا من القائمة للبدء في التحرير' : 'Select a clause from the list to start editing'}
                    </p>
                  </div>
                </div>
              )}

              {/* AI Edit Suggestion */}
              {selectedClause && (
                <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-800 dark:text-white mb-2 flex items-center">
                    <SparklesIcon size={16} className="mr-2 text-purple-500" />
                    {isRTL ? 'اقتراح تعديل بالذكاء الاصطناعي' : 'AI Edit Suggestion'}
                  </h4>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={editInstruction}
                      onChange={(e) => setEditInstruction(e.target.value)}
                      placeholder={isRTL ? 'وصف التعديل المطلوب...' : 'Describe the edit you want...'}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSuggestEdit();
                      }}
                    />
                    <button
                      onClick={handleSuggestEdit}
                      disabled={isRequestingSuggestion || !editInstruction.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center"
                    >
                      {isRequestingSuggestion ? (
                        <LoaderIcon size={16} className="animate-spin" />
                      ) : (
                        <>
                          <SparklesIcon size={14} className="mr-1" />
                          {isRTL ? 'اقتراح' : 'Suggest'}
                        </>
                      )}
                    </button>
                  </div>

                  {editSuggestion && (
                    <div className="border border-purple-200 dark:border-purple-800 rounded-lg p-3 bg-purple-50 dark:bg-purple-900/20">
                      <p className="text-xs font-medium text-purple-800 dark:text-purple-300 mb-2">
                        {editSuggestion.explanation}
                      </p>

                      {/* Diff display */}
                      <div className="bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 p-2 mb-2 max-h-40 overflow-y-auto text-xs font-mono">
                        {editSuggestion.diff.map((seg, i) => (
                          <span
                            key={i}
                            className={
                              seg.type === 'insert'
                                ? 'bg-green-200 dark:bg-green-900/40 text-green-800 dark:text-green-300'
                                : seg.type === 'delete'
                                ? 'bg-red-200 dark:bg-red-900/40 text-red-800 dark:text-red-300 line-through'
                                : 'text-gray-700 dark:text-gray-300'
                            }
                          >
                            {seg.text}
                          </span>
                        ))}
                      </div>

                      {/* Risk assessment */}
                      {editSuggestion.risk_assessment && (
                        <div className="mb-2 text-xs">
                          <span
                            className={`px-2 py-0.5 rounded-full font-medium ${
                              editSuggestion.risk_assessment.risk_level === 'high'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                : editSuggestion.risk_assessment.risk_level === 'medium'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            }`}
                          >
                            {editSuggestion.risk_assessment.risk_level} risk
                          </span>
                          <span className="ml-2 text-gray-600 dark:text-gray-400">
                            {editSuggestion.risk_assessment.risk_reason}
                          </span>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={handleAcceptSuggestion}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                        >
                          <CheckIcon size={14} className="inline mr-1" />
                          {isRTL ? 'قبول' : 'Accept'}
                        </button>
                        <button
                          onClick={handleRejectSuggestion}
                          className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200"
                        >
                          <XIcon size={14} className="inline mr-1" />
                          {isRTL ? 'رفض' : 'Reject'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Empty state when no contract selected */
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-12 flex flex-col items-center justify-center text-center">
          {isLoading ? (
            <LoaderIcon size={32} className="animate-spin text-blue-500 mb-3" />
          ) : contracts.length === 0 ? (
            <>
              <UploadIcon size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {isRTL ? 'لا توجد عقود محملة بعد. اضغط على "تحميل عقد" للبدء.' : 'No contracts uploaded yet. Click "Upload Contract" to get started.'}
              </p>
            </>
          ) : (
            <>
              <FileIcon size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {isRTL ? 'اختر عقدًا من القائمة أعلاه' : 'Select a contract from the dropdown above'}
              </p>
            </>
          )}
        </div>
      )}

      {/* Upload modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-medium mb-4 text-gray-900 dark:text-white">
              {isRTL ? 'تحميل عقد جديد' : 'Upload New Contract'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                  Contract Name
                </label>
                <input
                  type="text"
                  value={uploadContractName}
                  onChange={(e) => setUploadContractName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Siemens Draft v1"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                  Compare Against Template
                </label>
                <select
                  value={uploadTemplateId ?? ''}
                  onChange={(e) => setUploadTemplateId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    Page Start
                  </label>
                  <input
                    type="number"
                    value={uploadPageStart}
                    onChange={(e) => setUploadPageStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    Page End
                  </label>
                  <input
                    type="number"
                    value={uploadPageEnd}
                    onChange={(e) => setUploadPageEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Optional"
                  />
                </div>
              </div>

            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleFileSelect}
                disabled={!uploadContractName.trim() || !uploadTemplateId}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Select PDF & Upload
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".pdf"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function ContractClauseItem({
  clause,
  isSelected,
  onClick,
  getStatusBadge,
  getRiskBadge,
}: {
  clause: ContractClause;
  isSelected: boolean;
  onClick: () => void;
  getStatusBadge: (s: ComparisonStatus | null) => string;
  getRiskBadge: (r: RiskLevel | null) => string;
}) {
  return (
    <div
      className={`border-l-2 pl-3 cursor-pointer transition-colors ${
        isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
      style={{ paddingLeft: `${(clause.level - 1) * 16 + 12}px` }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between py-2 px-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-800 dark:text-white shrink-0">
            {clause.clause_code}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {clause.title}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {clause.comparison_status && (
            <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${getStatusBadge(clause.comparison_status)}`}>
              {clause.comparison_status}
            </span>
          )}
          {clause.risk_level && (
            <span
              className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${getRiskBadge(clause.risk_level)}`}
              title={clause.risk_reason || ''}
            >
              {clause.risk_level}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
