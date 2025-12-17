
import React, { createContext, useContext, useState, useEffect } from 'react';
import { ExtendedMochaUser } from '@/shared/user-types';
import { fetchWithAuth } from '@/react-app/utils/auth';
import { supabase } from '@/react-app/lib/supabase';

interface AuthContextType {
    user: ExtendedMochaUser | null;
    loading: boolean;
    isPending: boolean;
    login: (data: any) => Promise<void>;
    register: (data: any) => Promise<void>;
    logout: () => Promise<void>;
    fetchUser: () => Promise<void>;
    exchangeCodeForSessionToken: () => Promise<void>;
    redirectToLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<ExtendedMochaUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPending, setIsPending] = useState(true);
    const hasLoaded = React.useRef(false);

    const fetchUser = async () => {
        try {
            // Check if we have a session first
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setUser(null);
                setLoading(false);
                setIsPending(false);
                hasLoaded.current = true;
                return;
            }

            // We have a session, enable loading state ONLY if specific initial load hasn't happened
            if (!hasLoaded.current) {
                setIsPending(true);
            }

            // Call API to get profile (fetch-setup will inject the token from localStorage)
            const response = await fetchWithAuth('/api/auth/me', {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('[AuthContext] User data from API:', {
                    id: data.user?.id,
                    email: data.user?.email,
                    google_user_data: data.user?.google_user_data
                });
                setUser(data.user);
            } else {
                console.error('Failed to fetch user profile:', response.status);
                // Don't clear user immediately if API fails (could be network), 
                // but if 401, maybe logout?
                if (response.status === 401) {
                    await supabase.auth.signOut();
                    setUser(null);
                }
            }
        } catch (error) {
            console.error('Error fetching user:', error);
            // Don't clear user on network error
        } finally {
            setLoading(false);
            setIsPending(false);
            hasLoaded.current = true;
        }
    };

    useEffect(() => {
        // Initial load
        fetchUser();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state change:', event, session?.user?.email);
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                fetchUser();
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
                setLoading(false);
                setIsPending(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const login = async (_data: any) => {
        // Legacy login (simulated for type compatibility or unused)
        console.warn('Manual login deprecated. Use Google Login.');
    };

    const register = async (_data: any) => {
        console.warn('Manual register deprecated. Use Google Login.');
    };

    const logout = async () => {
        try {
            await supabase.auth.signOut();
            // API logout is optional if we rely on JWT, but good for clearing cookies if any
            // await fetchWithAuth('/api/auth/logout', { method: 'POST' }); 
            setUser(null);
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const exchangeCodeForSessionToken = async () => {
        // Not needed with Supabase Auth handling the flow
        await fetchUser();
    };

    const redirectToLogin = async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/auth/callback',
                    scopes: 'https://www.googleapis.com/auth/calendar.events'
                }
            });
            if (error) throw error;
        } catch (error) {
            console.error('Error redirecting to login:', error);
            alert("Erro ao iniciar login com Google. Tente novamente.");
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            isPending,
            login,
            register,
            logout,
            fetchUser,
            exchangeCodeForSessionToken,
            redirectToLogin
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
