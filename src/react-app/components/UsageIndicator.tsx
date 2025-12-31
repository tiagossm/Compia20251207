import React from 'react';
import { Sparkles, TrendingUp, AlertTriangle } from 'lucide-react';

interface UsageIndicatorProps {
    currentUsage: number;
    limit: number;
    resetDate?: string;
    showDetails?: boolean;
    className?: string;
    onUpgradeClick?: () => void;
}

/**
 * Componente que exibe o uso de IA da organização
 * Mostra barra de progresso e alertas quando próximo do limite
 */
export const UsageIndicator: React.FC<UsageIndicatorProps> = ({
    currentUsage,
    limit,
    resetDate,
    showDetails = false,
    className = '',
    onUpgradeClick,
}) => {
    const percentUsed = Math.min(100, Math.round((currentUsage / limit) * 100));
    const remaining = Math.max(0, limit - currentUsage);

    // Determinar cor da barra baseado no uso
    const getBarColor = () => {
        if (percentUsed >= 100) return 'bg-red-500';
        if (percentUsed >= 80) return 'bg-amber-500';
        if (percentUsed >= 50) return 'bg-blue-500';
        return 'bg-emerald-500';
    };

    // Determinar status e ícone
    const getStatus = () => {
        if (percentUsed >= 100) {
            return {
                icon: AlertTriangle,
                text: 'Limite atingido',
                color: 'text-red-600',
                bgColor: 'bg-red-50',
            };
        }
        if (percentUsed >= 80) {
            return {
                icon: AlertTriangle,
                text: 'Limite próximo',
                color: 'text-amber-600',
                bgColor: 'bg-amber-50',
            };
        }
        return {
            icon: Sparkles,
            text: 'IA disponível',
            color: 'text-emerald-600',
            bgColor: 'bg-emerald-50',
        };
    };

    const status = getStatus();
    const StatusIcon = status.icon;

    // Formatar data de reset
    const formatResetDate = () => {
        if (!resetDate) return '';
        const date = new Date(resetDate);
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    };

    return (
        <div className={`${className}`}>
            {/* Versão compacta (para header/sidebar) */}
            {!showDetails ? (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${status.bgColor}`}>
                    <StatusIcon className={`w-4 h-4 ${status.color}`} />
                    <span className={`text-sm font-medium ${status.color}`}>
                        {remaining}/{limit}
                    </span>
                </div>
            ) : (
                /* Versão detalhada (para dashboard) */
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className={`p-2 rounded-lg ${status.bgColor}`}>
                                <Sparkles className={`w-5 h-5 ${status.color}`} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900">Análises de IA</h3>
                                <p className="text-xs text-slate-500">{status.text}</p>
                            </div>
                        </div>
                        {percentUsed >= 80 && onUpgradeClick && (
                            <button
                                onClick={onUpgradeClick}
                                className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                            >
                                <TrendingUp className="w-4 h-4" />
                                Upgrade
                            </button>
                        )}
                    </div>

                    {/* Barra de progresso */}
                    <div className="mb-3">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-600">
                                {currentUsage} de {limit} análises
                            </span>
                            <span className={`font-medium ${status.color}`}>
                                {percentUsed}%
                            </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${getBarColor()} transition-all duration-500`}
                                style={{ width: `${percentUsed}%` }}
                            />
                        </div>
                    </div>

                    {/* Informações adicionais */}
                    <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                            {remaining} análises restantes
                        </span>
                        {resetDate && (
                            <span>
                                Renova em {formatResetDate()}
                            </span>
                        )}
                    </div>

                    {/* Alerta de limite */}
                    {percentUsed >= 100 && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-700">
                                Você atingiu o limite de análises deste mês.{' '}
                                {onUpgradeClick ? (
                                    <button
                                        onClick={onUpgradeClick}
                                        className="font-medium underline hover:no-underline"
                                    >
                                        Faça upgrade do seu plano
                                    </button>
                                ) : (
                                    'Aguarde a renovação ou faça upgrade.'
                                )}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default UsageIndicator;
