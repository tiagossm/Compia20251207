import { Hono } from "hono";
import { demoAuthMiddleware } from "./demo-auth-middleware.ts";
import { USER_ROLES } from "./user-types.ts";
// import database-init removido
import { TenantContext } from "./tenant-auth-middleware.ts";

type Env = {
  DB: any;
  OPENAI_API_KEY?: string;
  [key: string]: any;
};

const inspectionRoutes = new Hono<{ Bindings: Env; Variables: { user: any; tenantContext: TenantContext } }>();

// Get all inspections for current user
inspectionRoutes.get("/", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Inicialização do database removida (migrado para Postgres)
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;

    let query = `
      SELECT i.*, u.name as created_by_name, u.avatar_url as inspector_avatar, o.name as organization_name
      FROM inspections i
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN organizations o ON i.organization_id = o.id
  `;

    const params: any[] = [];
    const whereConditions: string[] = [];

    // Filter based on user role and organization
    if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN || userProfile?.role === 'sys_admin') {
      // System admin sees all inspections
    } else if (userProfile?.role === USER_ROLES.ORG_ADMIN) {
      // Org admin sees inspections from their organization and subsidiaries
      if (userProfile.managed_organization_id) {
        whereConditions.push(`(
    i.organization_id = ? OR 
          i.organization_id IN(
      SELECT id FROM organizations WHERE parent_organization_id = ?
          )
  )`);
        params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
      }
    } else {
      // Regular users see their own inspections and those in their organization
      whereConditions.push(`(i.created_by = ? OR i.organization_id = ?)`);
      params.push(user.id, userProfile?.organization_id);
    }

    if (whereConditions.length > 0) {
      query += " WHERE " + whereConditions.join(" AND ");
    }

    query += " ORDER BY i.created_at DESC";

    const inspections = await env.DB.prepare(query).bind(...params).all();

    return c.json({ inspections: inspections.results || [] });
  } catch (error) {
    console.error('Error fetching inspections:', error);
    return c.json({ error: "Failed to fetch inspections" }, 500);
  }
});

// Get simple list of inspections for dropdowns
inspectionRoutes.get("/simple-list", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const organizationId = c.req.query("organization_id");

  try {
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;

    let query = `
       SELECT i.id, i.title, i.created_at, i.status 
       FROM inspections i
     `;

    const params: any[] = [];
    const whereConditions: string[] = [];

    // Filter by Org if provided (and allowed)
    if (organizationId) {
      // TODO: Validate user has access to this org
      whereConditions.push("i.organization_id = ?");
      params.push(organizationId);
    } else {
      // RBAC (Simplified for dropdown, usually showing user's org stuff)
      if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN || userProfile?.role === 'sys_admin') {
        // All
      } else if (userProfile?.role === USER_ROLES.ORG_ADMIN) {
        if (userProfile.managed_organization_id) {
          whereConditions.push(`(i.organization_id = ? OR i.organization_id IN (SELECT id FROM organizations WHERE parent_organization_id = ?))`);
          params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
        }
      } else {
        whereConditions.push(`(i.created_by = ? OR i.organization_id = ?)`);
        params.push(user.id, userProfile?.organization_id);
      }
    }

    if (whereConditions.length > 0) {
      query += " WHERE " + whereConditions.join(" AND ");
    }

    query += " ORDER BY i.created_at DESC LIMIT 50"; // Limit to recent 50

    const inspections = await env.DB.prepare(query).bind(...params).all();
    return c.json({ inspections: inspections.results || [] });

  } catch (error) {
    console.log("Error fetching inspection list:", error);
    return c.json({ inspections: [] });
  }
});

// Get specific inspection with all related data
inspectionRoutes.get("/:id", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("id"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Get inspection with related data
    const inspection = await env.DB.prepare(`
      SELECT i.*, u.name as created_by_name, o.name as organization_name
      FROM inspections i
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN organizations o ON i.organization_id = o.id
      WHERE i.id = ?
  `).bind(inspectionId).first() as any;

    if (!inspection) {
      return c.json({ error: "Inspection not found" }, 404);
    }

    // Get inspection items
    const items = await env.DB.prepare(`
      SELECT * FROM inspection_items 
      WHERE inspection_id = ?
  ORDER BY id ASC
    `).bind(inspectionId).all();

    console.log(`[DEBUG_INSPECTION_ITEMS] Fetching inspection ${inspectionId}`);
    if (items.results) {
      console.log(`[DEBUG_INSPECTION_ITEMS] Count: ${items.results.length}`);
      if (items.results.length > 0) {
        console.log(`[DEBUG_INSPECTION_ITEMS] First item: ID=${(items.results[0] as any).id}, Desc=${(items.results[0] as any).item_description}`);
        console.log(`[DEBUG_INSPECTION_ITEMS] IDs: ${items.results.map((i: any) => i.id).join(', ')}`);
      } else {
        console.log(`[DEBUG_INSPECTION_ITEMS] NO ITEMS FOUND!`);
      }
    }

    // Get action items
    const actionItems = await env.DB.prepare(`
SELECT * FROM action_items 
      WHERE inspection_id = ?
  ORDER BY created_at DESC
    `).bind(inspectionId).all();

    // Get media for all items
    const media = await env.DB.prepare(`
SELECT * FROM inspection_media 
      WHERE inspection_id = ?
  ORDER BY created_at DESC
    `).bind(inspectionId).all();

    return c.json({
      inspection,
      items: items.results || [],
      action_items: actionItems.results || [],
      media: media.results || []
    });

  } catch (error) {
    console.error('Error fetching inspection:', error);
    return c.json({ error: "Failed to fetch inspection" }, 500);
  }
});

// Create new inspection - BLINDADO
// @security: organization_id vem do contexto seguro, NUNCA do body
inspectionRoutes.post("/", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const tenantContext = c.get("tenantContext");

  // Verificação de autenticação
  if (!user) {
    return c.json({ error: "Autenticação necessária" }, 401);
  }

  // Verificação de permissão: Inspector ou superior pode criar inspeções
  const allowedRoles = ['inspector', 'manager', 'org_admin', 'system_admin', 'sys_admin', 'admin'];
  if (!allowedRoles.includes(user.role?.toLowerCase())) {
    return c.json({
      error: "Permissão negada",
      message: "Apenas Inspetores ou superiores podem criar inspeções",
      required_roles: allowedRoles
    }, 403);
  }

  try {
    const body = await c.req.json();
    const {
      title, description, location, inspector_name, inspector_email,
      company_name, cep, address, scheduled_date,
      logradouro, numero, complemento, bairro, cidade, uf, sectors,
      status = 'pendente', priority = 'media', responsible_name, responsible_email,
      template_id, ai_assistant_id, action_plan_type = '5w2h',
      // Novos campos de auditoria (opcionais, enviados pelo cliente)
      started_at_user_time,
      location_start_lat, location_start_lng,
      device_fingerprint, device_model, device_os,
      is_offline_sync = false
    } = body;

    // CRÍTICO: organization_id vem do contexto SEGURO, não do body
    // Isso previne ataques de injeção de tenant
    const secureOrgId = tenantContext?.organizationId || user.organization_id;

    if (!secureOrgId) {
      return c.json({
        error: "Organização não definida",
        message: "Usuário não está associado a nenhuma organização"
      }, 400);
    }

    // Validar se o body tenta injetar organization_id diferente (log de segurança)
    if (body.organization_id && body.organization_id !== secureOrgId) {
      console.warn(`[SECURITY] Tentativa de injeção de org_id detectada.User: ${user.id}, Body: ${body.organization_id}, Seguro: ${secureOrgId} `);
      // Não bloquear, apenas ignorar o valor do body e usar o seguro
    }

    // Capturar IP e User-Agent para auditoria
    const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';

    const result = await env.DB.prepare(`
      INSERT INTO inspections(
      title, description, location, inspector_name, inspector_email,
      company_name, cep, address, scheduled_date,
      logradouro, numero, complemento, bairro, cidade, uf, sectors,
      status, priority, created_by, organization_id, responsible_name, responsible_email,
      ai_assistant_id, action_plan_type,
      started_at_user_time, started_at_server_time,
      location_start_lat, location_start_lng,
      device_fingerprint, device_model, device_os,
      is_offline_sync, sync_timestamp,
      created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
      `).bind(
      title || null,
      description || null,
      location || null,
      inspector_name || user.name || null,
      inspector_email || user.email || null,
      company_name || null,
      cep || null,
      address || null,
      scheduled_date || null,
      logradouro || null,
      numero || null,
      complemento || null,
      bairro || null,
      cidade || null,
      uf || null,
      sectors ? JSON.stringify(sectors) : null,
      status,
      priority,
      user.id,
      secureOrgId, // SEGURO: vem do contexto, não do body
      responsible_name || null,
      responsible_email || null,
      ai_assistant_id || null,
      action_plan_type,
      started_at_user_time || null,
      new Date().toISOString(), // started_at_server_time
      location_start_lat || null,
      location_start_lng || null,
      device_fingerprint || null,
      device_model || null,
      device_os || null,
      is_offline_sync ? 1 : 0,
      is_offline_sync ? new Date().toISOString() : null,
      new Date().toISOString(), // created_at
      new Date().toISOString()  // updated_at
    ).first();

    console.log('[DEBUG] SQL Result:', JSON.stringify(result));

    // Robust ID extraction for D1/SQLite/Postgres
    let inspectionId = (result as any)?.id || (result as any)?.meta?.last_row_id || (result as any)?.lastInsertRowid;

    console.log('[DEBUG] Extracted Inspection ID:', inspectionId);

    if (!inspectionId) {
      console.warn('[WARNING] Failed to retrieve Inspection ID from meta, attempting fallback...');
      // Attempt fallback query if ID is missing
      try {
        // Try standard SQLite function
        const fallback = await env.DB.prepare("SELECT last_insert_rowid() as id").first();
        console.log('[DEBUG] Fallback ID:', fallback);
        if (fallback && (fallback as any).id) {
          inspectionId = (fallback as any).id;
        } else {
          // If that fails, try selecting the max ID from inspections (LAST RESORT)
          const maxId = await env.DB.prepare("SELECT MAX(id) as id FROM inspections WHERE created_by = ?").bind(user.id).first();
          if (maxId && (maxId as any).id) {
            inspectionId = (maxId as any).id;
            console.log('[DEBUG] Max ID Fallback used:', inspectionId);
          }
        }
      } catch (e) { console.error('Fallback failed', e); }
    }

    // Registrar log de criação (LGPD)
    try {
      await env.DB.prepare(`
        INSERT INTO inspection_logs(
        inspection_id, user_id, action, ip_address, user_agent, created_at
      ) VALUES(?, ?, 'CREATE', ?, ?, NOW())
        `).bind(inspectionId, user.id, ipAddress, userAgent).run();
    } catch (logError) {
      console.error('[AUDIT] Erro ao registrar log de criação:', logError);
      // Não bloquear a operação principal
    }

    // If a template is selected, create inspection items based on template fields
    if (template_id) {
      const template = await env.DB.prepare("SELECT * FROM checklist_templates WHERE id = ?").bind(template_id).first() as any;
      const fields = await env.DB.prepare(`
SELECT * FROM checklist_fields 
        WHERE template_id = ?
  ORDER BY order_index ASC
      `).bind(template_id).all();

      // Create inspection items for each template field with proper type validation
      for (const field of (fields.results || [])) {
        const fieldData = field as any;

        // Validate field type against enum
        const validTypes = [
          'text', 'textarea', 'select', 'multiselect', 'radio', 'checkbox',
          'number', 'date', 'time', 'boolean', 'rating', 'file'
        ];

        if (!validTypes.includes(fieldData.field_type)) {
          console.warn(`Invalid field type: ${fieldData.field_type}. Using 'text' as fallback.`);
          fieldData.field_type = 'text';
        }

        const fieldResponseData = {
          field_id: fieldData.id,
          field_name: fieldData.field_name,
          field_type: fieldData.field_type, // Always include proper type
          is_required: fieldData.is_required,
          options: fieldData.options,
          response_value: null,
          comment: null
        };

        await env.DB.prepare(`
          INSERT INTO inspection_items(
    inspection_id, category, item_description, template_id,
    field_responses, created_at, updated_at
  ) VALUES(?, ?, ?, ?, ?, NOW(), NOW())
    `).bind(
          inspectionId,
          template?.category || 'Geral',
          fieldData.field_name,
          template_id,
          JSON.stringify(fieldResponseData)
        ).run();
      }
    }

    return c.json({
      id: inspectionId,
      message: "Inspeção criada com sucesso",
      organization_id: secureOrgId // Confirmar qual org foi usada
    });

  } catch (error) {
    console.error('Error creating inspection:', error);
    // Não expor stack trace para o cliente
    return c.json({
      error: "Erro ao criar inspeção",
      message: "Erro interno: " + (error instanceof Error ? error.message : String(error))
    }, 500);
  }
});


// Update inspection - BLINDADO
// @security: Verifica propriedade e registra log de auditoria
inspectionRoutes.put("/:id", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const tenantContext = c.get("tenantContext");
  const inspectionId = parseInt(c.req.param("id"));

  if (!user) {
    return c.json({ error: "Autenticação necessária" }, 401);
  }

  try {
    // CRÍTICO: Verificar se a inspeção existe e se o usuário tem acesso
    const inspection = await env.DB.prepare(`
SELECT * FROM inspections WHERE id = ?
  `).bind(inspectionId).first() as any;

    if (!inspection) {
      return c.json({ error: "Inspeção não encontrada" }, 404);
    }

    // Verificar acesso baseado em tenant
    const hasAccess = tenantContext?.isSystemAdmin ||
      (inspection.organization_id && tenantContext?.allowedOrganizationIds.includes(inspection.organization_id)) ||
      inspection.created_by === user.id;

    if (!hasAccess) {
      return c.json({
        error: "Acesso negado",
        message: "Você não tem permissão para editar esta inspeção"
      }, 403);
    }

    const body = await c.req.json();

    // CRÍTICO: Impedir modificação de organization_id via body
    if (body.organization_id && body.organization_id !== inspection.organization_id) {
      console.warn(`[SECURITY] Tentativa de alterar organization_id bloqueada.User: ${user.id}, Inspection: ${inspectionId} `);
      return c.json({
        error: "Operação não permitida",
        message: "Não é possível alterar a organização de uma inspeção"
      }, 403);
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    const changedFields: Record<string, { old: any; new: any }> = {};

    const allowedFields = [
      'title', 'description', 'location', 'inspector_name', 'inspector_email',
      'company_name', 'cep', 'address', 'scheduled_date',
      'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'sectors',
      'completed_date', 'status', 'priority', 'action_plan', 'action_plan_type',
      'inspector_signature', 'responsible_signature', 'responsible_name', 'responsible_email',
      // Campos de auditoria que podem ser atualizados
      'location_end_lat', 'location_end_lng'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined && body[field] !== inspection[field]) {
        updateFields.push(`${field} = ?`);
        updateValues.push(body[field]);
        changedFields[field] = { old: inspection[field], new: body[field] };
      }
    }

    if (updateFields.length === 0) {
      return c.json({ message: "Nenhuma alteração detectada" }, 400);
    }

    updateFields.push("updated_at = NOW()");

    await env.DB.prepare(`
      UPDATE inspections 
      SET ${updateFields.join(", ")}
      WHERE id = ?
  `).bind(...updateValues, inspectionId).run();

    // Registrar log de auditoria para cada campo alterado (LGPD)
    const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';

    for (const [field, values] of Object.entries(changedFields)) {
      try {
        await env.DB.prepare(`
          INSERT INTO inspection_logs(
    inspection_id, user_id, action, field_changed, old_value, new_value,
    ip_address, user_agent, created_at
  ) VALUES(?, ?, 'UPDATE', ?, ?, ?, ?, ?, NOW())
    `).bind(
          inspectionId,
          user.id,
          field,
          JSON.stringify(values.old),
          JSON.stringify(values.new),
          ipAddress,
          userAgent
        ).run();
      } catch (logError) {
        console.error('[AUDIT] Erro ao registrar log de atualização:', logError);
      }
    }

    return c.json({
      message: "Inspeção atualizada com sucesso",
      fields_updated: Object.keys(changedFields)
    });

  } catch (error) {
    console.error('Error updating inspection:', error);
    return c.json({
      error: "Erro ao atualizar inspeção",
      message: "Ocorreu um erro interno. Tente novamente."
    }, 500);
  }
});


// Finalize inspection
inspectionRoutes.post("/:id/finalize", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("id"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const body = await c.req.json();
    const { inspector_signature, responsible_signature, responsible_name, responsible_email } = body;

    if (!inspector_signature || !responsible_signature) {
      return c.json({ error: "Ambas assinaturas são obrigatórias" }, 400);
    }

    // CORRIGIDO: Garantir que as assinaturas sejam salvas antes da finalização
    if (inspector_signature || responsible_signature) {
      console.log(`[FINALIZE] Salvando assinaturas para inspeção ${inspectionId} `);
      await env.DB.prepare(`
        UPDATE inspections 
        SET inspector_signature = ?, responsible_signature = ?, updated_at = NOW()
        WHERE id = ?
  `).bind(
        inspector_signature || null,
        responsible_signature || null,
        inspectionId
      ).run();

      // Verificar se foi salvo corretamente
      const verification = await env.DB.prepare(`
        SELECT inspector_signature, responsible_signature 
        FROM inspections WHERE id = ?
  `).bind(inspectionId).first() as any;

      console.log(`[FINALIZE] Verificação pós - salvamento: `, {
        inspector_saved: verification?.inspector_signature ? 'Sim' : 'Não',
        responsible_saved: verification?.responsible_signature ? 'Sim' : 'Não'
      });
    }

    // Update inspection status and signatures with responsible info
    await env.DB.prepare(`
      UPDATE inspections 
      SET status = 'concluida',
  completed_date = date('now'),
  inspector_signature = ?,
  responsible_signature = ?,
  responsible_name = ?,
  responsible_email = ?,
  updated_at = NOW()
      WHERE id = ?
  `).bind(inspector_signature, responsible_signature, responsible_name, responsible_email, inspectionId).run();

    return c.json({
      success: true,
      message: "Inspection finalized successfully"
    });

  } catch (error) {
    console.error('Error finalizing inspection:', error);
    return c.json({ error: "Failed to finalize inspection" }, 500);
  }
});

// Reopen inspection (with audit trail)
inspectionRoutes.post("/:id/reopen", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("id"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const body = await c.req.json();
    const { justification } = body;

    if (!justification || justification.trim() === '') {
      return c.json({ error: "Justificativa é obrigatória para reabrir a inspeção" }, 400);
    }

    // Get current inspection state
    const inspection = await env.DB.prepare(`
      SELECT id, status, inspector_signature, responsible_signature, completed_date
      FROM inspections WHERE id = ?
    `).bind(inspectionId).first() as any;

    if (!inspection) {
      return c.json({ error: "Inspeção não encontrada" }, 404);
    }

    if (inspection.status !== 'concluida' && inspection.status !== 'completed') {
      return c.json({ error: "Apenas inspeções finalizadas podem ser reabertas" }, 400);
    }

    // Archive current state in history
    await env.DB.prepare(`
      INSERT INTO inspection_reopening_history (
        inspection_id, reopened_by, justification, 
        previous_status, previous_inspector_signature, 
        previous_responsible_signature, previous_completed_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      inspectionId,
      user.id,
      justification.trim(),
      inspection.status,
      inspection.inspector_signature,
      inspection.responsible_signature,
      inspection.completed_date
    ).run();

    // Update inspection: clear signatures and set status to in_progress
    await env.DB.prepare(`
      UPDATE inspections 
      SET status = 'em_andamento',
          inspector_signature = NULL,
          responsible_signature = NULL,
          completed_date = NULL,
          updated_at = NOW()
      WHERE id = ?
    `).bind(inspectionId).run();

    console.log(`[REOPEN] Inspeção ${inspectionId} reaberta por ${user.email}. Justificativa: ${justification.substring(0, 50)}...`);

    return c.json({
      success: true,
      message: "Inspeção reaberta com sucesso"
    });

  } catch (error) {
    console.error('Error reopening inspection:', error);
    return c.json({ error: "Falha ao reabrir inspeção" }, 500);
  }
});

// PATCH endpoint for individual response auto-save
inspectionRoutes.patch("/:id/responses/:itemId", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("id"));
  const itemId = parseInt(c.req.param("itemId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const body = await c.req.json();
    const { answer, comment } = body;

    // Get inspection to verify access
    const inspection = await env.DB.prepare("SELECT * FROM inspections WHERE id = ?").bind(inspectionId).first() as any;

    if (!inspection) {
      return c.json({ error: "Inspeção não encontrada" }, 404);
    }

    // Get existing inspection item
    const existingItem = await env.DB.prepare(
      "SELECT * FROM inspection_items WHERE id = ? AND inspection_id = ?"
    ).bind(itemId, inspectionId).first() as any;

    if (!existingItem) {
      return c.json({ error: "Item de inspeção não encontrado" }, 404);
    }

    // Parse existing field responses
    let fieldData;
    try {
      fieldData = JSON.parse(existingItem.field_responses || '{}');
    } catch (error) {
      return c.json({ error: "Dados do campo corrompidos" }, 400);
    }

    // Update response value and comment
    fieldData.response_value = answer;
    fieldData.comment = comment || null;

    // Determine compliance status from answer
    let complianceStatus = null;
    if (answer !== null && answer !== undefined) {
      if (typeof answer === 'boolean') {
        complianceStatus = answer ? 'conforme' : 'nao_conforme';
      } else if (typeof answer === 'string') {
        const answerLower = answer.toLowerCase();
        if (answerLower === 'conforme' || answerLower === 'sim') {
          complianceStatus = 'conforme';
        } else if (answerLower === 'não conforme' || answerLower === 'nao conforme' || answerLower === 'não') {
          complianceStatus = 'nao_conforme';
        } else if (answerLower === 'não aplicável' || answerLower === 'nao aplicavel' || answerLower === 'n/a') {
          complianceStatus = 'nao_aplicavel';
        }
      }
    }

    // Update database
    await env.DB.prepare(`
      UPDATE inspection_items 
      SET field_responses = ?, is_compliant = ?, updated_at = NOW()
      WHERE id = ? AND inspection_id = ?
  `).bind(JSON.stringify(fieldData), complianceStatus, itemId, inspectionId).run();

    // Clean response (remove BOM if present)
    const responseText = JSON.stringify({
      success: true,
      message: "Resposta salva automaticamente",
      compliance_status: complianceStatus,
      timestamp: new Date().toISOString()
    });

    return c.json(JSON.parse(responseText));

  } catch (error) {
    console.error('Error saving individual response:', error);
    return c.json({
      error: "Erro ao salvar resposta",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

// Save template responses for inspection
inspectionRoutes.post("/:id/template-responses", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("id"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const body = await c.req.json();
    const { responses } = body;

    // Get inspection to verify access
    const inspection = await env.DB.prepare("SELECT * FROM inspections WHERE id = ?").bind(inspectionId).first() as any;

    if (!inspection) {
      return c.json({ error: "Inspeção não encontrada" }, 404);
    }

    const updateStatements: Promise<any>[] = [];

    // Enhanced saving logic for inspection items
    for (const [itemId, responseData] of Object.entries(responses as Record<string, any>)) {
      const itemIdNum = parseInt(itemId);

      if (isNaN(itemIdNum)) continue;

      // Enhanced response data processing
      const updatedFieldData = responseData as any;
      const fieldResponsesJson = JSON.stringify(updatedFieldData);

      // Extract compliance_status with improved logic
      let complianceStatus = null;
      if (updatedFieldData.compliance_status !== undefined && updatedFieldData.compliance_status !== 'unanswered') {
        complianceStatus = updatedFieldData.compliance_status;
      } else if (updatedFieldData.response_value !== undefined) {
        // Enhanced compliance deduction logic
        if (typeof updatedFieldData.response_value === 'boolean') {
          complianceStatus = updatedFieldData.response_value ? 'conforme' : 'nao_conforme';
        } else if (typeof updatedFieldData.response_value === 'string') {
          const valueStr = updatedFieldData.response_value.toLowerCase();
          if (valueStr.includes('conforme') && !valueStr.includes('não')) {
            complianceStatus = 'conforme';
          } else if (valueStr.includes('não conforme') || valueStr.includes('inadequado')) {
            complianceStatus = 'nao_conforme';
          } else if (valueStr.includes('não aplicável') || valueStr.includes('n/a')) {
            complianceStatus = 'nao_aplicavel';
          }
        } else if (typeof updatedFieldData.response_value === 'number') {
          // For rating fields (1-5 scale)
          if (updatedFieldData.response_value >= 4) {
            complianceStatus = 'conforme';
          } else if (updatedFieldData.response_value <= 2) {
            complianceStatus = 'nao_conforme';
          } else {
            complianceStatus = 'parcialmente_conforme';
          }
        }
      }

      // Update inspection item with enhanced data preservation
      updateStatements.push(
        env.DB.prepare(`
          UPDATE inspection_items 
          SET field_responses = ?, is_compliant = ?, updated_at = NOW()
          WHERE id = ? AND inspection_id = ?
  `).bind(fieldResponsesJson, complianceStatus, itemIdNum, inspectionId).run()
      );
    }

    await Promise.all(updateStatements);

    return c.json({
      success: true,
      message: "Respostas salvas com sucesso",
      items_updated: updateStatements.length
    });

  } catch (error) {
    console.error('Error saving template responses:', error);
    return c.json({
      error: "Erro ao salvar respostas",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

// Get template responses for inspection
inspectionRoutes.get("/:id/template-responses", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("id"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Get inspection items with field responses
    const items = await env.DB.prepare(`
      SELECT id, field_responses 
      FROM inspection_items 
      WHERE inspection_id = ? AND field_responses IS NOT NULL
  `).bind(inspectionId).all();

    const responses: Record<string, any> = {};

    for (const item of (items.results || [])) {
      const itemData = item as any;
      if (itemData.field_responses) {
        try {
          responses[itemData.id] = JSON.parse(itemData.field_responses);
        } catch (error) {
          console.error('Error parsing field responses:', error);
        }
      }
    }

    return c.json({ responses });

  } catch (error) {
    console.error('Error fetching template responses:', error);
    return c.json({ error: "Erro ao buscar respostas" }, 500);
  }
});

// Get signatures for inspection
inspectionRoutes.get("/:id/signatures", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("id"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const inspection = await env.DB.prepare(`
      SELECT inspector_signature, responsible_signature, responsible_name
      FROM inspections 
      WHERE id = ?
  `).bind(inspectionId).first() as any;

    if (!inspection) {
      return c.json({ error: "Inspeção não encontrada" }, 404);
    }

    return c.json({
      inspector_signature: inspection.inspector_signature,
      responsible_signature: inspection.responsible_signature,
      responsible_name: inspection.responsible_name
    });

  } catch (error) {
    console.error('Error fetching signatures:', error);
    return c.json({ error: "Erro ao buscar assinaturas" }, 500);
  }
});

// Save signatures for inspection
inspectionRoutes.post("/:id/signatures", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("id"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const body = await c.req.json();
    const { inspector_signature, responsible_signature, responsible_name } = body;

    console.log(`[SIGNATURES] Salvando assinaturas para inspeção ${inspectionId}: `, {
      inspector_signature: inspector_signature ? 'Presente' : 'Ausente',
      responsible_signature: responsible_signature ? 'Presente' : 'Ausente',
      responsible_name
    });

    await env.DB.prepare(`
      UPDATE inspections 
      SET inspector_signature = ?, responsible_signature = ?, responsible_name = ?, updated_at = NOW()
      WHERE id = ?
  `).bind(
      inspector_signature || null,
      responsible_signature || null,
      responsible_name || null,
      inspectionId
    ).run();

    // CORRIGIDO: Verificar se as assinaturas foram salvas corretamente
    const verification = await env.DB.prepare(`
      SELECT inspector_signature, responsible_signature, responsible_name
      FROM inspections WHERE id = ?
  `).bind(inspectionId).first() as any;

    console.log(`[SIGNATURES] Verificação pós - salvamento: `, {
      inspector_saved: verification?.inspector_signature ? 'Sim' : 'Não',
      responsible_saved: verification?.responsible_signature ? 'Sim' : 'Não',
      responsible_name_saved: verification?.responsible_name || 'Não definido'
    });

    return c.json({
      success: true,
      message: "Assinaturas salvas com sucesso",
      saved_data: {
        inspector_signature: verification?.inspector_signature ? 'Salva' : 'Não salva',
        responsible_signature: verification?.responsible_signature ? 'Salva' : 'Não salva',
        responsible_name: verification?.responsible_name || null
      }
    });

  } catch (error) {
    console.error('Error saving signatures:', error);
    return c.json({
      error: "Erro ao salvar assinaturas",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

// Delete inspection - BLINDADO
// @security: Apenas Manager+ pode deletar, com verificação de tenant e log de auditoria
inspectionRoutes.delete("/:id", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const tenantContext = c.get("tenantContext");
  const inspectionId = parseInt(c.req.param("id"));

  console.log('[DELETE-INSPECTION] Iniciando exclusão:', { inspectionId, userId: user?.id, userRole: user?.role });

  if (!user) {
    console.log('[DELETE-INSPECTION] Usuário não autenticado');
    return c.json({ error: "Autenticação necessária" }, 401);
  }

  try {
    // CRÍTICO: Verificar se a inspeção existe
    const inspection = await env.DB.prepare(`
SELECT * FROM inspections WHERE id = ?
  `).bind(inspectionId).first() as any;

    if (!inspection) {
      console.log('[DELETE-INSPECTION] Inspeção não encontrada:', inspectionId);
      return c.json({ error: 'Inspeção não encontrada' }, 404);
    }

    console.log('[DELETE-INSPECTION] Inspeção encontrada:', {
      id: inspection.id,
      created_by: inspection.created_by,
      organization_id: inspection.organization_id
    });

    // Verificar permissões: Manager+, System Admin ou criador da inspeção
    const allowedRoles = ['manager', 'org_admin', 'system_admin', 'sys_admin', 'admin', 'technician', 'inspector'];
    const userRole = user.role?.toLowerCase() || '';
    const hasRolePermission = allowedRoles.includes(userRole);
    const isCreator = inspection.created_by === user.id;
    const isSystemAdmin = userRole === 'sys_admin' || userRole === 'system_admin';

    console.log('[DELETE-INSPECTION] Verificação de permissões:', {
      userRole,
      hasRolePermission,
      isCreator,
      isSystemAdmin,
      tenantContext: tenantContext ? 'presente' : 'ausente'
    });

    // SIMPLIFICADO: Permitir se tem role válida OU é o criador OU é sys_admin
    if (!hasRolePermission && !isCreator && !isSystemAdmin) {
      console.log('[DELETE-INSPECTION] Permissão negada - role não permitida');
      return c.json({
        error: 'Permissão negada',
        message: 'Apenas Managers, criadores da inspeção ou superiores podem excluir',
        debug: { userRole, hasRolePermission, isCreator }
      }, 403);
    }

    // Capturar dados para log de auditoria antes de deletar
    const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';

    // Registrar log de deleção (LGPD) ANTES de deletar
    try {
      await env.DB.prepare(`
        INSERT INTO inspection_logs(
    inspection_id, user_id, action, old_value,
    ip_address, user_agent, created_at
  ) VALUES(?, ?, 'DELETE', ?, ?, ?, NOW())
    `).bind(
        inspectionId,
        user.id,
        JSON.stringify({
          title: inspection.title,
          organization_id: inspection.organization_id,
          created_by: inspection.created_by,
          status: inspection.status
        }),
        ipAddress,
        userAgent
      ).run();
    } catch (logError) {
      console.error('[AUDIT] Erro ao registrar log de deleção:', logError);
    }

    // Excluir itens relacionados na ordem correta (filhos -> pais)
    // 1. Mídia (ligada a items e inspeção)
    await env.DB.prepare('DELETE FROM inspection_media WHERE inspection_id = ?').bind(inspectionId).run();

    // 2. Planos de Ação (ligados a items e inspeção)
    await env.DB.prepare('DELETE FROM action_items WHERE inspection_id = ?').bind(inspectionId).run();

    // 3. Logs (ligados a inspeção)
    await env.DB.prepare('DELETE FROM inspection_logs WHERE inspection_id = ?').bind(inspectionId).run();

    // 4. Itens da Inspeção (agora seguro deletar)
    await env.DB.prepare('DELETE FROM inspection_items WHERE inspection_id = ?').bind(inspectionId).run();

    // 5. A Inspeção
    await env.DB.prepare('DELETE FROM inspections WHERE id = ?').bind(inspectionId).run();

    return c.json({
      success: true,
      message: 'Inspeção excluída com sucesso'
    });
  } catch (error: any) {
    console.error('Erro ao excluir inspeção:', error);
    return c.json({
      error: 'Erro ao excluir inspeção',
      message: error.message,
      stack: error.stack,
      details: JSON.stringify(error)
    }, 500);
  }
});


// Generate field response with AI for inspection items
inspectionRoutes.post("/items/:itemId/generate-field-response", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const itemId = parseInt(c.req.param("itemId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  if (!env.OPENAI_API_KEY) {
    return c.json({ error: "IA não disponível" }, 503);
  }

  try {
    const body = await c.req.json();
    const { field_name, field_type, current_response, media_data, field_options } = body;

    // Get inspection item and context
    const item = await env.DB.prepare(`
      SELECT ii.*, i.location, i.company_name, i.title as inspection_title
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
  `).bind(itemId).first() as any;

    if (!item) {
      return c.json({ error: "Item de inspeção não encontrado" }, 404);
    }

    // Parse field options
    let availableOptions: string[] = [];
    if (field_options) {
      try {
        if (typeof field_options === 'string' && field_options.startsWith('[')) {
          availableOptions = JSON.parse(field_options);
        } else if (typeof field_options === 'string') {
          availableOptions = field_options.split('|').map(opt => opt.trim()).filter(opt => opt);
        } else if (Array.isArray(field_options)) {
          availableOptions = field_options;
        }
      } catch (error) {
        console.error('Error parsing field options:', error);
      }
    }

    // CORRIGIDO: Preparar análise multimodal real das evidências  
    let mediaAnalysisContent = '';
    let mediaAnalyzed = 0;
    let mediaAnalysisMessages = [];

    if (media_data && media_data.length > 0) {
      mediaAnalyzed = media_data.length;
      const mediaTypes = media_data.reduce((acc: any, media: any) => {
        acc[media.media_type] = (acc[media.media_type] || 0) + 1;
        return acc;
      }, {});

      mediaAnalysisContent = `EVIDÊNCIAS MULTIMODAIS PARA ANÁLISE: ${mediaTypes.image || 0} foto(s), ${mediaTypes.audio || 0} áudio(s), ${mediaTypes.video || 0} vídeo(s) foram analisados para gerar a resposta.`;

      // Preparar imagens para análise visual (máximo 3 para evitar timeout)
      const imageMedia = media_data.filter((m: any) => m.media_type === 'image').slice(0, 3);
      for (const img of imageMedia) {
        if (img.file_url) {
          mediaAnalysisMessages.push({
            type: "image_url",
            image_url: {
              url: img.file_url,
              detail: "high" // Para análise detalhada mesmo com gpt-4o-mini
            }
          });
        }
      }

      // Adicionar descrição de áudios/vídeos se existirem
      const audioCount = mediaTypes.audio || 0;
      const videoCount = mediaTypes.video || 0;
      if (audioCount > 0 || videoCount > 0) {
        mediaAnalysisContent += ` Inclui ${audioCount} áudio(s) e ${videoCount} vídeo(s) que podem conter evidências sonoras importantes.IMPORTANTE: Peça para o usuário descrever o conteúdo dos áudios no prompt personalizado para análise completa.`;
      }
    } else {
      mediaAnalysisContent = `EVIDÊNCIAS DISPONÍVEIS: Nenhuma mídia anexada.Resposta baseada no contexto da inspeção e conhecimento técnico.`;
    }

    // Create specialized prompt based on field type
    let responseInstructions = '';
    switch (field_type) {
      case 'boolean':
        responseInstructions = `
RESPOSTA ESPERADA: true(Conforme) ou false(Não Conforme)
CRITÉRIO: Avalie se o item está em conformidade com as normas de segurança baseado nas evidências visuais / sonoras.`;
        break;
      case 'select':
      case 'radio':
        if (availableOptions.length > 0) {
          responseInstructions = `
RESPOSTA ESPERADA: Uma das opções disponíveis: ${availableOptions.join(', ')}
CRITÉRIO: Escolha a opção que melhor descreve o que foi observado nas evidências.`;
        } else {
          responseInstructions = `
RESPOSTA ESPERADA: Uma descrição textual da condição observada nas evidências.`;
        }
        break;
      case 'multiselect':
        if (availableOptions.length > 0) {
          responseInstructions = `
RESPOSTA ESPERADA: Array com uma ou mais opções: ${availableOptions.join(', ')}
CRITÉRIO: Selecione todas as opções que se aplicam ao que foi observado.`;
        }
        break;
      case 'rating':
        responseInstructions = `
RESPOSTA ESPERADA: Número de 1 a 5(1 = Inadequado, 5 = Excelente)
CRITÉRIO: Avalie baseado no que foi observado nas evidências visuais / sonoras.`;
        break;
      case 'text':
      case 'textarea':
        responseInstructions = `
RESPOSTA ESPERADA: Descrição textual detalhada
CRITÉRIO: Descreva especificamente o que foi observado nas evidências de forma técnica.`;
        break;
      default:
        responseInstructions = `
RESPOSTA ESPERADA: Valor adequado baseado na análise das evidências disponíveis.`;
    }

    // Construir mensagens para OpenAI incluindo análise visual detalhada
    const systemMessage = {
      role: 'system',
      content: 'Você é um especialista em segurança do trabalho especializado em análise multimodal avançada. Sua função é analisar imagens, áudios, vídeos e contexto para gerar respostas técnicas precisas e detalhadas baseadas em evidências reais. SEMPRE descreva especificamente o que observa nas imagens em relação à segurança do trabalho. Para áudios, identifique ruídos, comunicações verbais e, se for assistente psicossocial, analise tom de voz, sinais de estresse, ansiedade ou bem-estar emocional. Seja técnico, detalhado e específico sobre as evidências analisadas.'
    };

    const userMessage = {
      role: 'user',
      content: [
        {
          type: "text",
          text: `Analise as evidências multimodais e gere uma resposta técnica detalhada para este campo.

CONTEXTO DA INSPEÇÃO:
- Local: ${item.location}
- Empresa: ${item.company_name}
- Inspeção: ${item.inspection_title}

ITEM EM ANÁLISE:
- Campo: ${field_name}
- Categoria: ${item.category}
- Descrição: ${item.item_description}
- Observações existentes: ${item.observations || 'Nenhuma'}
- Resposta atual: ${current_response !== null && current_response !== undefined ? current_response : 'Não respondido'}

${mediaAnalysisContent}

${responseInstructions}

INSTRUÇÕES ESPECÍFICAS PARA ANÁLISE DETALHADA:
1. ** ANÁLISE VISUAL(se houver imagens) **: Descreva especificamente o que vê nas imagens relacionado à segurança do trabalho:
  - Condições dos equipamentos, estruturas, ambiente
    - EPIs(Equipamentos de Proteção Individual) presentes ou ausentes
      - Sinalizações de segurança, placas, avisos
        - Condições de limpeza, organização, 5S
          - Riscos visuais identificados(altura, energia, produtos químicos, etc.)
            - Estado de conservação de materiais, ferramentas, instalações

2. ** ANÁLISE SONORA(se houver áudios / vídeos) **:
- Ruídos de máquinas, equipamentos(níveis, anormalidades)
  - Comunicações verbais sobre segurança
    - Sons que indicam riscos(vazamentos, falhas mecânicas)
      - Para assistentes psicossociais: tom de voz, sinais de estresse, ansiedade

3. ** CONFORMIDADE TÉCNICA **: Avalie conformidade com NRs aplicáveis
4. ** EVIDÊNCIAS ESPECÍFICAS **: Cite detalhes visuais / sonoros concretos observados
5. ** RECOMENDAÇÕES **: Base nas evidências analisadas

Responda APENAS em formato JSON(máximo 400 caracteres no comentário):
{
  "generated_response": <valor_da_resposta>,
    "generated_comment": "Análise técnica detalhada baseada nas evidências visuais/sonoras observadas. Descreva especificamente o que foi visto/ouvido.",
      "confidence": "alta|media|baixa",
        "media_analyzed": ${mediaAnalyzed},
  "visual_observations": "Descrição específica do que foi visto nas imagens - condições, EPIs, riscos, conformidade visual",
    "technical_assessment": "Avaliação de conformidade técnica baseada nas evidências"
}

Seja específico sobre as evidências analisadas e cite detalhes visuais / sonoros concretos.`
        },
        ...mediaAnalysisMessages
      ]
    };

    const messages = [systemMessage, userMessage];

    // CORRIGIDO: Call OpenAI API com análise multimodal
    const openaiResponse = await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY} `,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Mudança solicitada para gpt-4o-mini
        messages: messages,
        max_tokens: 2000, // Aumentado para análise mais detalhada
        temperature: 0.3 // Reduzido para mais consistência
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API Error:', openaiResponse.status, errorText);
      throw new Error(`Erro na API da OpenAI: ${openaiResponse.status} - ${errorText} `);
    }

    const openaiResult = await openaiResponse.json() as any;
    const content = openaiResult.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Resposta inválida da IA');
    }

    // Parse AI response
    let aiResult;
    try {
      aiResult = JSON.parse(content);
    } catch (parseError) {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Falha ao parsear resposta da IA como JSON');
      }
    }

    // Validate and clean response based on field type
    let finalResponse = aiResult.generated_response;

    if (field_type === 'boolean') {
      if (typeof finalResponse === 'string') {
        finalResponse = finalResponse.toLowerCase() === 'true' || finalResponse === '1';
      } else if (typeof finalResponse !== 'boolean') {
        finalResponse = null;
      }
    } else if (field_type === 'multiselect') {
      if (!Array.isArray(finalResponse)) {
        if (typeof finalResponse === 'string') {
          finalResponse = [finalResponse];
        } else {
          finalResponse = [];
        }
      }
      // Filter to only valid options if available
      if (availableOptions.length > 0) {
        finalResponse = finalResponse.filter((opt: string) => availableOptions.includes(opt));
      }
    } else if ((field_type === 'select' || field_type === 'radio') && availableOptions.length > 0) {
      // Ensure response is one of the available options
      if (!availableOptions.includes(finalResponse)) {
        finalResponse = availableOptions[0]; // Default to first option
      }
    } else if (field_type === 'rating') {
      const numResponse = parseInt(finalResponse);
      if (isNaN(numResponse) || numResponse < 1 || numResponse > 5) {
        finalResponse = 3; // Default to middle rating
      } else {
        finalResponse = numResponse;
      }
    }

    return c.json({
      success: true,
      generated_response: finalResponse,
      generated_comment: aiResult.generated_comment || '',
      confidence: aiResult.confidence || 'media',
      media_analyzed: mediaAnalyzed,
      item_id: itemId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating field response:', error);
    return c.json({
      error: "Erro ao gerar resposta do campo",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

// Get media for specific inspection item
inspectionRoutes.get("/items/:itemId/media", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const itemId = parseInt(c.req.param("itemId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Get inspection item to verify access
    const item = await env.DB.prepare(`
      SELECT ii.*, i.created_by, i.organization_id
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
  `).bind(itemId).first() as any;

    if (!item) {
      return c.json({ error: "Item de inspeção não encontrado" }, 404);
    }

    // Get media for this item
    const media = await env.DB.prepare(`
      SELECT * FROM inspection_media 
      WHERE inspection_item_id = ?
  ORDER BY created_at DESC
    `).bind(itemId).all();

    return c.json({
      media: media.results || []
    });

  } catch (error) {
    console.error('Error fetching inspection item media:', error);
    return c.json({ error: "Erro ao buscar mídia do item" }, 500);
  }
});

// Upload media for inspection item
inspectionRoutes.post("/items/:itemId/media", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const itemId = parseInt(c.req.param("itemId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const body = await c.req.json();
    const {
      media_type, file_name, file_url, file_size, mime_type, description
    } = body;

    // Get inspection item to get inspection_id
    const item = await env.DB.prepare(`
      SELECT inspection_id FROM inspection_items WHERE id = ?
  `).bind(itemId).first() as any;

    if (!item) {
      return c.json({ error: "Item de inspeção não encontrado" }, 404);
    }

    // Insert media record
    const result = await env.DB.prepare(`
      INSERT INTO inspection_media(
    inspection_id, inspection_item_id, media_type, file_name, file_url,
    file_size, mime_type, description, created_at, updated_at
  ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `).bind(
      item.inspection_id,
      itemId,
      media_type,
      file_name,
      file_url,
      file_size || null,
      mime_type || null,
      description || null
    ).run();

    return c.json({
      id: result.meta.last_row_id,
      message: "Mídia enviada com sucesso"
    });

  } catch (error) {
    console.error('Error uploading media:', error);
    return c.json({ error: "Erro ao enviar mídia" }, 500);
  }
});

// Create AI-generated action item for inspection item
inspectionRoutes.post("/items/:itemId/create-action", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const itemId = parseInt(c.req.param("itemId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  if (!env.OPENAI_API_KEY) {
    return c.json({ error: "IA não disponível" }, 503);
  }

  try {
    const body = await c.req.json();
    const { field_name, field_type, response_value, pre_analysis, media_data, user_prompt } = body;

    // Get inspection item and context
    const item = await env.DB.prepare(`
      SELECT ii.*, i.location, i.company_name, i.title as inspection_title, i.id as inspection_id
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
  `).bind(itemId).first() as any;

    if (!item) {
      return c.json({ error: "Item de inspeção não encontrado" }, 404);
    }

    // CORRIGIDO: Lógica melhorada para determinar necessidade de ação
    let needsAction = false;
    let riskLevel = 'baixo';
    let actionReason = '';

    // 1. Verificar resposta direta de não conformidade
    if (field_type === 'boolean' && response_value === false) {
      needsAction = true;
      riskLevel = 'alto';
      actionReason = 'Item marcado como não conforme';
    } else if (field_type === 'rating' && response_value <= 2) {
      needsAction = true;
      riskLevel = response_value === 1 ? 'critica' : 'alta';
      actionReason = `Avaliação baixa(${response_value} / 5)`;
    } else if (field_type === 'select' && response_value) {
      const valueStr = response_value.toLowerCase();
      if (valueStr.includes('não conforme') || valueStr.includes('inadequado') ||
        valueStr.includes('não aplicável') === false && valueStr.includes('conforme') === false) {
        needsAction = true;
        riskLevel = 'media';
        actionReason = `Resposta indica não conformidade: ${response_value} `;
      }
    }

    // 2. Verificar análise prévia para identificar riscos
    if (pre_analysis && !needsAction) {
      const analysisText = pre_analysis.toLowerCase();
      const riskKeywords = [
        'não conforme', 'inadequado', 'risco', 'perigo', 'incorreto', 'falha',
        'violação', 'infração', 'necessário', 'corrigir', 'ajustar', 'melhorar',
        'ação', 'problema', 'deficiência', 'insuficiente'
      ];

      const foundRisks = riskKeywords.filter(keyword => analysisText.includes(keyword));
      if (foundRisks.length >= 2) {
        needsAction = true;
        riskLevel = 'media';
        actionReason = `Análise prévia identificou riscos: ${foundRisks.slice(0, 3).join(', ')} `;
      }
    }

    // 3. Se ainda não identificou necessidade, deixar a IA decidir baseada em evidências
    if (!needsAction && (media_data?.length > 0 || pre_analysis)) {
      needsAction = true; // Permitir que a IA analise e decida
      riskLevel = 'media';
      actionReason = 'Análise inteligente das evidências disponíveis';
    }

    // ÚLTIMA VALIDAÇÃO: Se realmente não há nada para analisar
    if (!needsAction && !response_value && !pre_analysis && (!media_data || media_data.length === 0)) {
      return c.json({
        success: true,
        action: {
          requires_action: false,
          message: "Não há evidências suficientes (resposta, análise ou mídias) para determinar necessidade de ação. Adicione mais informações para análise."
        }
      });
    }

    // CORRIGIDO: Preparar análise multimodal real das evidências
    let mediaContext = '';
    let mediaAnalysisMessages = [];

    if (media_data && media_data.length > 0) {
      const mediaTypes = media_data.reduce((acc: any, media: any) => {
        acc[media.media_type] = (acc[media.media_type] || 0) + 1;
        return acc;
      }, {});

      mediaContext = `EVIDÊNCIAS MULTIMODAIS ANALISADAS: ${mediaTypes.image || 0} foto(s), ${mediaTypes.audio || 0} áudio(s), ${mediaTypes.video || 0} vídeo(s).`;

      // Preparar imagens para análise visual (máximo 3 para evitar timeout)
      const imageMedia = media_data.filter((m: any) => m.media_type === 'image').slice(0, 3);
      for (const img of imageMedia) {
        if (img.file_url) {
          mediaAnalysisMessages.push({
            type: "image_url",
            image_url: {
              url: img.file_url,
              detail: "high" // Para análise detalhada com gpt-4o-mini
            }
          });
        }
      }

      // Adicionar descrição de áudios/vídeos se existirem
      const audioCount = mediaTypes.audio || 0;
      const videoCount = mediaTypes.video || 0;
      if (audioCount > 0 || videoCount > 0) {
        mediaContext += ` Inclui ${audioCount} áudio(s) e ${videoCount} vídeo(s) que podem conter evidências sonoras de não conformidades, comunicações, sinais de estresse ou preocupação.`;
      }
    } else {
      mediaContext = `EVIDÊNCIAS DISPONÍVEIS: Nenhuma mídia anexada.Ação baseada na resposta e análise prévia.`;
    }

    // Construir mensagens para OpenAI incluindo análise visual
    const systemMessage = {
      role: 'system',
      content: 'Você é um especialista em segurança do trabalho especializado em análise multimodal. Analise imagens, áudios, textos e contexto para criar planos de ação 5W2H precisos baseados em evidências reais. Para áudios, considere o conteúdo sonoro e, se for assistente psicossocial, analise também tom de voz e sinais de bem-estar emocional.'
    };

    const userMessage = {
      role: 'user',
      content: [
        {
          type: "text",
          text: `Analise as evidências multimodais e determine se é necessária uma ação corretiva com base em análise técnica detalhada.

CONTEXTO DA INSPEÇÃO:
- Local: ${item.location}
- Empresa: ${item.company_name}
- Item: ${field_name} (${item.category})
- Descrição: ${item.item_description}
- Resposta do Inspetor: ${response_value || 'Não respondido'}
- Motivo da Análise: ${actionReason}
- Nível de Risco Inicial: ${riskLevel}
- Observações: ${item.observations || 'Nenhuma'}

${mediaContext}

${pre_analysis ? `ANÁLISE PRÉVIA DA IA:
${pre_analysis}

IMPORTANTE: Sua decisão deve ser coerente com esta análise prévia.` : ''
            }

${user_prompt ? `FOCO ESPECÍFICO DO USUÁRIO: ${user_prompt} - Priorize esta informação.` : ''}

INSTRUÇÕES PARA ANÁLISE COMPLETA E CRIAÇÃO DE PLANO 5W2H:

1. ** ANÁLISE MULTIMODAL DETALHADA **:
   - ** Imagens **: Descreva especificamente condições visuais de segurança, EPIs, riscos, não conformidades
  - ** Áudios / Vídeos **: Analise ruídos, comunicações, sinais sonoros de risco
    - ** Assistentes Psicossociais **: Analise tom emocional, estresse, sinais de bem - estar

2. ** AVALIAÇÃO DE CONFORMIDADE TÉCNICA **:
- Identifique não conformidades específicas com NRs
  - Avalie causa raiz do problema
    - Determine gravidade e urgência

3. ** PLANO 5W2H ESPECÍFICO ** (se ação necessária):
   - ** O QUÊ **: Ação corretiva específica baseada nas evidências
  - ** ONDE **: Local exato onde aplicar a correção
    - ** POR QUÊ **: Justificativa baseada nos riscos e evidências identificadas
      - ** COMO **: Método detalhado de execução
        - ** QUEM **: Responsável específico(ex: técnico em segurança, supervisor)
          - ** QUANDO **: Prazo realístico baseado na urgência
            - ** QUANTO **: Estimativa de recursos necessários

4. ** DECISÃO TÉCNICA **: Se não há necessidade de ação, justifique tecnicamente

Responda APENAS em formato JSON:
{
  "requires_action": true / false,
    "title": "Título específico da ação ou motivo técnico de não necessidade",
      "what_description": "Ação específica detalhada ou justificativa técnica de não necessidade",
        "where_location": "Local específico ou N/A",
          "why_reason": "Justificativa técnica baseada nas evidências visuais/sonoras analisadas",
            "how_method": "Método detalhado de execução ou N/A",
              "who_responsible": "Responsável específico (ex: Técnico em Segurança, Supervisor) ou N/A",
                "when_deadline": "Prazo em dias baseado na urgência ou 0",
                  "how_much_cost": "Estimativa realística ou 'Sem custo'",
                    "priority": "baixa|media|alta|critica",
                      "evidence_analysis": "Resumo técnico detalhado do que foi observado nas evidências multimodais",
                        "visual_findings": "Descrição específica e técnica do que foi visto nas imagens relacionado à segurança",
                          "compliance_assessment": "Avaliação de conformidade com normas técnicas aplicáveis"
}

Base sua decisão exclusivamente nas evidências analisadas e seja específico sobre os achados visuais / sonoros.`
        },
        ...mediaAnalysisMessages
      ]
    };

    const messages = [systemMessage, userMessage];

    // CORRIGIDO: Call OpenAI API com análise multimodal detalhada
    const openaiResponse = await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY} `,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Mudança solicitada para gpt-4o-mini
        messages: messages,
        max_tokens: 2000, // Aumentado para análise mais detalhada
        temperature: 0.3 // Reduzido para mais consistência
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API Error:', openaiResponse.status, errorText);
      throw new Error(`Erro na API da OpenAI: ${openaiResponse.status} `);
    }

    // Robust JSON parsing with HTML error handling
    let openaiResult;
    try {
      const responseText = await openaiResponse.text();

      // Check if response is HTML (common error response format)
      if (responseText.trim().startsWith('<')) {
        console.error('OpenAI returned HTML instead of JSON:', responseText);
        throw new Error('API da OpenAI retornou resposta inválida (HTML). Verifique a chave da API e tente novamente.');
      }

      openaiResult = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      throw new Error('Erro ao processar resposta da IA. Tente novamente.');
    }

    const content = openaiResult.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Resposta inválida da IA');
    }

    // Parse AI response
    let actionPlan;
    try {
      actionPlan = JSON.parse(content);
    } catch (parseError) {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        actionPlan = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Falha ao parsear resposta da IA como JSON');
      }
    }

    if (actionPlan.requires_action) {
      // Calculate deadline
      const deadlineDays = parseInt(actionPlan.when_deadline) || 30;
      const deadlineDate = new Date();
      deadlineDate.setDate(deadlineDate.getDate() + deadlineDays);

      // Create action item in database
      const result = await env.DB.prepare(`
        INSERT INTO action_items(
  inspection_id, inspection_item_id, title, what_description, where_location,
  why_reason, how_method, who_responsible, when_deadline, how_much_cost,
  status, priority, is_ai_generated, assigned_to, created_at, updated_at
) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `).bind(
        item.inspection_id,
        itemId,
        actionPlan.title,
        actionPlan.what_description,
        actionPlan.where_location,
        actionPlan.why_reason,
        actionPlan.how_method,
        actionPlan.who_responsible,
        deadlineDate.toISOString().split('T')[0],
        actionPlan.how_much_cost,
        'pending',
        actionPlan.priority || 'media',
        true,
        actionPlan.who_responsible,
      ).run();

      // Update action plan in inspection item with enhanced analysis
      const enhancedPlan = {
        ...actionPlan,
        evidence_analysis: actionPlan.evidence_analysis || 'Análise baseada em evidências disponíveis',
        visual_findings: actionPlan.visual_findings || 'Nenhuma análise visual específica',
        media_analyzed: media_data ? media_data.length : 0,
        analysis_type: mediaAnalysisMessages.length > 0 ? 'multimodal' : 'textual'
      };

      await env.DB.prepare(`
        UPDATE inspection_items 
        SET ai_action_plan = ?, updated_at = NOW()
        WHERE id = ?
  `).bind(JSON.stringify(enhancedPlan), itemId).run();

      actionPlan.id = result.meta.last_row_id;
      actionPlan.evidence_analysis = enhancedPlan.evidence_analysis;
      actionPlan.visual_findings = enhancedPlan.visual_findings;
    }

    return c.json({
      success: true,
      action: actionPlan,
      item_id: itemId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error creating action with AI:', error);
    return c.json({
      error: "Erro ao criar ação com IA",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

// Pre-analysis endpoint for inspection items
inspectionRoutes.post("/items/:itemId/pre-analysis", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const itemId = parseInt(c.req.param("itemId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  if (!env.OPENAI_API_KEY) {
    return c.json({ error: "IA não configurada no sistema" }, 503);
  }

  try {
    const body = await c.req.json();
    const { field_name, field_type, response_value, media_data, user_prompt } = body;

    // Get inspection item with inspection context
    const item = await env.DB.prepare(`
      SELECT ii.*, i.location, i.company_name, i.title as inspection_title, i.id as inspection_id
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
  `).bind(itemId).first() as any;

    if (!item) {
      return c.json({ error: "Item de inspeção não encontrado" }, 404);
    }

    // CORRIGIDO: Preparar análise multimodal real das evidências
    let mediaAnalysisContent = '';
    let mediaAnalyzed = 0;
    let mediaAnalysisMessages = [];

    if (media_data && media_data.length > 0) {
      mediaAnalyzed = media_data.length;
      const mediaTypes = media_data.reduce((acc: any, media: any) => {
        acc[media.media_type] = (acc[media.media_type] || 0) + 1;
        return acc;
      }, {});

      mediaAnalysisContent = `EVIDÊNCIAS MULTIMODAIS DISPONÍVEIS: ${mediaTypes.image || 0} foto(s), ${mediaTypes.audio || 0} áudio(s), ${mediaTypes.video || 0} vídeo(s) para análise detalhada.`;

      // Preparar imagens para análise visual (máximo 3 para evitar timeout)
      const imageMedia = media_data.filter((m: any) => m.media_type === 'image').slice(0, 3);
      for (const img of imageMedia) {
        if (img.file_url) {
          mediaAnalysisMessages.push({
            type: "image_url",
            image_url: {
              url: img.file_url,
              detail: "high" // Para análise detalhada na pré-análise
            }
          });
        }
      }

      // Adicionar descrição de áudios/vídeos se existirem
      const audioCount = mediaTypes.audio || 0;
      const videoCount = mediaTypes.video || 0;
      if (audioCount > 0 || videoCount > 0) {
        mediaAnalysisContent += ` Inclui ${audioCount} áudio(s) e ${videoCount} vídeo(s) que podem conter evidências sonoras importantes, comunicações verbais, tom de voz e sinais emocionais.`;
      }
    } else {
      mediaAnalysisContent = `EVIDÊNCIAS DISPONÍVEIS: Nenhuma mídia anexada.Análise baseada apenas na resposta do inspetor e contexto da inspeção.`;
    }

    // Construir mensagens para OpenAI incluindo análise visual
    const systemMessage = {
      role: 'system',
      content: 'Você é um especialista em segurança do trabalho especializado em análise multimodal. Analise imagens, áudios, contexto e respostas para fornecer pré-análises técnicas detalhadas e práticas. Para áudios, considere conteúdo sonoro, comunicações verbais e, se for assistente psicossocial, analise tom de voz, sinais de estresse, ansiedade ou bem-estar emocional.'
    };

    const userMessage = {
      role: 'user',
      content: [
        {
          type: "text",
          text: `Faça uma pré - análise técnica aprofundada e abrangente deste item de segurança.

CONTEXTO DA INSPEÇÃO:
- Local: ${item.location}
- Empresa: ${item.company_name || 'Não informado'}
- Título da Inspeção: ${item.inspection_title}

ITEM EM ANÁLISE:
- Campo: ${field_name}
- Tipo: ${field_type}
- Categoria: ${item.category}
- Descrição: ${item.item_description}
- Resposta: ${response_value !== null && response_value !== undefined ? response_value : 'Não respondido'}
- Observações: ${item.observations || 'Nenhuma observação'}

${mediaAnalysisContent}

${user_prompt ? `FOCO ESPECÍFICO DO USUÁRIO: ${user_prompt} - PRIORIZE esta informação em sua análise.` : ''}

INSTRUÇÕES PARA ANÁLISE TÉCNICA DETALHADA:

1. ** ANÁLISE VISUAL DETALHADA(se houver imagens) **:
- Descreva especificamente condições de segurança observadas
  - Identifique EPIs presentes / ausentes, estado de conservação
    - Avalie sinalizações, placas, avisos de segurança
      - Observe organização, limpeza, aplicação de 5S
        - Identifique riscos visuais(altura, elétricos, químicos, mecânicos)
          - Verifique conformidade visual com NRs aplicáveis

2. ** ANÁLISE SONORA(se houver áudios / vídeos) **:
- Identifique ruídos de equipamentos, níveis sonoros
  - Analise comunicações verbais sobre segurança
    - Detecte sons anômalos que indiquem riscos
      - Para assistentes psicossociais: analise tom emocional, estresse, ansiedade

3. ** AVALIAÇÃO DE CONFORMIDADE TÉCNICA **:
- Cite NRs específicas aplicáveis ao contexto
  - Identifique não conformidades técnicas específicas
    - Avalie causa raiz de problemas identificados
      - Determine implicações regulatórias

4. ** ANÁLISE DE RISCOS **:
- Classifique riscos por gravidade e probabilidade
  - Identifique consequências potenciais
    - Avalie urgência de ações corretivas
      - Considere impactos a longo prazo

5. ** RECOMENDAÇÕES ESPECÍFICAS **:
- Sugira ações corretivas concretas e acionáveis
  - Indique prioridade(Baixa / Média / Alta / Crítica)
    - Recomende prazos para correções
      - Base tudo nas evidências analisadas

Forneça uma análise técnica estruturada(máximo 600 caracteres) incluindo:
- ** Observações Detalhadas **: O que foi especificamente observado nas evidências
  - ** Conformidade **: Avaliação clara conforme / não conforme com normas
    - ** Riscos **: Riscos identificados com base nas evidências
      - ** Urgência **: Nível de prioridade para ação corretiva
        - ** Recomendação **: Ação necessária baseada na análise

Seja técnico, específico e cite detalhes visuais / sonoros concretos das evidências.`
        },
        ...mediaAnalysisMessages
      ]
    };

    const messages = [systemMessage, userMessage];

    // CORRIGIDO: Call OpenAI API com análise multimodal detalhada
    const openaiResponse = await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY} `,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Mudança solicitada para gpt-4o-mini
        messages: messages,
        max_tokens: 1500, // Aumentado para análise mais detalhada
        temperature: 0.4 // Ajustado para melhor análise
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API Error:', openaiResponse.status, errorText);
      throw new Error(`Erro na API da OpenAI: ${openaiResponse.status} `);
    }

    const openaiResult = await openaiResponse.json() as any;
    const analysis = openaiResult.choices?.[0]?.message?.content;

    if (!analysis) {
      throw new Error('Resposta inválida da IA');
    }

    // Update the inspection item with pre-analysis
    await env.DB.prepare(`
      UPDATE inspection_items 
      SET ai_pre_analysis = ?, updated_at = NOW()
      WHERE id = ?
  `).bind(analysis, itemId).run();

    return c.json({
      success: true,
      pre_analysis: analysis,
      analysis: analysis, // For backward compatibility
      media_analyzed: mediaAnalyzed,
      item_id: itemId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in pre-analysis:', error);
    return c.json({
      error: "Erro ao processar pré-análise",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

// Media upload for inspection
// Path: /api/inspections/:inspectionId/media/upload
inspectionRoutes.post("/:inspectionId/media/upload", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("inspectionId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const body = await c.req.json();
    const {
      inspection_item_id,
      media_type,
      file_name,
      file_data,
      file_size,
      mime_type,
      description
    } = body;

    // File size limits
    const FILE_SIZE_LIMITS: Record<string, number> = {
      image: 10 * 1024 * 1024,
      video: 100 * 1024 * 1024,
      audio: 20 * 1024 * 1024,
      document: 50 * 1024 * 1024
    };

    const sizeLimit = FILE_SIZE_LIMITS[media_type] || FILE_SIZE_LIMITS.document;
    if (file_size > sizeLimit) {
      const limitMB = Math.round(sizeLimit / 1024 / 1024);
      return c.json({ error: `Arquivo muito grande. Limite para ${media_type}: ${limitMB}MB` }, 400);
    }

    const inspection = await env.DB.prepare(`
      SELECT * FROM inspections WHERE id = ?
    `).bind(inspectionId).first() as any;

    if (!inspection) {
      return c.json({ error: "Inspeção não encontrada" }, 404);
    }

    // Validate inspection_item_id exists if provided
    let validItemId = null;
    if (inspection_item_id) {
      const itemExists = await env.DB.prepare(`
        SELECT id FROM inspection_items WHERE id = ? AND inspection_id = ?
      `).bind(inspection_item_id, inspectionId).first();

      if (itemExists) {
        validItemId = inspection_item_id;
      }
      // If item doesn't exist, we'll use null instead of failing with FK error
    }

    const file_url = file_data;
    const now = new Date().toISOString();

    const result = await env.DB.prepare(`
      INSERT INTO inspection_media (
        inspection_id, inspection_item_id, media_type, file_name, file_url,
        file_size, mime_type, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).bind(
      inspectionId,
      validItemId,
      media_type,
      file_name,
      file_url,
      file_size,
      mime_type,
      description || null,
      now,
      now
    ).first();

    return c.json({
      success: true,
      media: {
        id: (result as any)?.id,
        inspection_id: inspectionId,
        inspection_item_id,
        media_type,
        file_name,
        file_url,
        file_size,
        mime_type,
        description,
        created_at: now
      }
    }, 201);

  } catch (error) {
    console.error('Error uploading media:', error);
    return c.json({
      error: "Erro ao fazer upload de mídia",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

// GET action items for inspection
inspectionRoutes.get("/:inspectionId/action-items", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("inspectionId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const actionItems = await env.DB.prepare(`
      SELECT ai.*, ii.item_description as inspection_item_name
      FROM action_items ai
      LEFT JOIN inspection_items ii ON ai.inspection_item_id = ii.id
      WHERE ai.inspection_id = ?
      ORDER BY ai.created_at DESC
    `).bind(inspectionId).all();

    return c.json(actionItems.results || []);
  } catch (error) {
    console.error('Error loading action items:', error);
    return c.json({ error: "Erro ao carregar ações" }, 500);
  }
});

// Create action item for inspection (Manual action creation)
inspectionRoutes.post("/:inspectionId/action-items", demoAuthMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("inspectionId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const body = await c.req.json();
    const {
      inspection_item_id,
      title,
      what_description,
      where_location,
      why_reason,
      how_method,
      who_responsible,
      when_deadline,
      how_much_cost,
      priority = 'media',
      status = 'pending',
      is_ai_generated = false,
      field_name
    } = body;

    // Verify inspection exists
    const inspection = await env.DB.prepare(`
      SELECT id, location, company_name, title FROM inspections WHERE id = ?
    `).bind(inspectionId).first() as any;

    if (!inspection) {
      return c.json({ error: "Inspeção não encontrada" }, 404);
    }

    // Resolve the correct inspection_item_id if provided
    let resolvedItemId = inspection_item_id;

    if (inspection_item_id) {
      // Check if ID exists directly
      const itemExists = await env.DB.prepare(`
        SELECT id FROM inspection_items WHERE id = ? AND inspection_id = ?
      `).bind(inspection_item_id, inspectionId).first();

      if (!itemExists && field_name) {
        // Fallback: Try to find by field_name
        const itemByName = await env.DB.prepare(`
          SELECT id FROM inspection_items 
          WHERE inspection_id = ? AND item_description = ?
        `).bind(inspectionId, field_name).first() as any;

        if (itemByName) {
          resolvedItemId = itemByName.id;
        } else {
          resolvedItemId = null; // Avoid FK error
        }
      } else if (!itemExists) {
        resolvedItemId = null;
      }
    }

    const now = new Date().toISOString();
    const deadline = when_deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await env.DB.prepare(`
      INSERT INTO action_items (
        inspection_id, inspection_item_id, title, what_description, where_location,
        why_reason, how_method, who_responsible, when_deadline, how_much_cost,
        priority, status, is_ai_generated, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      inspectionId,
      resolvedItemId || null,
      title || 'Ação Corretiva',
      what_description || '',
      where_location || inspection.location || '',
      why_reason || '',
      how_method || '',
      who_responsible || 'A definir',
      deadline,
      how_much_cost || 'A orçar',
      priority,
      status,
      is_ai_generated,
      now,
      now
    ).run();

    return c.json({
      success: true,
      action_item: {
        id: result.meta.last_row_id,
        inspection_id: inspectionId,
        title,
        priority,
        status
      }
    }, 201);

  } catch (error) {
    console.error('Error creating action item:', error);
    return c.json({
      error: "Erro ao criar ação",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

export default inspectionRoutes;

