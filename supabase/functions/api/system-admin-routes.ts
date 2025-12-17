import { Hono } from "hono";
import { demoAuthMiddleware as authMiddleware } from "./demo-auth-middleware.ts";
import { USER_ROLES } from "./user-types.ts";
import { requireProtectedSysAdmin } from "./rbac-middleware.ts";
import { autoFixSystemAdmin } from "./system-admin-protection.ts";

type Env = {
  DB: any;
};

const systemAdminRoutes = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Endpoint para garantir que o usuário eng.tiagosm@gmail.com seja sempre system_admin
systemAdminRoutes.post("/ensure-protected-sysadmin", authMiddleware, requireProtectedSysAdmin(), async (c) => {
  const env = c.env;
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Garantir que o usuário protegido sempre tenha o role correto
    await env.DB.prepare(`
      UPDATE users 
      SET role = ?, can_manage_users = ?, can_create_organizations = ?, updated_at = NOW()
      WHERE email = ? OR id = ?
    `).bind(
      USER_ROLES.SYSTEM_ADMIN,
      true,
      true,
      'eng.tiagosm@gmail.com',
      '84edf8d1-77d9-4c73-935e-d76745bc3707'
    ).run();

    // Log da operação de segurança
    await env.DB.prepare(`
      INSERT INTO activity_log (user_id, action_type, action_description, target_type, target_id, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `).bind(
      user.id,
      'system_security_check',
      'Verificação e garantia de privilégios de administrador principal do sistema',
      'user',
      '84edf8d1-77d9-4c73-935e-d76745bc3707'
    ).run();

    return c.json({
      success: true,
      message: "Privilégios de administrador principal verificados e garantidos",
      protected_user: true
    });

  } catch (error) {
    console.error('Error ensuring protected sysadmin:', error);
    return c.json({ error: "Erro ao verificar privilégios do sistema" }, 500);
  }
});

// Endpoint para listar tentativas de modificação bloqueadas (auditoria)
systemAdminRoutes.get("/security-log", authMiddleware, requireProtectedSysAdmin(), async (c) => {
  const env = c.env;
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Buscar logs relacionados a tentativas de modificação de segurança
    const securityLogs = await env.DB.prepare(`
      SELECT * FROM activity_log 
      WHERE action_type IN ('system_security_check', 'user_update_blocked', 'user_delete_blocked')
         OR action_description LIKE '%eng.tiagosm@gmail.com%'
         OR target_id = '84edf8d1-77d9-4c73-935e-d76745bc3707'
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

    return c.json({
      security_logs: securityLogs.results || [],
      protected_user_id: '84edf8d1-77d9-4c73-935e-d76745bc3707',
      protected_user_email: 'eng.tiagosm@gmail.com'
    });

  } catch (error) {
    console.error('Error fetching security logs:', error);
    return c.json({ error: "Erro ao buscar logs de segurança" }, 500);
  }
});

// Endpoint para verificar status de proteção do sistema
systemAdminRoutes.get("/protection-status", authMiddleware, requireProtectedSysAdmin(), async (c) => {
  const env = c.env;
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Verificar o status atual do usuário protegido
    const protectedUser = await env.DB.prepare(`
      SELECT id, email, name, role, can_manage_users, can_create_organizations, is_active, created_at, updated_at
      FROM users 
      WHERE email = ? OR id = ?
    `).bind('eng.tiagosm@gmail.com', '84edf8d1-77d9-4c73-935e-d76745bc3707').first() as any;

    if (!protectedUser) {
      return c.json({
        error: "ALERTA DE SEGURANÇA: Usuário protegido não encontrado no sistema!",
        critical: true
      }, 404);
    }

    // Verificar se as configurações estão corretas
    const isCorrectlyConfigured =
      protectedUser.role === USER_ROLES.SYSTEM_ADMIN &&
      protectedUser.can_manage_users === true &&
      protectedUser.can_create_organizations === true &&
      protectedUser.is_active === true;

    // Contar outros system_admins
    const otherSystemAdmins = await env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE role = ? AND email != ? AND id != ?
    `).bind(USER_ROLES.SYSTEM_ADMIN, 'eng.tiagosm@gmail.com', '84edf8d1-77d9-4c73-935e-d76745bc3707').first() as any;

    return c.json({
      protection_status: {
        protected_user_found: true,
        correctly_configured: isCorrectlyConfigured,
        current_role: protectedUser.role,
        can_manage_users: protectedUser.can_manage_users,
        can_create_organizations: protectedUser.can_create_organizations,
        is_active: protectedUser.is_active,
        last_updated: protectedUser.updated_at
      },
      system_status: {
        other_system_admins_count: otherSystemAdmins?.count || 0,
        protection_middleware_active: true,
        protected_email: 'eng.tiagosm@gmail.com',
        protected_id: '84edf8d1-77d9-4c73-935e-d76745bc3707'
      },
      security_measures: {
        role_modification_blocked: true,
        user_deletion_blocked: true,
        email_change_blocked: true,
        permission_change_blocked: true,
        api_access_restricted: true
      }
    });

  } catch (error) {
    console.error('Error checking protection status:', error);
    return c.json({ error: "Erro ao verificar status de proteção" }, 500);
  }
});

// Endpoint para forçar correção do usuário protegido (em caso de inconsistência)
systemAdminRoutes.post("/force-fix-protected-user", authMiddleware, requireProtectedSysAdmin(), async (c) => {
  const env = c.env;
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Primeiro, verificar se o usuário existe
    let protectedUser = await env.DB.prepare(`
      SELECT * FROM users WHERE email = ? OR id = ?
    `).bind('eng.tiagosm@gmail.com', '84edf8d1-77d9-4c73-935e-d76745bc3707').first() as any;

    if (!protectedUser) {
      // Criar o usuário se não existir (situação de emergência)
      await env.DB.prepare(`
        INSERT INTO users (
          id, email, name, role, can_manage_users, can_create_organizations,
          is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `).bind(
        '84edf8d1-77d9-4c73-935e-d76745bc3707',
        'eng.tiagosm@gmail.com',
        'Tiago dos Santos Martins - SysAdmin',
        USER_ROLES.SYSTEM_ADMIN,
        true,
        true,
        true
      ).run();

      await env.DB.prepare(`
        INSERT INTO activity_log (user_id, action_type, action_description, target_type, target_id, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `).bind(
        user.id,
        'emergency_user_creation',
        'EMERGÊNCIA: Usuário protegido foi recriado no sistema',
        'user',
        '84edf8d1-77d9-4c73-935e-d76745bc3707'
      ).run();

      return c.json({
        success: true,
        message: "EMERGÊNCIA: Usuário protegido foi recriado com privilégios completos",
        action: "created"
      });
    } else {
      // Corrigir configurações se necessário
      await env.DB.prepare(`
        UPDATE users 
        SET role = ?, can_manage_users = ?, can_create_organizations = ?, is_active = ?, updated_at = NOW()
        WHERE email = ? OR id = ?
      `).bind(
        USER_ROLES.SYSTEM_ADMIN,
        true,
        true,
        true,
        'eng.tiagosm@gmail.com',
        '84edf8d1-77d9-4c73-935e-d76745bc3707'
      ).run();

      await env.DB.prepare(`
        INSERT INTO activity_log (user_id, action_type, action_description, target_type, target_id, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `).bind(
        user.id,
        'forced_user_fix',
        'Correção forçada de privilégios do usuário protegido do sistema',
        'user',
        '84edf8d1-77d9-4c73-935e-d76745bc3707'
      ).run();

      return c.json({
        success: true,
        message: "Usuário protegido foi corrigido com privilégios completos",
        action: "updated"
      });
    }

  } catch (error) {
    console.error('Error fixing protected user:', error);
    return c.json({ error: "Erro ao corrigir usuário protegido" }, 500);
  }
});

// Endpoint específico para garantir proteção do sysadmin principal
systemAdminRoutes.post('/ensure-protected-sysadmin', authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  // Verificar se é o usuário correto ou um admin
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;

  const isAuthorized = user.email === 'eng.tiagosm@gmail.com' ||
    userProfile?.role === 'sys_admin' ||
    userProfile?.role === 'system_admin';

  if (!isAuthorized) {
    return c.json({ error: 'Acesso negado. Endpoint restrito ao administrador principal.' }, 403);
  }

  try {
    console.log('[ENSURE-PROTECTED-SYSADMIN] Garantindo proteção do system_admin...');

    const result = await autoFixSystemAdmin(env);

    return c.json({
      success: result.success,
      message: result.message,
      user_id: 'eng.tiagosm',
      user_email: 'eng.tiagosm@gmail.com',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[ENSURE-PROTECTED-SYSADMIN] Erro:', error);
    return c.json({
      error: 'Erro ao garantir proteção do system_admin',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, 500);
  }
});

export default systemAdminRoutes;

