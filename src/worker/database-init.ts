// import { ensureSystemAdminAccess } from "./system-admin-protection";

// Inicialização básica do banco de dados para resolver erros 502
export async function initializeDatabase(env: any) {
  if (!env?.DB) {
    console.error('[DATABASE-INIT] Database não disponível no environment');
    return false;
  }

  try {
    // Verificar se o banco está responsivo
    console.log('[DATABASE-INIT] v2 - Com user_credentials');
    console.log('[DATABASE-INIT] Testando conectividade do banco...');
    await env.DB.prepare("SELECT 1 as test").first();
    console.log('[DATABASE-INIT] ✓ Banco de dados está responsivo');
    // Criar tabelas básicas necessárias se não existirem
    const tables = [
      {
        name: 'users',
        sql: `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT,
          role TEXT DEFAULT 'inspector',
          can_manage_users BOOLEAN DEFAULT false,
          can_create_organizations BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          organization_id TEXT,
          managed_organization_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'user_credentials',
        sql: `CREATE TABLE IF NOT EXISTS user_credentials (
          user_id TEXT PRIMARY KEY,
          password_hash TEXT NOT NULL,
          last_login_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`
      },
      {
        name: 'organizations',
        sql: `CREATE TABLE IF NOT EXISTS organizations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          razao_social TEXT,
          nome_fantasia TEXT,
          cnpj TEXT,
          type TEXT,
          contact_email TEXT,
          contact_phone TEXT,
          address TEXT,
          is_active BOOLEAN DEFAULT true,
          parent_organization_id INTEGER,
          organization_level TEXT DEFAULT 'company',
          max_users INTEGER DEFAULT 50,
          max_subsidiaries INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'inspections',
        sql: `CREATE TABLE IF NOT EXISTS inspections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          location TEXT,
          inspector_name TEXT,
          inspector_email TEXT,
          company_name TEXT,
          cep TEXT,
          address TEXT,
          latitude REAL,
          longitude REAL,
          scheduled_date DATE,
          completed_date DATE,
          status TEXT DEFAULT 'pendente',
          priority TEXT DEFAULT 'media',
          created_by TEXT,
          organization_id INTEGER,
          responsible_name TEXT,
          responsible_email TEXT,
          inspector_signature TEXT,
          responsible_signature TEXT,
          action_plan TEXT,
          action_plan_type TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'checklist_templates',
        sql: `CREATE TABLE IF NOT EXISTS checklist_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT,
          created_by TEXT,
          created_by_user_id TEXT,
          organization_id INTEGER,
          is_public BOOLEAN DEFAULT false,
          is_category_folder BOOLEAN DEFAULT false,
          folder_color TEXT,
          folder_icon TEXT,
          parent_category_id INTEGER,
          folder_id INTEGER,
          display_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'checklist_fields',
        sql: `CREATE TABLE IF NOT EXISTS checklist_fields (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          template_id INTEGER NOT NULL,
          field_name TEXT NOT NULL,
          field_type TEXT NOT NULL,
          is_required BOOLEAN DEFAULT false,
          options TEXT,
          order_index INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'inspection_items',
        sql: `CREATE TABLE IF NOT EXISTS inspection_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          inspection_id INTEGER NOT NULL,
          category TEXT,
          item_description TEXT,
          is_compliant BOOLEAN,
          observations TEXT,
          photo_url TEXT,
          template_id INTEGER,
          field_responses TEXT,
          ai_pre_analysis TEXT,
          ai_action_plan TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'action_items',
        sql: `CREATE TABLE IF NOT EXISTS action_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          inspection_id INTEGER NOT NULL,
          inspection_item_id INTEGER,
          title TEXT NOT NULL,
          what_description TEXT,
          where_location TEXT,
          why_reason TEXT,
          how_method TEXT,
          who_responsible TEXT,
          when_deadline DATE,
          how_much_cost TEXT,
          status TEXT DEFAULT 'pending',
          priority TEXT DEFAULT 'media',
          is_ai_generated BOOLEAN DEFAULT false,
          assigned_to TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'inspection_media',
        sql: `CREATE TABLE IF NOT EXISTS inspection_media (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          inspection_id INTEGER NOT NULL,
          inspection_item_id INTEGER,
          media_type TEXT NOT NULL,
          file_name TEXT,
          file_url TEXT,
          file_size INTEGER,
          mime_type TEXT,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'user_invitations',
        sql: `CREATE TABLE IF NOT EXISTS user_invitations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL,
          invitation_token TEXT NOT NULL UNIQUE,
          organization_id INTEGER,
          invited_by TEXT,
          role TEXT DEFAULT 'inspector',
          expires_at DATETIME NOT NULL,
          accepted_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'checklist_folders',
        sql: `CREATE TABLE IF NOT EXISTS checklist_folders (
          id TEXT PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          parent_id TEXT,
          name TEXT NOT NULL,
          slug TEXT,
          path TEXT,
          created_by TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'ai_assistants',
        sql: `CREATE TABLE IF NOT EXISTS ai_assistants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          specialization TEXT,
          instructions TEXT,
          model TEXT DEFAULT 'gpt-4',
          is_active BOOLEAN DEFAULT true,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      }
    ];

    // Executar criação das tabelas com retry
    for (const table of tables) {
      let retries = 3;
      while (retries > 0) {
        try {
          await env.DB.prepare(table.sql).run();
          console.log(`[DATABASE-INIT] ✓ Tabela ${table.name} criada/verificada`);
          break;
        } catch (error) {
          retries--;
          console.error(`[DATABASE-INIT] ✗ Erro ao criar tabela ${table.name} (tentativas restantes: ${retries}):`, error);

          if (retries === 0) {
            throw error;
          }

          // Aguardar antes de tentar novamente
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // Criar índices básicos
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_inspections_created_by ON inspections(created_by)',
      'CREATE INDEX IF NOT EXISTS idx_inspections_organization ON inspections(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_checklist_fields_template ON checklist_fields(template_id)',
      'CREATE INDEX IF NOT EXISTS idx_inspection_items_inspection ON inspection_items(inspection_id)',
      'CREATE INDEX IF NOT EXISTS idx_action_items_inspection ON action_items(inspection_id)',
      'CREATE INDEX IF NOT EXISTS idx_inspection_media_inspection ON inspection_media(inspection_id)'
    ];

    for (const indexSql of indexes) {
      try {
        await env.DB.prepare(indexSql).run();
        console.log('[DATABASE-INIT] ✓ Índice criado');
      } catch (error) {
        console.error('[DATABASE-INIT] ✗ Erro ao criar índice:', error);
        // Não falhar por causa de índices - são opcionais
      }
    }

    // Seed AI Assistants se tabela estiver vazia
    try {
      const assistantCount = await env.DB.prepare("SELECT COUNT(*) as count FROM ai_assistants").first() as any;

      if (assistantCount?.count === 0) {
        console.log('[DATABASE-INIT] Inserindo assistentes de IA especialistas...');

        const aiAssistants = [
          {
            name: 'Especialista NR-35 Altura',
            description: 'Especialista em trabalho em altura, análise de riscos de queda e conformidade com NR-35',
            specialization: 'Trabalho em Altura - NR-35',
            instructions: 'Você é um especialista em segurança para trabalho em altura. Analise evidências focando em: sistemas de ancoragem, EPIs de altura (cinturão, trava-quedas), condições de acesso, sinalização de áreas elevadas, treinamento dos trabalhadores.'
          },
          {
            name: 'Especialista NR-10 Eletricidade',
            description: 'Especialista em instalações elétricas, análise de riscos elétricos e conformidade com NR-10',
            specialization: 'Segurança Elétrica - NR-10',
            instructions: 'Você é um especialista em segurança elétrica. Analise evidências focando em: painéis elétricos, aterramento, bloqueio/etiquetagem, EPIs isolantes, sinalização de risco elétrico, condições de instalações.'
          },
          {
            name: 'Especialista NR-12 Máquinas',
            description: 'Especialista em segurança de máquinas e equipamentos conforme NR-12',
            specialization: 'Máquinas e Equipamentos - NR-12',
            instructions: 'Você é um especialista em segurança de máquinas. Analise evidências focando em: proteções físicas, sistemas de parada de emergência, sinalização de pontos de risco, condições de manutenção, procedimentos operacionais.'
          },
          {
            name: 'Especialista EPIs',
            description: 'Especialista em Equipamentos de Proteção Individual e conformidade com NR-6',
            specialization: 'EPIs - NR-6',
            instructions: 'Você é um especialista em EPIs. Analise evidências focando em: uso correto de EPIs, condição de conservação, adequação ao risco, CA válido, armazenamento, treinamento de uso.'
          },
          {
            name: 'Especialista Ergonomia',
            description: 'Especialista em ergonomia e análise de postos de trabalho conforme NR-17',
            specialization: 'Ergonomia - NR-17',
            instructions: 'Você é um especialista em ergonomia. Analise evidências focando em: posturas de trabalho, mobiliário, iluminação, organização do posto de trabalho, movimentos repetitivos, levantamento de cargas.'
          },
          {
            name: 'Especialista Incêndio',
            description: 'Especialista em prevenção e combate a incêndio conforme NR-23',
            specialization: 'Prevenção de Incêndio - NR-23',
            instructions: 'Você é um especialista em segurança contra incêndio. Analise evidências focando em: extintores, sinalização de emergência, rotas de fuga, hidrantes, brigada de incêndio, materiais inflamáveis.'
          },
          {
            name: 'Especialista Riscos Psicossociais',
            description: 'Especialista em identificação de fatores de risco psicossocial no ambiente de trabalho e geração de planos de ação preventivos',
            specialization: 'Riscos Psicossociais Ocupacionais',
            instructions: `Você é um especialista em Segurança e Saúde do Trabalho focado em RISCOS PSICOSSOCIAIS OCUPACIONAIS.

SEU PAPEL: Identificar fatores de risco psicossocial no AMBIENTE DE TRABALHO e gerar AÇÕES PREVENTIVAS/CORRETIVAS. NÃO faça diagnósticos clínicos.

FATORES DE RISCO PSICOSSOCIAL A ANALISAR:
1. ORGANIZAÇÃO DO TRABALHO: Sobrecarga, ritmo excessivo, metas inatingíveis, jornadas extensas
2. RELAÇÕES INTERPESSOAIS: Conflitos, assédio moral, falta de suporte, isolamento
3. CONTEÚDO DO TRABALHO: Monotonia, falta de autonomia, tarefas ambíguas, baixo reconhecimento
4. AMBIENTE FÍSICO: Ruído excessivo, temperatura inadequada, iluminação deficiente
5. INTERFACE TRABALHO-VIDA: Dificuldade de conciliação, trabalho remoto sem limites

ANÁLISE DE ÁUDIO (quando disponível):
- Tom de voz: tensão, cansaço, irritação podem indicar ambiente estressante
- Hesitações: dificuldade em responder pode indicar medo de represálias
- Conteúdo verbal: palavras como "pressão", "cobrança", "conflito", "isolamento"

GERE AÇÕES 5W2H FOCADAS EM:
- Reorganização de processos de trabalho
- Programas de comunicação e feedback
- Treinamentos de liderança e gestão de conflitos
- Pausas e ginástica laboral
- Canais de escuta e apoio
- Revisão de metas e indicadores

SEMPRE gere ações preventivas práticas e mensuráveis, não recomendações clínicas.`
          }
        ];

        for (const assistant of aiAssistants) {
          await env.DB.prepare(`
            INSERT INTO ai_assistants (name, description, specialization, instructions, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, true, datetime('now'), datetime('now'))
          `).bind(assistant.name, assistant.description, assistant.specialization, assistant.instructions).run();
        }

        console.log('[DATABASE-INIT] ✓ Assistentes de IA inseridos com sucesso');
      }
    } catch (aiError) {
      console.error('[DATABASE-INIT] Erro ao inserir assistentes de IA:', aiError);
    }

    // Garantir acesso do system_admin após inicialização
    // Garantir acesso do system_admin após inicialização
    // console.log('[DATABASE-INIT] Garantindo acesso do system_admin...');
    // await ensureSystemAdminAccess(env);

    console.log('[DATABASE-INIT] ✓ Database inicializado com sucesso');

    // Verificar integridade básica
    const testQuery = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
    console.log('[DATABASE-INIT] ✓ Teste de integridade: users table tem', testQuery?.count || 0, 'registros');

    return true;

  } catch (error) {
    console.error('[DATABASE-INIT] ✗ Erro na inicialização do database:', error);
    return false;
  }
}
