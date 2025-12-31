/**
 * AI Service Module - Gemini Primary with OpenAI Fallback
 * 
 * Responsável por:
 * - Tentar Gemini primeiro (mais barato)
 * - Fazer fallback para OpenAI se Gemini falhar
 * - Logar qual provider foi utilizado
 */

interface AICompletionOptions {
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
}

interface AICompletionResult {
    success: boolean;
    content: string;
    provider: 'gemini' | 'openai';
    model: string;
    error?: string;
    fallbackUsed?: boolean;
}

/**
 * Chama a API do Gemini (Google AI)
 */
async function callGemini(
    apiKey: string,
    options: AICompletionOptions
): Promise<{ success: boolean; content?: string; error?: string }> {
    const { systemPrompt, userPrompt, maxTokens = 1500, temperature = 0.3, timeoutMs = 60000 } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: `${systemPrompt}\n\n${userPrompt}` }
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: temperature,
                        maxOutputTokens: maxTokens,
                        responseMimeType: 'application/json'
                    },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                    ]
                }),
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[AI-SERVICE] Gemini API Error:', response.status, errorText);
            return { success: false, error: `Gemini error ${response.status}: ${errorText}` };
        }

        const data = await response.json();

        // Extract content from Gemini response
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
            return { success: false, error: 'Gemini returned empty response' };
        }

        console.log('[AI-SERVICE] Gemini success, content length:', content.length);
        return { success: true, content };

    } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            return { success: false, error: 'Gemini request timed out' };
        }

        console.error('[AI-SERVICE] Gemini exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Chama a API do OpenAI
 */
async function callOpenAI(
    apiKey: string,
    options: AICompletionOptions
): Promise<{ success: boolean; content?: string; error?: string }> {
    const { systemPrompt, userPrompt, maxTokens = 1500, temperature = 0.3, timeoutMs = 60000 } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: maxTokens,
                temperature: temperature
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[AI-SERVICE] OpenAI API Error:', response.status, errorText);
            return { success: false, error: `OpenAI error ${response.status}: ${errorText}` };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return { success: false, error: 'OpenAI returned empty response' };
        }

        console.log('[AI-SERVICE] OpenAI success, content length:', content.length);
        return { success: true, content };

    } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            return { success: false, error: 'OpenAI request timed out' };
        }

        console.error('[AI-SERVICE] OpenAI exception:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Função principal: tenta Gemini primeiro, depois OpenAI como fallback
 */
export async function generateAICompletion(
    geminiKey: string | undefined,
    openaiKey: string | undefined,
    options: AICompletionOptions
): Promise<AICompletionResult> {

    // 1. Tentar Gemini primeiro (se disponível)
    if (geminiKey && geminiKey.trim()) {
        console.log('[AI-SERVICE] Tentando Gemini primeiro...');

        const geminiResult = await callGemini(geminiKey.trim(), options);

        if (geminiResult.success && geminiResult.content) {
            return {
                success: true,
                content: geminiResult.content,
                provider: 'gemini',
                model: 'gemini-1.5-flash',
                fallbackUsed: false
            };
        }

        console.log('[AI-SERVICE] Gemini falhou:', geminiResult.error);
    } else {
        console.log('[AI-SERVICE] Gemini API key não disponível, pulando para OpenAI...');
    }

    // 2. Fallback para OpenAI
    if (openaiKey && openaiKey.trim()) {
        console.log('[AI-SERVICE] Usando OpenAI como fallback...');

        const openaiResult = await callOpenAI(openaiKey.trim(), options);

        if (openaiResult.success && openaiResult.content) {
            return {
                success: true,
                content: openaiResult.content,
                provider: 'openai',
                model: 'gpt-4o-mini',
                fallbackUsed: !!geminiKey // Se tinha Gemini key, foi fallback
            };
        }

        return {
            success: false,
            content: '',
            provider: 'openai',
            model: 'gpt-4o-mini',
            error: openaiResult.error || 'OpenAI failed',
            fallbackUsed: !!geminiKey
        };
    }

    // 3. Nenhum provider disponível
    return {
        success: false,
        content: '',
        provider: 'openai',
        model: 'none',
        error: 'Nenhum provedor de IA configurado (GEMINI_API_KEY ou OPENAI_API_KEY)'
    };
}

/**
 * Verifica status dos providers de IA
 */
export async function checkAIProvidersStatus(
    geminiKey: string | undefined,
    openaiKey: string | undefined
): Promise<{ gemini: 'available' | 'unavailable' | 'error'; openai: 'available' | 'unavailable' | 'error' }> {
    const status = {
        gemini: 'unavailable' as 'available' | 'unavailable' | 'error',
        openai: 'unavailable' as 'available' | 'unavailable' | 'error'
    };

    // Quick health check for Gemini
    if (geminiKey) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
                { method: 'GET' }
            );
            status.gemini = response.ok ? 'available' : 'error';
        } catch {
            status.gemini = 'error';
        }
    }

    // Quick health check for OpenAI
    if (openaiKey) {
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${openaiKey}` }
            });
            status.openai = response.ok ? 'available' : 'error';
        } catch {
            status.openai = 'error';
        }
    }

    return status;
}
