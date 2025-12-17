-- Migration to insert/update 38 NR Checklist Templates
-- Includes specific technical content for NR-06, 10, 12, 17, 35
-- Uses generic template for others.

BEGIN;

-- Helper function to create or update NR template with flexible fields
CREATE OR REPLACE FUNCTION upsert_nr_template(
    p_name TEXT, 
    p_description TEXT, 
    p_category TEXT,
    p_fields JSONB
) RETURNS VOID AS $$
DECLARE
    v_template_id BIGINT;
    v_field JSONB;
    v_idx INT;
BEGIN
    -- 1. Check if template exists
    SELECT id INTO v_template_id FROM checklist_templates WHERE name = p_name AND category = p_category;

    -- 2. Create or Update Template
    IF v_template_id IS NULL THEN
        INSERT INTO checklist_templates (
            name, description, category, is_public, created_at, updated_at
        ) VALUES (
            p_name, p_description, p_category, true, NOW(), NOW()
        ) RETURNING id INTO v_template_id;
    ELSE
        -- Update existing template metadata
        UPDATE checklist_templates 
        SET description = p_description, updated_at = NOW() 
        WHERE id = v_template_id;
        
        -- Delete existing fields to replace with new structure
        DELETE FROM checklist_fields WHERE template_id = v_template_id;
    END IF;

    -- 3. Insert Fields from JSON Array
    v_idx := 0;
    FOR v_field IN SELECT * FROM jsonb_array_elements(p_fields)
    LOOP
        v_idx := v_idx + 1;
        INSERT INTO checklist_fields (
            template_id, field_name, field_type, is_required, options, order_index
        ) VALUES (
            v_template_id,
            v_field->>'field_name',
            v_field->>'field_type',
            (v_field->>'is_required')::BOOLEAN,
            v_field->>'options',
            v_idx
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- --- SPECIFIC CHECKLISTS ---

-- NR-06 - EPI
SELECT upsert_nr_template(
    'NR-06 - Equipamento de Proteção Individual - EPI',
    'Checklist de validação de Conformidade com a NR-06 (EPIs)',
    'Normas Regulamentadoras (NR)',
    '[
        {"field_name": "Os EPIs fornecidos são adequados aos riscos da atividade?", "field_type": "select", "is_required": true, "options": "[\"Conforme\", \"Não Conforme\", \"Não Aplicável\"]"},
        {"field_name": "Os funcionários foram treinados quanto ao uso correto, guarda e conservação?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Existe registro de entrega (Ficha de EPI) assinado pelo colaborador?", "field_type": "file", "is_required": true},
        {"field_name": "Os EPIs encontram-se em bom estado de conservação e funcionamento?", "field_type": "select", "is_required": true, "options": "[\"Conforme\", \"Não Conforme\", \"Não Aplicável\"]"},
        {"field_name": "O Certificado de Aprovação (CA) dos EPIs está válido?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Foto de evidência do uso ou condição do EPI", "field_type": "file", "is_required": false},
        {"field_name": "Observações sobre inadequações ou necessidades de troca", "field_type": "textarea", "is_required": false}
    ]'::JSONB
);

-- NR-10 - Eletricidade
SELECT upsert_nr_template(
    'NR-10 - Segurança em Instalações e Serviços em Eletricidade',
    'Auditoria de segurança em instalações elétricas conforme NR-10',
    'Normas Regulamentadoras (NR)',
    '[
        {"field_name": "As instalações elétricas possuem projeto atualizado (diagramas unifilares)?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\", \"Parcial\"]"},
        {"field_name": "O Prontuário de Instalações Elétricas (PIE) está organizado e acessível?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\", \"Não Aplicável\"]"},
        {"field_name": "Os trabalhadores autorizados possuem treinamento de NR-10 (Básico/SEP) válido?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "As áreas de risco elétrico estão devidamente sinalizadas e delimitadas?", "field_type": "select", "is_required": true, "options": "[\"Conforme\", \"Não Conforme\"]"},
        {"field_name": "Existe sistema de aterramento e os laudos de SPDA estão vigentes?", "field_type": "file", "is_required": false},
        {"field_name": "Os quadros e painéis elétricos estão travados e livres de obstruções?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Evidência de EPIs/EPCs para eletricidade (Vestimentas RF, Bastões, etc)", "field_type": "file", "is_required": false}
    ]'::JSONB
);

-- NR-12 - Máquinas e Equipamentos
SELECT upsert_nr_template(
    'NR-12 - Segurança no Trabalho em Máquinas e Equipamentos',
    'Inspeção de proteções e segurança em máquinas (NR-12)',
    'Normas Regulamentadoras (NR)',
    '[
        {"field_name": "As zonas de perigo das máquinas possuem proteções fixas ou móveis?", "field_type": "select", "is_required": true, "options": "[\"Conforme\", \"Não Conforme\", \"Parcial\"]"},
        {"field_name": "Os dispositivos de parada de emergência estão acessíveis e funcionais?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Existe manual de instruções fornecido pelo fabricante em português?", "field_type": "select", "is_required": false, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "A manutenção preventiva/corretiva está registrada em livro próprio?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "O piso ao redor da máquina está limpo, nivelado e livre de obstruções?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Sinalização de segurança da máquina está visível e legível?", "field_type": "select", "is_required": false, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Foto da proteção da máquina/equipamento", "field_type": "file", "is_required": false}
    ]'::JSONB
);

-- NR-17 - Ergonomia
SELECT upsert_nr_template(
    'NR-17 - Ergonomia',
    'Avaliação das condições ergonômicas do posto de trabalho',
    'Normas Regulamentadoras (NR)',
    '[
        {"field_name": "O mobiliário (cadeiras, mesas) possui regulagens adequadas à antropometria?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\", \"Parcial\"]"},
        {"field_name": "A iluminação está adequada à natureza da atividade visual?", "field_type": "select", "is_required": true, "options": "[\"Adequada\", \"Inadequada\"]"},
        {"field_name": "O transporte manual de cargas respeita os limites de peso e técnica?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\", \"Não Aplicável\"]"},
        {"field_name": "Para atividades repetitivas, existem pausas ou rodízio de tarefas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\", \"Não Aplicável\"]"},
        {"field_name": "Os equipamentos (monitores, teclados) estão posicionados corretamente?", "field_type": "select", "is_required": false, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Existe Análise Ergonômica do Trabalho (AET) disponível?", "field_type": "file", "is_required": false},
        {"field_name": "Foto do posto de trabalho avaliado", "field_type": "file", "is_required": false}
    ]'::JSONB
);

-- NR-35 - Trabalho em Altura
SELECT upsert_nr_template(
    'NR-35 - Trabalho em Altura',
    'Permissão e verificação para trabalhos acima de 2,00m',
    'Normas Regulamentadoras (NR)',
    '[
        {"field_name": "Foi emitida a Permissão de Trabalho (PT) e Análise de Risco (AR)?", "field_type": "file", "is_required": true},
        {"field_name": "O trabalhador possui treinamento NR-35 válido e ASO apto para altura?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Os pontos de ancoragem são definitivos ou foram inspecionados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "O cinto tipo paraquedista e talabartes estão em bom estado?", "field_type": "select", "is_required": true, "options": "[\"Conforme\", \"Não Conforme\"]"},
        {"field_name": "A área abaixo do trabalho está isolada e sinalizada para evitar quedas de materiais?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Condições meterológicas permitem a realização do serviço?", "field_type": "select", "is_required": true, "options": "[\"Favoráveis\", \"Desfavoráveis\"]"},
        {"field_name": "Foto do sistema de ancoragem utilizado", "field_type": "file", "is_required": false}
    ]'::JSONB
);

-- --- GENERIC CHECKLISTS (For all others) ---
-- Helper for generic templates (reuse same upsert logic but simplified input)
DO $$
DECLARE
    rec RECORD;
    v_generic_fields JSONB := '[
        {"field_name": "O item verificado está em conformidade com a norma?", "field_type": "select", "is_required": true, "options": "[\"Conforme\", \"Não Conforme\", \"Não Aplicável\"]"},
        {"field_name": "Evidência Fotográfica", "field_type": "file", "is_required": false},
        {"field_name": "Observações e Melhorias", "field_type": "textarea", "is_required": false}
    ]';
    v_nrs TEXT[] := ARRAY[
        'NR-01 - Disposições Gerais e Gerenciamento de Riscos Ocupacionais',
        'NR-02 - Inspeção Prévia (Revogada)',
        'NR-03 - Embargo e Interdição',
        'NR-04 - SESMT',
        'NR-05 - CIPA',
        -- NR-06 (Done)
        'NR-07 - PCMSO',
        'NR-08 - Edificações',
        'NR-09 - Avaliação e Controle de Exposições Ocupacionais',
        -- NR-10 (Done)
        'NR-11 - Transporte, Movimentação, Armazenagem e Manuseio de Materiais',
        -- NR-12 (Done)
        'NR-13 - Caldeiras, Vasos de Pressão, Tubulações e Tanques Metálicos',
        'NR-14 - Fornos',
        'NR-15 - Atividades e Operações Insalubres',
        'NR-16 - Atividades e Operações Perigosas',
        -- NR-17 (Done)
        'NR-18 - Condições e Meio Ambiente de Trabalho na Indústria da Construção',
        'NR-19 - Explosivos',
        'NR-20 - Segurança e Saúde no Trabalho com Inflamáveis e Combustíveis',
        'NR-21 - Trabalhos a Céu Aberto',
        'NR-22 - Segurança e Saúde Ocupacional na Mineração',
        'NR-23 - Proteção Contra Incêndios',
        'NR-24 - Condições Sanitárias e de Conforto nos Locais de Trabalho',
        'NR-25 - Resíduos Industriais',
        'NR-26 - Sinalização de Segurança',
        'NR-27 - Registro Profissional (Revogada)',
        'NR-28 - Fiscalização e Penalidades',
        'NR-29 - Segurança e Saúde no Trabalho Portuário',
        'NR-30 - Segurança e Saúde no Trabalho Aquaviário',
        'NR-31 - Segurança e Saúde na Agricultura, Pecuária, Silvicultura, Exploração Florestal e Aquicultura',
        'NR-32 - Segurança e Saúde no Trabalho em Serviços de Saúde',
        'NR-33 - Segurança e Saúde nos Trabalhos em Espaços Confinados',
        'NR-34 - Condições e Meio Ambiente de Trabalho na Indústria da Construção, Reparação e Desmonte Naval',
        -- NR-35 (Done)
        'NR-36 - Segurança e Saúde no Trabalho em Empresas de Abate e Processamento de Carnes e Derivados',
        'NR-37 - Segurança e Saúde em Plataformas de Petróleo',
        'NR-38 - Segurança e Saúde no Trabalho nas Atividades de Limpeza Urbana e Manejo de Resíduos Sólidos'
    ];
    
    v_nr_name TEXT;
    v_category TEXT;
BEGIN
    FOREACH v_nr_name IN ARRAY v_nrs
    LOOP
        v_category := 'Normas Regulamentadoras (NR)';
        IF v_nr_name LIKE '%Revogada%' THEN
            v_category := 'Normas Regulamentadoras (NR) - Revogadas';
        END IF;

        PERFORM upsert_nr_template(
            v_nr_name,
            'Checklist de conformidade com a ' || split_part(v_nr_name, ' - ', 1),
            v_category,
            v_generic_fields
        );
    END LOOP;
END;
$$;

-- Cleanup
DROP FUNCTION upsert_nr_template(TEXT, TEXT, TEXT, JSONB);
-- Drop old helper if it still exists from a previous run/version
DROP FUNCTION IF EXISTS create_nr_template(TEXT, TEXT, TEXT);

COMMIT;
