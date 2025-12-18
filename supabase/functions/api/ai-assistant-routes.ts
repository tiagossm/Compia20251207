import { Hono } from 'hono'

const aiAssistantRoutes = new Hono()

aiAssistantRoutes.post('/chat', (c) => {
    return c.json({
        reply: "O assistente de IA está temporariamente indisponível. Por favor, tente novamente mais tarde.",
        suggestions: []
    })
})

export default aiAssistantRoutes
