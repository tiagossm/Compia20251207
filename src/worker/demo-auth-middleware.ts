import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";

export async function demoAuthMiddleware(c: Context, next: Next) {
  // 1. Tentar autenticação via Cookie (Login Local ou Google persistido)
  // O cookie pode vir como mocha-session-token ou mocha_session_token dependendo do cliente
  const sessionToken = getCookie(c, "mocha-session-token") || getCookie(c, "mocha_session_token");

  if (sessionToken && sessionToken.startsWith("dev-session-")) {
    const userId = sessionToken.replace("dev-session-", "");

    // Tentar buscar usuário real no banco
    try {
      if (c.env.DB) {
        const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();

        if (user) {
          // Injetar usuário real no contexto
          // Parsear campos JSON se necessário (embora sqlite retorne texto, hono/d1 pode tratar diferente)
          // Mas como definimos role como TEXT, está ok.

          // Se for o sys_admin hardcoded, garantir permissões extras (legado/segurança)
          if (user.email === 'eng.tiagosm@gmail.com') {
            user.role = 'system_admin';
          }

          c.set("user", user);
          await next();
          return;
        }
      }
    } catch (e) {
      console.error("[AUTH] Erro ao buscar usuário da sessão:", e);
    }
  }

  // 2. Fallback para Headers de Demo (para compatibilidade com testes manuais via curl/postman)
  const demoHeader = c.req.header('x-demo-auth');
  if (demoHeader === 'true') {
    const demoUserId = c.req.header('x-demo-user-id') || '01990d69-5246-733d-8605-1ed319a3f98d';

    const mockUser = {
      id: demoUserId,
      email: 'eng.tiagosm@gmail.com',
      name: 'Tiago Mocha System Admin (Demo)',
      role: 'sys_admin',
      organization_id: 1,
      is_active: true
    };
    c.set("user", mockUser);
    await next();
    return;
  }

  // 3. Se não autenticado, permitir passar mas sem usuário no contexto
  // (Rotas protegidas devem verificar c.get('user'))
  await next();
}

// Helper function to check if request is from demo user
export function isDemoRequest(c: Context): boolean {
  return c.req.header('x-demo-auth') === 'true';
}
