import React, { createContext, useState, useContext, useCallback } from 'react';

export interface AIContextInfo {
  contextType: 'general' | 'template' | 'contract' | 'comparison';
  contextLabel: string;
  templateId?: number;
  contractId?: number;
  clauseCode?: string;
  multiContractIds?: number[];
}

interface AIAssistantContextValue {
  isAIAssistantOpen: boolean;
  toggleAIAssistant: () => void;
  aiContext: AIContextInfo;
  setAIContext: (ctx: Omit<AIContextInfo, 'clauseCode'>) => void;
  setClauseCode: (code: string | undefined) => void;
}

const defaultContext: AIContextInfo = {
  contextType: 'general',
  contextLabel: 'General',
};

const AIAssistantContext = createContext<AIAssistantContextValue>({
  isAIAssistantOpen: false,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  toggleAIAssistant: () => {},
  aiContext: defaultContext,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setAIContext: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setClauseCode: () => {},
});

export const useAIAssistant = () => useContext(AIAssistantContext);

export const AIAssistantProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [aiContext, setAIContextState] = useState<AIContextInfo>(defaultContext);

  const toggleAIAssistant = useCallback(() => {
    setIsAIAssistantOpen((prev) => !prev);
  }, []);

  const setAIContext = useCallback((ctx: Omit<AIContextInfo, 'clauseCode'>) => {
    setAIContextState((prev) => ({ ...ctx, clauseCode: prev.clauseCode }));
  }, []);

  const setClauseCode = useCallback((code: string | undefined) => {
    setAIContextState((prev) => ({ ...prev, clauseCode: code }));
  }, []);

  return (
    <AIAssistantContext.Provider value={{ isAIAssistantOpen, toggleAIAssistant, aiContext, setAIContext, setClauseCode }}>
      {children}
    </AIAssistantContext.Provider>
  );
};
