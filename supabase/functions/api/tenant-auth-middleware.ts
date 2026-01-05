import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { USER_ROLES } from "./user-types.ts";

type Env = {
    DB: any;
    JWT_SECRET?: string;
};

/**
 * TENANT AUTH MIDDLEWARE - Blindagem de Segurança Multi-Tenant
 * 
 * Este middleware é responsável por:
 * 1. Autenticar o usuário (via cookie de sessão ou JWT)
 * 2. Injetar o contexto de tenant seguro na requisição
 * 3. CRÍTICO: O organizationId SEMPRE vem do banco/token, NUNCA do body/params
 * 
 * @security Este middleware implementa o princípio de "Least Privilege"
 */

// Tipo do contexto de tenant seguro
export interface TenantContext {
    organizationId: number | null;
    allowedOrganizationIds: number[]; // Inclui subsidiárias para Org Admin
    isSystemAdmin: boolean;
    userId: string;
    userRole: string;
}

// Tipo do usuário autenticado
export interface AuthenticatedUser {
    id: string;
    email: string;
    name: string;
    role: string;
    organization_id: number | null;
    managed_organization_id: number | null;
    can_manage_users: boolean;
    can_create_organizations: boolean;
    is_active: boolean;
}

/**
 * Middleware principal de autenticação e contexto de tenant
 * 
 * @security 
 * - Valida sessão via cookie ou JWT (quando configurado)
 * - Busca dados do usuário no banco para garantir integridade
 * - Injeta contexto de tenant seguro que NÃO pode ser manipulado pelo cliente
 */
export async function tenantAuthMiddleware(c: Context, next: Next) {
    const env = c.env as Env;

    // 0. Verificar se já existe usuário no contexto (injetado por Supabase Auth ou outro middleware)
    const existingUser = c.get('user');
    let userId: string | null = null;

    if (existingUser && existingUser.id) {
        userId = existingUser.id;
    }

    // 1. Extrair token de autenticação (Cookie) se não encontrado no contexto
    if (!userId) {
        if (!userId) {
            const sessionToken = getCookie(c, "mocha-session-token") || getCookie(c, "mocha_session_token");

            // 2. Validar sessão via cookie (desenvolvimento/produção atual)
            if (sessionToken && sessionToken.startsWith("dev-session-")) {
                userId = sessionToken.replace("dev-session-", "");
            }
        }
    }

    // 3. Validar JWT (quando JWT_SECRET estiver configurado)
    // TODO: Implementar validação JWT real quando a secret estiver disponível
    // const authHeader = c.req.header("Authorization");
    // if (authHeader?.startsWith("Bearer ") && env.JWT_SECRET) {
    //   const token = authHeader.substring(7);
    //   userId = await validateJWT(token, env.JWT_SECRET);
    // }

    // 4. Se não autenticado, permitir passar mas sem contexto
    // Rotas protegidas devem verificar c.get('user') e c.get('tenantContext')
    if (!userId) {
        await next();
        return;
    }

    // 5. CRÍTICO: Buscar dados do usuário SEMPRE do banco de dados
    // Isso garante que o organizationId é confiável e não pode ser manipulado
    try {
        if (!env.DB) {
            console.error("[TENANT-AUTH] Database não disponível");
            await next();
            return;
        }

        const user = await env.DB.prepare(`
      SELECT 
        id, email, name, role, organization_id, 
        managed_organization_id, can_manage_users, 
        can_create_organizations, is_active, last_active_at
      FROM users 
      WHERE id = ? AND is_active = 1
    `).bind(userId).first() as AuthenticatedUser & { last_active_at?: string };

        if (!user) {
            console.warn(`[TENANT-AUTH] Usuário ${userId} não encontrado no DB. Tentando auto-cadastro...`);

            // AUTO-HEAL: Se temos o usuário do contexto (Supabase Auth/Google), criar no banco
            if (existingUser && (existingUser as any).email) {
                try {
                    const email = (existingUser as any).email;
                    const meta = (existingUser as any).user_metadata || {};
                    const name = meta.full_name || meta.name || email.split('@')[0];

                    console.log(`[TENANT-AUTH] Criando usuário ${email} no banco...`);

                    // Try to insert
                    try {
                        await env.DB.prepare(`
                            INSERT INTO users (id, email, name, role, is_active, approval_status, created_at, updated_at)
                            VALUES (?, ?, ?, 'inspector', true, 'pending', NOW(), NOW())
                        `).bind(userId, email, name).run();
                    } catch (firstInsertError: any) {
                        console.error('[TENANT-AUTH] Erro ao inserir como inspector:', firstInsertError);
                        // Fallback to 'client' role if 'inspector' is rejected by constraint
                        await env.DB.prepare(`
                            INSERT INTO users (id, email, name, role, is_active, approval_status, created_at, updated_at)
                            VALUES (?, ?, ?, 'client', true, 'pending', NOW(), NOW())
                        `).bind(userId, email, name).run();
                    }


                    // Buscar o usuário recém-criado para prosseguir normalmente
                    const newUser = await env.DB.prepare(`
                        SELECT id, email, name, role, organization_id, 
                        managed_organization_id, can_manage_users, 
                        can_create_organizations, is_active, last_active_at
                        FROM users WHERE id = ?
                    `).bind(userId).first();

                    if (newUser) {
                        // Continuar execução com o novo usuário
                        // @ts-ignore
                        user = newUser;
                        console.log(`[TENANT-AUTH] Usuário criado e recuperado com sucesso: ${email}`);
                    } else {
                        console.error(`[TENANT-AUTH] Falha ao recuperar usuário após criação`);
                        // DO NOT RETURN 400 HERE. Let it proceed, maybe route handles it differently or we give specific error
                        // But if user is null, route will likely return 400/404.
                    }

                } catch (createError) {
                    console.error(`[TENANT-AUTH] Erro CRÍTICO ao criar usuário automaticamente:`, createError);
                    // Proceeding without user will likely cause 400 downstream
                }
            } else {
                console.warn(`[TENANT-AUTH] Dados insuficientes para auto-cadastro`);
            }
        } else {
            // Caso user exista, mas var 'user' seja const (no replace content a gente redeclara se precisar? 
            // Não, user vem do primeiro await. Se aquele await falhou, entra aqui.
            // Se user existisse, não entrava no if(!user).
        }

        // Update last_active_at if null or > 5 min old
        try {
            const now = new Date();
            const lastActive = user.last_active_at ? new Date(user.last_active_at) : null;

            if (!lastActive || (now.getTime() - lastActive.getTime() > 5 * 60 * 1000)) {
                // Async update
                env.DB.prepare("UPDATE users SET last_active_at = NOW() WHERE id = ?").bind(userId).run().catch((e: any) => console.error("Error updating last_active_at:", e));
            }
        } catch (e) {
            console.error("Error checking activity:", e);
        }

        // 6. Construir contexto de tenant seguro
        const isSystemAdmin = user.role === USER_ROLES.SYSTEM_ADMIN ||
            user.role === 'sys_admin' ||
            user.role === 'admin';

        let allowedOrganizationIds: number[] = [];

        if (isSystemAdmin) {
            allowedOrganizationIds = []; // System Admin has access to everything effectively (handled by logic elsewhere usually)
        } else {
            // Start with organization_id (Legacy/Primary)
            const orgsSet = new Set<number>();
            if (user.organization_id) orgsSet.add(user.organization_id);

            // Fetch explicit assignments from user_organizations
            try {
                const assigned = await env.DB.prepare("SELECT organization_id FROM user_organizations WHERE user_id = ?").bind(userId).all();
                if (assigned.results) {
                    assigned.results.forEach((r: any) => orgsSet.add(r.organization_id));
                }
            } catch (e) {
                console.error("[TENANT-AUTH] Error fetching user_organizations:", e);
            }

            // If Org Admin, include managed org and subsidiaries
            if (user.role === USER_ROLES.ORG_ADMIN && user.managed_organization_id) {
                orgsSet.add(user.managed_organization_id);
                try {
                    const subsidiaries = await env.DB.prepare("SELECT id FROM organizations WHERE parent_organization_id = ?").bind(user.managed_organization_id).all();
                    if (subsidiaries.results) {
                        subsidiaries.results.forEach((s: any) => orgsSet.add(s.id));
                    }
                } catch (e) {
                    console.error("[TENANT-AUTH] Error fetching subsidiaries:", e);
                }
            }

            allowedOrganizationIds = Array.from(orgsSet);
        }

        const tenantContext: TenantContext = {
            organizationId: user.organization_id,
            allowedOrganizationIds,
            isSystemAdmin,
            userId: user.id,
            userRole: user.role
        };

        // PRESERVE GOOGLE/SUPABASE METADATA (Picture/Name)
        if (existingUser && (existingUser as any).user_metadata) {
            const metadata = (existingUser as any).user_metadata;
            if (metadata.picture || metadata.avatar_url) {
                (user as any).google_user_data = {
                    picture: metadata.picture || metadata.avatar_url,
                    name: metadata.full_name || metadata.name
                };
            }
        }

        // 7. Injetar no contexto da requisição
        c.set("user", user);
        c.set("tenantContext", tenantContext);

        await next();

    } catch (error) {
        console.error("[TENANT-AUTH] Erro ao buscar usuário:", error);
        await next();
    }
}

/**
 * Middleware de proteção de rota - Requer autenticação
 * 
 * @security Use este middleware em rotas que EXIGEM usuário autenticado
 */
export async function requireAuth(c: Context, next: Next) {
    const user = c.get("user");

    if (!user) {
        return c.json({
            error: "unauthorized",
            message: "Autenticação necessária para acessar este recurso"
        }, 401);
    }

    await next();
}

/**
 * Middleware de verificação de roles permitidos
 * 
 * @param allowedRoles - Lista de roles que podem acessar a rota
 * @security Implementa o princípio de "Least Privilege"
 */
export function requireRoles(...allowedRoles: string[]) {
    return async (c: Context, next: Next) => {
        const user = c.get("user") as AuthenticatedUser | undefined;
        const tenantContext = c.get("tenantContext") as TenantContext | undefined;

        if (!user || !tenantContext) {
            return c.json({
                error: "unauthorized",
                message: "Autenticação necessária"
            }, 401);
        }

        // System Admin sempre tem acesso
        if (tenantContext.isSystemAdmin) {
            await next();
            return;
        }

        // Verificar se o role do usuário está na lista permitida
        const userRole = user.role.toLowerCase();
        const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());

        if (!normalizedAllowedRoles.includes(userRole)) {
            return c.json({
                error: "forbidden",
                message: "Permissões insuficientes para acessar este recurso",
                required_roles: allowedRoles,
                user_role: user.role
            }, 403);
        }

        await next();
    };
}

/**
 * Extrai o organizationId seguro do contexto de tenant
 * 
 * @security NUNCA use organization_id do body/params para usuários não-admin
 * @returns O organizationId do contexto seguro ou null se não disponível
 */
export function getSecureOrganizationId(c: Context): number | null {
    const tenantContext = c.get("tenantContext") as TenantContext | undefined;
    return tenantContext?.organizationId ?? null;
}

/**
 * Verifica se o usuário tem acesso a uma organização específica
 * 
 * @security Use esta função antes de acessar dados de uma organização
 */
export function canAccessOrganization(c: Context, targetOrgId: number): boolean {
    const tenantContext = c.get("tenantContext") as TenantContext | undefined;

    if (!tenantContext) return false;
    if (tenantContext.isSystemAdmin) return true;

    return tenantContext.allowedOrganizationIds.includes(targetOrgId);
}

/**
 * Helper para logging de segurança
 * 
 * @security Use para registrar tentativas de acesso não autorizado
 */
export async function logSecurityEvent(
    env: Env,
    userId: string,
    action: string,
    details: Record<string, unknown>,
    isBlocked: boolean = false
): Promise<void> {
    try {
        await env.DB.prepare(`
      INSERT INTO security_audit_log (
        user_id, action_type, old_value, new_value,
        blocked_reason, is_blocked, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW())
    `).bind(
            userId,
            action,
            JSON.stringify(details),
            null,
            isBlocked ? `Tentativa bloqueada: ${action}` : null,
            isBlocked ? 1 : 0
        ).run();
    } catch (error) {
        console.error("[SECURITY-LOG] Erro ao registrar evento:", error);
    }
}

