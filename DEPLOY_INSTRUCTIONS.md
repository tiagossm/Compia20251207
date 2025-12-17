# Guia de Deploy - COMPIA (Migração)

Este guia cobre os passos finais para colocar a aplicação no ar usando Vercel (Frontend) e Supabase (Backend).

## 1. Pré-requisitos
Certifique-se de ter as CLIs instaladas e logadas:
- Supabase CLI: `npx supabase login`
- Vercel CLI: `npx vercel login`

## 2. Deploy do Backend (Supabase Edge Functions)

A API foi migrada para Edge Functions. Precisamos fazer o deploy da função `api` e configurar as variáveis de ambiente.

1.  **Deploy da Função:**
    Execute no terminal raiz do projeto:
    ```bash
    npx supabase functions deploy api --project-ref vjlvvmriqerfmztwtewa --no-verify-jwt
    ```
    *Nota: `--no-verify-jwt` é usado porque nossa função gerencia o próprio CORS e Auth em alguns casos, ou para evitar verificação dupla desnecessária.*

2.  **Configurar Variáveis de Ambiente no Supabase:**
    Acesse o Dashboard do Supabase > Project Settings > Edge Functions.
    Adicione as seguintes variáveis (Secrets):

    *   `SUPABASE_DB_URL`: Connection string do banco de dados (Transaction Pooler - Porta 6543).
        *   Formato: `postgres://postgres.vjlvvmriqerfmztwtewa:[SUA_SENHA]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
    *   `SUPABASE_URL`: URL do projeto (Ex: `https://vjlvvmriqerfmztwtewa.supabase.co`)
    *   `SUPABASE_ANON_KEY`: Sua chave anon pública.
    *   `OPENAI_API_KEY`: Se tiver funcionalidades de IA.

    *Dica: Você pode definir via CLI também:*
    ```bash
    npx supabase secrets set SUPABASE_DB_URL="postgres://..." --project-ref vjlvvmriqerfmztwtewa
    ```

## 3. Deploy do Frontend (Vercel)

O frontend foi configurado para usar `vercel.json` com rewrites para a API.

1.  **Deploy:**
    Execute no terminal:
    ```bash
    npx vercel
    ```
    - Set up and deploy? **Yes**
    - Scope: **(Selecione seu scope)**
    - Link to existing project? **No**
    - Project name: **compia-app**
    - Directory: **./** (padrão)
    - Auto-detect settings? **No** (Vamos configurar manualmente para garantir)
        - Framework: **Vite**
        - Build Command: `npm run build`
        - Output Directory: `dist/client`

2.  **Variáveis de Ambiente (Vercel):**
    No dashboard da Vercel (ou via CLI durante o setup), configure as variáveis públicas do frontend se necessário (ex: URL da API se não estiver usando rewrites relativos).
    Como configuramos Rewrites no `vercel.json` redirecionando `/api/*`, o frontend deve funcionar chamando `/api/...` localmente.

## 4. Verificação

1.  Acesse a URL gerada pela Vercel.
2.  Tente fazer login.
3.  Verifique se os dados carregam (Inspect -> Network deve mostrar chamadas para `/api/...` retornando 200).

## Solução de Problemas

*   **Erro 500 na API:** Verifique os logs da Edge Function no Dashboard Supabase. Geralmente é falha de conexão com o Banco (`SUPABASE_DB_URL` errada) ou variáveis de ambiente faltando.
*   **Erro de Build Vercel:** Verifique se as dependências do Cloudflare foram removidas corretamente do `package.json` (já fizemos isso).

---
**Status da Migração:**
- [x] Banco de dados: Migrado e Populado (Seed AI Assistants OK).
- [x] Backend Código: Adaptado para Supabase Edge Functions.
- [x] Frontend Config: `vercel.json` e `vite.config.ts` ajustados.
