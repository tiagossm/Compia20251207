import { Context, Next } from "hono";

export async function demoAuthMiddleware(c: Context, next: Next) {
  // O usuário básico já foi injetado pelo index.ts via Supabase Auth
  let user = c.get('user');

  // Se não tiver usuário autenticado via Supabase, tentar headers de Demo (fallback)
  if (!user) {
    const demoHeader = c.req.header('x-demo-auth');
    if (demoHeader === 'true') {
      const demoUserId = c.req.header('x-demo-user-id') || '01990d69-5246-733d-8605-1ed319a3f98d';
      user = {
        id: demoUserId,
        email: 'eng.tiagosm@gmail.com',
        app_metadata: {},
        user_metadata: { name: 'Tiago Mocha System Admin (Demo)' },
        aud: 'authenticated',
        created_at: new Date().toISOString()
      };
      c.set("user", user); // Setar user básico demo
    }
  }

  // Se tivermos um usuário (Supabase ou Demo), buscar o perfil completo no banco
  if (user) {
    try {
      if (c.env.DB) {
        // Buscar dados da tabela users
        let dbUser = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();

        // FALLBACK: Lookup by Email (For Google Auth where AuthID != DB User ID)
        if (!dbUser && user.email) {
          console.log(`[AUTH] User ID mismatch for ${user.email}. Trying lookup by email...`);
          dbUser = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(user.email).first();
        }

        if (dbUser) {
          // Enriquecer o objeto user com dados do banco (role, org, etc)
          const enrichedUser = {
            ...user, // Dados do Auth (metadados)
            ...dbUser, // Dados do Banco (ID CORRETO, role, etc)
            id: (dbUser as any).id, // Ensuring we use the Database ID
            email: (dbUser as any).email // Ensuring consistency
          };

          // Override para sys_admin hardcoded se necessário
          if (user.email === 'eng.tiagosm@gmail.com') {
            enrichedUser.role = 'system_admin';
          }

          // Update last_active_at if null or > 5 min old
          try {
            const now = new Date();
            const lastActive = (dbUser as any).last_active_at ? new Date((dbUser as any).last_active_at) : null;

            if (!lastActive || (now.getTime() - lastActive.getTime() > 5 * 60 * 1000)) {
              // Async update
              c.env.DB.prepare("UPDATE users SET last_active_at = NOW() WHERE id = ?").bind(user.id).run().catch((e: any) => console.error("Error updating last_active_at:", e));
            }
          } catch (e) {
            console.error("Error checking activity:", e);
          }

          c.set("user", enrichedUser);
        } else {
          // Usuário existe no Auth mas não no Banco (primeiro login?)
          // As rotas podem tratar isso, ou podemos criar um perfil básico aqui.
          console.log('[AUTH] Usuário autenticado mas sem perfil no banco:', user.id);
        }
      }
    } catch (e) {
      console.error("[AUTH] Erro ao enriquecer perfil do usuário:", e);
    }
  }

  await next();
}

