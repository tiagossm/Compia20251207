import { useState, useEffect } from 'react';
import { Globe, Lock, Users, X, Check, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '../utils/auth';

interface ShareChecklistModalProps {
    isOpen: boolean;
    onClose: () => void;
    templateId: number;
    templateName: string;
    currentVisibility: 'private' | 'public' | 'shared';
    currentSharedWith: number[];
    onSave: () => void;
}

interface Organization {
    id: number;
    name: string;
}

export default function ShareChecklistModal({
    isOpen,
    onClose,
    templateId,
    templateName,
    currentVisibility,
    currentSharedWith = [],
    onSave,
}: ShareChecklistModalProps) {
    const [visibility, setVisibility] = useState<'private' | 'public' | 'shared'>(currentVisibility);
    const [sharedWith, setSharedWith] = useState<number[]>(currentSharedWith);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setVisibility(currentVisibility);
            setSharedWith(currentSharedWith);
            fetchOrganizations();
        }
    }, [isOpen, currentVisibility, currentSharedWith]);

    const fetchOrganizations = async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth('/api/organizations');
            if (response.ok) {
                const data = await response.json();
                setOrganizations(data.organizations || []);
            }
        } catch (error) {
            console.error('Error fetching organizations:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await fetchWithAuth(`/api/checklist/checklist-templates/${templateId}/share`, {
                method: 'PUT',
                body: JSON.stringify({
                    visibility,
                    shared_with: visibility === 'shared' ? sharedWith : [],
                }),
            });

            if (response.ok) {
                onSave();
                onClose();
            } else {
                const error = await response.json();
                alert(`Erro ao salvar: ${error.error || 'Erro desconhecido'}`);
            }
        } catch (error) {
            console.error('Error saving share settings:', error);
            alert('Erro ao salvar configurações de compartilhamento');
        } finally {
            setSaving(false);
        }
    };

    const toggleOrganization = (orgId: number) => {
        setSharedWith(prev =>
            prev.includes(orgId)
                ? prev.filter(id => id !== orgId)
                : [...prev, orgId]
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md m-4 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-white">Compartilhar Checklist</h3>
                        <p className="text-sm text-blue-100 truncate">{templateName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <div className="space-y-3">
                        {/* Private Option */}
                        <button
                            onClick={() => setVisibility('private')}
                            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${visibility === 'private'
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            <div className={`p-2 rounded-lg ${visibility === 'private' ? 'bg-blue-100' : 'bg-slate-100'}`}>
                                <Lock className={`w-5 h-5 ${visibility === 'private' ? 'text-blue-600' : 'text-slate-500'}`} />
                            </div>
                            <div className="text-left flex-1">
                                <div className="font-medium text-slate-900">Privado</div>
                                <div className="text-sm text-slate-500">Apenas sua organização</div>
                            </div>
                            {visibility === 'private' && <Check className="w-5 h-5 text-blue-600" />}
                        </button>

                        {/* Shared Option */}
                        <button
                            onClick={() => setVisibility('shared')}
                            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${visibility === 'shared'
                                    ? 'border-purple-500 bg-purple-50'
                                    : 'border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            <div className={`p-2 rounded-lg ${visibility === 'shared' ? 'bg-purple-100' : 'bg-slate-100'}`}>
                                <Users className={`w-5 h-5 ${visibility === 'shared' ? 'text-purple-600' : 'text-slate-500'}`} />
                            </div>
                            <div className="text-left flex-1">
                                <div className="font-medium text-slate-900">Compartilhado</div>
                                <div className="text-sm text-slate-500">Selecionar organizações</div>
                            </div>
                            {visibility === 'shared' && <Check className="w-5 h-5 text-purple-600" />}
                        </button>

                        {/* Public Option */}
                        <button
                            onClick={() => setVisibility('public')}
                            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${visibility === 'public'
                                    ? 'border-green-500 bg-green-50'
                                    : 'border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            <div className={`p-2 rounded-lg ${visibility === 'public' ? 'bg-green-100' : 'bg-slate-100'}`}>
                                <Globe className={`w-5 h-5 ${visibility === 'public' ? 'text-green-600' : 'text-slate-500'}`} />
                            </div>
                            <div className="text-left flex-1">
                                <div className="font-medium text-slate-900">Público</div>
                                <div className="text-sm text-slate-500">Todas as organizações</div>
                            </div>
                            {visibility === 'public' && <Check className="w-5 h-5 text-green-600" />}
                        </button>
                    </div>

                    {/* Organization Selection (when shared) */}
                    {visibility === 'shared' && (
                        <div className="border-t border-slate-200 pt-4 mt-4">
                            <h4 className="text-sm font-medium text-slate-700 mb-3">Selecionar Organizações</h4>
                            {loading ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                </div>
                            ) : organizations.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center py-4">Nenhuma organização disponível</p>
                            ) : (
                                <div className="max-h-48 overflow-y-auto space-y-2">
                                    {organizations.map(org => (
                                        <label
                                            key={org.id}
                                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={sharedWith.includes(org.id)}
                                                onChange={() => toggleOrganization(org.id)}
                                                className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                                            />
                                            <span className="text-sm text-slate-700">{org.name}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            'Salvar'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
