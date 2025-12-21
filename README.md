# COMPIA

**Sistema de Inspeções de Segurança do Trabalho com IA**

## Stack Tecnológica

| Componente | Tecnologia |
|------------|------------|
| **Frontend** | React + Vite + TypeScript |
| **Backend** | Supabase Edge Functions (Hono + Deno) |
| **Banco de Dados** | Supabase PostgreSQL |
| **Storage** | Supabase Storage |
| **Autenticação** | Supabase Auth (Google OAuth) |
| **Deploy Frontend** | Vercel |
| **IA** | OpenAI GPT-4o / Whisper |

## Estrutura do Projeto

```
├── src/react-app/          # Frontend React
├── supabase/functions/api/ # Backend Edge Functions (Supabase)
├── migrations/             # Migrações SQL
└── public/                 # Assets estáticos
```

## Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Rodar dev server (frontend)
npm run dev

# Deploy Edge Functions (Supabase)
supabase functions deploy api
```

## Variáveis de Ambiente

Criar arquivo `.env.local`:
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## Deploy

- **Frontend:** Vercel (automático via Git)
- **Backend:** `supabase functions deploy api`
