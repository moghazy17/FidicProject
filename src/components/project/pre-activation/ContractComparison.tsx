import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowRightIcon, SearchIcon, LoaderIcon,
  GitCompareIcon, FileTextIcon, ColumnsIcon, LayoutListIcon,
  ChevronRightIcon, ChevronDownIcon, CodeIcon,
} from 'lucide-react';
import { contractService, comparisonService } from '../../../services';
import { useTemplates } from '../../../context/TemplateContext';
import { useToast } from '../../../context/ToastContext';
import { useAIAssistant } from '../../../context/AIAssistantContext';
import type {
  Contract, DocumentComparisonResponse, DocumentComparisonClause,
  ComparisonStatus,
} from '../../../types';

type ComparisonMode = 'contract-template' | 'contract-contract';
type ViewMode = 'side-by-side' | 'unified-diff' | 'tabbed';

/** Natural sort comparator for clause codes like "1.1", "2", "10.3" */
function compareClauseCodes(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

interface ClauseTreeNode {
  clause: DocumentComparisonClause;
  children: ClauseTreeNode[];
}

/** Build a tree from flat sorted clauses. "1" is parent of "1.1", "1.2", etc. */
function buildClauseTree(clauses: DocumentComparisonClause[]): ClauseTreeNode[] {
  const roots: ClauseTreeNode[] = [];
  const nodeMap = new Map<string, ClauseTreeNode>();

  for (const clause of clauses) {
    const node: ClauseTreeNode = { clause, children: [] };
    nodeMap.set(clause.clause_code, node);

    const parts = clause.clause_code.split('.');
    if (parts.length > 1) {
      const parentCode = parts.slice(0, -1).join('.');
      const parent = nodeMap.get(parentCode);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  return roots;
}

const STATUS_STYLES: Record<ComparisonStatus, { bg: string; text: string; label: string }> = {
  REPLACED: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-800 dark:text-amber-300', label: 'Changed' },
  UNCHANGED: { bg: 'bg-gray-100 dark:bg-gray-700/50', text: 'text-gray-600 dark:text-gray-400', label: 'Unchanged' },
  ADDED: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-300', label: 'Only in B' },
  DELETED: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300', label: 'Only in A' },
};

/** Strip unified diff headers and produce a concise label for display */
function formatDiffSummaryLabel(raw: string): string {
  const lines = raw.split('\n').filter(
    (l) => !l.startsWith('---') && !l.startsWith('+++') && !l.startsWith('@@')
  );
  const added = lines.filter((l) => l.startsWith('+')).length;
  const removed = lines.filter((l) => l.startsWith('-')).length;
  if (added + removed === 0) return raw.slice(0, 80);
  const parts: string[] = [];
  if (removed > 0) parts.push(`${removed} removed`);
  if (added > 0) parts.push(`${added} added`);
  return parts.join(', ');
}

export function ContractComparison({
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

  // Mode
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('contract-template');

  // Documents
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(true);
  const [contractAId, setContractAId] = useState<number | null>(null);
  const [contractBId, setContractBId] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);

  // Comparison
  const [comparisonResult, setComparisonResult] = useState<DocumentComparisonResponse | null>(null);
  const [selectedClauseCode, setSelectedClauseCode] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  // View
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [activeTab, setActiveTab] = useState<'doc-a' | 'doc-b' | 'final'>('doc-a');

  // Text search (client-side)
  const [searchQuery, setSearchQuery] = useState('');

  // Status tag filters
  const [activeStatusFilters, setActiveStatusFilters] = useState<Set<ComparisonStatus>>(new Set());

  // Tree collapse state
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  // Load contracts on mount
  useEffect(() => {
    loadContracts();
  }, []);

  // Auto-set templateId from contractA's template_id
  useEffect(() => {
    if (contractAId !== null) {
      const contract = contracts.find((c) => c.id === contractAId);
      if (contract) {
        setTemplateId(contract.template_id);
      }
    }
  }, [contractAId, contracts]);

  // Reset when mode changes
  useEffect(() => {
    setComparisonResult(null);
    setSelectedClauseCode(null);
    setSearchQuery('');
    setActiveStatusFilters(new Set());
    setContractBId(null);
  }, [comparisonMode]);

  const loadContracts = async () => {
    setIsLoadingContracts(true);
    try {
      const data = await contractService.getContracts();
      setContracts(data.contracts);
      if (data.contracts.length > 0) {
        setContractAId(data.contracts[0].id);
      }
    } catch {
      showToast('Failed to load contracts', 'error');
    } finally {
      setIsLoadingContracts(false);
    }
  };

  // Push AI context for GlobalChatbot
  useEffect(() => {
    if (comparisonMode === 'contract-contract' && contractAId && contractBId) {
      setAIContext({
        contextType: 'comparison',
        contextLabel: 'Comparison: Contract vs Contract',
        multiContractIds: [contractAId, contractBId],
        templateId: templateId ?? undefined,
      });
    } else if (comparisonMode === 'contract-template' && contractAId) {
      setAIContext({
        contextType: 'comparison',
        contextLabel: 'Comparison: Contract vs Template',
        contractId: contractAId,
        templateId: templateId ?? undefined,
      });
    }
    return () => {
      setAIContext({ contextType: 'general', contextLabel: 'General' });
    };
  }, [comparisonMode, contractAId, contractBId, templateId, setAIContext]);

  // Push clause code for GlobalChatbot
  useEffect(() => {
    setClauseCode(selectedClauseCode ?? undefined);
  }, [selectedClauseCode, setClauseCode]);

  // Sort and filter clauses
  const sortedClauses = useMemo(() => {
    if (!comparisonResult) return [];
    return [...comparisonResult.results].sort((a, b) => compareClauseCodes(a.clause_code, b.clause_code));
  }, [comparisonResult]);

  const toggleStatusFilter = useCallback((status: ComparisonStatus) => {
    setActiveStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const filteredClauses = useMemo(() => {
    let result = sortedClauses;

    // Apply status filter
    if (activeStatusFilters.size > 0) {
      result = result.filter((clause) => activeStatusFilters.has(clause.diff_type));
    }

    // Apply text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (clause) =>
          clause.clause_code.toLowerCase().includes(q) ||
          (clause.clause_a_text && clause.clause_a_text.toLowerCase().includes(q)) ||
          (clause.clause_b_text && clause.clause_b_text.toLowerCase().includes(q)) ||
          (clause.diff_summary && clause.diff_summary.toLowerCase().includes(q)) ||
          (clause.final_text && clause.final_text.toLowerCase().includes(q))
      );
    }

    return result;
  }, [sortedClauses, searchQuery, activeStatusFilters]);

  const clauseTree = useMemo(() => buildClauseTree(filteredClauses), [filteredClauses]);

  const toggleCollapse = useCallback((code: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const selectedClause = useMemo(() => {
    if (!selectedClauseCode || !comparisonResult) return null;
    return comparisonResult.results.find((c) => c.clause_code === selectedClauseCode) ?? null;
  }, [selectedClauseCode, comparisonResult]);

  // Reset tab if current clause has no final_text while "final" tab is active
  useEffect(() => {
    if (activeTab === 'final' && selectedClause && !selectedClause.final_text) {
      setActiveTab('doc-a');
    }
  }, [activeTab, selectedClause]);

  const handleCompare = async () => {
    if (contractAId === null) return;

    if (comparisonMode === 'contract-template') {
      if (templateId === null) {
        showToast('No template associated with this contract', 'error');
        return;
      }
    } else {
      if (contractBId === null) {
        showToast('Select a second contract to compare', 'error');
        return;
      }
      if (contractAId === contractBId) {
        showToast('Please select two different contracts', 'error');
        return;
      }
    }

    setIsComparing(true);
    setComparisonResult(null);
    setSelectedClauseCode(null);

    try {
      let result: DocumentComparisonResponse;
      if (comparisonMode === 'contract-template') {
        result = await comparisonService.compareDocuments('template', templateId!, 'contract', contractAId);
      } else {
        result = await comparisonService.compareDocuments('contract', contractAId, 'contract', contractBId!);
      }
      setComparisonResult(result);
      if (result.results.length > 0) {
        setSelectedClauseCode(result.results[0].clause_code);
      }
    } catch {
      showToast('Failed to run comparison', 'error');
    } finally {
      setIsComparing(false);
    }
  };

  const contractAName = contracts.find((c) => c.id === contractAId)?.name ?? 'Document A';
  const contractBName =
    comparisonMode === 'contract-template'
      ? templates.find((t) => t.id === templateId)?.name ?? 'Template'
      : contracts.find((c) => c.id === contractBId)?.name ?? 'Document B';

  const docALabel = comparisonResult?.document_a.name ?? contractAName;
  const docBLabel = comparisonResult?.document_b.name ?? contractBName;

  return (
    <div className="flex">
      <div className="w-full space-y-4">
        {/* Header info */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
            {isRTL ? 'مقارنة العقود' : 'Contract Comparison'}
          </h3>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            {isRTL
              ? 'قارن بين مسودات المقاولين وقالب FIDIC الخاص بك. حدد البنود المتغيرة وقيم المخاطر.'
              : 'Compare contractor drafts against your FIDIC template or compare two contracts side-by-side.'}
          </p>
        </div>

        {/* Mode toggle + selectors + compare button */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setComparisonMode('contract-template')}
              className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${
                comparisonMode === 'contract-template'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <FileTextIcon size={16} />
              {isRTL ? 'عقد مقابل قالب' : 'Contract vs Template'}
            </button>
            <button
              onClick={() => setComparisonMode('contract-contract')}
              className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${
                comparisonMode === 'contract-contract'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <GitCompareIcon size={16} />
              {isRTL ? 'عقد مقابل عقد' : 'Contract vs Contract'}
            </button>
          </div>

          {/* Selectors row */}
          <div className="flex flex-wrap items-end gap-4">
            {/* Contract A */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {comparisonMode === 'contract-template'
                  ? (isRTL ? 'العقد' : 'Contract')
                  : (isRTL ? 'العقد الأول' : 'Contract A')}
              </label>
              <select
                value={contractAId ?? ''}
                onChange={(e) => setContractAId(Number(e.target.value) || null)}
                disabled={isLoadingContracts}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
              >
                <option value="">
                  {isLoadingContracts ? 'Loading...' : (isRTL ? 'اختر عقدًا' : 'Select contract...')}
                </option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.clause_count} clauses)
                  </option>
                ))}
              </select>
            </div>

            {/* Document B selector */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {comparisonMode === 'contract-template'
                  ? (isRTL ? 'القالب' : 'Template')
                  : (isRTL ? 'العقد الثاني' : 'Contract B')}
              </label>
              {comparisonMode === 'contract-template' ? (
                <div className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300">
                  {templateId !== null
                    ? templates.find((t) => t.id === templateId)?.name ?? `Template #${templateId}`
                    : (isRTL ? 'يتم تحديده تلقائيًا من العقد' : 'Auto-detected from contract')}
                </div>
              ) : (
                <select
                  value={contractBId ?? ''}
                  onChange={(e) => setContractBId(Number(e.target.value) || null)}
                  disabled={isLoadingContracts}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                >
                  <option value="">{isRTL ? 'اختر العقد الثاني' : 'Select contract...'}</option>
                  {contracts
                    .filter((c) => c.id !== contractAId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.clause_count} clauses)
                      </option>
                    ))}
                </select>
              )}
            </div>

            {/* Compare button */}
            <button
              onClick={handleCompare}
              disabled={isComparing || contractAId === null || (comparisonMode === 'contract-template' ? templateId === null : contractBId === null)}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              {isComparing ? (
                <LoaderIcon size={16} className="animate-spin" />
              ) : (
                <GitCompareIcon size={16} />
              )}
              {isRTL ? 'قارن' : 'Compare'}
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {comparisonResult && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <SummaryCard label="Total" value={comparisonResult.total_clauses} color="gray" />
              <SummaryCard label="Matched" value={comparisonResult.matched} color="blue" />
              <SummaryCard label="Changed" value={comparisonResult.changed} color="amber" />
              <SummaryCard label="Unchanged" value={comparisonResult.unchanged} color="gray" />
              <SummaryCard label="Only in A" value={comparisonResult.only_in_a} color="red" />
              <SummaryCard label="Only in B" value={comparisonResult.only_in_b} color="green" />
            </div>

            {/* Distribution bar */}
            {comparisonResult.total_clauses > 0 && (
              <div className="mt-3 flex h-2.5 rounded-full overflow-hidden">
                {comparisonResult.unchanged > 0 && (
                  <div
                    className="bg-gray-400"
                    style={{ width: `${(comparisonResult.unchanged / comparisonResult.total_clauses) * 100}%` }}
                    title={`Unchanged: ${comparisonResult.unchanged}`}
                  />
                )}
                {comparisonResult.changed > 0 && (
                  <div
                    className="bg-amber-500"
                    style={{ width: `${(comparisonResult.changed / comparisonResult.total_clauses) * 100}%` }}
                    title={`Changed: ${comparisonResult.changed}`}
                  />
                )}
                {comparisonResult.only_in_a > 0 && (
                  <div
                    className="bg-red-500"
                    style={{ width: `${(comparisonResult.only_in_a / comparisonResult.total_clauses) * 100}%` }}
                    title={`Only in A: ${comparisonResult.only_in_a}`}
                  />
                )}
                {comparisonResult.only_in_b > 0 && (
                  <div
                    className="bg-green-500"
                    style={{ width: `${(comparisonResult.only_in_b / comparisonResult.total_clauses) * 100}%` }}
                    title={`Only in B: ${comparisonResult.only_in_b}`}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Main content: clause list + clause detail */}
        {comparisonResult && (
          <div className="flex gap-4">
            {/* Clause list (left) */}
            <div className="w-1/3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col max-h-[600px]">
              <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <div className="relative">
                  <SearchIcon size={16} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder={isRTL ? 'بحث في البنود...' : 'Filter clauses...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                {/* Status filter chips */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(Object.entries(STATUS_STYLES) as [ComparisonStatus, (typeof STATUS_STYLES)[ComparisonStatus]][]).map(
                    ([status, style]) => {
                      const isActive = activeStatusFilters.has(status);
                      return (
                        <button
                          key={status}
                          onClick={() => toggleStatusFilter(status)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                            isActive
                              ? `${style.bg} ${style.text} border-current`
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {style.label}
                        </button>
                      );
                    }
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {filteredClauses.length} of {comparisonResult.results.length} clauses
                  {activeStatusFilters.size > 0 && ' (filtered)'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto">
                {clauseTree.map((node) => (
                  <ClauseTreeItem
                    key={node.clause.clause_code}
                    node={node}
                    depth={0}
                    selectedClauseCode={selectedClauseCode}
                    collapsedNodes={collapsedNodes}
                    onSelect={setSelectedClauseCode}
                    onToggle={toggleCollapse}
                  />
                ))}
                {filteredClauses.length === 0 && (
                  <p className="text-sm text-gray-500 p-4 text-center">
                    {searchQuery ? 'No clauses match your search' : 'No clauses found'}
                  </p>
                )}
              </div>
            </div>

            {/* Clause content (right) */}
            <div className="w-2/3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col max-h-[600px]">
              {/* Toolbar */}
              <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
                <div>
                  {selectedClause ? (
                    <>
                      <h4 className="text-sm font-medium text-gray-800 dark:text-white">
                        Clause {selectedClause.clause_code}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[selectedClause.diff_type].bg} ${STATUS_STYLES[selectedClause.diff_type].text}`}>
                          {STATUS_STYLES[selectedClause.diff_type].label}
                        </span>
                        {selectedClause.diff_summary && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[300px]" title={selectedClause.diff_summary}>
                            {formatDiffSummaryLabel(selectedClause.diff_summary)}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">{isRTL ? 'اختر بندًا' : 'Select a clause'}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* View mode toggle */}
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                    <button
                      onClick={() => setViewMode('side-by-side')}
                      className={`px-2.5 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors ${
                        viewMode === 'side-by-side'
                          ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                      }`}
                      title="Side by side"
                    >
                      <ColumnsIcon size={14} />
                    </button>
                    <button
                      onClick={() => setViewMode('unified-diff')}
                      className={`px-2.5 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors ${
                        viewMode === 'unified-diff'
                          ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                      }`}
                      title="Unified diff"
                    >
                      <CodeIcon size={14} />
                    </button>
                    <button
                      onClick={() => setViewMode('tabbed')}
                      className={`px-2.5 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors ${
                        viewMode === 'tabbed'
                          ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                      }`}
                      title="Tabbed view"
                    >
                      <LayoutListIcon size={14} />
                    </button>
                  </div>

                </div>
              </div>

              {/* Clause content area */}
              <div className="flex-1 overflow-y-auto">
                {selectedClause ? (
                  viewMode === 'side-by-side' ? (
                    <SideBySideView clause={selectedClause} docALabel={docALabel} docBLabel={docBLabel} />
                  ) : viewMode === 'unified-diff' ? (
                    <UnifiedDiffView clause={selectedClause} docALabel={docALabel} docBLabel={docBLabel} />
                  ) : (
                    <TabbedView
                      clause={selectedClause}
                      docALabel={docALabel}
                      docBLabel={docBLabel}
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                    />
                  )
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 p-8">
                    <p className="text-sm">{isRTL ? 'اختر بندًا لعرض المقارنة' : 'Select a clause to view comparison'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Empty state when no comparison yet */}
        {!comparisonResult && !isComparing && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-12 flex flex-col items-center justify-center text-center">
            <GitCompareIcon size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {isRTL ? 'اختر المستندات وانقر على "قارن" لبدء المقارنة' : 'Select documents and click "Compare" to start'}
            </p>
          </div>
        )}

        {/* Loading state */}
        {isComparing && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 flex flex-col items-center justify-center">
            <LoaderIcon size={32} className="animate-spin text-blue-500 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isRTL ? 'جاري المقارنة...' : 'Running comparison...'}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {comparisonResult
              ? `${comparisonResult.total_clauses} clauses analyzed`
              : isRTL ? 'قم بتشغيل المقارنة' : 'Run a comparison to analyze'}
          </p>
          <button
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center transition-colors"
            onClick={onContinue}
          >
            {isRTL ? 'المتابعة إلى التفعيل' : 'Continue to Activation'}
            <ArrowRightIcon size={16} className="ml-2" />
          </button>
        </div>
      </div>

    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function ClauseTreeItem({
  node,
  depth,
  selectedClauseCode,
  collapsedNodes,
  onSelect,
  onToggle,
}: {
  node: ClauseTreeNode;
  depth: number;
  selectedClauseCode: string | null;
  collapsedNodes: Set<string>;
  onSelect: (code: string) => void;
  onToggle: (code: string) => void;
}) {
  const { clause, children } = node;
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedNodes.has(clause.clause_code);
  const isSelected = selectedClauseCode === clause.clause_code;
  const style = STATUS_STYLES[clause.diff_type];

  return (
    <>
      <button
        onClick={() => onSelect(clause.clause_code)}
        className={`w-full text-left py-2 pr-3 border-b border-gray-100 dark:border-gray-700/50 transition-colors ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-900/30'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <div className="flex items-center gap-1.5">
          {hasChildren ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onToggle(clause.clause_code);
              }}
              className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
            >
              {isCollapsed ? <ChevronRightIcon size={14} /> : <ChevronDownIcon size={14} />}
            </span>
          ) : (
            <span className="flex-shrink-0 w-4" />
          )}
          <span className="text-sm font-medium text-gray-800 dark:text-white truncate">
            {clause.clause_code}
          </span>
          <span className={`ml-auto flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.text}`}>
            {style.label}
          </span>
        </div>
        {clause.diff_summary && depth === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1" style={{ marginLeft: `${hasChildren ? 22 : 22}px` }}>
            {clause.diff_summary}
          </p>
        )}
      </button>
      {hasChildren && !isCollapsed &&
        children.map((child) => (
          <ClauseTreeItem
            key={child.clause.clause_code}
            node={child}
            depth={depth + 1}
            selectedClauseCode={selectedClauseCode}
            collapsedNodes={collapsedNodes}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-50 dark:bg-gray-700/50 text-gray-800 dark:text-gray-200',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  };
  return (
    <div className={`rounded-lg p-3 text-center ${colorMap[color] ?? colorMap.gray}`}>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function getPlaceholder(
  text: string | null,
  side: 'a' | 'b',
  status: DocumentComparisonClause['status'],
  label: string
): string {
  if (text) return ''; // has content, no placeholder needed
  // If the clause is supposed to exist on this side but text is missing
  const clauseBelongsHere = (side === 'a' && status === 'only_in_a') || (side === 'b' && status === 'only_in_b');
  if (clauseBelongsHere) return 'Clause text not available';
  return `Clause not present in ${label}`;
}

function SideBySideView({
  clause,
  docALabel,
  docBLabel,
}: {
  clause: DocumentComparisonClause;
  docALabel: string;
  docBLabel: string;
}) {
  const placeholderA = getPlaceholder(clause.clause_a_text, 'a', clause.status, docALabel);
  const placeholderB = getPlaceholder(clause.clause_b_text, 'b', clause.status, docBLabel);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        {/* Doc A panel */}
        <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{docALabel}</span>
          </div>
          <div className="flex-1 p-3 overflow-y-auto">
            {clause.clause_a_text ? (
              <p className="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {clause.clause_a_text}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic">{placeholderA}</p>
            )}
          </div>
        </div>

        {/* Doc B panel */}
        <div className="w-1/2 flex flex-col">
          <div className="px-3 py-2 bg-green-50 dark:bg-green-900/20 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-green-700 dark:text-green-300">{docBLabel}</span>
          </div>
          <div className="flex-1 p-3 overflow-y-auto">
            {clause.clause_b_text ? (
              <p className="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {clause.clause_b_text}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic">{placeholderB}</p>
            )}
          </div>
        </div>
      </div>

      {/* Final Text panel */}
      {clause.final_text && (
        <div className="border-t border-gray-200 dark:border-gray-700 flex flex-col max-h-[200px]">
          <div className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Final Text</span>
          </div>
          <div className="flex-1 p-3 overflow-y-auto">
            <p className="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {clause.final_text}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Diff helpers ────────────────────────────────────────────

interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
}

/** Parse sentence-level unified diff from backend diff_summary */
function parseDiffSummary(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('---') || raw.startsWith('+++') || raw.startsWith('@@')) continue;
    if (raw.startsWith('-')) {
      lines.push({ type: 'removed', text: raw.slice(1) });
    } else if (raw.startsWith('+')) {
      lines.push({ type: 'added', text: raw.slice(1) });
    } else if (raw.startsWith(' ')) {
      lines.push({ type: 'same', text: raw.slice(1) });
    } else if (raw.trim()) {
      lines.push({ type: 'same', text: raw });
    }
  }
  return lines;
}

// ─── Diff view component ────────────────────────────────────

function UnifiedDiffView({
  clause,
  docALabel,
  docBLabel,
}: {
  clause: DocumentComparisonClause;
  docALabel: string;
  docBLabel: string;
}) {
  if (clause.diff_type === 'UNCHANGED') {
    return <SideBySideView clause={clause} docALabel={docALabel} docBLabel={docBLabel} />;
  }

  // Only-in-A or Only-in-B
  if (clause.diff_type === 'ADDED' || clause.diff_type === 'DELETED') {
    const text = clause.clause_a_text || clause.clause_b_text;
    const isAdded = clause.diff_type === 'ADDED';
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isAdded ? `Clause only present in ${docBLabel}` : `Clause only present in ${docALabel}`}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <p className={`text-sm whitespace-pre-wrap leading-relaxed p-3 rounded border-l-4 ${
            isAdded
              ? 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-200 border-green-500'
              : 'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 border-red-500'
          }`}>
            {text}
          </p>
        </div>
      </div>
    );
  }

  // REPLACED — parse backend sentence-level diff_summary
  const diffLines = useMemo(() => {
    if (clause.diff_summary) {
      return parseDiffSummary(clause.diff_summary);
    }
    return null;
  }, [clause.diff_summary]);

  // Fallback if no diff_summary available
  if (!diffLines || diffLines.length === 0) {
    return <SideBySideView clause={clause} docALabel={docALabel} docBLabel={docBLabel} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-200 dark:bg-red-900/50 border border-red-400" />
          <span className="text-xs text-gray-600 dark:text-gray-400">{docALabel} (removed)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900/50 border border-green-400" />
          <span className="text-xs text-gray-600 dark:text-gray-400">{docBLabel} (added)</span>
        </div>
      </div>

      {/* Sentence-level diff lines from backend */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {diffLines.map((line, i) => {
          if (line.type === 'same') {
            return (
              <p key={i} className="text-sm text-gray-800 dark:text-gray-300 leading-relaxed">
                {line.text}
              </p>
            );
          }
          if (line.type === 'removed') {
            return (
              <p
                key={i}
                className="text-sm leading-relaxed bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-2 py-1 rounded border-l-4 border-red-400 line-through decoration-red-400/60"
              >
                {line.text}
              </p>
            );
          }
          return (
            <p
              key={i}
              className="text-sm leading-relaxed bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-2 py-1 rounded border-l-4 border-green-400"
            >
              {line.text}
            </p>
          );
        })}
      </div>

      {/* Final Text panel */}
      {clause.final_text && (
        <div className="border-t border-gray-200 dark:border-gray-700 flex flex-col max-h-[200px]">
          <div className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Final Text</span>
          </div>
          <div className="flex-1 p-3 overflow-y-auto">
            <p className="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {clause.final_text}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function TabbedView({
  clause,
  docALabel,
  docBLabel,
  activeTab,
  onTabChange,
}: {
  clause: DocumentComparisonClause;
  docALabel: string;
  docBLabel: string;
  activeTab: 'doc-a' | 'doc-b' | 'final';
  onTabChange: (tab: 'doc-a' | 'doc-b' | 'final') => void;
}) {
  let text: string | null;
  let placeholder: string;

  if (activeTab === 'final') {
    text = clause.final_text;
    placeholder = 'Final text not available';
  } else {
    text = activeTab === 'doc-a' ? clause.clause_a_text : clause.clause_b_text;
    const side = activeTab === 'doc-a' ? 'a' as const : 'b' as const;
    const label = activeTab === 'doc-a' ? docALabel : docBLabel;
    placeholder = getPlaceholder(text, side, clause.status, label);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => onTabChange('doc-a')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'doc-a'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {docALabel}
        </button>
        <button
          onClick={() => onTabChange('doc-b')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'doc-b'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {docBLabel}
        </button>
        {clause.final_text && (
          <button
            onClick={() => onTabChange('final')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'final'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Final Text
          </button>
        )}
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        {text ? (
          <p className="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{text}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">{placeholder}</p>
        )}
      </div>
    </div>
  );
}
