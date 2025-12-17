-- Migration to insert/update ALL 38 NR Checklist Templates with SPECIFIC content
-- and move them to a unified folder.

BEGIN;

-- 1. Ensure Folder Exists
DO $$
DECLARE
    v_folder_id UUID;
BEGIN
    -- Try to find existing public folder or create new one
    SELECT id INTO v_folder_id FROM checklist_folders 
    WHERE name = 'Normas Regulamentadoras' AND organization_id IS NULL 
    LIMIT 1;

    IF v_folder_id IS NULL THEN
        INSERT INTO checklist_folders (name, description, organization_id, created_at, updated_at)
        VALUES ('Normas Regulamentadoras', 'Checklists oficiais das Normas Regulamentadoras', NULL, NOW(), NOW())
        RETURNING id INTO v_folder_id;
    END IF;

    -- Store ID in temp table for reuse in this transaction
    CREATE TEMP TABLE temp_nr_folder (id UUID);
    INSERT INTO temp_nr_folder VALUES (v_folder_id);
END $$;

-- 2. Helper Function
CREATE OR REPLACE FUNCTION upsert_nr_template_full(
    p_name TEXT, 
    p_description TEXT, 
    p_fields JSONB
) RETURNS VOID AS $$
DECLARE
    v_template_id BIGINT;
    v_field JSONB;
    v_idx INT;
    v_folder_id UUID;
BEGIN
    SELECT id INTO v_folder_id FROM temp_nr_folder LIMIT 1;

    -- Check if template exists
    SELECT id INTO v_template_id FROM checklist_templates WHERE name = p_name;

    -- Create/Update
    IF v_template_id IS NULL THEN
        INSERT INTO checklist_templates (
            name, description, category, is_public, folder_id, created_at, updated_at
        ) VALUES (
            p_name, p_description, 'Normas Regulamentadoras (NR)', true, v_folder_id, NOW(), NOW()
        ) RETURNING id INTO v_template_id;
    ELSE
        UPDATE checklist_templates 
        SET description = p_description, 
            folder_id = v_folder_id,
            category = 'Normas Regulamentadoras (NR)',
            is_public = true,
            updated_at = NOW() 
        WHERE id = v_template_id;
        
        DELETE FROM checklist_fields WHERE template_id = v_template_id;
    END IF;

    -- Insert Fields
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

-- 3. Insert Content for ALL NRs

-- NR-01
SELECT upsert_nr_template_full(
    'NR-01 - Disposições Gerais',
    'Gerenciamento de Riscos Ocupacionais (GRO) e PGR',
    '[
        {"field_name": "O PGR contém inventário de riscos atualizado?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Os trabalhadores foram consultados sobre a percepção de riscos?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "A matriz de risco classifica corretamente os perigos identificados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Existe plano de ação para controle dos riscos ocupacionais?", "field_type": "file", "is_required": true},
        {"field_name": "A contratante gerencia os riscos das atividades das contratadas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\", \"Não Aplicável\"]"}
    ]'::JSONB
);

-- NR-02 (Revoked but kept for record)
SELECT upsert_nr_template_full(
    'NR-02 - Inspeção Prévia (Revogada)',
    'Norma revogada pela Portaria SEPRT n.º 915/2019',
    '[
        {"field_name": "Esta norma foi revogada. Nenhuma ação requerida.", "field_type": "info", "is_required": false, "options": null}
    ]'::JSONB
);

-- NR-03
SELECT upsert_nr_template_full(
    'NR-03 - Embargo e Interdição',
    'Verificação de Condições de Risco Grave e Iminente',
    '[
        {"field_name": "Existe situação de risco grave e iminente identificada?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "As áreas interditadas/embargadas estão respeitando a paralisação?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\", \"Não Aplicável\"]"},
        {"field_name": "Foram adotadas medidas corretivas para as situações de risco?", "field_type": "textarea", "is_required": false, "options": null}
    ]'::JSONB
);

-- NR-04
SELECT upsert_nr_template_full(
    'NR-04 - SESMT',
    'Serviços Especializados em Engenharia de Segurança e em Medicina do Trabalho',
    '[
        {"field_name": "O SESMT está dimensionado conforme o Grau de Risco e nº de empregados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Os profissionais do SESMT possuem qualificação e registro válidos?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "O SESMT mantém registro das atividades de segurança e saúde?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Anexo comprovante de registro do SESMT no sistema governamental", "field_type": "file", "is_required": false, "options": null}
    ]'::JSONB
);

-- NR-05
SELECT upsert_nr_template_full(
    'NR-05 - CIPA',
    'Comissão Interna de Prevenção de Acidentes',
    '[
        {"field_name": "A CIPA foi constituída e mantida regularmente?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "As reuniões mensais estão sendo realizadas e registradas em ata?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Os membros da CIPA (titulares/suplentes) realizaram o treinamento?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "A CIPA participou da elaboração do Mapa de Riscos?", "field_type": "file", "is_required": false, "options": null}
    ]'::JSONB
);

-- NR-06 (Refined)
SELECT upsert_nr_template_full(
    'NR-06 - EPI',
    'Equipamento de Proteção Individual',
    '[
        {"field_name": "Todos os funcionários utilizam EPI adequado ao risco?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "A ficha de entrega de EPI está assinada e atualizada?", "field_type": "file", "is_required": true, "options": null},
        {"field_name": "Os EPIs possuem CA válido?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "São realizados treinamentos periódicos sobre uso e conservação?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Há substituição imediata de EPIs danificados ou extraviados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-07
SELECT upsert_nr_template_full(
    'NR-07 - PCMSO',
    'Programa de Controle Médico de Saúde Ocupacional',
    '[
        {"field_name": "O PCMSO está atualizado e coordenado por médico do trabalho?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Os ASOs (Admissional, Periódico, Demissional) estão em dia?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Os exames complementares exigidos pelos riscos foram realizados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Existe Relatório Analítico anual do PCMSO?", "field_type": "file", "is_required": false, "options": null}
    ]'::JSONB
);

-- NR-08
SELECT upsert_nr_template_full(
    'NR-08 - Edificações',
    'Requisitos Técnicos Mínimos para Edificações',
    '[
        {"field_name": "As estruturas oferecem estabilidade e segurança?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Pisos e escadas são antiderrapantes e estão em bom estado?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "As aberturas em pisos e paredes possuem proteção contra quedas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Há proteção contra intempéries nas partes externas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-09
SELECT upsert_nr_template_full(
    'NR-09 - Avaliação e Controle de Exposições Ocupacionais',
    'Agentes Físicos, Químicos e Biológicos',
    '[
        {"field_name": "Foi realizada avaliação quantitativa dos agentes ambientais?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Os limites de tolerância estão sendo respeitados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Existem medidas de controle coletivo (EPC) implantadas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Laudo Técnico (LTCAT) está disponível e atualizado?", "field_type": "file", "is_required": false, "options": null}
    ]'::JSONB
);

-- NR-10 (Refined)
SELECT upsert_nr_template_full(
    'NR-10 - Eletricidade',
    'Segurança em Instalações e Serviços em Eletricidade',
    '[
        {"field_name": "Prontuário das Instalações Elétricas (PIE) atualizado?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Diagramas unifilares correspondem à realidade?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Profissionais autorizados com treinamento básico/SEP?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Bloqueio e etiquetagem (LOTO) aplicados em manutenções?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Vestimentas FR (Fogo Repentino) em uso?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-11
SELECT upsert_nr_template_full(
    'NR-11 - Transporte e Movimentação',
    'Transporte, Movimentação, Armazenagem e Manuseio de Materiais',
    '[
        {"field_name": "Equipamentos (empilhadeiras, pontes) inspecionados diariamente?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Operadores possuem treinamento e cartão de identificação?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Carga máxima permitida está indicada visivelmente no equipamento?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Sinalização sonora de ré em funcionamento?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Áreas de movimentação sinalizadas e desobstruídas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-12 (Refined)
SELECT upsert_nr_template_full(
    'NR-12 - Máquinas e Equipamentos',
    'Segurança no Trabalho em Máquinas e Equipamentos',
    '[
        {"field_name": "Proteções fixas e móveis instaladas nas zonas de perigo?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Dispositivos de parada de emergência acessíveis e testados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Inventário de máquinas atualizado?", "field_type": "file", "is_required": true, "options": null},
        {"field_name": "Manuais e procedimentos operacionais disponíveis?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Sinalização de riscos e comandos clara e em português?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-13
SELECT upsert_nr_template_full(
    'NR-13 - Vasos de Pressão e Caldeiras',
    'Caldeiras, Vasos de Pressão, Tubulações e Tanques',
    '[
        {"field_name": "Placa de identificação legível e completa?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Prontuário do equipamento disponível?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Válvulas de segurança calibradas e testadas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Inspeção de segurança periódica dentro do prazo?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Operador de caldeira possui treinamento NR-13?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-14
SELECT upsert_nr_template_full(
    'NR-14 - Fornos',
    'Segurança na Operação de Fornos Industriais',
    '[
        {"field_name": "Os fornos estão instalados de forma a evitar acúmulo de gases nocivos?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "O revestimento refratário está em bom estado?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Existe sistema de exaustão adequado?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-15
SELECT upsert_nr_template_full(
    'NR-15 - Insalubridade',
    'Atividades e Operações Insalubres',
    '[
        {"field_name": "Ruído: Limites de tolerância respeitados ou proteção auditiva adequada?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Calor: IBUTG avaliado e regime de trabalho/descanso cumprido?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Agentes Químicos: Concentrações abaixo do limite de tolerância?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Laudo de Insalubridade atualizado?", "field_type": "file", "is_required": true, "options": null}
    ]'::JSONB
);

-- NR-16
SELECT upsert_nr_template_full(
    'NR-16 - Periculosidade',
    'Atividades e Operações Perigosas',
    '[
        {"field_name": "Armazenamento de inflam/explosivos respeita distâncias e quantidades?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Áreas de risco delimitadas e sinalizadas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Laudo de Periculosidade atualizado?", "field_type": "file", "is_required": true, "options": null}
    ]'::JSONB
);

-- NR-17 (Refined)
SELECT upsert_nr_template_full(
    'NR-17 - Ergonomia',
    'Ergonomia',
    '[
        {"field_name": "Mobiliário ergonômico e ajustável?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Iluminação, ruído e temperatura confortáveis?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Levantamento de peso conforme limites normativos?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Análise Ergonômica do Trabalho (AET) realizada?", "field_type": "file", "is_required": true, "options": null},
        {"field_name": "Pausas para descanso em atividades repetitivas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-18
SELECT upsert_nr_template_full(
    'NR-18 - Construção Civil',
    'Condições e Meio Ambiente de Trabalho na Indústria da Construção',
    '[
        {"field_name": "PGR da obra implementado e atualizado?", "field_type": "file", "is_required": true, "options": null},
        {"field_name": "Áreas de vivência (banheiros, refeitório) adequadas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Proteções periféricas e andaimes conformes?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Sinalização de segurança em todo o canteiro?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Treinamento admissional e periódico realizado?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-19
SELECT upsert_nr_template_full(
    'NR-19 - Explosivos',
    'Fabricação, armazenamento e manuseio de explosivos',
    '[
        {"field_name": "Depósitos construídos conforme especificações técnicas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Controle rígido de entrada/saída de material?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Equipamentos de combate a incêndio específicos disponíveis?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-20
SELECT upsert_nr_template_full(
    'NR-20 - Inflamáveis e Combustíveis',
    'Segurança com Inflamáveis e Combustíveis',
    '[
        {"field_name": "Classificação das instalações realizada corretamente?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Prontuário da instalação  disponível e atualizado?", "field_type": "file", "is_required": true, "options": null},
        {"field_name": "Treinamento específico NR-20 para os trabalhadores?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Sistemas de aterramento e combate a incêndio inspecionados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-21
SELECT upsert_nr_template_full(
    'NR-21 - Trabalho a Céu Aberto',
    'Proteção para trabalhos realizados ao ar livre',
    '[
        {"field_name": "Abrigos contra intempéries disponíveis?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Proteção contra insolação excessiva (protetor solar, chapéu)?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Água potável e fresca disponível no local?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-22
SELECT upsert_nr_template_full(
    'NR-22 - Mineração',
    'Segurança e Saúde Ocupacional na Mineração',
    '[
        {"field_name": "PGRM (Programa de Gerenciamento de Riscos) implantado?", "field_type": "file", "is_required": true, "options": null},
        {"field_name": "Monitoramento da estabilidade de taludes/galerias realizado?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Sistemas de ventilação em subsolo adequados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\", \"Não Aplica\"]"}
    ]'::JSONB
);

-- NR-23
SELECT upsert_nr_template_full(
    'NR-23 - Incêndios',
    'Proteção Contra Incêndios',
    '[
        {"field_name": "Extintores dentro da validade e desobstruídos?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Saídas de emergência sinalizadas e destravadas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Brigada de incêndio treinada e identificada?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "AVCB/CLCB válido?", "field_type": "file", "is_required": true, "options": null}
    ]'::JSONB
);

-- NR-24
SELECT upsert_nr_template_full(
    'NR-24 - Condições Sanitárias',
    'Condições Sanitárias e de Conforto nos Locais de Trabalho',
    '[
        {"field_name": "Instalações sanitárias limpas e separadas por sexo?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Vestiários com armários individuais (quando exigido)?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\", \"Não Aplica\"]"},
        {"field_name": "Refeitório adequado e limpo?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\", \"Não Aplica\"]"},
        {"field_name": "Fornecimento de água potável em condições higiênicas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-25
SELECT upsert_nr_template_full(
    'NR-25 - Resíduos Industriais',
    'Manejo e descarte de resíduos industriais',
    '[
        {"field_name": "Resíduos classificados e segregados corretamente?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Destinação final ambientalmente correta comprovada?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Trabalhadores usam EPIs adequados para coleta/manuseio?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-26
SELECT upsert_nr_template_full(
    'NR-26 - Sinalização',
    'Sinalização de Segurança',
    '[
        {"field_name": "Cores de segurança utilizadas conforme padrão normativo?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Rotulagem de produtos químicos (GHS) implementada?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Fichas com dados de segurança (FISPQ/FDS) disponíveis?", "field_type": "file", "is_required": false, "options": null}
    ]'::JSONB
);

-- NR-27 (Revoked)
SELECT upsert_nr_template_full(
    'NR-27 - Registro Profissional (Revogada)',
    'Norma revogada',
    '[
        {"field_name": "Norma revogada. Sem requisitos.", "field_type": "info", "is_required": false, "options": null}
    ]'::JSONB
);

-- NR-28
SELECT upsert_nr_template_full(
    'NR-28 - Fiscalização e Penalidades',
    'Procedimentos de Fiscalização',
    '[
        {"field_name": "A empresa possui histórico de autuações ou notificações?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Prazos de adequação de fiscalizações anteriores cumpridos?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\", \"Não Aplica\"]"}
    ]'::JSONB
);

-- NR-29 (Port)
SELECT upsert_nr_template_full(
    'NR-29 - Trabalho Portuário',
    'Segurança e Saúde no Trabalho Portuário',
    '[
        {"field_name": "Comunicação Prévia de Início de Trabalho realizada?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Equipamentos de guindar certificados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Proteção contra quedas no mar ou porão?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-30 (Waterway)
SELECT upsert_nr_template_full(
    'NR-30 - Trabalho Aquaviário',
    'Segurança e Saúde no Trabalho Aquaviário',
    '[
        {"field_name": "GSSTB (Grupo de Segurança e Saúde) constituído a bordo?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Manutenção de equipamentos de salvatagem em dia?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Cozinha e alojamentos higienizados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-31 (Agro)
SELECT upsert_nr_template_full(
    'NR-31 - Agricultura e Pecuária',
    'Segurança na Agricultura, Pecuária e Silvicultura',
    '[
        {"field_name": "PGRTR (Programa de Gerenciamento de Riscos Rural) implementado?", "field_type": "file", "is_required": true, "options": null},
        {"field_name": "Uso de agrotóxicos segue receituário e normas de segurança?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Tratores e máquinas com proteção de tomada de força e ROPS?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "CIPATR constituída?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-32 (Health)
SELECT upsert_nr_template_full(
    'NR-32 - Serviços de Saúde',
    'Segurança e Saúde em Serviços de Saúde',
    '[
        {"field_name": "PPRA/PGR contempla riscos biológicos e quimioterápicos?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Vacinação dos funcionários (Hepatite B, Tétano, etc) em dia?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Descarte de perfurocortantes em coletores rígidos?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Proibição do uso de adornos respeitada?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-33
SELECT upsert_nr_template_full(
    'NR-33 - Espaços Confinados',
    'Segurança e Saúde nos Trabalhos em Espaços Confinados',
    '[
        {"field_name": "Cadastro de espaços confinados atualizado?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "PET (Permissão de Entrada) emitida antes do trabalho?", "field_type": "file", "is_required": true, "options": null},
        {"field_name": "Supervisor de Entrada e Vigia capacitados e presentes?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Monitoramento contínuo da atmosfera realizado?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-34 (Ship repair)
SELECT upsert_nr_template_full(
    'NR-34 - Indústria Naval',
    'Condições e Meio Ambiente na Indústria Naval',
    '[
        {"field_name": "Permissão de Trabalho para atividade a quente emitida?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Trabalhos em altura e espaço confinado controlados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Testes de estanqueidade em mangueiras de gás realizados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-35 (Refined)
SELECT upsert_nr_template_full(
    'NR-35 - Trabalho em Altura',
    'Checklist de Trabalho em Altura',
    '[
        {"field_name": "Análise de Risco (AR) e Permissão de Trabalho (PT) emitidas?", "field_type": "file", "is_required": true, "options": null},
        {"field_name": "Trabalhadores com exame médico e treinamento válidos?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Pontos de ancoragem inspecionados?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Talabartes duplos e trava-quedas funcionando?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Área isolada e sinalizada?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-36 (Meat)
SELECT upsert_nr_template_full(
    'NR-36 - Frigoríficos',
    'Empresas de Abate e Processamento de Carnes',
    '[
        {"field_name": "Pausas de recuperação psicofisiológica cumpridas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Proteção de partes móveis e facas adequada?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Conforto térmico em ambientes frios controlado?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-37 (Oil Rigs)
SELECT upsert_nr_template_full(
    'NR-37 - Plataformas de Petróleo',
    'Segurança e Saúde em Plataformas de Petróleo',
    '[
        {"field_name": "Plano de Resposta a Emergências testado (simulados)?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Permissões de trabalho auditadas?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Acesso a bordo e condições de habitabilidade conformes?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- NR-38 (Cleaning)
SELECT upsert_nr_template_full(
    'NR-38 - Limpeza Urbana',
    'Segurança nas Atividades de Limpeza Urbana e Manejo de Resíduos',
    '[
        {"field_name": "Veículos coletores possuem estribos e pega-mãos seguros?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "EPIs de alta visibilidade utilizados pelos coletores?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"},
        {"field_name": "Vacinação dos trabalhadores controlada?", "field_type": "select", "is_required": true, "options": "[\"Sim\", \"Não\"]"}
    ]'::JSONB
);

-- Cleanup
DROP TABLE temp_nr_folder;
DROP FUNCTION upsert_nr_template_full(TEXT, TEXT, JSONB);

COMMIT;
