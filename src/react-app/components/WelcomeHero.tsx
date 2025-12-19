import { ClipboardList, Clock, CheckCircle2, Target, PlusCircle, Sun, Moon, Sunset } from 'lucide-react';
import { Link } from 'react-router-dom';

interface WelcomeHeroProps {
    userName: string;
    stats: {
        total: number;
        pending: number;
        completed: number;
    } | null;
    completionRate: number;
    showOrgSelector?: boolean;
    orgSelectorSlot?: React.ReactNode;
}

export default function WelcomeHero({
    userName,
    stats,
    completionRate,
    showOrgSelector,
    orgSelectorSlot
}: WelcomeHeroProps) {

    // Time-based greeting
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) {
            return { text: 'Bom dia', icon: Sun, emoji: '☀️' };
        } else if (hour >= 12 && hour < 18) {
            return { text: 'Boa tarde', icon: Sunset, emoji: '🌤️' };
        } else {
            return { text: 'Boa noite', icon: Moon, emoji: '🌙' };
        }
    };

    const greeting = getGreeting();
    const firstName = userName?.split(' ')[0] || 'Usuário';

    // Format date in Portuguese
    const formatDate = () => {
        const now = new Date();
        const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' });
        const day = now.getDate();
        const month = now.toLocaleDateString('pt-BR', { month: 'long' });
        return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${day} de ${month}`;
    };

    return (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 p-5 sm:p-6 text-white shadow-lg">
            {/* Subtle background decoration */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full -mr-20 -mt-20"></div>

            <div className="relative z-10">
                {/* Top Row: Greeting + Org Selector */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                            <span>{greeting.emoji}</span>
                            {greeting.text}, {firstName}!
                        </h1>
                        <p className="text-slate-400 text-sm mt-0.5">
                            {formatDate()}
                        </p>
                    </div>

                    {showOrgSelector && orgSelectorSlot && (
                        <div className="w-full sm:w-auto">
                            {orgSelectorSlot}
                        </div>
                    )}
                </div>

                {/* Compact Stats Row + Action */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Mini Stats - Inline */}
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                            <ClipboardList className="w-4 h-4 text-blue-400" />
                            <span className="text-lg font-bold">{stats?.total || 0}</span>
                            <span className="text-xs text-slate-400">Total</span>
                        </div>

                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                            <Clock className="w-4 h-4 text-amber-400" />
                            <span className="text-lg font-bold">{stats?.pending || 0}</span>
                            <span className="text-xs text-slate-400">Pendentes</span>
                        </div>

                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span className="text-lg font-bold">{stats?.completed || 0}</span>
                            <span className="text-xs text-slate-400">Concluídas</span>
                        </div>

                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                            <Target className="w-4 h-4 text-violet-400" />
                            <span className="text-lg font-bold">{completionRate}%</span>
                            <span className="text-xs text-slate-400">Eficiência</span>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex gap-2 sm:ml-auto">
                        <Link
                            to="/inspections/new"
                            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-md transition-all"
                        >
                            <PlusCircle className="w-4 h-4" />
                            Nova Inspeção
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
