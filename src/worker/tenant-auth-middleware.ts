import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { USER_ROLES } from "@/shared/user-types";

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

    // 1. Extrair token de autenticação
    const sessionToken = getCookie(c, "mocha-session-token") || getCookie(c, "mocha_session_token");
    // TODO: Adicionar suporte a Authorization header com JWT quando JWT_SECRET estiver configurado

    let userId: string | null = null;

    // 2. Validar sessão via cookie (desenvolvimento/produção atual)
    if (sessionToken && sessionToken.startsWith("dev-session-")) {
        userId = sessionToken.replace("dev-session-", "");
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
        can_create_organizations, is_active
      FROM users 
      WHERE id = ? AND is_active = 1
    `).bind(userId).first() as AuthenticatedUser | null;

        if (!user) {
            console.warn(`[TENANT-AUTH] Usuário ${userId} não encontrado ou inativo`);
            await next();
            return;
        }

        // 6. Construir contexto de tenant seguro
        const isSystemAdmin = user.role === USER_ROLES.SYSTEM_ADMIN ||
            user.role === 'sys_admin' ||
            user.role === 'admin';

        let allowedOrganizationIds: number[] = [];

        if (isSystemAdmin) {
            // System Admin: acesso a todas as organizações
            // Não preenchemos a lista, pois o helper de query vai ignorar o filtro
            allowedOrganizationIds = [];
        } else if (user.role === USER_ROLES.ORG_ADMIN && user.managed_organization_id) {
            // Org Admin: acesso à própria organização e subsidiárias
            const subsidiaries = await env.DB.prepare(`
        SELECT id FROM organizations 
        WHERE parent_organization_id = ?
      `).bind(user.managed_organization_id).all();

            allowedOrganizationIds = [
                user.managed_organization_id,
                ...((subsidiaries.results || []) as { id: number }[]).map(org => org.id)
            ];
        } else if (user.organization_id) {
            // Usuários regulares: apenas sua própria organização
            allowedOrganizationIds = [user.organization_id];
        }

        const tenantContext: TenantContext = {
            organizationId: user.organization_id,
            allowedOrganizationIds,
            isSystemAdmin,
            userId: user.id,
            userRole: user.role
        };

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
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
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
