import { Hono } from "hono";
import { demoAuthMiddleware } from "./demo-auth-middleware";
import { USER_ROLES } from "@/shared/user-types";

const actionPlansRoutes = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Get all action items across all inspections with optional organization filter
actionPlansRoutes.get("/all", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const organizationId = c.req.query("organization_id");
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;

    let query = `
      SELECT ai.*, 
             i.title as inspection_title,
             i.location as inspection_location,
             i.company_name as inspection_company,
             i.created_by as inspection_created_by,
             i.organization_id as inspection_organization_id,
             u.name as created_by_name,
             o.name as organization_name
      FROM action_items ai
      LEFT JOIN inspections i ON ai.inspection_id = i.id
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN organizations o ON i.organization_id = o.id
    `;

    const params: any[] = [];
    const whereConditions: string[] = [];

    // Organization filter
    if (organizationId && organizationId !== 'all') {
      whereConditions.push("i.organization_id = ?");
      params.push(parseInt(organizationId));
    }

    // Role-based access control
    if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN || userProfile?.role === 'sys_admin') {
      // System admin sees all action items (no additional filtering)
    } else if (userProfile?.role === USER_ROLES.ORG_ADMIN) {
      // Org admin sees action items from their organization and subsidiaries
      if (userProfile.managed_organization_id) {
        whereConditions.push(`(
          i.organization_id = ? OR 
          i.organization_id IN (
            SELECT id FROM organizations WHERE parent_organization_id = ?
          )
        )`);
        params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
      }
    } else {
      // Regular users see action items from inspections they created or from their organization
      whereConditions.push(`(i.created_by = ? OR i.organization_id = ?)`);
      params.push(user.id, userProfile?.organization_id);
    }

    if (whereConditions.length > 0) {
      query += " WHERE " + whereConditions.join(" AND ");
    }

    query += " ORDER BY ai.created_at DESC";

    const actionItems = await env.DB.prepare(query).bind(...params).all();

    return c.json({
      action_items: actionItems.results || [],
      total: (actionItems.results || []).length
    });

  } catch (error) {
    console.error('Error fetching all action items:', error);
    return c.json({ error: "Failed to fetch action items" }, 500);
  }
});

// Get action items by inspection ID
actionPlansRoutes.get("/inspection/:inspectionId", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("inspectionId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Verify access to inspection
    const inspection = await env.DB.prepare(`
      SELECT i.*, u.name as created_by_name
      FROM inspections i
      LEFT JOIN users u ON i.created_by = u.id
      WHERE i.id = ?
    `).bind(inspectionId).first() as any;

    if (!inspection) {
      return c.json({ error: "Inspection not found" }, 404);
    }

    // Check access permissions
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;

    const hasAccess = userProfile?.role === USER_ROLES.SYSTEM_ADMIN ||
      userProfile?.role === 'sys_admin' ||
      inspection.created_by === user.id ||
      inspection.organization_id === userProfile?.organization_id ||
      (userProfile?.role === USER_ROLES.ORG_ADMIN &&
        (inspection.organization_id === userProfile.managed_organization_id ||
          await env.DB.prepare(`
                         SELECT 1 FROM organizations 
                         WHERE id = ? AND parent_organization_id = ?
                       `).bind(inspection.organization_id, userProfile.managed_organization_id).first()));

    if (!hasAccess) {
      return c.json({ error: "Access denied" }, 403);
    }

    // Get action items for this inspection
    const actionItems = await env.DB.prepare(`
      SELECT ai.*, ii.category as item_category, ii.item_description
      FROM action_items ai
      LEFT JOIN inspection_items ii ON ai.inspection_item_id = ii.id
      WHERE ai.inspection_id = ?
      ORDER BY ai.created_at DESC
    `).bind(inspectionId).all();

    return c.json({
      inspection,
      action_items: actionItems.results || []
    });

  } catch (error) {
    console.error('Error fetching inspection action items:', error);
    return c.json({ error: "Failed to fetch action items" }, 500);
  }
});

// Update action item status
actionPlansRoutes.put("/:id/status", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const actionId = parseInt(c.req.param("id"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const body = await c.req.json();
    const { status } = body;

    if (!['pending', 'in_progress', 'completed'].includes(status)) {
      return c.json({ error: "Invalid status" }, 400);
    }

    // Get action item with inspection details for permission check
    const actionItem = await env.DB.prepare(`
      SELECT ai.*, i.created_by, i.organization_id
      FROM action_items ai
      JOIN inspections i ON ai.inspection_id = i.id
      WHERE ai.id = ?
    `).bind(actionId).first() as any;

    if (!actionItem) {
      return c.json({ error: "Action item not found" }, 404);
    }

    // Check permissions
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;

    const hasAccess = userProfile?.role === USER_ROLES.SYSTEM_ADMIN ||
      userProfile?.role === 'sys_admin' ||
      actionItem.created_by === user.id ||
      actionItem.organization_id === userProfile?.organization_id ||
      (userProfile?.role === USER_ROLES.ORG_ADMIN &&
        (actionItem.organization_id === userProfile.managed_organization_id ||
          await env.DB.prepare(`
                         SELECT 1 FROM organizations 
                         WHERE id = ? AND parent_organization_id = ?
                       `).bind(actionItem.organization_id, userProfile.managed_organization_id).first()));

    if (!hasAccess) {
      return c.json({ error: "Access denied" }, 403);
    }

    // Update status
    await env.DB.prepare(`
      UPDATE action_items 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(status, actionId).run();

    return c.json({
      success: true,
      message: "Status updated successfully"
    });

  } catch (error) {
    console.error('Error updating action item status:', error);
    return c.json({ error: "Failed to update status" }, 500);
  }
});

// Get action items statistics
actionPlansRoutes.get("/stats", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const organizationId = c.req.query("organization_id");
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;

    let query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN ai.status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN ai.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN ai.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN ai.priority = 'alta' AND ai.status != 'completed' THEN 1 ELSE 0 END) as high_priority,
        SUM(CASE WHEN ai.when_deadline < date('now') AND ai.status != 'completed' THEN 1 ELSE 0 END) as overdue
      FROM action_items ai
      LEFT JOIN inspections i ON ai.inspection_id = i.id
    `;

    const params: any[] = [];
    const whereConditions: string[] = [];

    // Organization filter
    if (organizationId && organizationId !== 'all') {
      whereConditions.push("i.organization_id = ?");
      params.push(parseInt(organizationId));
    }

    // Role-based access control
    if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN || userProfile?.role === 'sys_admin') {
      // System admin sees all stats
    } else if (userProfile?.role === USER_ROLES.ORG_ADMIN) {
      if (userProfile.managed_organization_id) {
        whereConditions.push(`(
          i.organization_id = ? OR 
          i.organization_id IN (
            SELECT id FROM organizations WHERE parent_organization_id = ?
          )
        )`);
        params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
      }
    } else {
      whereConditions.push(`(i.created_by = ? OR i.organization_id = ?)`);
      params.push(user.id, userProfile?.organization_id);
    }

    if (whereConditions.length > 0) {
      query += " WHERE " + whereConditions.join(" AND ");
    }

    const stats = await env.DB.prepare(query).bind(...params).first() as any;

    return c.json({
      stats: {
        total: stats?.total || 0,
        pending: stats?.pending || 0,
        in_progress: stats?.in_progress || 0,
        completed: stats?.completed || 0,
        high_priority: stats?.high_priority || 0,
        overdue: stats?.overdue || 0
      }
    });

  } catch (error) {
    console.error('Error fetching action items stats:', error);
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

export default actionPlansRoutes;
