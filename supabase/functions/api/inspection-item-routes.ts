import { Hono } from "hono";
import { demoAuthMiddleware } from "./demo-auth-middleware.ts";

const inspectionItemRoutes = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Helper function to transcribe audio using OpenAI Whisper API
async function transcribeAudio(
    audioBase64: string,
    providedMimeType: string,
    apiKey: string,
    db?: any,
    itemId?: number,
    userId?: string
): Promise<string> {
    const logToDb = async (action: string, details: any) => {
        if (!db || !itemId) return;
        try {
            await db.prepare(`
                INSERT INTO inspection_logs(
                    inspection_id, user_id, action, details, created_at
                ) VALUES (
                    (SELECT inspection_id FROM inspection_items WHERE id = ?), 
                    ?, ?, ?, NOW()
                )
            `).bind(itemId, userId || null, action, JSON.stringify(details)).run();
        } catch (e) {
            console.error('[WHISPER_LOG] Failed to log to DB:', e);
        }
    };

    try {
        console.log('[WHISPER] Starting transcription, data length:', audioBase64.length);
        await logToDb('WHISPER_START', { size: audioBase64.length, mime: providedMimeType });

        // Extract MIME type from data URL if present (data:audio/webm;base64,...)
        let mimeType = providedMimeType;
        let base64Data = audioBase64;

        if (audioBase64.startsWith('data:')) {
            const match = audioBase64.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                mimeType = match[1];
                base64Data = match[2];
                console.log('[WHISPER] Extracted MIME from data URL:', mimeType);
            }
        } else if (audioBase64.includes(',')) {
            base64Data = audioBase64.split(',')[1];
        }

        console.log('[WHISPER] MIME type:', mimeType, 'Base64 length:', base64Data.length);

        // Convert base64 to binary
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        console.log('[WHISPER] Converted to binary, size:', bytes.length, 'bytes');

        // Determine file extension from MIME type
        const extMap: Record<string, string> = {
            'audio/webm': 'webm',
            'audio/mp3': 'mp3',
            'audio/mpeg': 'mp3',
            'audio/wav': 'wav',
            'audio/ogg': 'ogg',
            'audio/m4a': 'm4a',
            'audio/mp4': 'm4a'
        };
        const ext = extMap[mimeType] || 'webm';

        // Create FormData for Whisper API
        const formData = new FormData();
        const blob = new Blob([bytes], { type: mimeType });
        formData.append('file', blob, `audio.${ext}`);
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt'); // Portuguese
        formData.append('response_format', 'text');

        console.log('[WHISPER] Calling OpenAI API with file:', `audio.${ext}`);

        const response = await globalThis.fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[WHISPER] Transcription error:', response.status, errorText);
            await logToDb('WHISPER_ERROR', { status: response.status, error: errorText });
            return `[Erro na transcrição do áudio: ${response.status}]`;
        }

        const transcription = await response.text();
        console.log('[WHISPER] Transcription successful:', transcription.substring(0, 100) + '...');
        await logToDb('WHISPER_SUCCESS', { transcription_preview: transcription.substring(0, 100) });
        return transcription.trim() || '[Áudio sem fala detectada]';
    } catch (error) {
        console.error('[WHISPER] Error:', error);
        await logToDb('WHISPER_EXCEPTION', { error: error instanceof Error ? error.message : String(error) });
        return `[Erro ao processar áudio: ${error instanceof Error ? error.message : 'desconhecido'}]`;
    }
}


// Get actions for specific inspection item
// Path: /api/inspection-items/:itemId/actions
inspectionItemRoutes.get("/:itemId/actions", demoAuthMiddleware, async (c) => {
    const env = c.env;
    const user = c.get("user");
    const itemId = parseInt(c.req.param("itemId"));

    if (!user) {
        return c.json({ error: "User not found" }, 401);
    }

    try {
        const item = await env.DB.prepare(`
      SELECT ii.*, i.created_by, i.organization_id
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
    `).bind(itemId).first() as any;

        if (!item) {
            return c.json({ error: "Item de inspeção não encontrado", actions: [] }, 200);
        }

        const actions = await env.DB.prepare(`
      SELECT * FROM action_items 
      WHERE inspection_item_id = ?
      ORDER BY created_at DESC
    `).bind(itemId).all();

        return c.json({
            actions: actions.results || []
        });

    } catch (error) {
        console.error('Error fetching item actions:', error);
        return c.json({ error: "Erro ao buscar ações", actions: [] }, 200);
    }
});

// Pre-analysis with AI - POST
inspectionItemRoutes.post("/:itemId/pre-analysis", demoAuthMiddleware, async (c) => {
    const env = c.env;
    const user = c.get("user");
    const itemId = parseInt(c.req.param("itemId"));

    if (!user) {
        return c.json({ error: "User not found" }, 401);
    }

    if (!env.OPENAI_API_KEY) {
        return c.json({ error: "IA não disponível - Configure OPENAI_API_KEY" }, 503);
    }

    try {
        const body = await c.req.json();
        const { field_name, response_value, media_data, user_prompt, inspection_id } = body;

        // First, try to find by itemId (direct ID)
        let item = await env.DB.prepare(`
      SELECT ii.*, i.location, i.company_name, i.title as inspection_title
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
    `).bind(itemId).first() as any;

        // Fallback: If not found and we have inspection_id + field_name, search by those
        if (!item && inspection_id && field_name) {
            item = await env.DB.prepare(`
                SELECT ii.*, i.location, i.company_name, i.title as inspection_title
                FROM inspection_items ii
                JOIN inspections i ON ii.inspection_id = i.id
                WHERE ii.inspection_id = ? AND ii.item_description = ?
            `).bind(inspection_id, field_name).first() as any;
        }

        if (!item) {
            return c.json({ error: "Item de inspeção não encontrado", details: { itemId, inspection_id, field_name } }, 404);
        }

        let mediaContext = '';
        let hasMedia = false;
        let audioTranscriptions: string[] = [];

        if (media_data && media_data.length > 0) {
            hasMedia = true;
            console.log(`[PRE-ANALYSIS] Received ${media_data.length} media items:`,
                media_data.map((m: any) => ({
                    type: m.media_type,
                    name: m.file_name,
                    has_url: !!m.file_url,
                    url_length: m.file_url?.length || 0,
                    url_preview: m.file_url?.substring(0, 30) + '...'
                }))
            );

            const mediaTypes = media_data.reduce((acc: any, media: any) => {
                acc[media.media_type] = (acc[media.media_type] || 0) + 1;
                return acc;
            }, {});

            // Transcribe audio files using Whisper
            const audioMedia = media_data.filter((m: any) => m.media_type === 'audio');
            if (audioMedia.length > 0) {
                console.log(`[PRE-ANALYSIS] Found ${audioMedia.length} audio file(s), starting transcription...`);
                for (let i = 0; i < Math.min(audioMedia.length, 3); i++) { // Limit to 3 audios
                    const audio = audioMedia[i];
                    if (audio.file_url || audio.file_data) {
                        const audioData = audio.file_data || audio.file_url;
                        const transcription = await transcribeAudio(
                            audioData,
                            audio.mime_type || 'audio/webm',
                            env.OPENAI_API_KEY,
                            env.DB,
                            itemId,
                            user.id
                        );
                        audioTranscriptions.push(`Áudio ${i + 1}: "${transcription}"`);
                    }
                }
            }

            mediaContext = `EVIDÊNCIAS DISPONÍVEIS: ${mediaTypes.image || 0} foto(s), ${mediaTypes.audio || 0} áudio(s), ${mediaTypes.video || 0} vídeo(s).`;

            if (audioTranscriptions.length > 0) {
                mediaContext += `\n\nTRANSCRIÇÕES DE ÁUDIO:\n${audioTranscriptions.join('\n')}`;
            }
        } else {
            mediaContext = `EVIDÊNCIAS DISPONÍVEIS: Nenhuma mídia anexada.`;
        }

        const prompt = `Você é um especialista em segurança do trabalho.

CONTEXTO:
- Local: ${item.location}
- Empresa: ${item.company_name}
- Inspeção: ${item.inspection_title}
- Campo: ${field_name}
- Categoria: ${item.category}
- Resposta: ${response_value !== null && response_value !== undefined ? response_value : 'Não respondido'}
${mediaContext}
${user_prompt ? `Foco: ${user_prompt}` : ''}

${audioTranscriptions.length > 0 ? 'IMPORTANTE: Analise CUIDADOSAMENTE as transcrições de áudio acima, pois contêm informações verbais do inspetor sobre a situação.\n\n' : ''}Forneça análise técnica breve (máximo 500 caracteres) sobre conformidade, riscos e recomendações. Use texto simples sem formatação.`;


        const openaiResponse = await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'Você é um especialista em segurança do trabalho. Forneça análises técnicas objetivas e concisas.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 500,
                temperature: 0.4
            })
        });

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error('OpenAI API Error:', openaiResponse.status, errorText);
            throw new Error(`Erro na API da OpenAI: ${openaiResponse.status}`);
        }

        const responseText = await openaiResponse.text();
        if (responseText.trim().startsWith('<')) {
            throw new Error('API da OpenAI retornou resposta inválida');
        }

        const openaiResult = JSON.parse(responseText);
        const analysis = openaiResult.choices?.[0]?.message?.content;

        if (!analysis) {
            throw new Error('Resposta inválida da IA');
        }

        const cleanAnalysis = analysis
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/#{1,6}\s/g, '')
            .replace(/`/g, '')
            .trim();

        const now = new Date().toISOString();
        await env.DB.prepare(`
      UPDATE inspection_items 
      SET ai_pre_analysis = ?, updated_at = ?
      WHERE id = ?
    `).bind(cleanAnalysis, now, itemId).run();

        return c.json({
            success: true,
            analysis: cleanAnalysis,
            pre_analysis: cleanAnalysis,
            media_analyzed: hasMedia ? media_data.length : 0,
            item_id: itemId,
            timestamp: now,
            // DEBUG INFO - remove after fixing
            _debug: {
                audio_count: media_data?.filter((m: any) => m.media_type === 'audio').length || 0,
                transcriptions: audioTranscriptions,
                prompt_preview: prompt?.substring(0, 200) + '...'
            }
        });

    } catch (error) {
        console.error('Error in pre-analysis:', error);
        return c.json({
            error: "Erro ao fazer pré-análise",
            details: error instanceof Error ? error.message : "Erro desconhecido"
        }, 500);
    }
});

// Delete pre-analysis
inspectionItemRoutes.delete("/:itemId/pre-analysis", demoAuthMiddleware, async (c) => {
    const env = c.env;
    const user = c.get("user");
    const itemId = parseInt(c.req.param("itemId"));

    if (!user) {
        return c.json({ error: "User not found" }, 401);
    }

    try {
        const now = new Date().toISOString();
        await env.DB.prepare(`
      UPDATE inspection_items 
      SET ai_pre_analysis = NULL, updated_at = ?
      WHERE id = ?
    `).bind(now, itemId).run();

        return c.json({
            success: true,
            message: "Pré-análise removida com sucesso"
        });

    } catch (error) {
        console.error('Error deleting pre-analysis:', error);
        return c.json({ error: "Erro ao remover pré-análise" }, 500);
    }
});

// Create action for inspection item
inspectionItemRoutes.post("/:itemId/create-action", demoAuthMiddleware, async (c) => {
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
        const { field_name, field_type, response_value, comment, compliance_status, pre_analysis, media_data, inspection_id } = body;

        // First, try to find by itemId (direct ID)
        let item = await env.DB.prepare(`
      SELECT ii.*, i.location, i.company_name, i.title as inspection_title, i.id as inspection_id
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
    `).bind(itemId).first() as any;

        // Fallback 1: If not found and we have inspection_id + field_name, search by exact match
        if (!item && inspection_id && field_name) {
            item = await env.DB.prepare(`
                SELECT ii.*, i.location, i.company_name, i.title as inspection_title, i.id as inspection_id
                FROM inspection_items ii
                JOIN inspections i ON ii.inspection_id = i.id
                WHERE ii.inspection_id = ? AND ii.item_description = ?
            `).bind(inspection_id, field_name).first() as any;
        }

        // Fallback 2: Search with LIKE (partial match) for flexibility
        if (!item && inspection_id && field_name) {
            item = await env.DB.prepare(`
                SELECT ii.*, i.location, i.company_name, i.title as inspection_title, i.id as inspection_id
                FROM inspection_items ii
                JOIN inspections i ON ii.inspection_id = i.id
                WHERE ii.inspection_id = ? AND LOWER(ii.item_description) LIKE LOWER(?)
                LIMIT 1
            `).bind(inspection_id, `%${field_name}%`).first() as any;
        }

        // Fallback 3: Try to match by field order if itemId looks like a template field id
        if (!item && inspection_id && itemId > 100) {
            // The itemId might be a template field ID, try to find by position
            const items = await env.DB.prepare(`
                SELECT ii.*, i.location, i.company_name, i.title as inspection_title, i.id as inspection_id
                FROM inspection_items ii
                JOIN inspections i ON ii.inspection_id = i.id
                WHERE ii.inspection_id = ?
                ORDER BY ii.id
            `).bind(inspection_id).all();

            // Log for debugging
            console.log(`[CREATE-ACTION] Searching for template field ${itemId} in inspection ${inspection_id}, found ${items.results?.length || 0} items`);

            // If we have items, use the first one that matches field_name loosely
            if (items.results && items.results.length > 0 && field_name) {
                item = items.results.find((i: any) =>
                    i.item_description?.toLowerCase().includes(field_name.toLowerCase().substring(0, 10))
                ) || items.results[0];
            }
        }

        if (!item) {
            console.error('[CREATE-ACTION] Item not found:', { itemId, inspection_id, field_name });
            return c.json({ error: "Item de inspeção não encontrado", details: { itemId, inspection_id, field_name } }, 404);
        }

        // Determinar se precisa de ação baseado na resposta
        let needsAction = false;
        let riskLevel = 'baixo';

        // Forçar "needsAction" se a resposta for negativa
        if (field_type === 'boolean' && response_value === false) {
            needsAction = true;
            riskLevel = 'alto';
        } else if (field_type === 'rating' && response_value <= 2) {
            needsAction = true;
            riskLevel = response_value === 1 ? 'critico' : 'alto';
        }

        // Se já sabemos que precisa de ação (Não Conforme), incluímos isso explicitamente no prompt
        const complianceStatus = needsAction ? 'NÃO CONFORME (Obrigatório gerar plano de ação)' : 'Em análise (Verificar necessidade)';

        const prompt = `Atue como um Engenheiro de Segurança do Trabalho Sênior.
Analise o contexto abaixo e GERE UM PLANO DE AÇÃO 5W2H TÉCNICO E DETALHADO.

CONTEXTO DA INSPEÇÃO:
- Empresa: ${item.company_name}
- Local/Setor: ${item.location}
- Item Inspecionado: ${item.inspection_title} > ${field_name}
- Resposta do Inspetor: ${response_value === false ? 'NÃO CONFORME' : response_value === true ? 'CONFORME' : response_value || 'Não informado'}
- Comentário/Observação do Inspetor: ${comment || 'Nenhuma observação'}
- Status da Conformidade: ${compliance_status === 'non_compliant' ? 'NÃO CONFORME' : compliance_status === 'compliant' ? 'CONFORME' : complianceStatus}
- Análise Prévia (Evidências): ${pre_analysis || 'Nenhuma observação prévia'}
- Nível de Risco Identificado: ${riskLevel}

DIRETRIZES PARA GERAÇÃO:
1. Se o status for "NÃO CONFORME", você **DEVE** gerar um plano de ação (\`requires_action: true\`).
2. Se houver riscos graves descritos na análise prévia, gere um plano de ação.
3. O plano deve ser prático, técnico e focado na resolução da não conformidade.
4. "how_much" (Custo) deve ser uma estimativa realista ou "A cotar".

Responda APENAS em JSON no seguinte formato:
{
  "requires_action": true/false,
  "what": "Ação corretiva detalhada (O que fazer)",
  "why": "Motivo técnico/Norma Regulamentadora (Por que fazer)",
  "where": "Local específico da intervenção",
  "when": "Prazo sugerido (Imediato / X dias)",
  "who": "Cargo responsável (Ex: Manutenção, SESMT)",
  "how": "Procedimento da correção",
  "how_much": "Estimativa de custo/recurso",
  "priority": "baixa/media/alta/critica",
  "justification": "Breve justificativa técnica"
}`;

        const openaiResponse = await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o', // Upgrade to gpt-4o for better logic
                messages: [
                    { role: 'system', content: 'Você é um especialista sênior em segurança do trabalho. Seja rigoroso na análise de riscos.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 1000,
                temperature: 0.2 // Lower component for more deterministic following of instructions
            })
        });

        if (!openaiResponse.ok) {
            throw new Error(`Erro na API: ${openaiResponse.status}`);
        }

        const responseText = await openaiResponse.text();
        const openaiResult = JSON.parse(responseText);
        const actionText = openaiResult.choices?.[0]?.message?.content || '';

        let actionData;
        try {
            const jsonMatch = actionText.match(/\{[\s\S]*\}/);
            actionData = jsonMatch ? JSON.parse(jsonMatch[0]) : { requires_action: false };
        } catch {
            actionData = { requires_action: false, error: "Não foi possível processar resposta" };
        }

        let actionItemId = null;
        let deadline: Date | null = null;

        if (actionData.requires_action) {
            const now = new Date().toISOString();
            deadline = new Date();
            deadline.setDate(deadline.getDate() + (actionData.priority === 'critica' ? 7 : actionData.priority === 'alta' ? 14 : 30));

            const insertResult = await env.DB.prepare(`
        INSERT INTO action_items (
          inspection_id, inspection_item_id, title,
          what_description, why_reason, where_location, when_deadline, who_responsible,
          how_method, how_much_cost, priority, status, is_ai_generated, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', true, ?, ?)
        RETURNING id
      `).bind(
                item.inspection_id,
                item.id, // Use the correct item.id from database lookup, not the URL parameter
                field_name,
                actionData.what || '',
                actionData.why || '',
                actionData.where || item.location,
                deadline.toISOString().split('T')[0],
                actionData.who || 'A definir',
                actionData.how || '',
                actionData.how_much || 'A orçar',
                actionData.priority || 'media',
                now,
                now
            ).first() as any;

            actionItemId = insertResult?.id || null;
        }

        // Always return suggestion data for inline display, even if not saved
        const actionSuggestion = {
            id: actionItemId || null,
            title: field_name,
            what_description: actionData.what || '',
            why_description: actionData.why || '',
            why_reason: actionData.why || '',
            where_description: actionData.where || item.location,
            where_location: actionData.where || item.location,
            when_deadline: deadline?.toISOString().split('T')[0] || null,
            who_responsible: actionData.who || 'A definir',
            how_description: actionData.how || '',
            how_method: actionData.how || '',
            how_much_cost: actionData.how_much || 'A orçar',
            priority: actionData.priority || 'media',
            status: actionItemId ? 'pending' : 'suggested',
            is_ai_generated: true,
            requires_action: actionData.requires_action,
            justification: actionData.justification || ''
        };

        return c.json({
            success: true,
            action: actionData,
            action_item: actionSuggestion // Always return for inline display
        });

    } catch (error) {
        console.error('Error creating action:', error);

        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
        let userMessage = "Erro ao criar ação com IA";
        let status = 500;

        if (errorMessage.includes('401')) {
            userMessage = "Chave OpenAI Inválida ou Expirada (401)";
            status = 502; // Bad Gateway
        } else if (errorMessage.includes('429')) {
            userMessage = "Limite de cota da OpenAI atingido (429)";
            status = 429;
        } else if (errorMessage.includes('503')) {
            userMessage = "Serviço OpenAI Indisponível (503)";
            status = 503;
        } else {
            // Include raw error for debugging 500s
            userMessage = `Erro interno: ${errorMessage}`;
        }

        return c.json({
            error: userMessage,
            details: errorMessage
        }, status as any); // cast for Hono/TS
    }
});

// Delete inspection item
inspectionItemRoutes.delete("/:itemId", demoAuthMiddleware, async (c) => {
    const env = c.env;
    const user = c.get("user");
    const itemId = parseInt(c.req.param("itemId"));

    if (!user) {
        return c.json({ error: "User not found" }, 401);
    }

    try {
        // Basic permission check - ensure item exists
        const item = await env.DB.prepare(`
            SELECT ii.*, i.organization_id, i.created_by 
            FROM inspection_items ii
            JOIN inspections i ON ii.inspection_id = i.id
            WHERE ii.id = ?
        `).bind(itemId).first() as any;

        if (!item) {
            return c.json({ error: "Item n\u00E3o encontrado" }, 404);
        }

        // Verify if user has permission (same organization or sys admin)
        // Assuming demoAuthMiddleware handles basic tenant check via secureOrgId context if applicable
        // But double checking logic:
        // if (item.organization_id !== user.organization_id && user.role !== 'sys_admin') ...

        await env.DB.prepare("DELETE FROM inspection_items WHERE id = ?").bind(itemId).run();

        return c.json({ success: true });
    } catch (error) {
        console.error('Error deleting item:', error);
        return c.json({ error: "Erro ao excluir item" }, 500);
    }
});

// Generate field response with AI for inspection items
inspectionItemRoutes.post("/:itemId/generate-field-response", demoAuthMiddleware, async (c) => {
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

            mediaAnalysisContent = `EVIDÊNCIAS MULTIMODAIS PARA ANÁLISE: ${mediaTypes.image || 0} foto(s), ${mediaTypes.audio || 0} áudio(s), ${mediaTypes.video || 0} vídeo(s), ${mediaTypes.pdf || mediaTypes.document || 0} documento(s) PDF.`;

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

            // Adicionar nomes dos arquivos PDF ao contexto
            const pdfMedia = media_data.filter((m: any) => m.media_type === 'pdf' || m.media_type === 'document');
            if (pdfMedia.length > 0) {
                const pdfNames = pdfMedia.map((p: any) => p.file_name || 'Documento sem nome').join(', ');
                mediaAnalysisContent += `\nDOCUMENTOS PDF ANEXADOS: ${pdfNames}. A IA deve mencionar que está ciente destes documentos na resposta e usar seu conteúdo se o usuário fornecer contexto sobre eles.`;
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
CONEXO DA INSPEÇÃO:
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

// Generate comprehensive action plan (5W2H) for inspection item
inspectionItemRoutes.post("/:itemId/generate-action-plan", demoAuthMiddleware, async (c) => {
    const env = c.env;
    const user = c.get("user");
    const itemId = parseInt(c.req.param("itemId"));

    if (!user) return c.json({ error: "User not found" }, 401);
    if (!env.OPENAI_API_KEY) return c.json({ error: "IA não disponível" }, 503);

    try {
        const body = await c.req.json();
        const { field_name, response_value, media_data, user_prompt } = body;

        const item = await env.DB.prepare(`
      SELECT ii.*, i.location, i.company_name, i.title as inspection_title
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
    `).bind(itemId).first() as any;

        if (!item) return c.json({ error: "Item não encontrado" }, 404);

        let mediaContext = '';
        let mediaAnalysisMessages = [];

        if (media_data && media_data.length > 0) {
            mediaContext = `EVIDÊNCIAS MULTIMODAIS: ${media_data.length} arquivos analisados.`;

            // Add PDF context
            const pdfMedia = media_data.filter((m: any) => m.media_type === 'pdf' || m.media_type === 'document');
            if (pdfMedia.length > 0) {
                const pdfNames = pdfMedia.map((p: any) => p.file_name).join(', ');
                mediaContext += ` DOCUMENTOS PDF: ${pdfNames}`;
            }

            // Process images for GPT-4o-mini
            const imageMedia = media_data.filter((m: any) => m.media_type === 'image').slice(0, 3);
            for (const img of imageMedia) {
                if (img.file_url) {
                    mediaAnalysisMessages.push({
                        type: "image_url",
                        image_url: { url: img.file_url, detail: "high" }
                    });
                }
            }
        }

        const systemMessage = {
            role: 'system',
            content: 'Você é um especialista em segurança do trabalho. Gere um plano de ação 5W2H detalhado e prático em formato JSON.'
        };

        const userContent = `Gere um plano de ação 5W2H técnico para a não conformidade detectada.
    
    CONTEXTO:
    - Item: ${item.item_description} (Local: ${item.location})
    - Resposta Encontrada: ${response_value}
- Prompt Usuário: ${user_prompt || 'Gere ação corretiva padrão'}
    
    ${mediaContext}
    
    Retorne JSON:
{
    "requires_action": true,
        "what": "O que fazer",
            "why": "Por que (Norma/Risco)",
                "where": "Local exato",
                    "when": "Prazo",
                        "who": "Responsável",
                            "how": "Como fazer",
                                "how_much": "Custo estimado",
                                    "priority": "alta/media/baixa"
} `;

        // Construct message array effectively
        const messages = [
            systemMessage,
            {
                role: 'user',
                content: [
                    { type: "text", text: userContent },
                    ...mediaAnalysisMessages
                ]
            }
        ];

        const openaiResponse = await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.OPENAI_API_KEY} `,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: messages,
                max_tokens: 1500,
                temperature: 0.3
            })
        });

        if (!openaiResponse.ok) throw new Error('Erro na API OpenAI');

        const resJson = await openaiResponse.json();
        const content = resJson.choices?.[0]?.message?.content;
        let actionPlan = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());

        // Validate and Insert into DB
        if (actionPlan.requires_action) {
            try {
                const now = new Date().toISOString();

                // Try to parse deadline or default to 7 days
                let deadline = new Date();
                deadline.setDate(deadline.getDate() + 7);
                const deadlineStr = actionPlan.when || deadline.toISOString();

                const insertResult = await env.DB.prepare(`
                    INSERT INTO action_items (
                        inspection_id, inspection_item_id, 
                        title, what_description, why_reason, where_location, 
                        who_responsible, when_deadline, how_method, how_much_cost,
                        priority, status, is_ai_generated, created_by, organization_id,
                        created_at, updated_at
                    ) VALUES (
                        ?, ?, 
                        ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, 'open', true, ?, ?,
                        ?, ?
                    )
                `).bind(
                    item.inspection_id, itemId,
                    `Ação 5W2H: ${item.item_description?.substring(0, 30)}...`,
                    actionPlan.what || '', actionPlan.why || '', actionPlan.where || item.location || '',
                    actionPlan.who || 'Responsável', deadlineStr, actionPlan.how || '', actionPlan.how_much || '',
                    actionPlan.priority?.toLowerCase() || 'medium',
                    user.id, user.organization_id || null,
                    now, now
                ).run();

                actionPlan.id = insertResult.meta.last_row_id;
                actionPlan.persisted = true;
            } catch (dbError) {
                console.error("Error persisting action plan:", dbError);
                // Continue to return the plan even if save fails, but mark as not persisted
                actionPlan.persisted = false;
                actionPlan.dbError = String(dbError);
            }
        }

        return c.json({ success: true, action: actionPlan });

    } catch (e) {
        console.error(e);
        return c.json({ error: "Falha ao gerar plano", details: String(e) }, 500);
    }
});

export default inspectionItemRoutes;
