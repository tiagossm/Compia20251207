import { useState } from 'react';
import {
  Save,
  Plus,
  Trash2,
  Edit,
  X,
  CheckCircle2,
  Type,
  Star,
  Copy,
  Folder,
  GripVertical
} from 'lucide-react';
import { ChecklistTemplate, ChecklistField, ChecklistFieldType } from '@/shared/checklist-types';

interface ChecklistPreviewProps {
  template: Partial<ChecklistTemplate>;
  fields: Partial<ChecklistField>[];
  onSave: (template: Partial<ChecklistTemplate>, fields: Partial<ChecklistField>[], folderId?: string | null) => void;
  onCancel: () => void;
  loading?: boolean;
  title: string;
  folders?: any[]; // Tree structure
  selectedFolderId?: string | null;
}

export default function ChecklistPreview({
  template,
  fields,
  onSave,
  onCancel,
  loading,
  title,
  folders,
  selectedFolderId: initialFolderId
}: ChecklistPreviewProps) {
  const [editedTemplate, setEditedTemplate] = useState<Partial<ChecklistTemplate>>(template);
  const [editedFields, setEditedFields] = useState<Partial<ChecklistField>[]>(fields);
  const [editingField, setEditingField] = useState<number | null>(null);
  const selectedFolderId = initialFolderId || null;

  // Helper to flatten tree for select
  const flattenFolders = (foldersList: any[], depth = 0): any[] => {
    return foldersList.reduce((acc, folder) => {
      acc.push({ ...folder, depth });
      if (folder.children) {
        acc.push(...flattenFolders(folder.children, depth + 1));
      }
      return acc;
    }, []);
  };

  const fieldTypes: { value: ChecklistFieldType; label: string }[] = [
    { value: 'text', label: 'Texto Curto' },
    { value: 'textarea', label: 'Texto Longo' },
    { value: 'select', label: 'Lista Suspensa' },
    { value: 'multiselect', label: 'Múltipla Escolha' },
    { value: 'radio', label: 'Escolha Única' },
    { value: 'checkbox', label: 'Caixa de Seleção' },
    { value: 'boolean', label: 'Conforme/Não Conforme' },
    { value: 'number', label: 'Número' },
    { value: 'date', label: 'Data' },
    { value: 'time', label: 'Hora' },
    { value: 'rating', label: 'Avaliação (1-5)' },
    { value: 'file', label: 'Upload de Arquivo/Foto' }
  ];

  const addField = () => {
    const newField: Partial<ChecklistField> = {
      field_name: 'Nova pergunta',
      field_type: 'text',
      is_required: false,
      options: '',
      order_index: editedFields.length
    };
    setEditedFields([...editedFields, newField]);
    setEditingField(editedFields.length);
  };

  const removeField = (index: number) => {
    const newFields = editedFields.filter((_, i) => i !== index);
    // Update order indices
    newFields.forEach((field, i) => {
      field.order_index = i;
    });
    setEditedFields(newFields);
    setEditingField(null);
  };

  const updateField = (index: number, updates: Partial<ChecklistField>) => {
    const newFields = [...editedFields];
    newFields[index] = { ...newFields[index], ...updates };
    setEditedFields(newFields);
  };

  const needsOptions = (fieldType: ChecklistFieldType) => {
    return ['select', 'multiselect', 'radio'].includes(fieldType);
  };

  const handleSave = () => {
    onSave(editedTemplate, editedFields, selectedFolderId);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] -m-6 bg-slate-50/50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-700"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col">
            <h2 className="font-heading text-base font-semibold text-slate-900 leading-tight">
              {title}
            </h2>
            {selectedFolderId && folders && (
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                <Folder className="w-3 h-3" />
                <span>
                  {flattenFolders(folders).find((f: any) => f.id === selectedFolderId)?.name || 'Pasta Desconhecida'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-medium text-xs md:text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="flex items-center px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-xs md:text-sm shadow-sm"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
            ) : (
              <Save className="w-3 h-3 md:w-4 md:h-4 mr-1.5" />
            )}
            {loading ? 'Salvando...' : 'Salvar Checklist'}
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Document Title Section */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200/60">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Nome do Template
            </label>
            <input
              type="text"
              required
              value={editedTemplate.name || ''}
              onChange={(e) => setEditedTemplate({ ...editedTemplate, name: e.target.value })}
              className="w-full text-xl md:text-2xl font-bold text-slate-900 border-0 border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:ring-0 px-0 py-1 transition-all placeholder-slate-300 bg-transparent"
              placeholder="Digite o nome do checklist..."
            />

            <input
              type="text"
              value={editedTemplate.description || ''}
              onChange={(e) => setEditedTemplate({ ...editedTemplate, description: e.target.value })}
              className="w-full text-sm text-slate-500 border-0 border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:ring-0 px-0 py-1 mt-2 transition-all placeholder-slate-400 bg-transparent"
              placeholder="Adicionar uma breve descrição (opcional)..."
            />
          </div>

          {/* Fields Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-baseline gap-2">
                <h3 className="font-heading text-sm font-semibold text-slate-900 uppercase tracking-wider">
                  Perguntas
                </h3>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                  {editedFields.length} total
                </span>
              </div>
              <button
                type="button"
                onClick={addField}
                className="flex items-center px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors shadow-sm text-xs font-medium"
              >
                <Plus className="w-3 h-3 mr-1.5" />
                Adicionar
              </button>
            </div>

            <div className="space-y-3 pb-12">
              {editedFields.map((field, index) => (
                <div
                  key={index}
                  className={`group bg-white border border-slate-200 rounded-lg transition-all duration-200 ${editingField === index
                    ? 'ring-2 ring-blue-500 border-transparent shadow-lg z-10 relative'
                    : 'hover:border-blue-300 hover:shadow-sm'
                    }`}
                >
                  {editingField === index ? (
                    // Edit Mode
                    <div className="p-4 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <span className="flex items-center text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                          <Edit className="w-3 h-3 mr-1" />
                          Editando Item {index + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => removeField(index)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="h-4 w-px bg-slate-200 mx-1" />
                          <button
                            onClick={() => setEditingField(null)}
                            className="flex items-center px-3 py-1 bg-green-600 text-white hover:bg-green-700 rounded text-xs font-medium transition-colors shadow-sm"
                            title="Concluir"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            OK
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className="md:col-span-8">
                          <label className="block text-xs font-semibold text-slate-500 mb-1">
                            Pergunta / Item
                          </label>
                          <input
                            type="text"
                            value={field.field_name}
                            onChange={(e) => updateField(index, { field_name: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder="Digite a pergunta..."
                            autoFocus
                          />
                        </div>

                        <div className="md:col-span-4">
                          <label className="block text-xs font-semibold text-slate-500 mb-1">
                            Tipo de Resposta
                          </label>
                          <div className="relative">
                            <select
                              value={field.field_type}
                              onChange={(e) => updateField(index, { field_type: e.target.value as ChecklistFieldType })}
                              className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm appearance-none bg-white font-medium text-slate-700"
                            >
                              {fieldTypes.map(type => (
                                <option key={type.value} value={type.value}>
                                  {type.label}
                                </option>
                              ))}
                            </select>
                            <div className="absolute right-2.5 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                              <Type className="w-3 h-3" />
                            </div>
                          </div>
                        </div>

                        {needsOptions(field.field_type as ChecklistFieldType) && (
                          <div className="md:col-span-12">
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              Opções (separadas por vírgula)
                            </label>
                            <input
                              type="text"
                              value={field.options || ''}
                              onChange={(e) => updateField(index, { options: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm bg-slate-50"
                              placeholder="Opção 1, Opção 2, Opção 3"
                            />
                          </div>
                        )}

                        <div className="md:col-span-12 pt-1">
                          <label className="inline-flex items-center cursor-pointer select-none group/toggle">
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={field.is_required}
                                onChange={(e) => updateField(index, { is_required: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                            </div>
                            <span className="ml-2 text-sm font-medium text-slate-600 group-hover/toggle:text-slate-900 transition-colors">
                              Resposta Obrigatória
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-start gap-3 p-4 select-none">
                      <div className="flex-shrink-0 cursor-move text-slate-300 hover:text-slate-500 transition-colors p-1 -ml-1">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-slate-100 text-slate-600 rounded text-xs font-bold mt-0.5 font-mono">
                        {index + 1}
                      </div>

                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="font-medium text-slate-900 text-sm leading-snug break-words">
                            {field.field_name}
                          </h4>
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-sm border border-slate-100 rounded-lg p-0.5 absolute right-4 top-3 md:relative md:right-auto md:top-auto md:shadow-none md:border-0 md:bg-transparent">
                            <button
                              onClick={() => setEditingField(index)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Editar"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                const duplicate = { ...field, order_index: editedFields.length };
                                setEditedFields([...editedFields, duplicate]);
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Duplicar"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removeField(index)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Excluir"
                              disabled={editedFields.length === 1}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide bg-slate-100 text-slate-500 border border-slate-200">
                            {fieldTypes.find(t => t.value === field.field_type)?.label}
                          </span>
                          {field.is_required && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide bg-red-50 text-red-600 border border-red-100">
                              <Star className="w-2.5 h-2.5 mr-1 fill-current" />
                              Obrigatório
                            </span>
                          )}
                        </div>

                        {field.options && (
                          <div className="mt-2 pl-2 border-l-2 border-slate-100">
                            <p className="text-xs text-slate-500 truncate max-w-lg">
                              <span className="font-semibold">Opções:</span> {field.options}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {editedFields.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <Plus className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-slate-500 font-medium text-sm">Nenhum campo definido</p>
                  <button
                    onClick={addField}
                    className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium hover:underline"
                  >
                    Adicionar sua primeira pergunta
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
