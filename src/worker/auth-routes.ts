import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { initializeDatabase } from "./database-init";

const authRoutes = new Hono<{ Bindings: Env; Variables: { user: any } }>();
console.log('[AUTH-ROUTES] Auth routes module loaded, typeof:', typeof authRoutes);

// Helper para hash de senha (simples para demo, idealmente usar bcrypt/argon2 em prod real)
// Como estamos no worker, vamos usar Web Crypto API
async function hashPassword(password: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Registro de usuário
authRoutes.post("/register", async (c) => {
    const env = c.env;

    try {
        const { email, password, name, organization_name, role } = await c.req.json();

        if (!email || !password || !name) {
            return c.json({ error: "Email, senha e nome são obrigatórios" }, 400);
        }

        await initializeDatabase(env);

        // Verificar se usuário já existe
        const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();

        if (existingUser) {
            return c.json({ error: "Email já cadastrado" }, 409);
        }

        // Criar ID único
        const userId = crypto.randomUUID();
        const passwordHash = await hashPassword(password);

        // Verificar se é o usuário Admin de Bootstrap
        const isBootstrapAdmin = email === 'eng.tiagosm@gmail.com';

        // Definir Role Inicial
        let initialRole = role || 'inspector';

        // Se estiver criando organização, força ser Admin da Org
        if (organization_name) {
            initialRole = 'org_admin';
        }

        // Sanitização de segurança: Impedir criação direta de SysAdmin via API
        if (initialRole === 'sys_admin' || initialRole === 'system_admin') {
            if (isBootstrapAdmin) {
                initialRole = 'sys_admin'; // Permitido apenas para o e-mail mestre
            } else {
                initialRole = 'org_admin'; // Downgrade seguro
            }
        }

        // Definir Status: SEMPRE pendente, exceto o bootstrap admin
        const initialStatus = isBootstrapAdmin ? 'approved' : 'pending';

        // 1. Criar usuário (Agora com role dinâmico e status forçado)
        await env.DB.prepare(`
          INSERT INTO users (id, email, name, role, approval_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(userId, email, name, initialRole, initialStatus).run();

        // 2. Criar credenciais
        await env.DB.prepare(`
          INSERT INTO user_credentials (user_id, password_hash, created_at, updated_at)
          VALUES (?, ?, datetime('now'), datetime('now'))
        `).bind(userId, passwordHash).run();

        // 3. Se forneceu nome da organização, criar e vincular
        if (organization_name) {
            const orgResult = await env.DB.prepare(`
                INSERT INTO organizations (name, type, created_at, updated_at)
                VALUES (?, 'company', datetime('now'), datetime('now'))
            `).bind(organization_name).run();

            const orgId = orgResult.meta.last_row_id;

            // Vincular usuário à organização criada
            await env.DB.prepare(`
                UPDATE users 
                SET organization_id = ?, can_manage_users = true, can_create_organizations = true
                WHERE id = ?
            `).bind(orgId, userId).run();
        }

        return c.json({
            success: true,
            message: "Conta criada com sucesso. Aguardando aprovação do administrador.",
            requires_approval: true,
            user: { id: userId, email, name }
        }, 201);

    } catch (error) {
        console.error('Erro no registro:', error);
        return c.json({ error: "Erro ao criar conta" }, 500);
    }
});

// Login
authRoutes.post("/login", async (c) => {
    const env = c.env;

    try {
        const { email, password } = await c.req.json();

        if (!email || !password) {
            return c.json({ error: "Email e senha são obrigatórios" }, 400);
        }

        await initializeDatabase(env);

        // Buscar usuário e verificar status de aprovação
        const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();

        if (!user) {
            return c.json({ error: "Credenciais inválidas" }, 401);
        }

        // VERIFICAÇÃO DE APROVAÇÃO
        if (user.approval_status === 'pending') {
            return c.json({
                error: "Conta em análise",
                message: "Sua conta aguarda aprovação do administrador.",
                code: "APPROVAL_PENDING"
            }, 403);
        } else if (user.approval_status === 'rejected') {
            return c.json({
                error: "Conta recusada",
                message: "Sua solicitação de cadastro foi recusada.",
                code: "APPROVAL_REJECTED"
            }, 403);
        }

        // Verificar senha
        const credentials = await env.DB.prepare("SELECT password_hash FROM user_credentials WHERE user_id = ?").bind(user.id).first();

        if (!credentials) {
            // Usuário existe mas sem senha (login social?)
            return c.json({ error: "Este usuário deve fazer login via Google" }, 401);
        }

        const inputHash = await hashPassword(password);

        if (inputHash !== credentials.password_hash) {
            return c.json({ error: "Credenciais inválidas" }, 401);
        }

        // Login sucesso
        // Atualizar last_login
        await env.DB.prepare("UPDATE user_credentials SET last_login_at = datetime('now') WHERE user_id = ?").bind(user.id).run();

        // Gerar token de sessão (simples para demo)
        const sessionToken = `dev-session-${user.id}`;

        // Setar cookie
        setCookie(c, "mocha-session-token", sessionToken, {
            httpOnly: true,
            path: "/",
            sameSite: "Lax",
            secure: false, // true em prod
            maxAge: 60 * 60 * 24 * 7 // 7 dias
        });

        return c.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        return c.json({ error: "Erro ao realizar login" }, 500);
    }
});

// Logout
authRoutes.post("/logout", async (c) => {
    deleteCookie(c, "mocha-session-token");
    return c.json({ success: true });
});

export default authRoutes;
