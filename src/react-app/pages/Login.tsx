
import { useEffect, useState } from 'react';
import { useAuth } from '@/react-app/context/AuthContext';
import { fetchWithAuth } from '@/react-app/utils/auth';
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { Chrome, Loader2, AlertTriangle } from 'lucide-react';

export default function Login() {
  const {
    user,
    isPending,
    signInWithGoogle
  } = useAuth();

  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as any)?.from?.pathname || '/';

  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Auto-redirect if already authenticated
    if (user && !isPending) {
      console.log('User authenticated, redirecting to:', from);
      navigate(from, { replace: true });
    }
  }, [user, isPending, from, navigate]);

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      setError('');
      await signInWithGoogle();
      // Note: Page will redirect to Google OAuth, so no need to setIsLoading(false)
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err?.message || 'Erro ao fazer login com Google');
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor, preencha email e senha.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetchWithAuth('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        // Login bem sucedido, recarregar página para auth context pegar o cookie
        window.location.reload();
      } else {
        if (data.code === 'APPROVAL_PENDING') {
          setError('Sua conta aguarda aprovação do administrador.');
        } else if (data.code === 'APPROVAL_REJECTED') {
          setError('Sua solicitação de cadastro foi recusada.');
        } else {
          setError(data.error || 'Credenciais inválidas.');
        }
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Erro no login:', err);
      setError('Erro de conexão. Tente novamente.');
      setIsLoading(false);
    }
  };

  if (isPending) {
    return <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-slate-600">Verificando autenticação...</p>
      </div>
    </div>;
  }

  if (user) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 font-sans transition-colors duration-300 relative overflow-x-hidden">
      <main className="w-full flex flex-col items-center justify-center p-4 lg:p-8 z-10 max-w-md">

        {/* LOGO - Centralizado */}
        <div className="flex flex-col items-center justify-center mb-6 text-center">
          <div className="flex items-center justify-center">
            <img
              src="/compia-logo.png"
              alt="Compia Logo"
              className="w-[60px] h-[60px] object-contain"
            />
            <span className="font-heading font-bold text-slate-800 text-4xl tracking-tight -ml-3">
              Compia
            </span>
          </div>
          <p className="text-sm font-medium text-slate-500 mt-2">
            Sua Plataforma Inteligente de Inspeções.
          </p>
        </div>

        {/* CARD DE LOGIN */}
        <div className="w-full bg-white p-8 lg:p-10 rounded-2xl shadow-xl transition-all duration-300 border border-slate-100">

          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Bem-vindo de volta</h2>
            <p className="text-slate-500 text-sm">Acesse sua conta corporativa.</p>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start text-left">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0" />
                <span className="text-sm text-red-600 font-medium">{error}</span>
              </div>
            )}

            {/* Login Social */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="ripple w-full flex items-center justify-center gap-3 p-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-all duration-300 shadow-sm hover:shadow-md group"
            >
              <Chrome className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-primary transition-colors" />
              <span className="text-slate-700 dark:text-white font-semibold">Entrar com Google</span>
            </button>

            <div className="my-8 flex items-center justify-between gap-4">
              <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
              <span className="text-slate-400 dark:text-slate-500 text-sm font-medium uppercase tracking-wide">OU E-MAIL</span>
              <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
            </div>

            {/* CAMPO E-MAIL (Floating Label + Sem Ícone Interno) */}
            <div className="relative group">
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=" "
                className="input-no-icon block px-4 pb-2.5 pt-5 w-full text-base text-slate-900 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-0 border-b-2 border-slate-300 appearance-none dark:text-white dark:border-slate-600 dark:focus:border-primary focus:outline-none focus:ring-0 focus:border-primary peer transition-colors"
              />
              <label
                htmlFor="email"
                className="absolute text-sm text-slate-500 dark:text-slate-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-primary peer-focus:dark:text-primary peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-4"
              >
                E-mail
              </label>
            </div>

            {/* CAMPO SENHA (Floating Label + Sem Ícone Interno) */}
            <div className="relative group">
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=" "
                className="input-no-icon block px-4 pb-2.5 pt-5 w-full text-base text-slate-900 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-0 border-b-2 border-slate-300 appearance-none dark:text-white dark:border-slate-600 dark:focus:border-primary focus:outline-none focus:ring-0 focus:border-primary peer transition-colors"
              />
              <label
                htmlFor="password"
                className="absolute text-sm text-slate-500 dark:text-slate-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-primary peer-focus:dark:text-primary peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-4"
              >
                Senha
              </label>
            </div>

            <div className="flex items-center justify-between text-sm pt-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary dark:bg-slate-700 dark:border-slate-600 transition-all"
                />
                <span className="text-slate-600 dark:text-slate-300 group-hover:text-primary dark:group-hover:text-primary-light transition-colors font-medium">Lembrar de mim</span>
              </label>
              <a className="text-primary hover:text-primary-hover font-semibold transition-colors decoration-2 hover:underline underline-offset-4" href="#">Esqueceu a senha?</a>
            </div>

            {/* BOTÃO PRINCIPAL (CTA) */}
            <button
              type="submit"
              disabled={isLoading}
              className="ripple w-full bg-primary hover:bg-primary-hover active:bg-primary-focus text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 uppercase tracking-wider text-sm flex items-center justify-center gap-2 mt-4"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'ENTRAR NA PLATAFORMA'
              )}
            </button>
          </form>

          {/* Rodapé de Cadastro (Fluxo de Aprovação) */}
          <div className="pt-8 text-center text-sm">
            <span className="text-slate-500 dark:text-slate-400">Novo na Compia? </span>
            <Link
              to="/register"
              className="text-primary hover:text-primary-hover font-semibold transition-colors decoration-2 hover:underline underline-offset-4"
            >
              Solicite seu acesso
            </Link>
          </div>

        </div>

        {/* Links de Conformidade (Rodapé da Página) */}
        <footer className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
          <a className="hover:underline" href="#">Termos de Uso</a>
          <span className="mx-2">|</span>
          <a className="hover:underline" href="#">Política de Privacidade</a>
        </footer>
      </main>
    </div>
  );
}
