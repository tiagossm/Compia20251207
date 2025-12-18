import React from 'react';
import { useAuth } from '@/react-app/context/AuthContext';
import { Navigate, useLocation } from 'react-router';
import { Shield, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { ExtendedMochaUser } from '../../shared/user-types';
import DatabaseStatus from './DatabaseStatus';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: string;
  requiredRoles?: string[];
}

export default function AuthGuard({ children, requiredRole, requiredRoles }: AuthGuardProps) {
  const { user, isPending, fetchUser } = useAuth();
  const extendedUser = user as ExtendedMochaUser;
  const location = useLocation();

  // Check for demo user
  const [demoUser, setDemoUser] = React.useState<any>(null);

  React.useEffect(() => {
    const isDemoAuth = localStorage.getItem('demo-auth');
    const storedDemoUser = localStorage.getItem('demo-user');
    if (isDemoAuth === 'true' && storedDemoUser) {
      try {
        const parsedDemoUser = JSON.parse(storedDemoUser);
        setDemoUser(parsedDemoUser);
      } catch (error) {
        console.error('Error parsing demo user:', error);
        localStorage.removeItem('demo-auth');
        localStorage.removeItem('demo-user');
      }
    }
  }, []);

  // Add timeout for auth check to prevent infinite loading
  const [authTimeout, setAuthTimeout] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);
  const [isRetrying, setIsRetrying] = React.useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryCount(prev => prev + 1);
    setAuthTimeout(false);

    try {
      await fetchUser();
    } catch (error) {
      console.error('Auth retry failed:', error);
    } finally {
      setIsRetrying(false);
    }
  };

  React.useEffect(() => {
    if (isPending) {
      const timer = setTimeout(() => {
        setAuthTimeout(true);
      }, 15000); // 15 second timeout

      return () => clearTimeout(timer);
    } else {
      setAuthTimeout(false);
    }
  }, [isPending]);

  // Auto-retry on auth failure after delay
  React.useEffect(() => {
    if (authTimeout && retryCount < 3) {
      const retryTimer = setTimeout(() => {
        handleRetry();
      }, 5000); // Auto retry after 5 seconds

      return () => clearTimeout(retryTimer);
    }
  }, [authTimeout, retryCount]);

  if ((isPending && !authTimeout) || isRetrying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <DatabaseStatus onRetry={handleRetry} />
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="p-4 bg-blue-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-slate-700">
              {isRetrying ? 'Tentando reconectar...' : 'Verificando autenticação...'}
            </span>
          </div>
          <p className="text-slate-500 text-sm">
            {isRetrying ? 'Reconectando com o servidor' : 'Aguarde enquanto validamos suas credenciais'}
            {retryCount > 0 && ` (Tentativa ${retryCount})`}
          </p>
        </div>
      </div>
    );
  }

  if (authTimeout && retryCount >= 3) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <DatabaseStatus onRetry={handleRetry} />
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="p-4 bg-red-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Problema de Conectividade
          </h2>
          <p className="text-slate-600 mb-4">
            Não foi possível conectar com o servidor após várias tentativas.
          </p>
          <div className="space-y-2">
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isRetrying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Tentar Novamente
            </button>
            <button
              onClick={() => window.location.href = '/login'}
              className="w-full bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium"
            >
              Ir para Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user && !isPending && !isRetrying && !demoUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user && !demoUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Use demo user if available, otherwise use regular user
  const currentUser = demoUser || extendedUser;

  // Check role-based access
  const hasRequiredRole = () => {
    // For demo users, always grant access
    if (demoUser) {
      return true; // Demo users have full access
    }

    const userRole = currentUser.profile?.role || currentUser.role;
    // Admin has access to everything
    if (userRole === 'admin' || userRole === 'system_admin' || userRole === 'sys_admin') {
      return true;
    }

    if (requiredRole) {
      return userRole === requiredRole;
    }

    if (requiredRoles && requiredRoles.length > 0) {
      return requiredRoles.includes(userRole || '');
    }
    return true;
  };

  if (!hasRequiredRole()) {
    const requiredRoleText = requiredRole || (requiredRoles ? requiredRoles.join(', ') : 'Indefinido');
    const userRole = currentUser.profile?.role || currentUser.role;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="p-4 bg-red-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Acesso Negado
          </h2>
          <p className="text-slate-600 mb-4">
            Você não tem permissão para acessar esta página.
          </p>
          <p className="text-sm text-slate-500">
            Perfil necessário: <span className="font-medium">{requiredRoleText}</span>
            <br />
            Seu perfil: <span className="font-medium">{userRole}</span>
          </p>
          {demoUser && (
            <button
              onClick={() => {
                localStorage.removeItem('demo-auth');
                localStorage.removeItem('demo-user');
                window.location.href = '/login';
              }}
              className="mt-4 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium"
            >
              Sair do Demo
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
