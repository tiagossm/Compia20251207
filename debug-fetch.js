
async function check() {
    try {
        const res = await fetch('https://vjlvvmriqerfmztwtewa.supabase.co/functions/v1/api/ai-assistants');
        console.log('Status:', res.status);
        const json = await res.json();
        console.log('Body:', JSON.stringify(json, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}
check();
