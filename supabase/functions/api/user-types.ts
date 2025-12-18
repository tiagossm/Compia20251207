export interface User {
    id: string;
    email: string;
    name?: string;
    role?: string;
    account_id?: number;
    avatar_url?: string;
}

export type UserRole = 'super_admin' | 'sys_admin' | 'tenant_admin' | 'manager' | 'inspector' | 'auditor' | 'client' | 'blocked';
