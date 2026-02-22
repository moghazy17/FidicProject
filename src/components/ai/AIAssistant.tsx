import React, { useState, useRef, useEffect } from 'react';
import {
  SendIcon,
  BrainIcon,
  XIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  RefreshCwIcon,
  CopyIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  WrenchIcon,
} from 'lucide-react';
import { conversationService } from '../../services';
import { useToast } from '../../context/ToastContext';
import type { ToolCall } from '../../types';

interface AIAssistantProps {
  onClose: () => void;
  isRTL?: boolean;
  contextType?: string;
  contractId?: number;
  templateId?: number;
  clauseCode?: string;
  initialConversationId?: string;
}

interface DisplayMessage {
  role: 'user' | 'system';
  content: string;
  toolCalls?: ToolCall[] | null;
}

const getSuggestedPrompts = (contextType?: string): string[] => {
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

export function AIAssistant({
  onClose,
  isRTL = false,
  contextType = 'general',
  contractId,
  templateId,
  clauseCode,
  initialConversationId,
}: AIAssistantProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: 'system',
      content: "Hello! I'm your FIDIC AI Assistant. How can I help you today?",
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const ensureConversation = async (): Promise<string> => {
    if (conversationId) return conversationId;

    try {
      const conv = await conversationService.createConversation(
        contextType,
        contractId,
        templateId
      );
      setConversationId(conv.conversation_id);
      return conv.conversation_id;
    } catch (err) {
      showToast('Failed to start conversation', 'error');
      throw err;
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = inputValue.trim();
    if (query === '' || isTyping) return;

    setMessages((prev) => [...prev, { role: 'user', content: query }]);
    setInputValue('');
    setIsTyping(true);

    try {
      const convId = await ensureConversation();
      const response = await conversationService.sendMessage(convId, query, clauseCode);

      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: response.assistant_message.content,
          toolCalls: response.assistant_message.tool_calls,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
      showToast('Failed to send message', 'error');
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearConversation = () => {
    setConversationId(null);
    setMessages([
      {
        role: 'system',
        content: 'Conversation cleared. How can I help you now?',
      },
    ]);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    showToast('Copied to clipboard', 'success');
  };

  const suggestedPrompts = getSuggestedPrompts(contextType);

  return (
    <div className="flex flex-col h-full bg-gray-900 shadow-lg w-full max-h-[800px]">
      <div
        className={`flex justify-between items-center p-4 bg-blue-600 text-white ${isRTL ? 'flex-row-reverse' : ''}`}
      >
        <div className={`flex items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
          <BrainIcon size={24} className={isRTL ? 'ml-3' : 'mr-3'} />
          <h2 className="text-lg font-semibold">
            {isRTL ? 'المساعد الذكي' : 'AI Assistant'}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:bg-blue-700 p-2 rounded-full"
        >
          <XIcon size={24} />
        </button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto bg-gray-900">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex my-3 ${
              message.role === 'user'
                ? isRTL
                  ? 'justify-start'
                  : 'justify-end'
                : isRTL
                ? 'justify-end'
                : 'justify-start'
            }`}
          >
            <div
              className={`p-3 rounded-lg max-w-md shadow-sm ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-800 text-gray-100 border border-gray-700'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>

              {/* Tool calls */}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="mt-2 space-y-1">
                  {message.toolCalls.map((tool, i) => (
                    <ToolCallSection key={i} toolCall={tool} />
                  ))}
                </div>
              )}

              {message.role === 'system' && index > 0 && (
                <div
                  className={`flex items-center mt-2 pt-2 border-t border-gray-700 ${isRTL ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`flex space-x-2 ${isRTL ? 'ml-auto' : 'mr-auto'}`}
                  >
                    <button
                      className="text-gray-400 hover:text-blue-600"
                      onClick={() => handleCopy(message.content)}
                    >
                      <CopyIcon size={18} />
                    </button>
                    <button className="text-gray-400 hover:text-green-600">
                      <ThumbsUpIcon size={18} />
                    </button>
                    <button className="text-gray-400 hover:text-red-600">
                      <ThumbsDownIcon size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
            <div
              className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
              style={{ animationDelay: '0.2s' }}
            ></div>
            <div
              className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
              style={{ animationDelay: '0.4s' }}
            ></div>
            <span className="text-sm text-gray-400">
              {isRTL ? 'يفكر...' : 'Thinking...'}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-700">
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestedPrompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => setInputValue(prompt)}
              className="px-3 py-2 text-sm bg-gray-700 text-gray-200 rounded-full hover:bg-gray-600 transition-colors"
            >
              {isRTL ? `اقتراح ${i + 1}` : prompt}
            </button>
          ))}
        </div>
        <form
          onSubmit={handleSendMessage}
          className={`flex items-center space-x-2 ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={isRTL ? 'اطرح سؤالاً...' : 'Ask a question...'}
            className="flex-grow px-4 py-2 text-sm border border-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white placeholder-gray-400"
          />
          <button
            type="submit"
            className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            disabled={isTyping || inputValue.trim() === ''}
          >
            <SendIcon size={24} />
          </button>
          <button
            type="button"
            onClick={handleClearConversation}
            className="p-3 bg-gray-700 text-gray-300 rounded-full hover:bg-gray-600 transition-colors"
            title={isRTL ? 'مسح المحادثة' : 'Clear Conversation'}
          >
            <RefreshCwIcon size={24} />
          </button>
        </form>
      </div>
    </div>
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
