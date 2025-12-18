
// script-audit.ts
export default {
    async fetch(request, env) {
        const users = await env.DB.prepare("SELECT email, role, approval_status, organization_id FROM users").all();
        return new Response(JSON.stringify(users.results, null, 2));
    }
}
