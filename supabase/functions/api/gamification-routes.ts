import { Hono } from 'hono'

const gamificationRoutes = new Hono()

gamificationRoutes.get('/stats', (c) => {
    return c.json({
        points: 0,
        level: 1,
        badges: [],
        nextLevelPoints: 100
    })
})

export default gamificationRoutes
