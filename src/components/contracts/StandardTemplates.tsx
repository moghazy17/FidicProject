import { useTemplates } from '../../context/TemplateContext';

export function StandardTemplates() {
  const { templates, loading } = useTemplates();

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Standard FIDIC Templates</h2>
      {loading ? (
        <p className="text-sm text-gray-500">Loading templates...</p>
      ) : (
        <div className="space-y-2">
          {templates.map(template => (
            <div key={template.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex justify-between items-center bg-white dark:bg-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{template.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {template.fidic_book} ({template.edition_year}) &middot; {template.clause_count} clauses
                </p>
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-gray-500">No templates found. Upload templates from the Contract Drafting page.</p>
          )}
        </div>
      )}
    </div>
  );
}
