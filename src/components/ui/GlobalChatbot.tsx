import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  MessageSquareTextIcon, XIcon, SendIcon, MinimizeIcon, MaximizeIcon,
  BrainIcon, ChevronDownIcon, ChevronRightIcon, WrenchIcon,
  RefreshCwIcon, CopyIcon,
} from 'lucide-react';
import { conversationService } from '../../services';
import { useAIAssistant } from '../../context/AIAssistantContext';
import { useToast } from '../../context/ToastContext';
import type { ToolCall } from '../../types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[] | null;
}

const getSuggestedPrompts = (contextType: string): string[] => {
  switch (contextType) {
    case 'template':
      return [
        'Summarize this template clause',
        'What risks does this clause carry?',
        'Suggest improvements for clarity',
        'Compare with standard FIDIC wording',
      ];
    case 'contract':
      return [
        'Analyze deviations from template',
        'What are the key risk areas?',
        'Summarize uploaded contract',
        'Identify missing clauses',
      ];
    case 'comparison':
      return [
        'Explain the key differences',
        'Which contractor has lowest risk?',
        'Summarize risk assessment',
        'Recommend negotiation points',
      ];
    default:
      return [
        'How does the approval process work?',
        'What FIDIC books are available?',
        'Help me understand clause 8.4',
        'What are common contract risks?',
      ];
  }
};

interface GlobalChatbotProps {
  language?: string;
}

export function GlobalChatbot({ language = 'english' }: GlobalChatbotProps) {
  const isRTL = language === 'arabic';
  const { isAIAssistantOpen, toggleAIAssistant, aiContext } = useAIAssistant();
  const { showToast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isMultiContract, setIsMultiContract] = useState(false);

  // Context override: user can switch to "General"
  const [contextOverride, setContextOverride] = useState<'auto' | 'general'>('auto');
  const [contextDropdownOpen, setContextDropdownOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const contextKeyRef = useRef('');

  // Determine effective context
  const effectiveContextType = contextOverride === 'general' ? 'general' : aiContext.contextType;
  const effectiveLabel = contextOverride === 'general' ? 'General' : aiContext.contextLabel;

  // Build a key that changes when we need to reset conversation
  const contextKey = contextOverride === 'general'
    ? 'general'
    : `${aiContext.contextType}|${aiContext.templateId ?? ''}|${aiContext.contractId ?? ''}|${(aiContext.multiContractIds ?? []).join(',')}`;

  // Reset conversation when context key changes (but NOT when clauseCode changes)
  useEffect(() => {
    if (contextKeyRef.current && contextKeyRef.current !== contextKey) {
      setConversationId(null);
      setIsMultiContract(false);
      setMessages([]);
    }
    contextKeyRef.current = contextKey;
  }, [contextKey]);

  // Sync with sidebar AI button
  useEffect(() => {
    if (isAIAssistantOpen && !isOpen) {
      setIsOpen(true);
      setIsMinimized(false);
    }
  }, [isAIAssistantOpen, isOpen]);

  // Close sync: when user closes chatbot, also close the sidebar state
  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (isAIAssistantOpen) toggleAIAssistant();
  }, [isAIAssistantOpen, toggleAIAssistant]);

  // Scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current && isOpen && !isMinimized) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isOpen, isMinimized]);

  const ensureConversation = async (): Promise<string> => {
    if (conversationId) return conversationId;

    try {
      if (
        contextOverride !== 'general' &&
        aiContext.multiContractIds &&
        aiContext.multiContractIds.length >= 2
      ) {
        const session = await conversationService.createMultiContractSession(
          aiContext.multiContractIds,
          aiContext.templateId
        );
        setConversationId(session.conversation_id);
        setIsMultiContract(true);
        return session.conversation_id;
      }

      const conv = await conversationService.createConversation(
        effectiveContextType,
        contextOverride !== 'general' ? aiContext.contractId : undefined,
        contextOverride !== 'general' ? aiContext.templateId : undefined,
      );
      setConversationId(conv.conversation_id);
      setIsMultiContract(false);
      return conv.conversation_id;
    } catch (err) {
      showToast('Failed to start conversation', 'error');
      throw err;
    }
  };

  const handleSendMessage = async () => {
    const query = inputValue.trim();
    if (query === '' || isTyping) return;

    setMessages((prev) => [...prev, { role: 'user', content: query }]);
    setInputValue('');
    setIsTyping(true);

    try {
      const convId = await ensureConversation();
      const clauseCode = contextOverride !== 'general' ? aiContext.clauseCode : undefined;

      const response = isMultiContract
        ? await conversationService.sendMultiContractMessage(convId, query, clauseCode)
        : await conversationService.sendMessage(convId, query, clauseCode);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.assistant_message.content,
          toolCalls: response.assistant_message.tool_calls,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
      showToast('Failed to send message', 'error');
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearConversation = () => {
    setConversationId(null);
    setIsMultiContract(false);
    setMessages([]);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    showToast('Copied to clipboard', 'success');
  };

  const handleContextSelect = (mode: 'auto' | 'general') => {
    setContextOverride(mode);
    setContextDropdownOpen(false);
    // Reset conversation when user switches context mode
    setConversationId(null);
    setIsMultiContract(false);
    setMessages([]);
  };

  const suggestedPrompts = getSuggestedPrompts(effectiveContextType);
  const showSuggestions = messages.length === 0;

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => {
          if (isOpen) {
            handleClose();
          } else {
            setIsOpen(true);
            setIsMinimized(false);
          }
        }}
        className="fixed bottom-6 right-6 bg-blue-600 dark:bg-blue-500 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-all z-50"
        aria-label={isRTL ? 'فتح المساعد الذكي' : 'Open AI Assistant'}
      >
        {isOpen ? <XIcon size={24} /> : <MessageSquareTextIcon size={24} />}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          className={`fixed bottom-20 right-6 bg-gray-900 rounded-lg shadow-xl border border-gray-700 transition-all z-50 ${
            isMinimized ? 'w-72 h-14' : 'w-96 h-[600px] max-h-[80vh]'
          } flex flex-col`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-blue-600 text-white rounded-t-lg">
            <div className="flex items-center">
              <BrainIcon size={20} className="mr-2" />
              <h3 className="font-medium text-sm">{isRTL ? 'المساعد الذكي' : 'AI Assistant'}</h3>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="text-white hover:text-blue-100"
              >
                {isMinimized ? <MaximizeIcon size={18} /> : <MinimizeIcon size={18} />}
              </button>
              <button onClick={handleClose} className="text-white hover:text-blue-100">
                <XIcon size={18} />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Context selector */}
              <div className="px-3 py-2 border-b border-gray-700 bg-gray-800">
                <div className="relative">
                  <button
                    onClick={() => setContextDropdownOpen(!contextDropdownOpen)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600"
                  >
                    <div className="flex items-center">
                      <BrainIcon size={14} className="text-blue-400 mr-2" />
                      <span className="text-gray-100 truncate">
                        {effectiveLabel}
                      </span>
                    </div>
                    <ChevronDownIcon size={16} className="text-gray-300" />
                  </button>
                  {contextDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-md z-10">
                      <ul className="py-1">
                        {/* Auto-detected context */}
                        {aiContext.contextType !== 'general' && (
                          <li>
                            <button
                              onClick={() => handleContextSelect('auto')}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 ${
                                contextOverride === 'auto'
                                  ? 'bg-blue-900/30 text-blue-400'
                                  : 'text-gray-200'
                              }`}
                            >
                              {aiContext.contextLabel}
                              <span className="ml-1 text-xs text-gray-400">(auto)</span>
                            </button>
                          </li>
                        )}
                        {/* General override */}
                        <li>
                          <button
                            onClick={() => handleContextSelect('general')}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 ${
                              contextOverride === 'general' || aiContext.contextType === 'general'
                                ? 'bg-blue-900/30 text-blue-400'
                                : 'text-gray-200'
                            }`}
                          >
                            {isRTL ? 'عام' : 'General'}
                          </button>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 bg-gray-900">
                {/* Welcome + suggested prompts when empty */}
                {showSuggestions && (
                  <div className="text-center py-6">
                    <BrainIcon size={32} className="mx-auto mb-3 text-blue-400 opacity-60" />
                    <p className="text-sm text-gray-300 mb-4">
                      {isRTL
                        ? 'مرحبًا! كيف يمكنني مساعدتك اليوم؟'
                        : "Hello! How can I help you today?"}
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {suggestedPrompts.map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => setInputValue(prompt)}
                          className="px-3 py-1.5 text-xs bg-gray-800 text-gray-200 border border-gray-600 rounded-full hover:bg-gray-700 hover:border-blue-500 transition-colors"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chat messages */}
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`mb-3 ${message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg p-3 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 border border-gray-700 shadow-sm'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-line text-gray-100">
                        {message.content}
                      </p>

                      {/* Tool calls */}
                      {message.toolCalls && message.toolCalls.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {message.toolCalls.map((tool, i) => (
                            <ToolCallSection key={i} toolCall={tool} />
                          ))}
                        </div>
                      )}

                      {/* Actions for assistant messages */}
                      {message.role === 'assistant' && (
                        <div className="mt-2 pt-2 border-t border-gray-700 flex justify-between items-center">
                          <button
                            className="text-xs text-gray-400 hover:text-blue-400"
                            onClick={() => handleCopy(message.content)}
                          >
                            <CopyIcon size={12} className="inline mr-1" />
                            {isRTL ? 'نسخ' : 'Copy'}
                          </button>
                          <span className="text-xs text-gray-500">FIDIC AI</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-sm">
                      <div className="flex items-center space-x-1.5">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                        <span className="text-xs text-gray-400 ml-2">
                          {isRTL ? 'يفكر...' : 'Thinking...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-gray-700 bg-gray-800">
                <div className="relative">
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder={isRTL ? 'اكتب سؤالك هنا...' : 'Type your question here...'}
                    className="w-full pl-3 pr-10 py-2 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none bg-gray-700 text-white placeholder-gray-400"
                    rows={2}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={inputValue.trim() === '' || isTyping}
                    className={`absolute right-2 bottom-2 text-blue-400 hover:text-blue-300 ${
                      inputValue.trim() === '' || isTyping ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <SendIcon size={20} />
                  </button>
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-400">
                  <span>
                    {isRTL ? 'اسأل عن العقود والبنود والالتزامات' : 'Ask about contracts, clauses, and obligations'}
                  </span>
                  <button
                    onClick={handleClearConversation}
                    className="text-gray-400 hover:text-blue-400 flex items-center"
                    title={isRTL ? 'مسح المحادثة' : 'Clear conversation'}
                  >
                    <RefreshCwIcon size={14} className="mr-1" />
                    {isRTL ? 'مسح' : 'Clear'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function ToolCallSection({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-600 rounded text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 w-full px-2 py-1 text-left text-gray-300 hover:bg-gray-700 rounded"
      >
        <WrenchIcon size={12} />
        <span className="font-medium">{toolCall.name}</span>
        {expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
      </button>
      {expanded && (
        <div className="px-2 py-1 border-t border-gray-600 bg-gray-900 max-h-32 overflow-y-auto">
          <pre className="whitespace-pre-wrap text-gray-400">
            {JSON.stringify(toolCall.result ?? toolCall.arguments, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
