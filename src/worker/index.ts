import { Hono } from "hono";
import { cors } from "hono/cors";
import { demoAuthMiddleware } from "./demo-auth-middleware";
import {
  criticalUserProtection,
  autoIntegrityCheck,
  securityAuditLogger
} from "./security-protection";
// import {
//   authMiddleware,
//   deleteSession,
//   MOCHA_SESSION_TOKEN_COOKIE_NAME
// } from "@getmocha/users-service/backend";

const MOCHA_SESSION_TOKEN_COOKIE_NAME = "mocha-session-token";
const authMiddleware = demoAuthMiddleware; // Use demo auth everywhere for now
const deleteSession = async () => { console.log('Mock delete session'); };
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { USER_ROLES } from "@/shared/user-types";
import { initializeDatabase } from "./database-init";

// Import route modules
import usersRoutes from "./users-routes";
import checklistRoutes from "./checklist-routes";
import checklistFoldersRoutes from "./checklist-folders-routes";
import multiTenantRoutes from "./multi-tenant-routes";
import organizationsRoutes from "./organizations-routes";
import shareRoutes from "./share-routes";
import adminDebugRoutes from "./admin-debug-routes";
import dashboardRoutes from "./dashboard-routes";
import rolePermissionsRoutes from "./role-permissions-routes";
import systemAdminRoutes from "./system-admin-routes";
import securityRoutes from "./security-endpoints";
import { autosuggest } from "./autosuggest-routes";
import aiAssistantsRoutes from "./ai-assistants-routes";
import cepRoutes from "./cep-routes";
import inspectionRoutes from "./inspection-routes";
import databaseDebugRoutes from "./database-debug-routes";
import mediaRoutes from "./media-routes";
import actionPlansRoutes from "./action-plans-routes";
import resetRoutes from "./reset-project";
import autoOrganizeRoutes from "./auto-organize-folders";
import adminApprovalRoutes from "./admin-approval-routes";
import userAssignmentRoutes from "./user-assignment-routes";
// import authRoutes from "./auth-routes"; // Removido para inlining

type Env = {
  DB: any;
  MOCHA_USERS_SERVICE_API_URL?: string;
  MOCHA_USERS_SERVICE_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
};

type Variables = {
  user: any;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS middleware - Enhanced for authentication
app.use("*", cors({
  origin: (origin) => origin || "*", // Allow all origins including localhost
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Cookie",
    "Set-Cookie"
  ],
  credentials: true,
  exposeHeaders: ["Content-Length", "X-Total-Count", "Set-Cookie"]
}));

// OAuth endpoints
// OAuth endpoints - MODIFIED FOR DEV BYPASS
app.get('/api/oauth/google/redirect_url', async (c) => {
  // Em desenvolvimento, retornamos a URL direta do Google se as chaves do Mocha não estiverem configuradas
  const clientId = (c.env as Env).GOOGLE_CLIENT_ID || "551326749121-83qla5ssl63poko7a08vorm119tqfno2.apps.googleusercontent.com";
  const redirectUri = "http://localhost:5173/auth/callback";

  const scope = "email profile openid";
  const responseType = "code";
  const accessType = "offline";
  const prompt = "consent";

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=${responseType}&access_type=${accessType}&prompt=${prompt}`;

  console.log('[OAUTH] Using DEV BYPASS Google Auth URL');
  return c.json({ redirectUrl: googleAuthUrl }, 200);
});

// Exchange the code for a session token
// Exchange the code for a session token - MODIFIED FOR DEV BYPASS
app.post("/api/sessions", async (c) => {
  try {
    let body = {};
    try {
      body = await c.req.json();
    } catch (e) {
      console.log('[SESSIONS] Empty or invalid JSON body, proceeding with mock session');
    }
    console.log('[SESSIONS] Request body:', body);

    // DEV BYPASS: Se recebermos um código do Google, criamos uma sessão mockada
    // Na produção real, trocaríamos esse código pelo token no backend

    // Gerar um token de sessão falso mas válido para nosso middleware
    const mockSessionToken = "dev-session-" + Math.random().toString(36).substring(2);

    // Armazenar cookie - Hardcoded name to avoid import issues
    const cookieName = "mocha-session-token";
    setCookie(c, cookieName, mockSessionToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax", // Lax para desenvolvimento local
      secure: false, // False para localhost
      maxAge: 60 * 24 * 60 * 60, // 60 days
    });

    console.log('[SESSIONS] DEV BYPASS: Cookie set successfully:', cookieName);
    return c.json({ success: true }, 200);
  } catch (error) {
    console.error('Error exchanging code for session token:', error);
    return c.json({
      error: "Erro ao trocar código por token de sessão",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

// Get the current user object for the frontend - MODIFIED FOR DEV BYPASS
app.get("/api/users/me", demoAuthMiddleware, async (c) => {
  try {
    // DEV BYPASS: Verificar se temos o cookie de dev
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    console.log('[USERS_ME] Session token:', sessionToken?.substring(0, 20) + '...');

    let user = c.get("user") as any;
    console.log('[USERS_ME] User from context:', user ? user.email : 'NONE');

    // DEV BYPASS: Se temos cookie de dev mas não temos user, criar user de dev
    if (sessionToken?.startsWith('dev-session-') && !user) {
      console.log('[USERS_ME] DEV BYPASS: Creating dev user from cookie');
      user = {
        id: "01990d69-5246-733d-8605-1ed319a3f98d",
        email: "eng.tiagosm@gmail.com",
        google_user_data: {
          email: "eng.tiagosm@gmail.com",
          email_verified: true,
          picture: "https://via.placeholder.com/150",
        },
        profile: {
          id: "01990d69-5246-733d-8605-1ed319a3f98d",
          email: "eng.tiagosm@gmail.com",
          name: "Tiago Mocha System Admin",
          role: "sys_admin",
          can_manage_users: true,
          can_create_organizations: true,
          is_active: true,
          organization_id: 1,
          managed_organization_id: 1,
        }
      } as any;
    }

    if (!user) {
      console.log('[USERS_ME] No user from auth middleware');
      return c.json({ error: "User not authenticated" }, 401);
    }

    console.log('[USERS_ME] User from auth middleware:', user.email);

    const env = c.env;

    // Verificar se o banco de dados está disponível
    if (!env?.DB) {
      console.error('[USERS_ME] Database não disponível no environment');
      return c.json({ error: "Database não disponível" }, 503);
    }

    // Garantir inicialização do banco de dados
    console.log('[USERS_ME] Inicializando banco de dados...');
    await initializeDatabase(env);

    // Get extended user profile from database
    console.log('[USERS_ME] Buscando perfil do usuário:', user.id, user.email);
    let userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    console.log('[USERS_ME] Perfil encontrado:', userProfile ? 'SIM' : 'NÃO');

    if (!userProfile) {
      // DEV BYPASS: Se for usuário de dev, retornar perfil mock sem tentar inserir no banco
      if (sessionToken?.startsWith('dev-session-')) {
        console.log('[USERS_ME] DEV BYPASS: Returning mock user profile');
        return c.json({
          ...user.google_user_data,
          profile: (user as any).profile || {
            id: user.id,
            email: user.email,
            name: user.google_user_data?.name || "Demo User",
            role: "sys_admin",
            can_manage_users: true,
            can_create_organizations: true,
            is_active: true,
            organization_id: 1,
            managed_organization_id: 1,
          }
        });
      }

      // Tentar criar usuário no banco apenas se não for dev mode
      try {
        // Verifica se é o usuário sys_admin protegido
        if (user.id === '01990d69-5246-733d-8605-1ed319a3f98d' || user.email === 'eng.tiagosm@gmail.com') {
          // Recria como sys_admin com configurações completas
          await env.DB.prepare(`
            INSERT INTO users (
              id, email, name, role, can_manage_users, can_create_organizations,
              is_active, organization_id, managed_organization_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(
            user.id,
            user.email,
            user.google_user_data?.name || 'Tiago Mocha System Admin',
            'sys_admin',
            true,
            true,
            true,
            1, // Organização principal
            1
          ).run();
          console.log(`[USERS_ME] Usuário sys_admin protegido ${user.email} recriado com papel sys_admin.`);
        } else {
          // Para outros usuários, cria como inspector (padrão)
          await env.DB.prepare(`
            INSERT INTO users (
              id, email, name, role, can_manage_users, can_create_organizations,
              is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(
            user.id,
            user.email,
            user.google_user_data?.name || user.email,
            'inspector',
            false,
            false,
            true
          ).run();
          console.log(`[USERS_ME] Usuário ${user.email} criado com papel inspector.`);
        }

        // Re-busca o perfil recém-criado/atualizado
        userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
      } catch (dbError) {
        console.error('[USERS_ME] Erro ao criar usuário no banco:', dbError);
        // Continue com userProfile = null
      }
    }

    // Get organization if exists
    let organization = null;
    if (userProfile?.organization_id) {
      organization = await env.DB.prepare("SELECT * FROM organizations WHERE id = ?").bind(userProfile.organization_id).first();
    }

    // Return extended user object
    console.log('[USERS_ME] Retornando dados do usuário com perfil e organização');
    return c.json({
      ...user.google_user_data,
      profile: userProfile,
      organization: organization
    });

  } catch (error) {
    console.error('[USERS_ME] Erro ao buscar perfil do usuário:', error);

    // Tentar recovery automático do banco de dados
    try {
      console.log('[USERS_ME] Tentando recovery automático do banco...');
      await initializeDatabase(c.env);

      // Return basic error response
      return c.json({ error: "Failed to fetch user profile" }, 500);
    } catch (recoveryError) {
      console.error('[USERS_ME] Falha no recovery automático:', recoveryError);
    }

    return c.json({ error: "Failed to fetch user profile" }, 500);
  }
});

// Helper function to perform CNPJ lookup with proper error handling
const performCnpjLookup = async (cnpjInput: string) => {
  try {
    if (!cnpjInput) {
      return {
        success: false,
        error: "CNPJ é obrigatório",
        status: 400
      };
    }

    // Clean CNPJ (remove dots, slashes, dashes, spaces)
    const cleanCnpj = cnpjInput.replace(/[.\-\/\s]/g, '');

    // Validate CNPJ format (14 digits)
    if (!/^\d{14}$/.test(cleanCnpj)) {
      return {
        success: false,
        error: "CNPJ deve conter 14 dígitos numéricos",
        status: 400
      };
    }

    // Call external CNPJ API (using a free API like ReceitaWS)
    const apiUrl = `https://www.receitaws.com.br/v1/cnpj/${cleanCnpj}`;

    const response = await globalThis.fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InspectionApp/1.0)',
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        return {
          success: false,
          error: "Muitas consultas. Tente novamente em alguns minutos.",
          status: 429
        };
      }
      return {
        success: false,
        error: `Erro na consulta externa: ${response.status}`,
        status: 502
      };
    }

    const cnpjData = await response.json() as any;

    if (cnpjData.status === 'ERROR') {
      return {
        success: false,
        error: cnpjData.message || "CNPJ não encontrado",
        status: 404
      };
    }

    // Transform data to match our organization fields
    const organizationData = {
      cnpj: cnpjData.cnpj,
      razao_social: cnpjData.nome,
      nome_fantasia: cnpjData.fantasia || cnpjData.nome,
      cnae_principal: cnpjData.atividade_principal?.[0]?.code,
      cnae_descricao: cnpjData.atividade_principal?.[0]?.text,
      natureza_juridica: cnpjData.natureza_juridica,
      data_abertura: cnpjData.abertura,
      capital_social: cnpjData.capital_social ? parseFloat(cnpjData.capital_social.replace(/[^\d.,]/g, '').replace(',', '.')) : null,
      porte_empresa: cnpjData.porte,
      situacao_cadastral: cnpjData.situacao,
      address: cnpjData.logradouro ?
        `${cnpjData.logradouro}, ${cnpjData.numero || 'S/N'}, ${cnpjData.bairro}, ${cnpjData.municipio}/${cnpjData.uf}, CEP: ${cnpjData.cep}` :
        null,
      contact_phone: cnpjData.telefone,
      contact_email: cnpjData.email,
      // Additional fields we can extract
      cep: cnpjData.cep,
      endereco_completo: {
        logradouro: cnpjData.logradouro,
        numero: cnpjData.numero,
        complemento: cnpjData.complemento,
        bairro: cnpjData.bairro,
        municipio: cnpjData.municipio,
        uf: cnpjData.uf,
        cep: cnpjData.cep
      },
      data_situacao: cnpjData.data_situacao,
      motivo_situacao: cnpjData.motivo_situacao
    };

    return {
      success: true,
      data: organizationData,
      raw_data: cnpjData, // Include raw data for debugging/additional info
      status: 200
    };

  } catch (error) {
    console.error('CNPJ lookup error:', error);
    return {
      success: false,
      error: "Erro interno ao consultar CNPJ",
      details: error instanceof Error ? error.message : "Erro desconhecido",
      status: 500
    };
  }
};

// CNPJ lookup endpoint with path parameter (only accepts numeric CNPJs)
app.get("/api/cnpj/:cnpj", async (c) => {
  // Set proper JSON content type header
  c.header('Content-Type', 'application/json');

  const cnpj = c.req.param("cnpj");
  const result = await performCnpjLookup(cnpj);

  if (result.success) {
    return c.json({
      success: true,
      data: result.data,
      raw_data: result.raw_data
    }, 200);
  } else {
    return c.json({
      error: result.error,
      details: result.details
    }, result.status as any);
  }
});

// CNPJ lookup endpoint with query string (supports both formatted and unformatted CNPJs)
app.get("/api/cnpj", async (c) => {
  // Set proper JSON content type header
  c.header('Content-Type', 'application/json');

  const cnpj = c.req.query("cnpj");

  if (!cnpj) {
    return c.json({
      error: "Parâmetro 'cnpj' é obrigatório na query string. Ex: /api/cnpj?cnpj=12345678000195"
    }, 400);
  }

  const result = await performCnpjLookup(cnpj);

  if (result.success) {
    return c.json({
      success: true,
      data: result.data,
      raw_data: result.raw_data
    }, 200);
  } else {
    return c.json({
      error: result.error,
      details: result.details
    }, result.status as any);
  }
});

// Logout endpoint
app.get('/api/logout', async (c) => {
  try {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);

    if (typeof sessionToken === 'string') {
      const apiUrl = c.env.MOCHA_USERS_SERVICE_API_URL;
      const apiKey = c.env.MOCHA_USERS_SERVICE_API_KEY;

      if (apiUrl && apiKey) {
        await deleteSession();
      }
    }

    // Delete cookie by setting max age to 0
    setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, '', {
      httpOnly: true,
      path: '/',
      sameSite: 'none',
      secure: true,
      maxAge: 0,
    });

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error('Error during logout:', error);
    return c.json({ error: "Erro durante logout" }, 500);
  }
});

// Health check endpoint
app.get("/api/health", async (c) => {
  const env = c.env;

  try {
    // Inicializar database se necessário
    if (env?.DB) {
      await initializeDatabase(env);
    }
    // Check database connection
    const dbCheck = await (env as Env).DB.prepare("SELECT 1 as test").first();

    // Check OpenAI API key
    const openaiConfigured = !!(env as Env).OPENAI_API_KEY;

    // Check auth service
    const authConfigured = !!((env as Env).MOCHA_USERS_SERVICE_API_KEY && (env as Env).MOCHA_USERS_SERVICE_API_URL);

    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: dbCheck ? "connected" : "error",
      ai_enabled: openaiConfigured,
      auth_service: authConfigured ? "configured" : "not_configured",
      environment: "production"
    });
  } catch (error) {
    return c.json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, 500);
  }
});
// Debug middleware
app.use("*", async (c, next) => {
  console.log(`[REQUEST] ${c.req.method} ${c.req.url}`);
  await next();
});

// Mount route modules
app.route("/api/users", usersRoutes);
app.route("/api/checklist", checklistRoutes);
app.route("/api/checklist", checklistFoldersRoutes);
app.route("/api", checklistRoutes); // Also mount checklist routes at /api for inspection-items endpoints

// Mount organizations routes properly to handle all /api/organizations/* endpoints
app.route("/", organizationsRoutes); // Mount organizations routes at root level to handle /api/organizations/*

app.route("/api", multiTenantRoutes); // Mount multi-tenant routes at /api level for other endpoints
app.route("/api/multi-tenant", multiTenantRoutes); // Also mount at /api/multi-tenant for compatibility

app.route("/api/inspections", inspectionRoutes); // Mount inspection routes
app.route("/api/inspections", mediaRoutes); // Mount media routes for inspections
app.route("/api/inspection", mediaRoutes); // Mount media routes for deletion
app.route("/api/inspection-items", inspectionRoutes); // Mount inspection-items routes
app.route("/api/inspections", shareRoutes); // Mount share routes under /api/inspections
app.route("/api/admin", adminDebugRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/role-permissions", rolePermissionsRoutes);
app.route("/api/system-admin", systemAdminRoutes);
app.route("/api/security", securityRoutes);
app.route("/api/autosuggest", autosuggest);
app.route("/api/ai-assistants", aiAssistantsRoutes);
app.route("/api/cep", cepRoutes);
app.route("/api/action-plans", actionPlansRoutes);
app.route("/api", resetRoutes);
app.route("/api/admin", adminApprovalRoutes);
app.route("/api/user-assignments", userAssignmentRoutes);

// Helper para hash de senha
async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Rotas de Autenticação Inline (para corrigir 404)
app.post("/api/auth/register", async (c) => {
  console.log('[AUTH] Register request received');
  const env = c.env;
  try {
    const { email, password, name, organization_name } = await c.req.json();
    if (!email || !password || !name) return c.json({ error: "Dados incompletos" }, 400);

    await initializeDatabase(env);

    // Verificar usuário existente
    const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existingUser) return c.json({ error: "Email já cadastrado" }, 409);

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    // Criar usuário
    await env.DB.prepare(`INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES (?, ?, ?, 'inspector', datetime('now'), datetime('now'))`).bind(userId, email, name).run();

    // Criar credenciais
    await env.DB.prepare(`INSERT INTO user_credentials (user_id, password_hash, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))`).bind(userId, passwordHash).run();

    // Organização opcional
    if (organization_name) {
      const orgResult = await env.DB.prepare(`INSERT INTO organizations (name, type, created_at, updated_at) VALUES (?, 'company', datetime('now'), datetime('now'))`).bind(organization_name).run();
      const orgId = orgResult.meta.last_row_id;
      await env.DB.prepare(`UPDATE users SET organization_id = ?, role = 'org_admin', can_manage_users = true WHERE id = ?`).bind(orgId, userId).run();
    }

    return c.json({ success: true, message: "Usuário criado" }, 201);
  } catch (error) {
    console.error('[AUTH] Erro no registro:', error);
    return c.json({ error: "Erro interno" }, 500);
  }
});

app.post("/api/auth/login", async (c) => {
  console.log('[AUTH] Login request received');
  const env = c.env;
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "Dados incompletos" }, 400);

    await initializeDatabase(env);
    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    if (!user) return c.json({ error: "Credenciais inválidas" }, 401);

    const credentials = await env.DB.prepare("SELECT password_hash FROM user_credentials WHERE user_id = ?").bind(user.id).first();
    if (!credentials) return c.json({ error: "Login via Google necessário" }, 401);

    const inputHash = await hashPassword(password);
    if (inputHash !== credentials.password_hash) return c.json({ error: "Credenciais inválidas" }, 401);

    await env.DB.prepare("UPDATE user_credentials SET last_login_at = datetime('now') WHERE user_id = ?").bind(user.id).run();

    const sessionToken = `dev-session-${user.id}`;
    setCookie(c, "mocha-session-token", sessionToken, { httpOnly: true, path: "/", sameSite: "Lax", secure: false, maxAge: 60 * 60 * 24 * 7 });

    return c.json({ success: true, user });
  } catch (error) {
    console.error('[AUTH] Erro no login:', error);
    return c.json({ error: "Erro interno" }, 500);
  }
});

app.post("/api/auth/logout", async (c) => {
  deleteCookie(c, "mocha-session-token");
  return c.json({ success: true });
});

// Database debug routes (temporary)
app.route("/api", databaseDebugRoutes);

// Middlewares de segurança
app.use("*", securityAuditLogger());
app.use("*", criticalUserProtection());
app.use("*", autoIntegrityCheck());

// Main inspection routes
app.get("/api/inspections", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user") as any;

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  // Verificar se o banco de dados está disponível
  if (!env?.DB) {
    return c.json({ error: "Database não disponível", inspections: [] }, 503);
  }

  try {
    // Inicializar database se necessário
    await initializeDatabase(env);
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;

    let query = `
      SELECT i.*, u.name as created_by_name, o.name as organization_name
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
          i.organization_id IN (
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

app.get("/api/inspections/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user") as any;
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
      ORDER BY id
    `).bind(inspectionId).all();

    // Get action items
    const actionItems = await env.DB.prepare(`
      SELECT * FROM action_items 
      WHERE inspection_id = ?
      ORDER BY created_at DESC
    `).bind(inspectionId).all();

    // Get media
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

app.post("/api/inspections", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user") as any;

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const body = await c.req.json();
    const {
      title, description, location, inspector_name, inspector_email,
      company_name, cep, address, latitude, longitude, scheduled_date,
      status = 'pendente', priority = 'media', responsible_name, responsible_email
    } = body;

    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;

    const result = await env.DB.prepare(`
      INSERT INTO inspections (
        title, description, location, inspector_name, inspector_email,
        company_name, cep, address, latitude, longitude, scheduled_date,
        status, priority, created_by, organization_id, responsible_name, responsible_email,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      title, description, location, inspector_name, inspector_email,
      company_name, cep, address, latitude, longitude, scheduled_date,
      status, priority, user.id, userProfile?.organization_id, responsible_name, responsible_email
    ).run();

    return c.json({
      id: result.meta.last_row_id,
      message: "Inspection created successfully"
    });

  } catch (error) {
    console.error('Error creating inspection:', error);
    return c.json({ error: "Failed to create inspection" }, 500);
  }
});

app.put("/api/inspections/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user") as any;
  const inspectionId = parseInt(c.req.param("id"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    const body = await c.req.json();

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];

    const allowedFields = [
      'title', 'description', 'location', 'inspector_name', 'inspector_email',
      'company_name', 'cep', 'address', 'latitude', 'longitude', 'scheduled_date',
      'completed_date', 'status', 'priority', 'action_plan', 'action_plan_type',
      'inspector_signature', 'responsible_signature', 'responsible_name', 'responsible_email'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(body[field]);
      }
    }

    if (updateFields.length === 0) {
      return c.json({ message: "No fields to update" }, 400);
    }

    updateFields.push("updated_at = datetime('now')");

    await env.DB.prepare(`
      UPDATE inspections 
      SET ${updateFields.join(", ")}
      WHERE id = ?
    `).bind(...updateValues, inspectionId).run();

    return c.json({ message: "Inspection updated successfully" });

  } catch (error) {
    console.error('Error updating inspection:', error);
    return c.json({ error: "Failed to update inspection" }, 500);
  }
});

// NOTA: Rota DELETE de inspeções movida para inspection-routes.ts com verificação de permissões

// Public invitation acceptance endpoint (no auth required)
app.get("/api/invitations/:token", async (c) => {
  const env = c.env;
  const token = c.req.param("token");

  try {
    const invitation = await env.DB.prepare(`
      SELECT ui.*, o.name as organization_name, u.name as inviter_name
      FROM user_invitations ui
      LEFT JOIN organizations o ON ui.organization_id = o.id
      LEFT JOIN users u ON ui.invited_by = u.id
      WHERE ui.invitation_token = ? AND ui.accepted_at IS NULL
    `).bind(token).first() as any;

    if (!invitation) {
      return c.json({ error: "Convite não encontrado ou já aceito." }, 404);
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);

    if (expiresAt < now) {
      return c.json({ error: "Convite expirado." }, 410);
    }

    return c.json({ invitation });

  } catch (error) {
    console.error('Error fetching invitation:', error);
    return c.json({ error: "Erro ao buscar convite." }, 500);
  }
});

// Auto-organize routes
app.route("/api/checklist", autoOrganizeRoutes);

app.post("/api/invitations/:token/accept", async (c) => {
  const env = c.env;
  const token = c.req.param("token");

  try {
    // Get invitation details
    const invitation = await env.DB.prepare(`
      SELECT * FROM user_invitations 
      WHERE invitation_token = ? AND accepted_at IS NULL
    `).bind(token).first() as any;

    if (!invitation) {
      return c.json({ error: "Convite não encontrado ou já aceito." }, 404);
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);

    if (expiresAt < now) {
      return c.json({ error: "Convite expirado." }, 410);
    }

    // Mark invitation as accepted
    await env.DB.prepare(`
      UPDATE user_invitations 
      SET accepted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(invitation.id).run();

    return c.json({
      message: "Convite aceito com sucesso.",
      redirect_url: "/login"
    });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    return c.json({ error: "Erro ao aceitar convite." }, 500);
  }
});

// Default export for Cloudflare Workers
export default app;
