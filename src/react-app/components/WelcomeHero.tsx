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
        const year = now.getFullYear();
        return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${day} de ${month} de ${year}`;
    };

    return (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 sm:p-8 text-white shadow-xl">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -ml-24 -mb-24"></div>

            <div className="relative z-10">
                {/* Top Row: Greeting + Org Selector */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 mb-1">
                            <span>{greeting.emoji}</span>
                            {greeting.text}, {firstName}!
                        </h1>
                        <p className="text-blue-200 text-sm sm:text-base">
                            {formatDate()}
                        </p>
                    </div>

                    {showOrgSelector && orgSelectorSlot && (
                        <div className="w-full sm:w-auto">
                            {orgSelectorSlot}
                        </div>
                    )}
                </div>

                {/* Mini Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10">
                        <div className="flex items-center justify-center mb-2">
                            <ClipboardList className="w-5 h-5 text-blue-200" />
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold">{stats?.total || 0}</p>
                        <p className="text-xs text-blue-200 font-medium uppercase tracking-wide">Total</p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10">
                        <div className="flex items-center justify-center mb-2">
                            <Clock className="w-5 h-5 text-amber-300" />
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold">{stats?.pending || 0}</p>
                        <p className="text-xs text-blue-200 font-medium uppercase tracking-wide">Pendentes</p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10">
                        <div className="flex items-center justify-center mb-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold">{stats?.completed || 0}</p>
                        <p className="text-xs text-blue-200 font-medium uppercase tracking-wide">Concluídas</p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10">
                        <div className="flex items-center justify-center mb-2">
                            <Target className="w-5 h-5 text-violet-300" />
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold">{completionRate}%</p>
                        <p className="text-xs text-blue-200 font-medium uppercase tracking-wide">Eficiência</p>
                    </div>
                </div>

                {/* Action Button */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <Link
                        to="/inspections/new"
                        className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 px-6 py-3 rounded-xl font-semibold shadow-lg hover:bg-blue-50 transition-all transform hover:-translate-y-0.5 hover:shadow-xl"
                    >
                        <PlusCircle className="w-5 h-5" />
                        Nova Inspeção
                    </Link>
                    <Link
                        to="/action-plans"
                        className="inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur-sm text-white px-6 py-3 rounded-xl font-semibold border border-white/20 hover:bg-white/20 transition-all"
                    >
                        Ver Pendências
                    </Link>
                </div>
            </div>
        </div>
    );
}
