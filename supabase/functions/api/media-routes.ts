import { Hono } from "hono";
import { tenantAuthMiddleware as authMiddleware } from "./tenant-auth-middleware.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const mediaRoutes = new Hono<{ Bindings: Env; Variables: { user: any } }>();

type Env = {
  DB: any;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

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
      thumbnail_data, // New field
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

    // Resolve the correct inspection_item_id
    // The frontend sends the template field_id, but we need the actual inspection_item.id
    let resolvedItemId = inspection_item_id;

    if (inspection_item_id) {
      // First, check if the ID exists directly
      const itemExists = await env.DB.prepare(`
        SELECT id FROM inspection_items WHERE id = ? AND inspection_id = ?
      `).bind(inspection_item_id, inspectionId).first();

      if (!itemExists) {
        // Fallback: Try to find by field_name (passed in body)
        const { field_name } = body;
        if (field_name) {
          const itemByName = await env.DB.prepare(`
            SELECT id FROM inspection_items 
            WHERE inspection_id = ? AND item_description = ?
          `).bind(inspectionId, field_name).first() as any;

          if (itemByName) {
            resolvedItemId = itemByName.id;
          } else {
            // If still not found, set to null to avoid FK error
            resolvedItemId = null;
          }
        } else {
          resolvedItemId = null;
        }
      }
    }

    let file_url = '';
    let thumbnail_url = ''; // New variable

    try {
      // Upload to Supabase Storage
      const supabaseUrl = env.SUPABASE_URL;
      const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && supabaseServiceKey) {
        // Use Supabase Storage
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Convert base64 to binary
        const base64Data = file_data.split(',')[1];
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        // Generate unique file path
        const timestamp = Date.now();
        const sanitizedFileName = file_name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${inspectionId}/${timestamp}_${sanitizedFileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('inspection-media')
          .upload(filePath, binaryData, {
            contentType: mime_type,
            upsert: false
          });

        if (uploadError) {
          console.error('Supabase Storage error:', uploadError);
          throw new Error(uploadError.message);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('inspection-media')
          .getPublicUrl(filePath);

        file_url = urlData.publicUrl;

        // Process Thumbnail if present
        if (thumbnail_data) {
          try {
            const thumbBase64 = thumbnail_data.split(',')[1];
            const thumbBinary = Uint8Array.from(atob(thumbBase64), c => c.charCodeAt(0));
            const thumbPath = `${filePath}_thumb`;

            const { data: thumbUploadData, error: thumbError } = await supabase.storage
              .from('inspection-media')
              .upload(thumbPath, thumbBinary, {
                contentType: 'image/jpeg', // Assuming thumbs are JPEGs
                upsert: false
              });

            if (!thumbError) {
              const { data: thumbUrlData } = supabase.storage
                .from('inspection-media')
                .getPublicUrl(thumbPath);
              thumbnail_url = thumbUrlData.publicUrl;
            } else {
              console.warn('Thumbnail upload failed:', thumbError);
            }
          } catch (e) {
            console.warn('Error processing thumbnail:', e);
          }
        }

      } else {
        // Fallback: Store base64 reference (truncated for DB)
        // This is a workaround - store just a marker and keep base64 client-side
        console.warn('Supabase Storage not configured, using fallback');
        file_url = `local:${file_name}`;
        if (thumbnail_data) {
          thumbnail_url = `local:thumb_${file_name}`;
        }
      }

      const now = new Date().toISOString();

      // Insert media record with storage URL
      const result = await env.DB.prepare(`
        INSERT INTO inspection_media (
          inspection_id, inspection_item_id, media_type, file_name, file_url, thumbnail_url,
          file_size, mime_type, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `).bind(
        inspectionId,
        resolvedItemId || null,
        media_type,
        file_name,
        file_url,
        thumbnail_url, // Bind new field
        file_size,
        mime_type,
        description || null,
        now,
        now
      ).run();

      return c.json({
        success: true,
        media: {
          id: result.meta.last_row_id,
          file_url: file_url,
          media_type: media_type,
          file_name: file_name
        },
        message: "Upload realizado com sucesso"
      });

    } catch (storageError) {
      console.error('Storage error:', storageError);
      return c.json({
        error: "Erro ao armazenar arquivo",
        details: String(storageError)
      }, 500);
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

    return c.json({ media: media.results });

  } catch (error) {
    console.error('Error fetching media:', error);
    return c.json({
      error: "Erro ao buscar mídia",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

// Delete media
mediaRoutes.delete("/:inspectionId/media/:mediaId", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const inspectionId = parseInt(c.req.param("inspectionId"));
  const mediaId = parseInt(c.req.param("mediaId"));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  try {
    // Get media record first
    const media = await env.DB.prepare(`
      SELECT * FROM inspection_media WHERE id = ? AND inspection_id = ?
    `).bind(mediaId, inspectionId).first() as any;

    if (!media) {
      return c.json({ error: "Mídia não encontrada" }, 404);
    }

    // Delete from Supabase Storage if applicable
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceKey && media.file_url && !media.file_url.startsWith('local:')) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        // Extract path from URL
        const urlParts = media.file_url.split('/inspection-media/');
        if (urlParts[1]) {
          await supabase.storage.from('inspection-media').remove([urlParts[1]]);
        }
      } catch (e) {
        console.error('Error deleting from storage:', e);
      }
    }

    // Delete from database
    await env.DB.prepare(`DELETE FROM inspection_media WHERE id = ?`).bind(mediaId).run();

    return c.json({ success: true, message: "Mídia excluída com sucesso" });

  } catch (error) {
    console.error('Error deleting media:', error);
    return c.json({
      error: "Erro ao excluir mídia",
      details: error instanceof Error ? error.message : "Erro desconhecido"
    }, 500);
  }
});

export default mediaRoutes;
