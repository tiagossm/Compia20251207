import { Hono } from "hono";
import { demoAuthMiddleware as authMiddleware } from "./demo-auth-middleware";

const mediaRoutes = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// File size limits in bytes
const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024,      // 10 MB
  video: 100 * 1024 * 1024,     // 100 MB
  audio: 20 * 1024 * 1024,      // 20 MB
  document: 50 * 1024 * 1024    // 50 MB
};

// Upload media for inspection
mediaRoutes.post("/:inspectionId/media/upload", authMiddleware, async (c) => {
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

    // Validate file size based on media type
    const sizeLimit = FILE_SIZE_LIMITS[media_type as keyof typeof FILE_SIZE_LIMITS];
    if (file_size > sizeLimit) {
      const limitMB = Math.round(sizeLimit / 1024 / 1024);
      return c.json({
        error: `Arquivo muito grande. Limite para ${media_type}: ${limitMB}MB`
      }, 400);
    }

    // Verify inspection exists and user has access
    const inspection = await env.DB.prepare(`
      SELECT i.*, u.organization_id as user_org_id
      FROM inspections i
      JOIN users u ON u.id = ?
      WHERE i.id = ?
    `).bind(user.id, inspectionId).first() as any;

    if (!inspection) {
      return c.json({ error: "Inspeção não encontrada" }, 404);
    }

    // Check access permissions
    const hasAccess = inspection.created_by === user.id ||
      inspection.organization_id === inspection.user_org_id;

    if (!hasAccess) {
      return c.json({ error: "Sem permissão para acessar esta inspeção" }, 403);
    }

    // Convert base64 data to blob for storage
    let file_url = '';

    try {
      // For now, we'll store the base64 data directly
      // In production, you might want to upload to a CDN or cloud storage
      file_url = file_data; // Store the base64 data URL directly

      // Insert media record
      const result = await env.DB.prepare(`
        INSERT INTO inspection_media (
          inspection_id, inspection_item_id, media_type, file_name, file_url,
          file_size, mime_type, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        inspectionId,
        inspection_item_id || null,
        media_type,
        file_name,
        file_url,
        file_size,
        mime_type,
        description || null
      ).run();

      return c.json({
        id: result.meta.last_row_id,
        file_url: file_url,
        message: "Upload realizado com sucesso"
      });

    } catch (storageError) {
      console.error('Storage error:', storageError);
      return c.json({ error: "Erro ao armazenar arquivo" }, 500);
    }

  } catch (error) {
    console.error('Error uploading media:', error);
    return c.json({
      error: "Erro ao fazer upload",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

// Get media for inspection
mediaRoutes.get("/:inspectionId/media", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("inspectionId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Verify inspection access
    const inspection = await env.DB.prepare(`
      SELECT i.*, u.organization_id as user_org_id
      FROM inspections i
      JOIN users u ON u.id = ?
      WHERE i.id = ?
    `).bind(user.id, inspectionId).first() as any;

    if (!inspection) {
      return c.json({ error: "Inspeção não encontrada" }, 404);
    }

    // Get all media for the inspection
    const media = await env.DB.prepare(`
      SELECT * FROM inspection_media 
      WHERE inspection_id = ?
      ORDER BY created_at DESC
    `).bind(inspectionId).all();

    return c.json({
      media: media.results || []
    });

  } catch (error) {
    console.error('Error fetching media:', error);
    return c.json({ error: "Erro ao buscar mídia" }, 500);
  }
});

// Delete media
mediaRoutes.delete("/media/:mediaId", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const mediaId = parseInt(c.req.param("mediaId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Get media with inspection info to verify access
    const media = await env.DB.prepare(`
      SELECT m.*, i.created_by, i.organization_id, u.organization_id as user_org_id
      FROM inspection_media m
      JOIN inspections i ON m.inspection_id = i.id
      JOIN users u ON u.id = ?
      WHERE m.id = ?
    `).bind(user.id, mediaId).first() as any;

    if (!media) {
      return c.json({ error: "Mídia não encontrada" }, 404);
    }

    // Check access permissions
    const hasAccess = media.created_by === user.id ||
      media.organization_id === media.user_org_id;

    if (!hasAccess) {
      return c.json({ error: "Sem permissão para deletar esta mídia" }, 403);
    }

    // Delete media record
    await env.DB.prepare('DELETE FROM inspection_media WHERE id = ?').bind(mediaId).run();

    return c.json({
      success: true,
      message: "Mídia deletada com sucesso"
    });

  } catch (error) {
    console.error('Error deleting media:', error);
    return c.json({ error: "Erro ao deletar mídia" }, 500);
  }
});

export default mediaRoutes;
