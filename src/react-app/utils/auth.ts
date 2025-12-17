// Utility functions for authentication and role checking

export function isSystemAdmin(user: any): boolean {
  if (!user) return false;

  const userRole = user.profile?.role || user.role;
  return userRole === 'system_admin' ||
    userRole === 'sys_admin' ||
    userRole === 'admin' ||
    (user.email && user.email.includes('admin'));
}

export function hasRole(user: any, role: string): boolean {
  if (!user) return false;

  const userRole = user.profile?.role || user.role;
  return userRole === role;
}

export function hasAnyRole(user: any, roles: string[]): boolean {
  return roles.some(role => hasRole(user, role));
}

// Function to make API requests 
// Note: Authorization header with User Token is injected by fetch-setup.ts
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers: any = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (anonKey) {
    headers['apikey'] = anonKey;
    // DO NOT set Authorization here. fetch-setup.ts will inject the correct Bearer token.
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include cookies in requests
  });
}
