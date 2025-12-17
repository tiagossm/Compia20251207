import { useState } from 'react';
import { FileDown, Loader2, X, Image } from 'lucide-react';
import { InspectionType, InspectionItemType, InspectionMediaType } from '@/shared/types';
import { useToast } from '@/react-app/hooks/useToast';

interface PDFGeneratorProps {
  inspection: InspectionType;
  items: InspectionItemType[];
  templateItems?: any[];
  media: InspectionMediaType[];
  responses: Record<number, any>;
  signatures: { inspector?: string; responsible?: string };
  isOpen: boolean;
  onClose: () => void;
  qrCodeDataUrl?: string;
  shareLink?: string;
  actionItems?: any[];
  organizationLogoUrl?: string;
  parentOrganizationLogoUrl?: string;
  organizationName?: string;
  parentOrganizationName?: string;
}

type LogoPreference = 'organization' | 'parent' | 'both' | 'none';

export default function PDFGenerator({
  inspection,
  items,
  templateItems = [],
  media,
  responses,
  signatures,
  isOpen,
  onClose,
  qrCodeDataUrl,
  shareLink,
  actionItems = [],
  organizationLogoUrl,
  parentOrganizationLogoUrl,
  organizationName = 'Organização',
  parentOrganizationName = 'Organização Matriz'
}: PDFGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [includeMedia, setIncludeMedia] = useState(true);
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [includeActionPlan, setIncludeActionPlan] = useState(false);
  const [logoPreference, setLogoPreference] = useState<LogoPreference>(
    organizationLogoUrl && parentOrganizationLogoUrl ? 'both' :
      organizationLogoUrl ? 'organization' :
        parentOrganizationLogoUrl ? 'parent' : 'none'
  );
  const { success, error } = useToast();

  if (!isOpen) return null;

  const formatResponseValue = (value: any, fieldType: string) => {
    switch (fieldType) {
      case 'boolean':
        const isTrue = value === true || value === 'true';
        const isFalse = value === false || value === 'false';

        if (!isTrue && !isFalse) {
          return 'Não respondido';
        }

        return isTrue ? 'Conforme ✓' : 'Não Conforme ✗';
      case 'rating':
        if (value === null || value === undefined || value === '') {
          return 'Não respondido';
        }
        return `${value}/5 estrelas`;
      case 'multiselect':
        if (value === null || value === undefined || value === '') {
          return 'Não respondido';
        }
        if (Array.isArray(value)) {
          return value.join(', ');
        }
        return String(value);
      default:
        if (value === null || value === undefined || value === '') {
          return 'Não respondido';
        }
        return String(value);
    }
  };

  // Calculate statistics
  const stats = {
    totalItems: 0,
    compliantItems: 0,
    nonCompliantItems: 0,
    conformanceRate: 0
  };

  // Count manual items
  items.forEach(item => {
    if (item.is_compliant === true) {
      stats.compliantItems++;
      stats.totalItems++;
    } else if (item.is_compliant === false) {
      stats.nonCompliantItems++;
      stats.totalItems++;
    }
  });

  // Count template items
  templateItems.forEach((item) => {
    try {
      const fieldData = JSON.parse(item.field_responses);
      const response = responses[fieldData.field_id];
      if (fieldData.field_type === 'boolean') {
        if (response === true || response === 'true') {
          stats.compliantItems++;
          stats.totalItems++;
        } else if (response === false || response === 'false') {
          stats.nonCompliantItems++;
          stats.totalItems++;
        }
      } else if (response !== null && response !== undefined && response !== '') {
        stats.compliantItems++;
        stats.totalItems++;
      }
    } catch (error) {
      console.error('Error processing template item:', error);
    }
  });

  stats.conformanceRate = stats.totalItems > 0 ? Math.round((stats.compliantItems / stats.totalItems) * 100) : 0;

  const generatePDFHTML = () => {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Inspeção - ${inspection.title}</title>
  <style>
    @page {
      margin: 15mm;
      size: A4;
    }
    @media print {
      body { 
        margin: 0; 
        padding: 15mm;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page-break { page-break-before: always; }
      .checklist-item { page-break-inside: avoid; }
      .signature-box { page-break-inside: avoid; }
      /* Ocultar header/footer padrão do navegador */
      @page { margin-top: 10mm; margin-bottom: 10mm; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      line-height: 1.5; 
      color: #1f2937; 
      background: white;
      padding: 30px; 
      font-size: 12px;
    }
    .header { 
      text-align: center; 
      margin-bottom: 30px; 
      border-bottom: 1px solid #d1d5db; 
      padding-bottom: 20px;
    }
    .logos-container {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 30px;
      margin-bottom: 20px;
    }
    .logo { max-height: 60px; max-width: 150px; object-fit: contain; }
    .report-title {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 8px;
    }
    h1 { 
      color: #111827; 
      font-size: 22px; 
      font-weight: 600; 
      margin-bottom: 4px;
    }
    h2 { 
      color: #374151; 
      font-size: 16px; 
      margin: 25px 0 12px 0; 
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
      font-weight: 600;
    }
    h3 { 
      color: #4b5563; 
      font-size: 14px; 
      margin: 15px 0 8px 0;
      font-weight: 600;
    }
    .meta-info { 
      font-size: 11px; 
      color: #9ca3af; 
      margin-top: 8px;
    }
    .info-grid { 
      display: table;
      width: 100%;
      margin: 15px 0;
      border: 1px solid #374151;
      border-collapse: collapse;
    }
    .info-row {
      display: table-row;
    }
    .info-item { 
      display: table-cell;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      vertical-align: top;
    }
    .info-label { 
      font-weight: 600; 
      color: #374151; 
      display: block;
      margin-bottom: 2px;
      font-size: 10px;
      text-transform: uppercase;
    }
    .info-value { color: #1f2937; font-size: 12px; }
    .stats-grid { 
      display: grid; 
      grid-template-columns: repeat(4, 1fr); 
      gap: 15px; 
      margin: 20px 0;
    }
    .stat-card { 
      background: #ffffff;
      border: 1px solid #e5e7eb;
      padding: 15px; 
      border-radius: 4px; 
      text-align: center;
    }
    .stat-card.compliant { border-left: 4px solid #10b981; }
    .stat-card.non-compliant { border-left: 4px solid #ef4444; }
    .stat-card.rate { border-left: 4px solid #1e40af; }
    .stat-number { font-size: 28px; font-weight: 700; color: #111827; margin-bottom: 4px; }
    .stat-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #374151;
      margin: 25px 0 15px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    .checklist-item { 
      background: white;
      border: 1px solid #e5e7eb; 
      border-radius: 4px; 
      padding: 15px; 
      margin: 10px 0;
      page-break-inside: avoid;
    }
    .item-header { 
      display: flex; 
      align-items: flex-start; 
      gap: 10px; 
      margin-bottom: 10px;
    }
    .item-number { 
      color: #6b7280; 
      font-weight: 600; 
      font-size: 12px;
      min-width: 25px;
    }
    .item-title { font-weight: 600; color: #111827; font-size: 14px; }
    .item-response { 
      background: #f9fafb; 
      padding: 10px; 
      border-radius: 4px; 
      margin: 8px 0;
      border-left: 3px solid #d1d5db;
    }
    .response-label { font-weight: 600; color: #6b7280; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; }
    .conforme { color: #059669; font-weight: 600; }
    .nao-conforme { color: #dc2626; font-weight: 600; }
    .media-grid { 
      display: grid; 
      grid-template-columns: repeat(3, 1fr); 
      gap: 12px; 
      margin: 12px 0;
    }
    .media-item { 
      border: 1px solid #d1d5db; 
      border-radius: 6px; 
      overflow: hidden;
      background: white;
      break-inside: avoid;
    }
    .media-item img { 
      width: 100%; 
      height: 100px; 
      object-fit: contain; 
      background: #f9fafb;
      padding: 4px;
    }
    .media-info { padding: 6px 8px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
    .media-filename { font-size: 9px; font-weight: 600; color: #374151; word-break: break-all; }
    .media-description { font-size: 8px; color: #6b7280; margin-top: 2px; }
    .signatures-section { 
      margin-top: 40px; 
      page-break-before: auto;
    }
    .signatures-grid { 
      display: grid; 
      grid-template-columns: repeat(2, 1fr); 
      gap: 30px; 
      margin-top: 20px;
    }
    .signature-box { 
      text-align: center; 
      padding: 15px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
    }
    .signature-preview { 
      height: 100px; 
      border: 1px solid #e5e7eb; 
      border-radius: 4px; 
      margin: 10px 0;
      background: #fafafa;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .signature-preview img { max-height: 80px; max-width: 100%; object-fit: contain; }
    .signature-line { 
      border-top: 1px solid #374151; 
      margin: 15px auto 8px auto; 
      width: 200px;
    }
    .signature-name { font-weight: 600; color: #111827; font-size: 13px; }
    .signature-role { font-size: 11px; color: #6b7280; }
    .footer { 
      margin-top: 40px; 
      padding-top: 15px; 
      border-top: 1px solid #e5e7eb;
      font-size: 10px; 
      color: #9ca3af;
      text-align: center;
    }
    .action-plan { 
      background: #fffbeb; 
      border: 1px solid #fcd34d; 
      border-radius: 4px; 
      padding: 12px; 
      margin: 10px 0;
    }
    .action-plan h4 { color: #92400e; margin-bottom: 8px; font-size: 13px; }
    .action-item { 
      background: white; 
      padding: 8px; 
      border-radius: 4px; 
      margin: 6px 0; 
      border-left: 3px solid #f59e0b;
    }
    .w5-grid { 
      display: grid; 
      grid-template-columns: repeat(2, 1fr); 
      gap: 8px; 
      margin-top: 6px;
    }
    .w5-item { margin-bottom: 6px; font-size: 12px; }
    .w5-label { font-weight: 600; color: #92400e; }
    .page-break { page-break-before: always; }
    .ai-analysis {
      background: #f0f9ff;
      border-left: 3px solid #1e40af;
      padding: 10px;
      margin: 8px 0;
      border-radius: 4px;
    }
    .ai-label { font-weight: 600; color: #1e40af; font-size: 11px; text-transform: uppercase; margin-bottom: 4px; }
    @media print {
      body { margin: 0; padding: 20px; }
      .page-break { page-break-before: always; }
      .checklist-item { page-break-inside: avoid; }
      .signature-box { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${(() => {
        const logos = [];
        if (logoPreference === 'both' || logoPreference === 'parent') {
          if (parentOrganizationLogoUrl) logos.push(parentOrganizationLogoUrl);
        }
        if (logoPreference === 'both' || logoPreference === 'organization') {
          if (organizationLogoUrl) logos.push(organizationLogoUrl);
        }
        if (logos.length === 0) return '';
        return `
    <div class="logos-container">
      ${logos.map(logo => `<img class="logo" src="${logo}" alt="Logo" />`).join('')}
    </div>`;
      })()}
    <div class="report-title">Relatório de Inspeção Técnica</div>
    <h1>${inspection.title}</h1>
    <div class="meta-info">
      Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
    </div>
  </div>

  <table class="info-grid">
    <tr class="info-row">
      ${inspection.company_name ? `
      <td class="info-item">
        <span class="info-label">Empresa</span>
        <span class="info-value">${inspection.company_name}</span>
      </td>` : '<td class="info-item"></td>'}
      <td class="info-item">
        <span class="info-label">Local</span>
        <span class="info-value">${inspection.location}</span>
      </td>
    </tr>
    <tr class="info-row">
      <td class="info-item">
        <span class="info-label">Inspetor</span>
        <span class="info-value">${inspection.inspector_name}</span>
      </td>
      ${inspection.responsible_name ? `
      <td class="info-item">
        <span class="info-label">Responsável</span>
        <span class="info-value">${inspection.responsible_name}</span>
      </td>` : '<td class="info-item"></td>'}
    </tr>
    <tr class="info-row">
      ${inspection.scheduled_date ? `
      <td class="info-item">
        <span class="info-label">Data</span>
        <span class="info-value">${new Date(inspection.scheduled_date).toLocaleDateString('pt-BR')}</span>
      </td>` : '<td class="info-item"></td>'}
      ${inspection.responsible_email ? `
      <td class="info-item">
        <span class="info-label">Email</span>
        <span class="info-value">${inspection.responsible_email}</span>
      </td>` : '<td class="info-item"></td>'}
    </tr>
    ${inspection.address || inspection.cep ? `
    <tr class="info-row">
      ${inspection.address ? `
      <td class="info-item">
        <span class="info-label">Endereço</span>
        <span class="info-value">${inspection.address}</span>
      </td>` : '<td class="info-item"></td>'}
      ${inspection.cep ? `
      <td class="info-item">
        <span class="info-label">CEP</span>
        <span class="info-value">${inspection.cep}</span>
      </td>` : '<td class="info-item"></td>'}
    </tr>` : ''}
  </table>

  <h2>Estatísticas da Inspeção</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-number">${stats.totalItems}</div>
      <div class="stat-label">Total de Itens</div>
    </div>
    <div class="stat-card compliant">
      <div class="stat-number">${stats.compliantItems}</div>
      <div class="stat-label">Conformes</div>
    </div>
    <div class="stat-card non-compliant">
      <div class="stat-number">${stats.nonCompliantItems}</div>
      <div class="stat-label">Não Conformes</div>
    </div>
    <div class="stat-card rate">
      <div class="stat-number">${stats.conformanceRate}%</div>
      <div class="stat-label">Taxa de Conformidade</div>
    </div>
  </div>

  ${templateItems.length > 0 ? `
  <h2>Checklist Respondido</h2>
  ${templateItems.map((item, index) => {
        try {
          const fieldData = JSON.parse(item.field_responses);
          const response = responses[fieldData.field_id];
          const comment = (responses as Record<string, any>)[`comment_${fieldData.field_id}`];
          const itemMedia = media.filter(m => m.inspection_item_id === item.id);

          return `
      <div class="checklist-item">
        <div class="item-header">
          <div class="item-number">${index + 1}</div>
          <div class="item-title">${item.item_description}</div>
        </div>
        <div class="item-response">
          <div class="response-label">Resposta:</div>
          <div class="${response === true || response === 'true' ? 'conforme' : response === false || response === 'false' ? 'nao-conforme' : ''}">${formatResponseValue(response, fieldData.field_type)}</div>
        </div>
        ${comment ? `
        <div class="item-response">
          <div class="response-label">Comentário:</div>
          <div>${comment}</div>
        </div>` : ''}
        ${item.ai_pre_analysis ? `
        <div class="ai-analysis">
          <div class="ai-label">Análise IA:</div>
          <div>${item.ai_pre_analysis}</div>
        </div>` : ''}
        ${includeActionPlan && item.ai_action_plan ? (() => {
              try {
                const actionPlan = JSON.parse(item.ai_action_plan);
                if (!actionPlan?.actions?.length) return '';
                return `
            <div class="action-plan">
              <h4>Plano de Ação (IA)</h4>
              ${actionPlan.summary ? `<p style="margin-bottom: 10px;">${actionPlan.summary}</p>` : ''}
              ${actionPlan.actions.map((action: any, i: number) => `
                <div class="action-item">
                  <strong>Ação ${i + 1}:</strong> ${action.item || action.what}
                  <div class="w5-grid">
                    <div class="w5-item"><span class="w5-label">O que:</span> ${action.what}</div>
                    <div class="w5-item"><span class="w5-label">Onde:</span> ${action.where}</div>
                    <div class="w5-item"><span class="w5-label">Por que:</span> ${action.why}</div>
                    <div class="w5-item"><span class="w5-label">Como:</span> ${action.how}</div>
                    <div class="w5-item"><span class="w5-label">Quando:</span> ${action.when}</div>
                    <div class="w5-item"><span class="w5-label">Quem:</span> ${action.who}</div>
                    <div class="w5-item" style="grid-column: 1/-1;"><span class="w5-label">Quanto:</span> ${action.how_much}</div>
                  </div>
                </div>
              `).join('')}
            </div>`;
              } catch (e) {
                return '';
              }
            })() : ''}
        ${includeMedia && itemMedia.length > 0 ? `
        <div>
          <div class="response-label">Evidências (${itemMedia.length}):</div>
          <div class="media-grid">
            ${itemMedia.map(mediaItem => {
              if (mediaItem.media_type === 'image' && mediaItem.file_url.startsWith('data:image/')) {
                return `
                <div class="media-item">
                  <img src="${mediaItem.file_url}" alt="${mediaItem.file_name}" />
                  <div class="media-info">
                    <div class="media-filename">${mediaItem.file_name}</div>
                    ${mediaItem.description ? `<div class="media-description">${mediaItem.description}</div>` : ''}
                  </div>
                </div>`;
              }
              return `
              <div class="media-item">
                <div class="media-info">
                  <div class="media-filename">📁 ${mediaItem.file_name}</div>
                  <div class="media-description">${mediaItem.media_type.toUpperCase()}</div>
                  ${mediaItem.description ? `<div class="media-description">${mediaItem.description}</div>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
      </div>`;
        } catch (err) {
          return '';
        }
      }).join('')}` : ''}

  ${items.length > 0 ? `
  <h2>Itens Manuais</h2>
  ${items.map((item, index) => {
        const itemMedia = media.filter(m => m.inspection_item_id === item.id);
        return `
    <div class="checklist-item">
      <div class="item-header">
        <div class="item-number">${index + 1}</div>
        <div>
          <div class="item-title">${item.item_description}</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">📂 ${item.category}</div>
        </div>
      </div>
      <div class="item-response">
        <div class="response-label">Status:</div>
        <div class="${item.is_compliant === true ? 'conforme' : item.is_compliant === false ? 'nao-conforme' : ''}">
          ${item.is_compliant === true ? 'Conforme ✓' : item.is_compliant === false ? 'Não Conforme ✗' : 'Não Avaliado'}
        </div>
      </div>
      ${item.observations ? `
      <div class="item-response">
        <div class="response-label">Observações:</div>
        <div>${item.observations}</div>
      </div>` : ''}
      ${includeMedia && itemMedia.length > 0 ? `
      <div>
        <div class="response-label">Evidências (${itemMedia.length}):</div>
        <div class="media-grid">
          ${itemMedia.map(mediaItem => {
          if (mediaItem.media_type === 'image' && mediaItem.file_url.startsWith('data:image/')) {
            return `
              <div class="media-item">
                <img src="${mediaItem.file_url}" alt="${mediaItem.file_name}" />
                <div class="media-info">
                  <div class="media-filename">${mediaItem.file_name}</div>
                  ${mediaItem.description ? `<div class="media-description">${mediaItem.description}</div>` : ''}
                </div>
              </div>`;
          }
          return `
            <div class="media-item">
              <div class="media-info">
                <div class="media-filename">📁 ${mediaItem.file_name}</div>
                <div class="media-description">${mediaItem.media_type.toUpperCase()}</div>
                ${mediaItem.description ? `<div class="media-description">${mediaItem.description}</div>` : ''}
              </div>
            </div>`;
        }).join('')}
        </div>
      </div>` : ''}
    </div>`;
      }).join('')}` : ''}

  ${actionItems.length > 0 ? `
  <h2>Planos de Ação Executivos</h2>
  <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
    <p style="color: #1e40af; font-weight: 600; margin-bottom: 15px;">
      Total de ${actionItems.length} ${actionItems.length === 1 ? 'ação identificada' : 'ações identificadas'}
    </p>
    ${actionItems.map((action: any, index: number) => `
      <div class="checklist-item" style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: between; align-items: start; margin-bottom: 15px;">
          <h4 style="color: #111827; font-size: 16px; font-weight: 600;">${index + 1}. ${action.title}</h4>
          <div style="display: flex; gap: 8px;">
            <span style="background: ${action.priority === 'alta' || action.priority === 'critica' ? '#fef2f2; color: #991b1b' :
          action.priority === 'media' ? '#fefce8; color: #92400e' :
            '#f0fdf4; color: #166534'
        }; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">
              ${action.priority || 'média'}
            </span>
            <span style="background: ${action.status === 'completed' ? '#f0fdf4; color: #166534' :
          action.status === 'in_progress' ? '#eff6ff; color: #1d4ed8' :
            '#f3f4f6; color: #374151'
        }; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">
              ${action.status === 'pending' ? 'Pendente' :
          action.status === 'in_progress' ? 'Em Progresso' :
            action.status === 'completed' ? 'Concluído' : action.status}
            </span>
          </div>
        </div>
        
        ${action.is_ai_generated ? `
        <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 6px; color: #7c3aed; font-size: 11px;">
          <span>Gerado por Inteligência Artificial</span>
        </div>` : ''}
        
        <div class="w5-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 10px;">
          ${action.what_description ? `
          <div style="background: #fef2f2; padding: 10px; border-radius: 6px; border-left: 3px solid #ef4444;">
            <div class="w5-label" style="font-weight: 600; color: #b91c1c; margin-bottom: 4px;">O que:</div>
            <div style="color: #7f1d1d; font-size: 13px;">${action.what_description}</div>
          </div>` : ''}
          ${action.where_location ? `
          <div style="background: #f0fdf4; padding: 10px; border-radius: 6px; border-left: 3px solid #22c55e;">
            <div class="w5-label" style="font-weight: 600; color: #15803d; margin-bottom: 4px;">Onde:</div>
            <div style="color: #14532d; font-size: 13px;">${action.where_location}</div>
          </div>` : ''}
          ${action.why_reason ? `
          <div style="background: #eff6ff; padding: 10px; border-radius: 6px; border-left: 3px solid #3b82f6;">
            <div class="w5-label" style="font-weight: 600; color: #1d4ed8; margin-bottom: 4px;">Por que:</div>
            <div style="color: #1e3a8a; font-size: 13px;">${action.why_reason}</div>
          </div>` : ''}
          ${action.how_method ? `
          <div style="background: #f0f9ff; padding: 10px; border-radius: 6px; border-left: 3px solid #6366f1;">
            <div class="w5-label" style="font-weight: 600; color: #4338ca; margin-bottom: 4px;">Como:</div>
            <div style="color: #312e81; font-size: 13px;">${action.how_method}</div>
          </div>` : ''}
          ${action.who_responsible ? `
          <div style="background: #faf5ff; padding: 10px; border-radius: 6px; border-left: 3px solid #a855f7;">
            <div class="w5-label" style="font-weight: 600; color: #7c2d12; margin-bottom: 4px;">Quem:</div>
            <div style="color: #581c87; font-size: 13px;">${action.who_responsible}</div>
          </div>` : ''}
          ${action.when_deadline ? `
          <div style="background: #fefce8; padding: 10px; border-radius: 6px; border-left: 3px solid #eab308;">
            <div class="w5-label" style="font-weight: 600; color: #92400e; margin-bottom: 4px;">Quando:</div>
            <div style="color: #78350f; font-size: 13px;">${new Date(action.when_deadline).toLocaleDateString('pt-BR')}</div>
          </div>` : ''}
          ${action.how_much_cost ? `
          <div style="grid-column: 1/-1; background: #fff7ed; padding: 10px; border-radius: 6px; border-left: 3px solid #f97316;">
            <div class="w5-label" style="font-weight: 600; color: #c2410c; margin-bottom: 4px;">Quanto:</div>
            <div style="color: #9a3412; font-size: 13px;">${action.how_much_cost}</div>
          </div>` : ''}
        </div>
        
        ${action.assigned_to ? `
        <div style="margin-top: 12px; padding: 8px; background: #f8fafc; border-radius: 4px; font-size: 11px;">
          <span style="font-weight: 600; color: #374151;">Atribuído a:</span>
          <span style="color: #111827; margin-left: 6px;">${action.assigned_to}</span>
        </div>` : ''}
      </div>
    `).join('')}
  </div>` : ''}

  ${includeSignatures ? `
  <div class="signatures-section page-break">
    <h2>Assinaturas Digitais</h2>
    <div class="signatures-grid">
      <div class="signature-box">
        <h3>Assinatura do Inspetor</h3>
        <div class="signature-preview">
          ${signatures.inspector ? `<img src="${signatures.inspector}" alt="Assinatura do Inspetor" />` : '<div style="color: #9ca3af;">Assinatura não disponível</div>'}
        </div>
        <div class="signature-line"></div>
        <div class="signature-name">${inspection.inspector_name}</div>
        <div class="signature-role">Inspetor Responsável</div>
      </div>
      <div class="signature-box">
        <h3>Assinatura do Responsável</h3>
        <div class="signature-preview">
          ${signatures.responsible ? `<img src="${signatures.responsible}" alt="Assinatura do Responsável" />` : '<div style="color: #9ca3af;">Assinatura não disponível</div>'}
        </div>
        <div class="signature-line"></div>
        <div class="signature-name">${inspection.responsible_name || 'Responsável Técnico'}</div>
        <div class="signature-role">Empresa</div>
      </div>
    </div>
  </div>` : ''}

  ${qrCodeDataUrl ? `
  <div class="page-break" style="text-align: center; margin-top: 40px; padding: 30px; border-top: 3px solid #3b82f6; background: linear-gradient(135deg, #f0f9ff, #e0f2fe);">
    <h2 style="color: #1e40af; font-size: 24px; margin-bottom: 20px; display: flex; align-items: center; justify-content: center; gap: 10px;">
      Acesse o Relatório Digital
    </h2>
    
    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 30px; align-items: center; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center;">
        <div style="background: white; padding: 15px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); display: inline-block;">
          <img src="${qrCodeDataUrl}" alt="QR Code do Relatório" style="width: 150px; height: 150px; display: block;">
        </div>
        <p style="font-size: 12px; color: #1e40af; margin-top: 15px; font-weight: 600;">
          Escaneie com a câmera do celular
        </p>
      </div>
      
      <div style="text-align: left;">
        <h3 style="color: #1e40af; font-size: 16px; margin-bottom: 15px;">Recursos Digitais:</h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 12px; line-height: 1.8;">
          <li style="margin-bottom: 8px;"><strong>Evidências Interativas:</strong> Visualize fotos, vídeos e áudios</li>
          <li style="margin-bottom: 8px;"><strong>GPS Navegável:</strong> Coordenadas clicáveis para mapas</li>
          <li style="margin-bottom: 8px;"><strong>Análises da IA:</strong> Planos de ação detalhados</li>
          <li style="margin-bottom: 8px;"><strong>Assinaturas Digitais:</strong> Verificação de autenticidade</li>
          <li style="margin-bottom: 8px;"><strong>Dashboard Dinâmico:</strong> Estatísticas atualizadas</li>
        </ul>
        
        ${shareLink ? `
        <div style="margin-top: 20px; padding: 10px; background: white; border-radius: 8px; border: 1px solid #d1d5db;">
          <p style="font-size: 10px; color: #374151; margin: 0 0 5px 0;"><strong>🔗 Link direto:</strong></p>
          <p style="font-size: 9px; color: #6b7280; word-break: break-all; margin: 0;">${shareLink}</p>
        </div>
        ` : ''}
      </div>
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <p><strong>Relatório gerado automaticamente pelo Sistema Compia</strong></p>
    <p>Este documento possui validade legal conforme legislação vigente</p>
    <p>Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
    ${inspection.latitude && inspection.longitude ? `
    <p style="margin-top: 10px;"><strong>Localização GPS:</strong> 
      <a href="https://www.google.com/maps/search/?api=1&query=${inspection.latitude},${inspection.longitude}" target="_blank" style="color: #2563eb; text-decoration: underline;">
        ${inspection.latitude.toFixed(6)}, ${inspection.longitude.toFixed(6)}
      </a>
    </p>` : ''}
    ${media.length > 0 ? `<p style="margin-top: 10px;"><strong>Mídias completas:</strong> Disponíveis na versão digital</p>` : ''}
  </div>
</body>
</html>`;
  };

  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    try {
      // Show initial progress
      success('Gerando PDF', 'Preparando o relatório... Por favor, aguarde.');

      const htmlContent = generatePDFHTML();

      // Create Blob URL to avoid about:blank in print header
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);

      // Open with Blob URL - this gives the window a proper URL instead of about:blank
      const printWindow = window.open(blobUrl, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
      if (!printWindow) {
        URL.revokeObjectURL(blobUrl); // Clean up
        throw new Error('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está desativado.');
      }

      // Set up error handling for the new window
      printWindow.onerror = (msg, url, lineNo, columnNo, error) => {
        console.error('Erro na janela de PDF:', { msg, url, lineNo, columnNo, error });
        URL.revokeObjectURL(blobUrl); // Clean up
        throw new Error('Erro ao carregar conteúdo do PDF');
      };

      // Enhanced loading wait with multiple fallbacks
      await new Promise((resolve, reject) => {
        let resolved = false;

        // Primary load event
        printWindow.onload = () => {
          if (!resolved) {
            resolved = true;
            resolve(true);
          }
        };

        // Fallback for when document is ready
        const checkReady = () => {
          if (printWindow.document.readyState === 'complete' && !resolved) {
            resolved = true;
            resolve(true);
          }
        };

        // Check readiness multiple times
        setTimeout(checkReady, 500);
        setTimeout(checkReady, 1000);
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(true); // Force resolve after timeout
          }
        }, 3000);

        // Error timeout
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error('Timeout ao carregar conteúdo do PDF'));
          }
        }, 10000);
      });

      // Additional delay to ensure all images are loaded
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Focus window and trigger print dialog
      printWindow.focus();

      // Check if window is still available before printing
      if (printWindow.closed) {
        throw new Error('A janela foi fechada prematuramente');
      }

      // Trigger print dialog with error handling
      try {
        printWindow.print();
      } catch (printError) {
        console.warn('Erro ao abrir diálogo de impressão:', printError);
        // Even if print dialog fails, the window is open for manual printing
      }

      success('PDF Pronto', 'Relatório aberto em nova janela! Use Ctrl+P (Windows) ou Cmd+P (Mac) para imprimir/salvar. Se a impressão não abriu automaticamente, use o menu do navegador.');

      // Don't auto-close the window - let user control it
      // User can close it manually after printing/saving

      onClose();
    } catch (err) {
      console.error('Erro detalhado ao gerar PDF:', err);

      let errorMessage = 'Erro desconhecido ao gerar relatório';
      let errorTitle = 'Erro ao Gerar PDF';

      if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        errorMessage = err.message;

        if (msg.includes('pop-up') || msg.includes('janela')) {
          errorTitle = 'Bloqueador de Pop-ups';
          errorMessage = 'Desative o bloqueador de pop-ups do seu navegador e tente novamente.';
        } else if (msg.includes('timeout')) {
          errorTitle = 'Timeout';
          errorMessage = 'O PDF demorou muito para carregar. Tente novamente com menos imagens ou conteúdo.';
        } else if (msg.includes('fechada')) {
          errorTitle = 'Janela Fechada';
          errorMessage = 'A janela do PDF foi fechada. Tente gerar o relatório novamente.';
        }
      }

      error(errorTitle, errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <FileDown className="w-6 h-6 text-blue-600" />
              <h2 className="font-heading text-2xl font-bold text-slate-900">
                Gerar Relatório PDF
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Preview Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">
                {inspection.title}
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm text-blue-800">
                <div>
                  <span className="font-medium">Total de Itens:</span> {stats.totalItems}
                </div>
                <div>
                  <span className="font-medium">Conformidade:</span> {stats.conformanceRate}%
                </div>
                <div>
                  <span className="font-medium">Mídias:</span> {media.length}
                </div>
                <div>
                  <span className="font-medium">Status:</span> {inspection.status === 'concluida' ? 'Finalizada' : 'Em andamento'}
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900">Opções do Relatório</h3>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeMedia}
                    onChange={(e) => setIncludeMedia(e.target.checked)}
                    className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-medium text-slate-900">
                      Incluir Evidências Visuais
                    </span>
                    <p className="text-sm text-slate-600 mt-1">
                      Inclui todas as fotos, vídeos e áudios anexados aos itens da inspeção.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSignatures}
                    onChange={(e) => setIncludeSignatures(e.target.checked)}
                    className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-medium text-slate-900">
                      Incluir Assinaturas Digitais
                    </span>
                    <p className="text-sm text-slate-600 mt-1">
                      Inclui as assinaturas digitais do inspetor e responsável técnico.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeActionPlan}
                    onChange={(e) => setIncludeActionPlan(e.target.checked)}
                    className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-medium text-slate-900">
                      Incluir Planos de Ação Detalhados
                    </span>
                    <p className="text-sm text-slate-600 mt-1">
                      Inclui todos os planos de ação 5W2H gerados pela IA com detalhes completos.
                    </p>
                  </div>
                </label>
              </div>

              {/* Logo Selection */}
              {(organizationLogoUrl || parentOrganizationLogoUrl) && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Logo no Relatório
                  </h4>
                  <div className="space-y-2">
                    {parentOrganizationLogoUrl && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="logoPreference"
                          value="parent"
                          checked={logoPreference === 'parent'}
                          onChange={() => setLogoPreference('parent')}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">
                          Apenas logo da {parentOrganizationName}
                        </span>
                      </label>
                    )}
                    {organizationLogoUrl && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="logoPreference"
                          value="organization"
                          checked={logoPreference === 'organization'}
                          onChange={() => setLogoPreference('organization')}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">
                          Apenas logo da {organizationName}
                        </span>
                      </label>
                    )}
                    {organizationLogoUrl && parentOrganizationLogoUrl && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="logoPreference"
                          value="both"
                          checked={logoPreference === 'both'}
                          onChange={() => setLogoPreference('both')}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">
                          Ambos os logos
                        </span>
                      </label>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="logoPreference"
                        value="none"
                        checked={logoPreference === 'none'}
                        onChange={() => setLogoPreference('none')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">
                        Sem logo
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h4 className="font-medium text-slate-900 mb-2">📄 Será incluído no PDF:</h4>
              <ul className="text-sm text-slate-700 space-y-1">
                <li>✓ Informações da inspeção e estatísticas</li>
                <li>✓ Todas as respostas do checklist</li>
                <li>✓ Análises da IA (quando disponíveis)</li>
                {includeMedia && <li>✓ Evidências visuais (fotos, vídeos, áudios)</li>}
                {includeActionPlan && <li>✓ Planos de ação 5W2H detalhados</li>}
                {includeSignatures && <li>✓ Assinaturas digitais</li>}
                <li>✓ Rodapé com data/hora de geração</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={onClose}
                className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleGeneratePDF}
                disabled={isGenerating}
                className="flex-1 flex items-center justify-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando PDF...
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4 mr-2" />
                    Gerar Relatório PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
