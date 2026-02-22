import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import { templateService } from '../services';
import type { Template, TemplateClause } from '../types';

interface TemplateContextType {
  templates: Template[];
  loading: boolean;
  error: string | null;
  loadTemplates: () => Promise<void>;
  fetchClauses: (templateId: number) => Promise<TemplateClause[]>;
  uploadTemplate: (
    file: File,
    name: string,
    fidicBook: string,
    editionYear: number,
    pageStart?: number,
    pageEnd?: number,
    onProgress?: (progress: number) => void
  ) => Promise<Template>;
}

const TemplateContext = createContext<TemplateContextType | undefined>(undefined);

export const useTemplates = () => {
  const context = useContext(TemplateContext);
  if (!context) {
    throw new Error('useTemplates must be used within a TemplateProvider');
  }
  return context;
};

interface TemplateProviderProps {
  children: ReactNode;
}

export const TemplateProvider = ({ children }: TemplateProviderProps) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await templateService.getTemplates();
      setTemplates(data.templates);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load templates';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch if user is authenticated (token present)
    const token = localStorage.getItem('access_token');
    if (token) {
      loadTemplates();
    } else {
      setLoading(false);
    }
  }, [loadTemplates]);

  const fetchClauses = useCallback(async (templateId: number): Promise<TemplateClause[]> => {
    return templateService.getTemplateClauses(templateId);
  }, []);

  const uploadTemplate = useCallback(
    async (
      file: File,
      name: string,
      fidicBook: string,
      editionYear: number,
      pageStart?: number,
      pageEnd?: number,
      onProgress?: (progress: number) => void
    ): Promise<Template> => {
      const newTemplate = await templateService.uploadTemplate(
        file,
        name,
        fidicBook,
        editionYear,
        pageStart,
        pageEnd,
        onProgress
      );
      // Refresh list after upload
      await loadTemplates();
      return newTemplate;
    },
    [loadTemplates]
  );

  return (
    <TemplateContext.Provider
      value={{
        templates,
        loading,
        error,
        loadTemplates,
        fetchClauses,
        uploadTemplate,
      }}
    >
      {children}
    </TemplateContext.Provider>
  );
};
