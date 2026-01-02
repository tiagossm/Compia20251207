import { Hono } from "hono";
import { tenantAuthMiddleware } from "./tenant-auth-middleware.ts";
import { ExtendedMochaUser, USER_ROLES } from "./user-types.ts";

type Env = {
    DB: any;
};

const getDatabase = (env: any) => env.DB;

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// List events
app.get('/', tenantAuthMiddleware, async (c) => {
    try {
        const user = c.get('user') as ExtendedMochaUser;
        const db = getDatabase(c.env);

        const startDate = c.req.query('start_date');
        const endDate = c.req.query('end_date');

        // Get user profile to know which organization to fetch for
        const userProfile = await db.prepare("SELECT organization_id, managed_organization_id, role FROM users WHERE id = ?").bind(user.id).first() as any;

        if (!userProfile) {
            return c.json({ error: "User profile not found" }, 404);
        }

        const orgId = userProfile.managed_organization_id || userProfile.organization_id;

        if (!orgId) {
            return c.json({ error: "User is not associated with any organization" }, 400);
        }

        let query = `
      SELECT * FROM calendar_events 
      WHERE organization_id = ?
    `;
        const params: any[] = [orgId];

        if (startDate) {
            query += ` AND end_time >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND start_time <= ?`;
            params.push(endDate);
        }

        query += ` ORDER BY start_time ASC`;

        const result = await db.prepare(query).bind(...params).all();

        return c.json(result.results || []);

    } catch (error) {
        console.error('Error fetching calendar events:', error);
        return c.json({ error: 'Erro ao buscar eventos do calendário' }, 500);
    }
});

// Create event
app.post('/', tenantAuthMiddleware, async (c) => {
    try {
        const user = c.get('user') as ExtendedMochaUser;
        const db = getDatabase(c.env);
        const body = await c.req.json();

        const {
            title,
            description,
            start_time,
            end_time,
            event_type,
            metadata
        } = body;

        // Validation
        if (!title || !start_time || !end_time || !event_type) {
            return c.json({ error: "Campos obrigatórios: title, start_time, end_time, event_type" }, 400);
        }

        // Get user profile
        const userProfile = await db.prepare("SELECT organization_id, managed_organization_id, role FROM users WHERE id = ?").bind(user.id).first() as any;

        if (!userProfile) {
            return c.json({ error: "User profile not found" }, 404);
        }

        const orgId = userProfile.managed_organization_id || userProfile.organization_id;

        if (!orgId) {
            return c.json({ error: "User is not associated with any organization" }, 400);
        }

        // Insert
        const result = await db.prepare(`
        INSERT INTO calendar_events (
            organization_id, created_by, title, description, 
            start_time, end_time, event_type, metadata
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?
        ) RETURNING *
    `).bind(
            orgId, user.id, title, description || null,
            start_time, end_time, event_type, JSON.stringify(metadata || {})
        ).first();

        // Log Activity
        await db.prepare(`
        INSERT INTO activity_log(user_id, organization_id, action_type, action_description, target_type, target_id, created_at)
        VALUES(?, ?, ?, ?, ?, ?, NOW())
    `).bind(
            user.id, orgId, 'event_created',
            `Criou evento: ${title}`, 'calendar_event', result.id.toString()
        ).run();

        return c.json(result);

    } catch (error) {
        console.error('Error creating calendar event:', error);
        return c.json({ error: 'Erro ao criar evento' }, 500);
    }
});

// Update event
app.put('/:id', tenantAuthMiddleware, async (c) => {
    try {
        const user = c.get('user') as ExtendedMochaUser;
        const db = getDatabase(c.env);
        const eventId = c.req.param('id');
        const body = await c.req.json();

        // Allowed fields to update
        const allowedFields = ['title', 'description', 'start_time', 'end_time', 'event_type', 'status', 'metadata'];
        const updates = [];
        const values = [];

        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updates.push(`${field} = ?`);
                if (field === 'metadata') {
                    values.push(JSON.stringify(body[field]));
                } else {
                    values.push(body[field]);
                }
            }
        }

        if (updates.length === 0) {
            return c.json({ message: "Nada para atualizar" }, 200);
        }

        updates.push("updated_at = NOW()");

        // Verify ownership/permission (RLS handles logic, but nice to check existence)
        // Ideally we assume RLS policies prevent unauthorized updates, 
        // but we need to ensure the WHERE clause includes org check if we weren't using RLS at DB level,
        // but since we are using `run()` via direct DB connection which acts as SERVICE ROLE usually in Edge Functions?
        // WAIT. The Edge Function connects via `DB` binding which usually has full access or uses the connection string.
        // If it uses direct connection string, RLS might NOT apply unless we set `set_config('request.jwt.claim.sub', ...)`
        // However, in previous code (e.g. organizations-routes) we do explicit checks.
        // Let's do explicit check for safety.

        // Get user profile
        const userProfile = await db.prepare("SELECT organization_id, managed_organization_id, role FROM users WHERE id = ?").bind(user.id).first() as any;
        const orgId = userProfile.managed_organization_id || userProfile.organization_id;

        const query = `
            UPDATE calendar_events 
            SET ${updates.join(', ')} 
            WHERE id = ? AND organization_id = ?
            RETURNING *
        `;

        const result = await db.prepare(query).bind(...values, eventId, orgId).first();

        if (!result) {
            return c.json({ error: "Evento não encontrado ou permissão negada" }, 404);
        }

        return c.json(result);

    } catch (error) {
        console.error('Error updating calendar event:', error);
        return c.json({ error: 'Erro ao atualizar evento' }, 500);
    }
});

// Delete event
app.delete('/:id', tenantAuthMiddleware, async (c) => {
    try {
        const user = c.get('user') as ExtendedMochaUser;
        const db = getDatabase(c.env);
        const eventId = c.req.param('id');

        const userProfile = await db.prepare("SELECT organization_id, managed_organization_id, role FROM users WHERE id = ?").bind(user.id).first() as any;
        const orgId = userProfile.managed_organization_id || userProfile.organization_id;

        const result = await db.prepare(`
            DELETE FROM calendar_events 
            WHERE id = ? AND organization_id = ?
            RETURNING id
        `).bind(eventId, orgId).first();

        if (!result) {
            return c.json({ error: "Evento não encontrado ou permissão negada" }, 404);
        }

        return c.json({ message: "Evento excluído com sucesso" });

    } catch (error) {
        console.error('Error deleting calendar event:', error);
        return c.json({ error: 'Erro ao excluir evento' }, 500);
    }
});

export default app;
