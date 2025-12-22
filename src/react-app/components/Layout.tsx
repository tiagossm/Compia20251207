import { useState, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import CompiaLogo from '@/react-app/components/CompiaLogo';
import Header from '@/react-app/components/Header';
import { useAuth } from '@/react-app/context/AuthContext';
import { ExtendedMochaUser } from '@/shared/user-types';
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Settings,
  Users,
  Building2,
  LogOut,
  X,
  ChevronDown,
  PlusCircle,
  FileCheck,
  Brain,
  BarChart3,
  Activity,
  Shield,
  Database
} from 'lucide-react';
import NotificationSystem from '@/react-app/components/NotificationSystem';
import FloatingAiAssistant from '@/react-app/components/FloatingAiAssistant';

interface LayoutProps {
  children: ReactNode;
  actionButton?: ReactNode;
}

export default function Layout({ children, actionButton }: LayoutProps) {
  const { user, signOut } = useAuth();
  const extendedUser = user as ExtendedMochaUser;
  const profile = extendedUser?.profile;

  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Restore Navigation Groups
  const navigationGroups = [
    {
      title: 'Principal',
      items: [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Inspeções', href: '/inspections', icon: ClipboardList },
        { name: 'Planos de Ação', href: '/action-plans', icon: FileText },
      ]
    },
    {
      title: 'Ferramentas',
      items: [
        { name: 'Nova Inspeção', href: '/inspections/new', icon: PlusCircle },
        { name: 'Checklists', href: '/checklists', icon: FileCheck },
        { name: 'IA Generator', href: '/checklists/ai-generate', icon: Brain },
      ]
    },
    {
      title: 'Análise',
      items: [
        { name: 'Relatórios', href: '/reports', icon: BarChart3 },
        { name: 'Atividades', href: '/activities', icon: Activity },
      ]
    }
  ];

  const adminNavigation = [
    { name: 'Usuários', href: '/users', icon: Users },
    { name: 'Organizações', href: '/organizations', icon: Building2 },
  ];

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const NavItem = ({ item }: { item: any }) => {
    const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
    return (
      <Link
        to={item.href}
        className={`
          flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors group
          ${isActive
            ? 'bg-primary text-white shadow-md shadow-primary/20'
            : 'text-slate-500 hover:bg-gray-50 hover:text-primary'
          }
        `}
        onClick={() => setIsSidebarOpen(false)}
      >
        <item.icon
          size={20}
          className={`transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-primary'}`}
        />
        {item.name}
      </Link>
    );
  };

  return (
    <div className="h-screen w-full max-w-full bg-white flex overflow-hidden font-sans text-slate-800 antialiased">

      {/* --- SIDEBAR BRANCA --- */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 shadow-lg md:shadow-none flex flex-col transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0
        `}
      >
        {/* Logo Area */}
        <div className="h-16 flex items-center px-4 border-b border-gray-100 shrink-0">
          <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
            <CompiaLogo size={40} textSize={28} />
          </Link>
          <button
            className="lg:hidden ml-auto text-gray-500 hover:text-primary"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">

          {/* Default Groups with Category Titles */}
          {navigationGroups.map((group, groupIndex) => (
            <div key={group.title} className={groupIndex > 0 ? "pt-4" : ""}>
              <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavItem key={item.name} item={item} />
                ))}
              </div>
            </div>
          ))}

          {/* Admin Section */}
          {(profile?.role === 'system_admin' || profile?.role === 'sys_admin' || profile?.role === 'admin' || profile?.role === 'org_admin') && (
            <div className="pt-2 pb-2">
              <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Administração</p>
              <div className="space-y-1">
                {(profile?.role === 'system_admin' || profile?.role === 'sys_admin') && (
                  <>
                    <NavItem item={{ name: 'Permissões', href: '/settings/permissions', icon: Shield }} />
                    <NavItem item={{ name: 'Sinc. Dados', href: '/admin/data-sync', icon: Database }} />
                    <NavItem item={{ name: 'Logs Auditoria', href: '/admin/audit', icon: Activity }} />
                  </>
                )}

                {(profile?.role === 'system_admin' || profile?.role === 'sys_admin' || profile?.role === 'admin') &&
                  adminNavigation.map(item => <NavItem key={item.name} item={item} />)
                }

                {(profile?.role === 'org_admin') && (
                  <NavItem item={{ name: 'Minha Organização', href: '/organizations', icon: Building2 }} />
                )}
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="pt-2">
            <NavItem item={{ name: 'Configurações', href: '/settings', icon: Settings }} />
          </div>

        </nav>
      </aside>

      {/* --- MAIN CONTENT WRAPPER --- */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">

        {/* HEADER */}
        <Header onMenuClick={() => setIsSidebarOpen(true)} actionButton={actionButton}>
          {/* Notification System */}
          <NotificationSystem />

          {/* Dropdown with Google Avatar & Profile Info */}
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-3 hover:bg-gray-50 p-2 pl-3 rounded-full transition-colors border border-transparent hover:border-gray-100 group"
            >
              {/* Google Avatar or Initials Fallback */}
              <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 border border-gray-200 overflow-hidden shadow-sm group-hover:shadow-md transition-all">
                {extendedUser?.google_user_data?.picture ? (
                  <img
                    src={extendedUser.google_user_data.picture}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{profile?.name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U'}</span>
                )}
              </div>

              {/* Name & Role */}
              <div className="text-left hidden md:block">
                <span className="text-sm font-bold text-slate-800 block leading-tight">
                  {profile?.name ? profile.name.split(' ')[0] : (user?.email?.split('@')[0] || 'Minha Conta')}
                </span>
                <span className="text-xs font-medium text-slate-500 block leading-tight mt-0.5 capitalize">
                  {profile?.role?.replace(/_/g, ' ').replace('sys', 'System') || 'Visitante'}
                </span>
              </div>
              <ChevronDown size={14} className="text-gray-400 group-hover:text-primary transition-colors" />
            </button>

            {isUserMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsUserMenuOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl py-1 z-20 border border-gray-100 transform origin-top-right transition-all animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-3 border-b border-gray-50 md:hidden">
                    <p className="text-sm font-bold text-slate-800">{profile?.name || 'Usuário'}</p>
                    <p className="text-xs text-slate-500">{user?.email}</p>
                  </div>
                  <Link to="/profile" className="block px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-2">
                    <Users size={16} /> Meu Perfil
                  </Link>
                  <Link to="/settings" className="block px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-2">
                    <Settings size={16} /> Preferências
                  </Link>
                  <div className="my-1 border-t border-gray-100"></div>
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2">
                    <LogOut size={16} /> Sair
                  </button>
                </div>
              </>
            )}
          </div>
        </Header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-auto overflow-x-hidden p-6 lg:p-8 bg-white relative max-w-full">
          <div className="max-w-7xl mx-auto space-y-6 w-full overflow-x-hidden">
            {children}
          </div>
        </main>

      </div>

      {/* Floating AI Assistant */}
      <FloatingAiAssistant />
    </div>
  );
}
