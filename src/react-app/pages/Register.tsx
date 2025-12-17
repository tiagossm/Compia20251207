import { useState } from 'react';
import { fetchWithAuth } from '@/react-app/utils/auth';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Building2, ArrowRight, CheckCircle2, ShieldCheck, HardHat, Briefcase } from 'lucide-react';

export default function Register() {
    const navigate = useNavigate();

    // accountType: 'business' | 'freelancer' | 'manager'
    const [accountType, setAccountType] = useState<'business' | 'freelancer' | 'manager'>('freelancer');

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        organizationName: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
    };

    const validateForm = () => {
        if (!formData.name || !formData.email || !formData.password) {
            setError('Por favor, preencha todos os campos obrigatórios.');
            return false;
        }
        if (formData.password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres.');
            return false;
        }
        if (formData.password !== formData.confirmPassword) {
            setError('As senhas não coincidem.');
            return false;
        }
        if (accountType === 'business' && !formData.organizationName) {
            setError('Para conta empresarial, o nome da empresa é obrigatório.');
            return false;
        }
        return true;
    };

    const getRoleFromAccountType = () => {
        switch (accountType) {
            case 'business': return 'org_admin';
            case 'manager': return 'manager';
            case 'freelancer': return 'inspector';
            default: return 'inspector';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setLoading(true);
        try {
            const role = getRoleFromAccountType();
            // Se for business, organizationName é enviado. Se não, undefined.
            const orgName = accountType === 'business' ? formData.organizationName : undefined;

            const response = await fetchWithAuth('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    password: formData.password,
                    organization_name: orgName,
                    role: role
                })
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(true);
                // Redirecionar após 5 segundos (dando mais tempo para ler a msg)
                setTimeout(() => {
                    navigate('/login');
                }, 5000);
            } else {
                setError(data.error || 'Erro ao criar conta. Tente novamente.');
            }
        } catch (err) {
            console.error('Erro no registro:', err);
            setError('Erro de conexão. Verifique sua internet.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
                <div className="sm:mx-auto sm:w-full sm:max-w-md">
                    <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 text-center border border-slate-100">
                        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6 animate-in zoom-in duration-300">
                            <CheckCircle2 className="h-8 w-8 text-green-600" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 mb-4 leading-snug">
                            Sucesso! Sua solicitação de acesso foi enviada para análise.
                        </h2>
                        <div className="bg-blue-50 rounded-lg p-5 mb-6 text-left border border-blue-100">
                            <p className="text-slate-700 text-sm leading-relaxed">
                                Um administrador do sistema revisará seus dados. Você receberá uma notificação por e-mail assim que sua conta for aprovada. Obrigado por sua paciência.
                            </p>
                        </div>
                        <Link
                            to="/login"
                            className="inline-flex items-center justify-center w-full px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-semibold"
                        >
                            Voltar para o Login
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="text-center">
                    {/* Logo Pequeno se quiser, mas mantendo simples */}
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                        Solicitar Acesso à Plataforma Compia
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                        Já possui cadastro aprovado?{' '}
                        <Link to="/login" className="font-bold text-blue-600 hover:text-blue-500 transition-colors">
                            Fazer login
                        </Link>
                    </p>
                </div>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-2xl sm:px-10 border border-slate-100">
                    <form className="space-y-6" onSubmit={handleSubmit}>

                        {/* Seletor de Tipo de Conta - Estilo Cards Selecionáveis */}
                        <div className="space-y-3 mb-6">
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Qual é o seu perfil de acesso?
                            </label>
                            <div className="grid grid-cols-1 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setAccountType('freelancer')}
                                    className={`relative flex items-center p-3 rounded-lg border-2 transition-all ${accountType === 'freelancer'
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-slate-200 hover:border-slate-300 bg-white'
                                        }`}
                                >
                                    <div className={`p-2 rounded-full ${accountType === 'freelancer' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                        <HardHat className="w-5 h-5" />
                                    </div>
                                    <div className="ml-3 text-left">
                                        <p className="text-sm font-medium text-slate-900">Técnico de Campo</p>
                                        <p className="text-xs text-slate-500">Realizar inspeções e checklists</p>
                                    </div>
                                    {accountType === 'freelancer' && <div className="absolute top-3 right-3 w-3 h-3 bg-blue-500 rounded-full" />}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setAccountType('manager')}
                                    className={`relative flex items-center p-3 rounded-lg border-2 transition-all ${accountType === 'manager'
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-slate-200 hover:border-slate-300 bg-white'
                                        }`}
                                >
                                    <div className={`p-2 rounded-full ${accountType === 'manager' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div className="ml-3 text-left">
                                        <p className="text-sm font-medium text-slate-900">Gestor de Equipe</p>
                                        <p className="text-xs text-slate-500">Gerenciar técnicos e relatórios</p>
                                    </div>
                                    {accountType === 'manager' && <div className="absolute top-3 right-3 w-3 h-3 bg-blue-500 rounded-full" />}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setAccountType('business')}
                                    className={`relative flex items-center p-3 rounded-lg border-2 transition-all ${accountType === 'business'
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-slate-200 hover:border-slate-300 bg-white'
                                        }`}
                                >
                                    <div className={`p-2 rounded-full ${accountType === 'business' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div className="ml-3 text-left">
                                        <p className="text-sm font-medium text-slate-900">Dono de Empresa</p>
                                        <p className="text-xs text-slate-500">Criar organização e gerenciar tudo</p>
                                    </div>
                                    {accountType === 'business' && <div className="absolute top-3 right-3 w-3 h-3 bg-blue-500 rounded-full" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start animate-in fade-in slide-in-from-top-2">
                                <ShieldCheck className="w-5 h-5 text-red-600 mr-2 mt-0.5 shrink-0" />
                                <span className="text-sm text-red-700">{error}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Nome Completo</label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        name="name"
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={handleChange}
                                        className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5"
                                        placeholder="Seu nome"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700">Email Profissional</label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        name="email"
                                        type="email"
                                        required
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5"
                                        placeholder="seu@empresa.com"
                                    />
                                </div>
                            </div>

                            {/* Campo de Organização - Condicional e Animado */}
                            {accountType === 'business' && (
                                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                                    <label className="block text-sm font-medium text-slate-700">Nome da Empresa</label>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Briefcase className="h-5 w-5 text-slate-400" />
                                        </div>
                                        <input
                                            name="organizationName"
                                            type="text"
                                            value={formData.organizationName}
                                            onChange={handleChange}
                                            className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 bg-blue-50/50"
                                            placeholder="Nome da sua empresa"
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-blue-600">
                                        Uma nova área de trabalho será criada para sua empresa.
                                    </p>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700">Senha</label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        name="password"
                                        type="password"
                                        required
                                        value={formData.password}
                                        onChange={handleChange}
                                        className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5"
                                        placeholder="Mínimo 6 caracteres"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700">Confirmar Senha</label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        name="confirmPassword"
                                        type="password"
                                        required
                                        value={formData.confirmPassword}
                                        onChange={handleChange}
                                        className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5"
                                        placeholder="Repita a senha"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                            >
                                {loading ? (
                                    <>Solicitando acesso...</>
                                ) : (
                                    <>
                                        Solicitar Cadastro
                                        <ArrowRight className="ml-2 w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>

                    <div className="mt-6 text-center text-xs text-slate-500">
                        Ao criar uma conta, você concorda com nossos Termos de Serviço e Política de Privacidade.
                    </div>
                </div>
            </div>
        </div>
    );
}
