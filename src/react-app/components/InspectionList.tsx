import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface InspectionListProps<T> {
    items: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
    onFinalize: () => void;
    isSaving?: boolean;
    emptyMessage?: string;
}

export default function InspectionList<T>({
    items,
    renderItem,
    onFinalize,
    isSaving = false,
    emptyMessage = "Nenhum item encontrado."
}: InspectionListProps<T>) {

    if (!items || items.length === 0) {
        return (
            <div className="p-8 text-center text-slate-500">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="w-full pb-12">
            {/* List Container - Flat Style */}
            <div className="divide-y divide-slate-100 border-b border-slate-100">
                {items.map((item, index) => (
                    <div key={index} className="w-full bg-white">
                        {renderItem(item, index)}
                    </div>
                ))}
            </div>

            {/* Static Action Button (End of Scroll) */}
            <div className="mt-8 px-4 md:px-0 max-w-2xl mx-auto">
                <button
                    onClick={onFinalize}
                    disabled={isSaving}
                    className="
                        w-full py-4 rounded-xl
                        bg-blue-600 text-white font-semibold text-lg
                        shadow-lg shadow-blue-600/20 hover:bg-blue-700
                        active:scale-[0.98] transition-all
                        flex items-center justify-center gap-2
                        disabled:opacity-70 disabled:cursor-not-allowed
                    "
                >
                    {isSaving ? (
                        <span className="animate-pulse">Finalizando...</span>
                    ) : (
                        <>
                            <CheckCircle2 size={24} />
                            Finalizar Inspeção
                        </>
                    )}
                </button>
                <p className="text-center text-xs text-slate-400 mt-3">
                    Revise todos os itens antes de finalizar.
                </p>
            </div>
        </div>
    );
}
