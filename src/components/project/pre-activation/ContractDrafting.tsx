import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowRightIcon, HistoryIcon, CheckIcon, FileTextIcon,
  EditIcon, GitCommitIcon, UploadIcon, ChevronRightIcon,
  ChevronDownIcon, SparklesIcon, XIcon, LoaderIcon,
} from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import * as Diff from 'diff';

import { useTemplates } from '../../../context/TemplateContext';
import { useToast } from '../../../context/ToastContext';
import { useAIAssistant } from '../../../context/AIAssistantContext';
import { useUploadProgress } from '../../../context/UploadProgressContext';
import { clauseService } from '../../../services';
import type { TemplateClause, SuggestEditResponse } from '../../../types';

// Build a tree from flat clause list
interface ClauseTreeNode extends TemplateClause {
  children: ClauseTreeNode[];
}

function buildClauseTree(clauses: TemplateClause[]): ClauseTreeNode[] {
  const map = new Map<number, ClauseTreeNode>();
  const roots: ClauseTreeNode[] = [];

  clauses.forEach((c) => map.set(c.id, { ...c, children: [] }));

  clauses.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parent_clause_id && map.has(c.parent_clause_id)) {
      map.get(c.parent_clause_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

// Diff helpers for local editing
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

export function ContractDrafting({
  onContinue,
  language = 'english',
}: {
  onContinue: (name: string) => void;
  language?: string;
}) {
  const isRTL = language === 'arabic';
  const { templates, loading: templatesLoading, fetchClauses, loadTemplates } = useTemplates();
  const { showToast } = useToast();
  const { setAIContext, setClauseCode } = useAIAssistant();
  const { addTemplateUpload } = useUploadProgress();

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  // Clause state
  const [clauses, setClauses] = useState<TemplateClause[]>([]);
  const [isLoadingClauses, setIsLoadingClauses] = useState(false);
  const [selectedClause, setSelectedClause] = useState<TemplateClause | null>(null);
  const [clauseContent, setClauseContent] = useState('');
  const [originalClauseContent, setOriginalClauseContent] = useState('');

  // AI edit suggestion
  const [editSuggestion, setEditSuggestion] = useState<SuggestEditResponse | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [isRequestingSuggestion, setIsRequestingSuggestion] = useState(false);

  // Upload modal
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadFidicBook, setUploadFidicBook] = useState('Red Book');
  const [uploadEditionYear, setUploadEditionYear] = useState(2017);
  const [uploadPageStart, setUploadPageStart] = useState('');
  const [uploadPageEnd, setUploadPageEnd] = useState('');

  const [viewMode, setViewMode] = useState('edit');
  const [showNamePopup, setShowNamePopup] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [, setIsSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-select first template
  useEffect(() => {
    if (templates.length > 0 && selectedTemplateId === null) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, selectedTemplateId]);

  // Fetch clauses when template changes
  useEffect(() => {
    if (selectedTemplateId === null) return;
    setIsLoadingClauses(true);
    setSelectedClause(null);
    setClauseContent('');
    setOriginalClauseContent('');
    setEditSuggestion(null);

    fetchClauses(selectedTemplateId)
      .then((data) => setClauses(data))
      .catch(() => showToast('Failed to load clauses', 'error'))
      .finally(() => setIsLoadingClauses(false));
  }, [selectedTemplateId, fetchClauses, showToast]);

  // Push AI context for GlobalChatbot
  useEffect(() => {
    if (selectedTemplateId !== null) {
      const template = templates.find((t) => t.id === selectedTemplateId);
      setAIContext({
        contextType: 'template',
        contextLabel: template ? `Template: ${template.name}` : 'Template',
        templateId: selectedTemplateId,
      });
    }
    return () => {
      setAIContext({ contextType: 'general', contextLabel: 'General' });
    };
  }, [selectedTemplateId, templates, setAIContext]);

  // Push clause code for GlobalChatbot
  useEffect(() => {
    setClauseCode(selectedClause?.clause_code);
  }, [selectedClause, setClauseCode]);

  const handleTemplateSelect = (id: number) => {
    setSelectedTemplateId(id);
    setIsSaved(false);
  };

  const handleClauseSelect = (clause: TemplateClause) => {
    setSelectedClause(clause);
    setClauseContent(clause.content);
    setOriginalClauseContent(clause.content);
    setEditSuggestion(null);
    setIsSaved(false);
  };

  const handleUploadClick = () => {
    setUploadModalOpen(true);
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadName.trim()) {
      showToast('Please provide a name for the template', 'warning');
      return;
    }

    const name = uploadName;
    const book = uploadFidicBook;
    const year = uploadEditionYear;
    const ps = uploadPageStart ? parseInt(uploadPageStart) : undefined;
    const pe = uploadPageEnd ? parseInt(uploadPageEnd) : undefined;

    // Close modal immediately and delegate to global progress context
    setUploadModalOpen(false);
    setUploadName('');
    setUploadPageStart('');
    setUploadPageEnd('');

    addTemplateUpload({
      file,
      name,
      fidicBook: book,
      editionYear: year,
      pageStart: ps,
      pageEnd: pe,
      onComplete: () => {
        loadTemplates();
      },
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetToOriginal = () => {
    if (selectedClause) {
      setClauseContent(originalClauseContent);
      setIsSaved(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedClause) return;
    try {
      await clauseService.directUpdate(selectedClause.id, stripHtml(clauseContent), 'template');
      setOriginalClauseContent(clauseContent);
      setIsSaved(true);
      showToast('Clause saved successfully', 'success');
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
        'template',
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
        'template'
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

  const handleSaveAndContinue = () => {
    if (draftName.trim() === '') {
      showToast('Please enter a name for the draft', 'warning');
      return;
    }
    onContinue(draftName);
    setShowNamePopup(false);
  };

  const clauseTree = buildClauseTree(clauses);
  const diffResult = generateDiff(originalClauseContent, clauseContent);

  return (
    <div className="space-y-6">
      <style>{`
        .dark .ql-toolbar.ql-snow { background-color: #1f2937; border-color: #374151; }
        .dark .ql-container.ql-snow { background-color: #111827; border-color: #374151; color: #d1d5db; }
        .dark .ql-snow .ql-stroke { stroke: #9ca3af; }
        .dark .ql-snow .ql-fill { fill: #9ca3af; }
        .dark .ql-snow .ql-picker { color: #d1d5db; }
        .dark .ql-snow .ql-picker-options { background-color: #1f2937; border-color: #374151; }
      `}</style>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
          {isRTL ? 'صياغة العقد' : 'Contract Drafting'}
        </h3>
        <p className="text-xs text-blue-700 dark:text-blue-300">
          {isRTL
            ? 'اختر قالب FIDIC كأساس، ثم قم بتعديل البنود حسب احتياجات مشروعك.'
            : 'Choose a FIDIC template as your baseline, then edit clauses to suit your project needs.'}
        </p>
      </div>

      <div className="flex">
        <div className="w-full space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left sidebar: Template selection + clause tree */}
            <div className="md:col-span-1 space-y-4">
              {/* Template selection */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-medium text-gray-800 dark:text-white">
                    {isRTL ? 'اختر قالب FIDIC' : 'Select FIDIC Template'}
                  </h3>
                  <button
                    onClick={handleUploadClick}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 flex items-center"
                  >
                    <UploadIcon size={14} className="mr-1" />
                    {isRTL ? 'تحميل قالب' : 'Upload Template'}
                  </button>
                </div>

                {templatesLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <LoaderIcon size={20} className="animate-spin text-blue-500" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className={`border rounded-lg p-3 cursor-pointer transition-all duration-200 ${
                          selectedTemplateId === template.id
                            ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => handleTemplateSelect(template.id)}
                      >
                        <div className="flex items-start">
                          <input
                            type="radio"
                            className="h-4 w-4 mt-0.5 text-blue-600 border-gray-300"
                            checked={selectedTemplateId === template.id}
                            readOnly
                          />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {template.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {template.fidic_book} ({template.edition_year}) &middot; {template.clause_count} clauses
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Clause tree */}
              {selectedTemplateId !== null && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-800 dark:text-white mb-3">
                    {isRTL ? 'بنود القالب' : 'Template Clauses'}
                  </h3>
                  {isLoadingClauses ? (
                    <div className="flex items-center justify-center py-6">
                      <LoaderIcon size={20} className="animate-spin text-blue-500" />
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto space-y-1">
                      {clauseTree.map((node) => (
                        <ClauseTreeItem
                          key={node.id}
                          node={node}
                          selectedId={selectedClause?.id ?? null}
                          onSelect={handleClauseSelect}
                        />
                      ))}
                      {clauseTree.length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
                          No clauses found for this template.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Main editor area */}
            <div className="md:col-span-2">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center">
                    <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {selectedClause
                        ? `${selectedClause.clause_code} - ${selectedClause.title}`
                        : isRTL ? 'اختر بندًا للتحرير' : 'Select a clause to edit'}
                    </h3>
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
                  </div>
                  <div className="flex space-x-2">
                    <button
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 flex items-center"
                      onClick={handleResetToOriginal}
                      disabled={!selectedClause}
                    >
                      <HistoryIcon size={14} className="mr-1" />
                      {isRTL ? 'إعادة تعيين' : 'Reset'}
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 flex items-center disabled:opacity-50"
                      onClick={handleSaveChanges}
                      disabled={!selectedClause}
                    >
                      <CheckIcon size={14} className="mr-1" />
                      {isRTL ? 'حفظ' : 'Save'}
                    </button>
                  </div>
                </div>

                {selectedClause ? (
                  <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
                    {viewMode === 'edit' ? (
                      <ReactQuill
                        theme="snow"
                        value={clauseContent}
                        onChange={setClauseContent}
                        className="h-[400px] mb-12"
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
                      <div className="w-full h-[400px] text-sm text-gray-800 dark:text-gray-300 overflow-y-auto font-mono bg-white dark:bg-gray-900">
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
                  <div className="flex items-center justify-center h-[400px] text-gray-400 dark:text-gray-500 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                    <div className="text-center">
                      <FileTextIcon size={40} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">
                        {isRTL ? 'اختر بندًا من القائمة للبدء في التحرير' : 'Select a clause from the tree to start editing'}
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
        </div>

      </div>

      <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {isRTL ? 'العقد جاهز للموافقة' : 'Contract ready for approval'}
        </p>
        <button
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center transition-colors duration-200"
          onClick={() => setShowNamePopup(true)}
        >
          {isRTL ? 'المتابعة إلى موافقة الصياغة' : 'Continue to Drafting Approval'}
          <ArrowRightIcon size={16} className="ml-2" />
        </button>
      </div>

      {/* Name popup */}
      {showNamePopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-1/3">
            <h3 className="text-lg font-medium mb-4 text-gray-900 dark:text-white">Name Your Draft</h3>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md mb-4 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="e.g., Metro Line 3 - Final Draft"
            />
            <div className="flex justify-end space-x-2">
              <button onClick={() => setShowNamePopup(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleSaveAndContinue} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                Save and Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload template modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-medium mb-4 text-gray-900 dark:text-white">
              {isRTL ? 'تحميل قالب جديد' : 'Upload New Template'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., FIDIC Red Book 2017"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">FIDIC Book</label>
                <select
                  value={uploadFidicBook}
                  onChange={(e) => setUploadFidicBook(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="Red Book">Red Book</option>
                  <option value="Yellow Book">Yellow Book</option>
                  <option value="Silver Book">Silver Book</option>
                  <option value="Green Book">Green Book</option>
                  <option value="White Book">White Book</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Edition Year</label>
                <input
                  type="number"
                  value={uploadEditionYear}
                  onChange={(e) => setUploadEditionYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Page Start</label>
                  <input
                    type="number"
                    value={uploadPageStart}
                    onChange={(e) => setUploadPageStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Page End</label>
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
                onClick={() => setUploadModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleFileSelect}
                disabled={!uploadName.trim()}
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

// Clause tree item component
function ClauseTreeItem({
  node,
  selectedId,
  onSelect,
  depth = 0,
}: {
  node: ClauseTreeNode;
  selectedId: number | null;
  onSelect: (clause: TemplateClause) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center py-1.5 px-2 rounded cursor-pointer text-sm transition-colors ${
          selectedId === node.id
            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          onSelect(node);
          if (hasChildren) setExpanded(!expanded);
        }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDownIcon size={14} className="mr-1 flex-shrink-0" />
          ) : (
            <ChevronRightIcon size={14} className="mr-1 flex-shrink-0" />
          )
        ) : (
          <span className="w-[14px] mr-1 flex-shrink-0" />
        )}
        <span className="font-medium mr-2">{node.clause_code}</span>
        <span className="truncate text-xs text-gray-500 dark:text-gray-400">{node.title}</span>
      </div>
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <ClauseTreeItem
            key={child.id}
            node={child}
            selectedId={selectedId}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}
