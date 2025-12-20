import { useState, useRef, useEffect } from 'react';
import {
    Camera,
    Mic,
    Paperclip,
    Sparkles,
    Zap,
    RotateCw,
    X,
    CheckCircle,
    FileText,
    Bot,
    Play,
    Pause,
    Trash2,
    Image,
    FileAudio,
    Square,
    ThumbsUp,
    ThumbsDown,
    Minus,
    ChevronDown
} from 'lucide-react';
import { InspectionMediaType } from '@/shared/types';
import { ComplianceMode } from '@/shared/checklist-types';

type ComplianceStatus = 'compliant' | 'non_compliant' | 'not_applicable' | 'unanswered';

interface InspectionItemProps {
    item: {
        id: number;
        description: string;
        category?: string;
        response?: string;
        comment?: string;
        aiAnalysis?: string;
        field_type?: string;
    };
    media: InspectionMediaType[];
    // Configuração de conformidade
    complianceEnabled?: boolean;
    complianceMode?: ComplianceMode;
    complianceStatus?: ComplianceStatus;
    onComplianceChange?: (status: ComplianceStatus) => void;
    onCommentChange: (value: string) => void;
    onMediaUpload: (type: 'image' | 'audio' | 'video' | 'file', source?: 'camera' | 'upload') => void;
    onMediaDelete?: (mediaId: number) => void;
    onAiAnalysisRequest: (selectedMediaIds: number[]) => void;
    onAiActionPlanRequest: (selectedMediaIds: number[]) => void;
    onManualActionSave?: (actionData: ManualActionData) => void;
    actionPlan?: any;
    isAiAnalyzing?: boolean;
    isCreatingAction?: boolean;
    isRecording?: boolean;
    recordingTime?: number;
    index?: number;
    children?: React.ReactNode;
}

interface ManualActionData {
    title: string;
    priority: 'baixa' | 'media' | 'alta';
    what_description?: string;
}

export default function InspectionItem({
    item,
    media,
    complianceStatus,
    onComplianceChange,
    onCommentChange,
    onMediaUpload,
    onMediaDelete,
    onAiAnalysisRequest,
    onAiActionPlanRequest,
    onManualActionSave,
    actionPlan,
    isAiAnalyzing = false,
    isCreatingAction = false,
    isRecording = false,
    recordingTime = 0,
    index,
    children
}: InspectionItemProps) {
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [showActionForm, setShowActionForm] = useState(false);
    const [actionMode, setActionMode] = useState<'manual' | 'ai'>('manual');
    const [selectedAiMedia, setSelectedAiMedia] = useState<number[]>([]);
    const [viewingImage, setViewingImage] = useState<{ url: string; index: number } | null>(null);
    const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
    const [showPhotoMenu, setShowPhotoMenu] = useState(false);
    const [showAudioMenu, setShowAudioMenu] = useState(false);
    const [showActionPlanExpanded, setShowActionPlanExpanded] = useState(false);

    const [manualAction, setManualAction] = useState<ManualActionData>({
        title: '',
        priority: 'media',
        what_description: ''
    });

    const audioRefs = useRef<{ [key: number]: HTMLAudioElement | null }>({});
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustTextareaHeight = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    };

    useEffect(() => adjustTextareaHeight(), [item.comment]);

    useEffect(() => {
        const handleClickOutside = () => {
            setShowPhotoMenu(false);
            setShowAudioMenu(false);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const toggleAiMedia = (id: number) => {
        setSelectedAiMedia(prev =>
            prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
        );
    };

    const handleManualActionSubmit = () => {
        if (manualAction.title.trim() && onManualActionSave) {
            onManualActionSave(manualAction);
            setManualAction({ title: '', priority: 'media', what_description: '' });
            setShowActionForm(false);
        }
    };

    const toggleAudio = (mediaId: number) => {
        const audio = audioRefs.current[mediaId];
        if (!audio) return;
        if (playingAudioId === mediaId) {
            audio.pause();
            setPlayingAudioId(null);
        } else {
            Object.values(audioRefs.current).forEach(a => a?.pause());
            audio.play();
            setPlayingAudioId(mediaId);
        }
    };

    const handleAudioEnded = (mediaId: number) => {
        if (playingAudioId === mediaId) setPlayingAudioId(null);
    };

    const handleToggleAi = () => {
        if (!isAiOpen) setShowActionForm(false);
        setIsAiOpen(!isAiOpen);
    };

    const handleToggleAction = () => {
        if (!showActionForm) setIsAiOpen(false);
        setShowActionForm(!showActionForm);
    };

    const imageMedia = media.filter(m => m.media_type === 'image');
    const audioMedia = media.filter(m => m.media_type === 'audio');
    const docMedia = media.filter(m => m.media_type === 'document' || (m.media_type as string) === 'file');

    // Check if media has valid ID for deletion
    const canDeleteMedia = (m: InspectionMediaType) => m.id != null && m.id > 0;

    return (
        <div className="py-3 px-2 border-b border-slate-100 last:border-0">
            {/* Header */}
            <div className="mb-2">
                {item.category && (
                    <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wide">
                        {item.category}
                    </span>
                )}
                <h3 className="text-sm font-medium text-slate-800 leading-snug">
                    {index !== undefined && <span className="text-slate-400 mr-1">{index + 1}.</span>}
                    {item.description}
                </h3>
            </div>

            {/* Response */}
            <div className="mb-2">{children}</div>

            {/* Compliance Status Selector - híbrido por tipo de campo */}
            {/* TIPOS AUTOMÁTICOS (não mostra seletor): boolean, checkbox */}
            {/* TIPOS MANUAL (mostra seletor): text, textarea, file, select, radio, multiselect, number, rating */}
            {/* TIPOS N/A (não mostra seletor): date, time */}
            {onComplianceChange &&
                !['date', 'time', 'boolean', 'checkbox'].includes(item.field_type || '') && (
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs text-slate-500">
                            Avaliação
                            {['text', 'textarea', 'file'].includes(item.field_type || '') ? ' (manual)' : ''}
                            :
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => onComplianceChange('compliant')}
                                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-all ${complianceStatus === 'compliant'
                                    ? 'bg-green-600 border-green-600 text-white font-medium'
                                    : 'border-slate-200 text-slate-500 hover:border-green-300 hover:bg-green-50'
                                    }`}
                            >
                                <ThumbsUp size={12} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onComplianceChange('non_compliant')}
                                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-all ${complianceStatus === 'non_compliant'
                                    ? 'bg-red-600 border-red-600 text-white font-medium'
                                    : 'border-slate-200 text-slate-500 hover:border-red-300 hover:bg-red-50'
                                    }`}
                            >
                                <ThumbsDown size={12} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onComplianceChange('not_applicable')}
                                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-all ${complianceStatus === 'not_applicable'
                                    ? 'bg-slate-600 border-slate-600 text-white font-medium'
                                    : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                            >
                                <Minus size={12} />
                            </button>
                        </div>
                    </div>
                )}

            {/* Observation */}
            <textarea
                ref={textareaRef}
                value={item.comment || ''}
                onChange={(e) => { onCommentChange(e.target.value); adjustTextareaHeight(); }}
                placeholder="Observação..."
                rows={1}
                className="w-full py-1 text-slate-600 text-xs placeholder:text-slate-400 border-none focus:ring-0 resize-none bg-transparent"
            />

            {/* Media Previews */}
            {media.length > 0 && (
                <div className="mb-2 space-y-1">
                    {/* Images */}
                    {imageMedia.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {imageMedia.map((m, idx) => (
                                <div key={m.id} className="relative">
                                    {/* Image thumbnail */}
                                    <div
                                        className={`w-12 h-12 rounded-lg border-2 cursor-pointer overflow-hidden shadow-sm
                                            ${selectedAiMedia.includes(m.id!) ? 'border-blue-500' : 'border-slate-200'}`}
                                        onClick={() => setViewingImage({ url: m.file_url, index: idx })}
                                    >
                                        <img src={m.file_url} className="w-full h-full object-cover" alt="" />
                                    </div>
                                    {/* Delete Button - always visible */}
                                    {onMediaDelete && canDeleteMedia(m) && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); m.id && onMediaDelete(m.id); }}
                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-sm hover:bg-red-600"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                    {/* AI Selection - checkbox style */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); m.id && toggleAiMedia(m.id); }}
                                        className={`absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded flex items-center justify-center shadow-sm border
                                            ${selectedAiMedia.includes(m.id!) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-400 border-slate-300 hover:border-blue-400'}`}
                                    >
                                        {selectedAiMedia.includes(m.id!) ? <CheckCircle size={12} /> : <Sparkles size={10} />}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Audio */}
                    {audioMedia.length > 0 && (
                        <div className="space-y-1.5">
                            {audioMedia.map((m) => (
                                <div key={m.id} className={`flex items-center gap-2 p-2 rounded-lg border bg-white shadow-sm
                                    ${selectedAiMedia.includes(m.id!) ? 'border-blue-400' : 'border-slate-200'}`}>
                                    {/* Play/Pause button */}
                                    <button
                                        onClick={() => m.id && toggleAudio(m.id)}
                                        className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-800 flex-shrink-0"
                                    >
                                        {playingAudioId === m.id ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                                    </button>
                                    <audio ref={el => { if (m.id) audioRefs.current[m.id] = el; }} src={m.file_url} onEnded={() => m.id && handleAudioEnded(m.id)} className="hidden" />

                                    {/* Filename */}
                                    <span className="flex-1 truncate text-xs text-slate-600">{m.file_name || 'Áudio'}</span>

                                    {/* AI Selection */}
                                    <button
                                        onClick={() => m.id && toggleAiMedia(m.id)}
                                        className={`w-7 h-7 rounded flex items-center justify-center border
                                            ${selectedAiMedia.includes(m.id!) ? 'bg-blue-500 text-white border-blue-500' : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-blue-400'}`}
                                    >
                                        {selectedAiMedia.includes(m.id!) ? <CheckCircle size={14} /> : <Sparkles size={12} />}
                                    </button>

                                    {/* Delete */}
                                    {onMediaDelete && canDeleteMedia(m) && (
                                        <button
                                            onClick={() => m.id && onMediaDelete(m.id)}
                                            className="w-7 h-7 rounded flex items-center justify-center bg-red-50 text-red-500 border border-red-200 hover:bg-red-100"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Documents */}
                    {docMedia.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {docMedia.map((m) => (
                                <div key={m.id} className={`group flex items-center gap-1 px-1.5 py-1 rounded border text-xs cursor-pointer
                                    ${selectedAiMedia.includes(m.id!) ? 'bg-slate-100 border-slate-300' : 'bg-slate-50 border-slate-200'}`}
                                    onClick={() => m.id && toggleAiMedia(m.id)}
                                >
                                    <FileText size={12} className="text-slate-400" />
                                    <span className="text-slate-600 max-w-[80px] truncate">{m.file_name || 'Doc'}</span>
                                    {selectedAiMedia.includes(m.id!) && <CheckCircle size={10} className="text-slate-600" />}
                                    {onMediaDelete && canDeleteMedia(m) && (
                                        <button onClick={(e) => { e.stopPropagation(); m.id && onMediaDelete(m.id); }} className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100">
                                            <X size={10} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Compact Toolbar */}
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                <div className="flex items-center gap-0.5">
                    {/* Photo */}
                    <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setShowPhotoMenu(!showPhotoMenu); setShowAudioMenu(false); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
                            <Camera size={16} />
                        </button>
                        {showPhotoMenu && (
                            <div className="absolute top-full left-0 mt-0.5 bg-white border border-slate-200 rounded shadow-lg py-0.5 z-20 min-w-[120px]">
                                <button onClick={() => { onMediaUpload('image', 'camera'); setShowPhotoMenu(false); }} className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                    <Camera size={12} /> Câmera
                                </button>
                                <button onClick={() => { onMediaUpload('image', 'upload'); setShowPhotoMenu(false); }} className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                    <Image size={12} /> Upload
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Audio */}
                    <div className="relative">
                        {isRecording ? (
                            <button onClick={() => onMediaUpload('audio', 'camera')} className="flex items-center gap-1 px-2 py-1 rounded bg-red-500 text-white text-xs">
                                <Square size={10} />
                                <span>{Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}</span>
                            </button>
                        ) : (
                            <>
                                <button onClick={(e) => { e.stopPropagation(); setShowAudioMenu(!showAudioMenu); setShowPhotoMenu(false); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
                                    <Mic size={16} />
                                </button>
                                {showAudioMenu && (
                                    <div className="absolute top-full left-0 mt-0.5 bg-white border border-slate-200 rounded shadow-lg py-0.5 z-20 min-w-[120px]">
                                        <button onClick={() => { onMediaUpload('audio', 'camera'); setShowAudioMenu(false); }} className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                            <Mic size={12} /> Gravar
                                        </button>
                                        <button onClick={() => { onMediaUpload('audio', 'upload'); setShowAudioMenu(false); }} className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                            <FileAudio size={12} /> Upload
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Document */}
                    <button onClick={() => onMediaUpload('file')} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
                        <Paperclip size={16} />
                    </button>
                </div>

                <div className="flex items-center gap-1">
                    <button onClick={handleToggleAction} className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${showActionForm ? 'bg-slate-200 text-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <Zap size={12} />
                        <span className="hidden sm:inline">Ação</span>
                    </button>
                    <button onClick={handleToggleAi} className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${isAiOpen ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <Sparkles size={12} />
                        <span>IA</span>
                        {selectedAiMedia.length > 0 && <span className="ml-0.5 px-1 py-0.5 bg-slate-500 text-white rounded text-[9px]">{selectedAiMedia.length}</span>}
                    </button>
                </div>
            </div>

            {/* Action Form - Compact */}
            {showActionForm && (
                <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-200">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-medium text-slate-700">Nova Ação</span>
                        <button onClick={() => setShowActionForm(false)} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                    </div>
                    <div className="flex gap-1 mb-2">
                        <button onClick={() => setActionMode('manual')} className={`flex-1 py-1 rounded text-xs ${actionMode === 'manual' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                            <FileText size={10} className="inline mr-0.5" /> Manual
                        </button>
                        <button onClick={() => setActionMode('ai')} className={`flex-1 py-1 rounded text-xs ${actionMode === 'ai' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                            <Bot size={10} className="inline mr-0.5" /> 5W2H IA
                        </button>
                    </div>
                    {actionMode === 'manual' ? (
                        <div className="space-y-1.5">
                            <input type="text" value={manualAction.title} onChange={(e) => setManualAction(prev => ({ ...prev, title: e.target.value }))} placeholder="O que fazer?" className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs" />
                            <div className="flex gap-1">
                                <select value={manualAction.priority} onChange={(e) => setManualAction(prev => ({ ...prev, priority: e.target.value as any }))} className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded text-xs">
                                    <option value="baixa">Baixa</option>
                                    <option value="media">Média</option>
                                    <option value="alta">Alta</option>
                                </select>
                                <button onClick={handleManualActionSubmit} disabled={!manualAction.title.trim()} className="px-2 py-1 bg-slate-700 text-white text-xs rounded disabled:opacity-50">Salvar</button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <p className="text-[10px] text-slate-500 mb-1">{selectedAiMedia.length > 0 ? `${selectedAiMedia.length} mídia(s) selecionada(s)` : 'Selecione mídias acima'}</p>
                            <button onClick={() => onAiActionPlanRequest(selectedAiMedia)} disabled={isCreatingAction} className="w-full py-1.5 bg-slate-700 text-white text-xs rounded disabled:opacity-50 flex items-center justify-center gap-1">
                                {isCreatingAction ? <RotateCw size={12} className="animate-spin" /> : <Bot size={12} />}
                                {isCreatingAction ? 'Gerando...' : 'Gerar 5W2H'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* AI Panel - Compact */}
            {isAiOpen && (
                <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-xs font-medium text-slate-700 flex items-center gap-1 mb-1.5"><Sparkles size={10} /> Análise IA</span>
                    {isAiAnalyzing ? (
                        <div className="flex items-center gap-1 py-2 text-xs text-slate-600"><RotateCw size={12} className="animate-spin" /> Analisando...</div>
                    ) : item.aiAnalysis ? (
                        <div className="bg-white rounded p-1.5 text-xs text-slate-700 whitespace-pre-line border border-slate-100">{item.aiAnalysis}</div>
                    ) : (
                        <div>
                            <p className="text-[10px] text-slate-500 mb-1">
                                {selectedAiMedia.length > 0
                                    ? `${selectedAiMedia.length} mídia(s) selecionada(s)`
                                    : 'Analisa a resposta (selecione mídias para incluí-las)'}
                            </p>
                            <button onClick={() => onAiAnalysisRequest(selectedAiMedia)} className="w-full py-1.5 bg-slate-700 text-white text-xs rounded hover:bg-slate-800 flex items-center justify-center gap-1">
                                <Sparkles size={12} /> Analisar com IA
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Action Plan Inline Display */}
            {actionPlan && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                    <button
                        onClick={() => setShowActionPlanExpanded(!showActionPlanExpanded)}
                        className="flex items-center gap-2 w-full text-left text-xs text-slate-600 hover:text-slate-800"
                    >
                        <CheckCircle size={14} className="text-green-500" />
                        <span className="font-medium">Plano de Ação 5W2H</span>
                        <ChevronDown size={14} className={`ml-auto transition-transform ${showActionPlanExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {showActionPlanExpanded && (
                        <div className="mt-2 bg-slate-50 rounded-lg p-3 text-xs space-y-2 border border-slate-200">
                            {actionPlan.title && (
                                <div className="font-medium text-slate-800 border-b pb-1 mb-2">{actionPlan.title}</div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                                {actionPlan.what_description && (
                                    <div>
                                        <span className="text-red-500 font-semibold">O quê:</span>
                                        <span className="ml-1 text-slate-600">{actionPlan.what_description}</span>
                                    </div>
                                )}
                                {actionPlan.why_description && (
                                    <div>
                                        <span className="text-orange-500 font-semibold">Por quê:</span>
                                        <span className="ml-1 text-slate-600">{actionPlan.why_description}</span>
                                    </div>
                                )}
                                {actionPlan.where_description && (
                                    <div>
                                        <span className="text-yellow-600 font-semibold">Onde:</span>
                                        <span className="ml-1 text-slate-600">{actionPlan.where_description}</span>
                                    </div>
                                )}
                                {actionPlan.when_deadline && (
                                    <div>
                                        <span className="text-green-500 font-semibold">Quando:</span>
                                        <span className="ml-1 text-slate-600">{new Date(actionPlan.when_deadline).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                )}
                                {actionPlan.who_responsible && (
                                    <div>
                                        <span className="text-blue-500 font-semibold">Quem:</span>
                                        <span className="ml-1 text-slate-600">{actionPlan.who_responsible}</span>
                                    </div>
                                )}
                                {actionPlan.how_description && (
                                    <div>
                                        <span className="text-purple-500 font-semibold">Como:</span>
                                        <span className="ml-1 text-slate-600">{actionPlan.how_description}</span>
                                    </div>
                                )}
                                {actionPlan.how_much_cost && (
                                    <div>
                                        <span className="text-pink-500 font-semibold">Quanto:</span>
                                        <span className="ml-1 text-slate-600">{actionPlan.how_much_cost}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${actionPlan.priority === 'alta' ? 'bg-red-100 text-red-700' :
                                    actionPlan.priority === 'media' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-green-100 text-green-700'
                                    }`}>
                                    {actionPlan.priority?.toUpperCase() || 'MÉDIA'}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] ${actionPlan.status === 'pending' ? 'bg-slate-100 text-slate-600' :
                                    actionPlan.status === 'in_progress' ? 'bg-blue-100 text-blue-600' :
                                        'bg-green-100 text-green-600'
                                    }`}>
                                    {actionPlan.status === 'pending' ? 'Pendente' :
                                        actionPlan.status === 'in_progress' ? 'Em Andamento' :
                                            actionPlan.status === 'completed' ? 'Concluído' : actionPlan.status}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Image Viewer Modal */}
            {viewingImage && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setViewingImage(null)}>
                    <button
                        onClick={() => setViewingImage(null)}
                        className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white"
                    >
                        <X size={24} />
                    </button>

                    {/* Navigation */}
                    {imageMedia.length > 1 && (
                        <>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const prev = viewingImage.index === 0 ? imageMedia.length - 1 : viewingImage.index - 1;
                                    setViewingImage({ url: imageMedia[prev].file_url, index: prev });
                                }}
                                className="absolute left-4 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white"
                            >
                                ←
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const next = viewingImage.index === imageMedia.length - 1 ? 0 : viewingImage.index + 1;
                                    setViewingImage({ url: imageMedia[next].file_url, index: next });
                                }}
                                className="absolute right-4 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white"
                            >
                                →
                            </button>
                        </>
                    )}

                    <img
                        src={viewingImage.url}
                        className="max-w-[90vw] max-h-[90vh] object-contain"
                        alt=""
                        onClick={(e) => e.stopPropagation()}
                    />

                    {/* Counter */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
                        {viewingImage.index + 1} / {imageMedia.length}
                    </div>
                </div>
            )}
        </div>
    );
}
