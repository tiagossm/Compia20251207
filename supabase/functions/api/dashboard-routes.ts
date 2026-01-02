import { Hono } from "hono";
import { tenantAuthMiddleware } from "./tenant-auth-middleware.ts";
import { USER_ROLES } from "./user-types.ts";

type Env = {
  DB: any;
};

const dashboardRoutes = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// GET estatísticas gerais do dashboard
dashboardRoutes.get("/stats", tenantAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const organizationId = c.req.query("organization_id");

  if (!user) {
    return c.json({ error: "Usuário não autenticado" }, 401);
  }

  try {
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;

    let whereClause = "";
    let params: any[] = [];

    if (organizationId) {
      // Se um organization_id for fornecido na query, filtre por ele.
      // O middleware de autenticação (AuthGuard) já garante que o usuário
      // tenha acesso ao scope desta organização.
      whereClause = "WHERE organization_id = ?";
      params.push(organizationId);
    } else if (userProfile?.role === USER_ROLES.ORG_ADMIN && userProfile.managed_organization_id) {
      // Para Org Admins, se nenhum organization_id específico for fornecido,
      // filtre pela organização gerenciada e suas subsidiárias
      whereClause = `
        WHERE organization_id IN (
          SELECT id FROM organizations 
          WHERE id = ? OR parent_organization_id = ?
        )
      `;
      params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
    } else if (userProfile?.organization_id) {
      // Para usuários comuns (não-admin), filtre pela sua organização
      whereClause = "WHERE organization_id = ?";
      params.push(userProfile.organization_id);
    }
    // SYSTEM_ADMIN não tem filtro, vê tudo

    const total = await env.DB.prepare(`SELECT COUNT(*) as count FROM inspections ${whereClause}`).bind(...params).first() as any;
    const pending = await env.DB.prepare(`SELECT COUNT(*) as count FROM inspections ${whereClause}${whereClause ? ' AND' : ' WHERE'} status = 'pendente'`).bind(...params).first() as any;
    const inProgress = await env.DB.prepare(`SELECT COUNT(*) as count FROM inspections ${whereClause}${whereClause ? ' AND' : ' WHERE'} status = 'em_andamento'`).bind(...params).first() as any;
    const completed = await env.DB.prepare(`SELECT COUNT(*) as count FROM inspections ${whereClause}${whereClause ? ' AND' : ' WHERE'} status = 'concluida'`).bind(...params).first() as any;

    return c.json({
      total: total?.count || 0,
      pending: pending?.count || 0,
      inProgress: inProgress?.count || 0,
      completed: completed?.count || 0,
    });

  } catch (error) {
    console.error('[DASHBOARD-STATS] Erro ao buscar estatísticas:', error);
    // Return empty stats instead of error 500
    return c.json({
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0
    });
  }
});

// GET sumário do plano de ação do dashboard
dashboardRoutes.get("/action-plan-summary", tenantAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const organizationId = c.req.query("organization_id");

  if (!user) {
    return c.json({ error: "Usuário não autenticado" }, 401);
  }

  try {
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;

    let whereClause = "";
    let params: any[] = [];

    if (organizationId) {
      whereClause = "WHERE i.organization_id = ?";
      params.push(organizationId);
    } else if (userProfile?.role === USER_ROLES.ORG_ADMIN && userProfile.managed_organization_id) {
      whereClause = `
        WHERE i.organization_id IN (
          SELECT id FROM organizations 
          WHERE id = ? OR parent_organization_id = ?
        )
      `;
      params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
    } else if (userProfile?.organization_id) {
      whereClause = "WHERE i.organization_id = ?";
      params.push(userProfile.organization_id);
    }
    // SYSTEM_ADMIN não tem filtro

    const allActions = await env.DB.prepare(`
      SELECT 
        ai.status, 
        ai.priority, 
        ai.when_deadline, 
        ai.is_ai_generated 
      FROM action_items ai
      JOIN inspections i ON ai.inspection_id = i.id
      ${whereClause}
    `).bind(...params).all() as any;

    const actions = allActions.results || [];
    const now = new Date();

    const summary = actions.reduce((acc: any, action: any) => {
      acc.total_actions++;
      if (action.status === 'pending') acc.pending_actions++;
      if (action.status === 'in_progress') acc.in_progress_actions++;
      if (action.status === 'completed') acc.completed_actions++;
      if (action.is_ai_generated) acc.ai_generated_count++;

      if (action.when_deadline) {
        const deadlineDate = new Date(action.when_deadline);
        if (action.status !== 'completed' && deadlineDate < now) {
          acc.overdue_actions++;
        }
        if (action.status !== 'completed' && deadlineDate > now && (deadlineDate.getTime() - now.getTime()) < (7 * 24 * 60 * 60 * 1000)) {
          acc.upcoming_deadline++;
        }
      }
      if (action.status !== 'completed' && action.priority === 'alta') {
        acc.high_priority_pending++;
      }
      return acc;
    }, {
      total_actions: 0,
      pending_actions: 0,
      in_progress_actions: 0,
      completed_actions: 0,
      upcoming_deadline: 0,
      overdue_actions: 0,
      high_priority_pending: 0,
      ai_generated_count: 0
    });

    return c.json(summary);

  } catch (error) {
    console.error('[DASHBOARD-ACTIONS] Erro ao buscar sumário do plano de ação:', error);
    // Return empty summary instead of error 500
    return c.json({
      total_actions: 0,
      pending_actions: 0,
      in_progress_actions: 0,
      completed_actions: 0,
      upcoming_deadline: 0,
      overdue_actions: 0,
      high_priority_pending: 0,
      ai_generated_count: 0
    });
  }
});

export default dashboardRoutes;

