
async function check() {
    try {
        const res = await fetch('https://vjlvvmriqerfmztwtewa.supabase.co/functions/v1/api/ai-assistants');
        const json = await res.json();
        console.log('DETAILS:', json.details);
        console.log('STACK HEAD:', json.stack ? json.stack.substring(0, 100) : 'No stack');
    } catch (e) {
        console.error('Error:', e);
    }
}
check();
