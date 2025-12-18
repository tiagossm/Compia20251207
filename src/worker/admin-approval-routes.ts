import { Hono } from "hono";
import { tenantAuthMiddleware, requireRoles } from "./tenant-auth-middleware";
import { USER_ROLES } from "@/shared/user-types";

/**
 * Rotas de administração para Aprovação de Usuários
 * @security Apenas System Admin pode acessar estas rotas
 */
const adminApprovalRoutes = new Hono<{ Bindings: Env; Variables: { user: any; tenantContext: any } }>();

// Middleware global para estas rotas: Autenticação + Apenas SysAdmin (por enquanto)
// TODO: Futuramente permitir que outros funcion ários (Org Admin) aprovem?
adminApprovalRoutes.use("*", tenantAuthMiddleware, requireRoles(USER_ROLES.SYSTEM_ADMIN, 'sys_admin', 'admin'));

/**
 * Listar usuários pendentes
 * GET /api/admin/pending-users
 */
adminApprovalRoutes.get("/pending-users", async (c) => {
    const env = c.env;

    try {
        const pendingUsers = await env.DB.prepare(`
      SELECT id, email, name, role, organization_id, created_at 
      FROM users 
      WHERE approval_status = 'pending'
      ORDER BY created_at DESC
    `).all();

        return c.json({
            success: true,
            data: pendingUsers.results || []
        });
    } catch (error) {
        console.error('[ADMIN-APPROVAL] Erro ao listar pendentes:', error);
        return c.json({ error: "Erro ao buscar usuários pendentes" }, 500);
    }
});

/**
 * Aprovar usuário
 * POST /api/admin/users/:id/approve
 */
adminApprovalRoutes.post("/users/:id/approve", async (c) => {
    const env = c.env;
    const targetUserId = c.req.param("id");
    const approver = c.get("user");

    try {
        const result = await env.DB.prepare(`
      UPDATE users 
      SET 
        approval_status = 'approved',
        approved_by = ?,
        approved_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(approver.id, targetUserId).run();

        if (result.meta.changes === 0) {
            return c.json({ error: "Usuário não encontrado" }, 404);
        }

        // Opcional: Enviar email de "Sua conta foi aprovada" (future work)

        return c.json({
            success: true,
            message: "Usuário aprovado com sucesso"
        });

    } catch (error) {
        console.error('[ADMIN-APPROVAL] Erro ao aprovar usuário:', error);
        return c.json({ error: "Erro ao realizar aprovação" }, 500);
    }
});

/**
 * Rejeitar usuário
 * POST /api/admin/users/:id/reject
 */
adminApprovalRoutes.post("/users/:id/reject", async (c) => {
    const env = c.env;
    const targetUserId = c.req.param("id");
    const approver = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const reason = body.reason || null;

    try {
        // Poderíamos deletar o usuário ou apenas marcar como rejected.
        // Marcar como rejected mantém registro.
        const result = await env.DB.prepare(`
      UPDATE users 
      SET 
        approval_status = 'rejected',
        approved_by = ?, 
        rejection_reason = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(approver.id, reason, targetUserId).run();

        if (result.meta.changes === 0) {
            return c.json({ error: "Usuário não encontrado" }, 404);
        }

        return c.json({
            success: true,
            message: "Usuário rejeitado com sucesso"
        });

    } catch (error) {
        console.error('[ADMIN-APPROVAL] Erro ao rejeitar usuário:', error);
        return c.json({ error: "Erro ao rejeitar usuário" }, 500);
    }
});

export default adminApprovalRoutes;
