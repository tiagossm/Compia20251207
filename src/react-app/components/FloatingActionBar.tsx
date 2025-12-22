import { useState } from 'react';
import {
    Save,
    CheckCircle2,
    RotateCcw,
    FileText,
    Share2,
    Eye,
    MoreHorizontal,
    X
} from 'lucide-react';

interface FloatingActionBarProps {
    status: string;
    onSave?: () => void;
    onFinalize?: () => void;
    onReopen?: () => void;
    onGeneratePDF?: () => void;
    onShare?: () => void;
    onViewSummary?: () => void;
    isSaving?: boolean;
    isCompleted?: boolean;
    saveStatus?: 'idle' | 'saving' | 'saved';
}

interface ActionItem {
    id: string;
    icon: React.ElementType;
    label: string;
    shortLabel: string;
    onClick: () => void;
    color: string;
    bgColor: string;
    hoverColor: string;
    show: boolean;
    primary?: boolean;
    disabled?: boolean;
}

export default function FloatingActionBar({
    status,
    onSave,
    onFinalize,
    onReopen,
    onGeneratePDF,
    onShare,
    onViewSummary,
    isSaving = false,
    saveStatus = 'idle'
}: FloatingActionBarProps) {
    const [showMore, setShowMore] = useState(false);

    const isCompleted = status === 'concluida' || status === 'completed';
    const isInProgress = status === 'em_andamento' || status === 'in_progress' || status === 'pendente' || status === 'pending';

    const actions: ActionItem[] = [
        // Primary actions
        {
            id: 'save',
            icon: Save,
            label: saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'saved' ? 'Salvo ✓' : 'Salvar',
            shortLabel: saveStatus === 'saving' ? '...' : saveStatus === 'saved' ? '✓' : 'Salvar',
            onClick: () => onSave?.(),
            color: saveStatus === 'saved' ? 'text-green-600' : 'text-blue-600',
            bgColor: saveStatus === 'saved' ? 'bg-green-50' : 'bg-blue-50',
            hoverColor: saveStatus === 'saved' ? 'hover:bg-green-100' : 'hover:bg-blue-100',
            show: isInProgress && !!onSave,
            disabled: isSaving || saveStatus === 'saving'
        },
        {
            id: 'finalize',
            icon: CheckCircle2,
            label: 'Finalizar',
            shortLabel: 'Finalizar',
            onClick: () => onFinalize?.(),
            color: 'text-white',
            bgColor: 'bg-green-600',
            hoverColor: 'hover:bg-green-700',
            show: isInProgress && !!onFinalize,
            primary: true
        },
        {
            id: 'reopen',
            icon: RotateCcw,
            label: 'Reabrir',
            shortLabel: 'Reabrir',
            onClick: () => onReopen?.(),
            color: 'text-amber-700',
            bgColor: 'bg-amber-50',
            hoverColor: 'hover:bg-amber-100',
            show: isCompleted && !!onReopen
        },
        // Secondary actions
        {
            id: 'pdf',
            icon: FileText,
            label: 'Gerar PDF',
            shortLabel: 'PDF',
            onClick: () => onGeneratePDF?.(),
            color: 'text-red-600',
            bgColor: 'bg-red-50',
            hoverColor: 'hover:bg-red-100',
            show: !!onGeneratePDF
        },
        {
            id: 'share',
            icon: Share2,
            label: 'Compartilhar',
            shortLabel: 'Enviar',
            onClick: () => onShare?.(),
            color: 'text-purple-600',
            bgColor: 'bg-purple-50',
            hoverColor: 'hover:bg-purple-100',
            show: !!onShare
        },
        {
            id: 'summary',
            icon: Eye,
            label: 'Ver Resumo',
            shortLabel: 'Resumo',
            onClick: () => onViewSummary?.(),
            color: 'text-slate-600',
            bgColor: 'bg-slate-50',
            hoverColor: 'hover:bg-slate-100',
            show: isCompleted && !!onViewSummary
        }
    ];

    const visibleActions = actions.filter(a => a.show);

    // Mobile: show max 3 actions + more button
    // Desktop: show all actions
    const mobileMaxActions = 3;
    const primaryActions = visibleActions.slice(0, mobileMaxActions);
    const moreActions = visibleActions.slice(mobileMaxActions);

    if (visibleActions.length === 0) return null;

    return (
        <>
            {/* Floating Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-[100] pb-safe">
                <div className="bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-lg">
                    <div className="max-w-4xl mx-auto px-3 py-2 sm:px-4 sm:py-3">
                        <div className="flex items-center justify-center gap-2 sm:gap-3">
                            {/* Mobile: Primary actions + More */}
                            <div className="flex sm:hidden items-center gap-2">
                                {primaryActions.map((action) => (
                                    <button
                                        key={action.id}
                                        onClick={action.onClick}
                                        disabled={action.disabled}
                                        className={`
                      flex items-center gap-1.5 px-3 py-2.5 rounded-lg font-medium text-sm
                      transition-all active:scale-95
                      ${action.primary
                                                ? `${action.bgColor} ${action.color} ${action.hoverColor} shadow-sm`
                                                : `${action.bgColor} ${action.color} ${action.hoverColor} border border-slate-200`
                                            }
                      ${action.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                                    >
                                        <action.icon className="w-4 h-4" />
                                        <span>{action.shortLabel}</span>
                                    </button>
                                ))}

                                {moreActions.length > 0 && (
                                    <button
                                        onClick={() => setShowMore(true)}
                                        className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                                        aria-label="Mais ações"
                                    >
                                        <MoreHorizontal className="w-5 h-5" />
                                    </button>
                                )}
                            </div>

                            {/* Desktop: All actions */}
                            <div className="hidden sm:flex items-center gap-2">
                                {visibleActions.map((action) => (
                                    <button
                                        key={action.id}
                                        onClick={action.onClick}
                                        disabled={action.disabled}
                                        className={`
                      flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm
                      transition-all hover:shadow-sm
                      ${action.primary
                                                ? `${action.bgColor} ${action.color} ${action.hoverColor}`
                                                : `${action.bgColor} ${action.color} ${action.hoverColor} border border-slate-200`
                                            }
                      ${action.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                                    >
                                        <action.icon className="w-4 h-4" />
                                        <span>{action.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* More Actions Modal (mobile) */}
            {showMore && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:hidden">
                    <div
                        className="absolute inset-0"
                        onClick={() => setShowMore(false)}
                    />
                    <div className="relative w-full bg-white rounded-t-2xl animate-slide-up">
                        <div className="flex items-center justify-between p-4 border-b border-slate-100">
                            <h3 className="font-medium text-slate-900">Mais ações</h3>
                            <button
                                onClick={() => setShowMore(false)}
                                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-3 pb-8 space-y-2">
                            {moreActions.map((action) => (
                                <button
                                    key={action.id}
                                    onClick={() => {
                                        action.onClick();
                                        setShowMore(false);
                                    }}
                                    className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium
                    ${action.bgColor} ${action.color} ${action.hoverColor}
                    transition-all active:scale-98
                  `}
                                >
                                    <action.icon className="w-5 h-5" />
                                    <span>{action.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Safe area spacer to prevent content from being hidden */}
            <div className="h-20 sm:h-16" />
        </>
    );
}
