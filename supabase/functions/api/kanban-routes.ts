import { Hono } from 'hono'

const kanbanRoutes = new Hono()

kanbanRoutes.get('/:orgId/items', (c) => {
    return c.json({ items: [] })
})

kanbanRoutes.put('/:orgId/items/:itemId/move', (c) => {
    return c.json({ success: true })
})

export default kanbanRoutes
