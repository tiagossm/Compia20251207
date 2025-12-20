import { useState, useRef } from 'react';
import { ChecklistField, FieldResponse } from '@/shared/checklist-types';
import { calculateAutoCompliance } from '@/shared/compliance-utils';
import { useMediaHandling } from '@/react-app/hooks/useMediaHandling';
import { fetchWithAuth } from '@/react-app/utils/auth';
import InspectionList from './InspectionList';
import InspectionItem from './InspectionItem';
import CameraModal from './CameraModal';
import {
  Star, Calendar, Clock,
  Upload, CheckCircle, ThumbsUp, ThumbsDown
} from 'lucide-react';

interface ChecklistFormProps {
  fields: ChecklistField[];
  onSubmit: (responses: FieldResponse[]) => void;
  initialValues?: Record<number, any>;
  readonly?: boolean;
  inspectionId?: number;
  inspectionItems?: any[];
  onAutoSave?: (responses: Record<number, any>, comments: Record<number, string>, complianceStatuses?: Record<number, any>) => void;
  onSaveSuccess?: () => void;
  showComplianceSelector?: boolean;
}

export default function ChecklistForm({
  fields,
  onSubmit,
  initialValues = {},
  onAutoSave,
  inspectionId,
  showComplianceSelector = true
}: ChecklistFormProps) {

  // State
  const [responses, setResponses] = useState<Record<number, any>>(initialValues);
  const [itemsComments, setItemsComments] = useState<Record<number, string>>({});
  const [complianceStatuses, setComplianceStatuses] = useState<Record<number, string>>({});
  const [itemsMedia, setItemsMedia] = useState<Record<number, any[]>>({});
  const [generatingResponse, setGeneratingResponse] = useState<Record<number, boolean>>({});
  const [itemsAnalysis, setItemsAnalysis] = useState<Record<number, string>>({});
  const [creatingAction, setCreatingAction] = useState<Record<number, boolean>>({});
  const [itemsActionPlan, setItemsActionPlan] = useState<Record<number, any>>({});
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Media Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeMediaFieldId = useRef<number | null>(null);
  const activeMediaType = useRef<string>('image');

  const updateResponse = (fieldId: number, value: any) => {
    const field = fields.find(f => f.id === fieldId);

    setResponses(prev => {
      const next = { ...prev, [fieldId]: value };

      // Calcular conformidade automaticamente se o campo tiver modo 'auto'
      if (field && field.compliance_enabled !== false && field.compliance_mode !== 'manual') {
        const autoStatus = calculateAutoCompliance(field, value);
        if (autoStatus) {
          setComplianceStatuses(prevStatus => {
            const nextStatus = { ...prevStatus, [fieldId]: autoStatus };
            if (onAutoSave) onAutoSave(next, itemsComments, nextStatus);
            return nextStatus;
          });
          return next;
        }
      }

      if (onAutoSave) onAutoSave(next, itemsComments, complianceStatuses);
      return next;
    });
  };

  const updateComment = (fieldId: number, comment: string) => {
    setItemsComments(prev => {
      const next = { ...prev, [fieldId]: comment };
      if (onAutoSave) onAutoSave(responses, next, complianceStatuses);
      return next;
    });
  };

  const updateComplianceStatus = (fieldId: number, status: string) => {
    setComplianceStatuses(prev => {
      const next = { ...prev, [fieldId]: status };
      if (onAutoSave) onAutoSave(responses, itemsComments, next);
      return next;
    });
  };

  // --- Media Logic ---
  const { uploadFile, startAudioRecording, stopRecording, recording, recordingTime } = useMediaHandling({
    inspectionId: inspectionId || 0,
    onMediaUploaded: (media) => {
      const fieldId = activeMediaFieldId.current;
      if (fieldId) {
        setItemsMedia(prev => ({
          ...prev,
          [fieldId]: [...(prev[fieldId] || []), media]
        }));
      }
    }
  });

  const handleMediaRequest = async (fieldId: number, type: 'image' | 'audio' | 'video' | 'file', source?: 'camera' | 'upload') => {
    activeMediaFieldId.current = fieldId;
    activeMediaType.current = type;

    if (type === 'image') {
      if (source === 'camera') {
        setIsCameraOpen(true);
      } else {
        if (fileInputRef.current) {
          fileInputRef.current.accept = 'image/*';
          fileInputRef.current.removeAttribute('capture');
          fileInputRef.current.click();
        }
      }
    } else if (type === 'audio') {
      if (source === 'camera') {
        if (recording === 'audio') {
          // Stop recording and upload the blob
          const blob = await stopRecording();
          if (blob && fieldId) {
            const audioFile = new File([blob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });
            await uploadFile(audioFile, fieldId, 'audio');
          }
        } else {
          activeMediaFieldId.current = fieldId;
          await startAudioRecording();
        }
      } else {
        if (fileInputRef.current) {
          fileInputRef.current.accept = 'audio/*';
          fileInputRef.current.removeAttribute('capture');
          fileInputRef.current.click();
        }
      }
    } else if (type === 'file') {
      if (fileInputRef.current) {
        fileInputRef.current.accept = '.pdf,.doc,.docx,.xls,.xlsx,.txt';
        fileInputRef.current.removeAttribute('capture');
        fileInputRef.current.click();
      }
    } else if (type === 'video') {
      if (fileInputRef.current) {
        fileInputRef.current.accept = 'video/*';
        fileInputRef.current.removeAttribute('capture');
        fileInputRef.current.click();
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const fieldId = activeMediaFieldId.current;

    if (files && files.length > 0 && fieldId) {
      const file = files[0];
      const type = activeMediaType.current;
      await uploadFile(file, fieldId, type as any);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMediaDelete = async (fieldId: number, mediaId: number) => {
    try {
      const response = await fetchWithAuth(`/api/media/${mediaId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setItemsMedia(prev => ({
          ...prev,
          [fieldId]: (prev[fieldId] || []).filter(m => m.id !== mediaId)
        }));
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || 'Erro ao excluir mídia');
      }
    } catch (error) {
      console.error('Delete media error:', error);
      alert('Erro ao excluir mídia');
    }
  };

  // --- AI Logic ---
  const handleAiAnalysisRequest = async (fieldId: number, mediaIds: number[] = []) => {
    if (!fieldId) return;
    setGeneratingResponse(prev => ({ ...prev, [fieldId]: true }));

    try {
      const currentMedia = itemsMedia[fieldId] || [];
      const relevantMedia = mediaIds.length > 0
        ? currentMedia.filter(m => m.id && mediaIds.includes(m.id))
        : currentMedia;

      const mediaData = relevantMedia.map(m => ({
        file_url: m.file_url,
        media_type: m.media_type,
        file_name: m.file_name
      }));

      const response = await fetchWithAuth(`/api/inspection-items/${fieldId}/pre-analysis`, {
        method: 'POST',
        body: JSON.stringify({
          inspection_id: inspectionId,
          field_name: fields.find(f => f.id === fieldId)?.field_name || '',
          response_value: responses[fieldId] || '',
          media_data: mediaData
        })
      });

      if (response.ok) {
        const data = await response.json();
        setItemsAnalysis(prev => ({ ...prev, [fieldId]: data.pre_analysis || data.analysis || 'Análise concluída.' }));
      } else {
        console.error("AI Analysis failed", response.statusText);
        alert("Erro ao gerar análise IA. Tente novamente.");
      }
    } catch (error) {
      console.error("AI Error", error);
      alert("Erro de conexão ao gerar análise.");
    } finally {
      setGeneratingResponse(prev => ({ ...prev, [fieldId]: false }));
    }
  };

  const handleAiActionPlanRequest = async (fieldId: number, mediaIds: number[] = []) => {
    if (!fieldId) return;
    setCreatingAction(prev => ({ ...prev, [fieldId]: true }));

    try {
      const currentMedia = itemsMedia[fieldId] || [];
      const relevantMedia = mediaIds.length > 0
        ? currentMedia.filter(m => m.id && mediaIds.includes(m.id))
        : currentMedia;

      const mediaData = relevantMedia.map(m => ({
        file_url: m.file_url,
        media_type: m.media_type,
        file_name: m.file_name
      }));

      const response = await fetchWithAuth(`/api/inspection-items/${fieldId}/create-action`, {
        method: 'POST',
        body: JSON.stringify({
          inspection_id: inspectionId,
          field_name: fields.find(f => f.id === fieldId)?.field_name || '',
          response_value: responses[fieldId] || '',
          pre_analysis: itemsAnalysis[fieldId] || null,
          media_data: mediaData
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Store action plan for inline display
        if (data.action_item) {
          setItemsActionPlan(prev => ({ ...prev, [fieldId]: data.action_item }));
        }
      } else {
        const err = await response.json().catch(() => ({}));
        console.error("AI Action Plan failed", err);
        alert(err.error || "Erro ao gerar plano 5W2H. Tente novamente.");
      }
    } catch (error) {
      console.error("AI Error", error);
      alert("Erro de conexão ao gerar plano.");
    } finally {
      setCreatingAction(prev => ({ ...prev, [fieldId]: false }));
    }
  };

  const handleManualActionSave = async (fieldId: number, actionData: { title: string; priority: string; what_description?: string }) => {
    if (!inspectionId) return;

    try {
      const response = await fetchWithAuth(`/api/inspections/${inspectionId}/action-items`, {
        method: 'POST',
        body: JSON.stringify({
          inspection_id: inspectionId,
          inspection_item_id: fieldId,
          title: actionData.title,
          what_description: actionData.what_description || '',
          priority: actionData.priority,
          status: 'pending',
          is_ai_generated: false
        })
      });

      if (response.ok) {
        alert('✅ Ação manual criada com sucesso!');
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || 'Erro ao criar ação manual.');
      }
    } catch (error) {
      console.error('Manual Action Error', error);
      alert('Erro de conexão.');
    }
  };

  const handleFinalize = () => {
    // Collect responses with compliance status
    const submitData: FieldResponse[] = Object.keys(responses).map(key => {
      const fid = Number(key);
      const field = fields.find(f => f.id === fid);
      if (!field) return null;

      return {
        field_id: fid,
        field_name: field.field_name,
        field_type: field.field_type,
        value: responses[fid],
        comment: itemsComments[fid],
        compliance_status: complianceStatuses[fid] || 'unanswered'
      } as FieldResponse;
    }).filter((item): item is FieldResponse => item !== null);

    onSubmit(submitData);
  };

  const renderInput = (field: ChecklistField) => {
    const value = responses[field.id!];
    const update = (val: any) => updateResponse(field.id!, val);

    switch (field.field_type) {
      case 'text':
        return (
          <input
            type="text"
            value={value || ''}
            onChange={e => update(e.target.value)}
            className="w-full border-b border-slate-200 py-3 text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none bg-transparent transition-colors"
            placeholder="Digite a resposta..."
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={e => {
              update(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            rows={1}
            className="w-full border-b border-slate-200 py-3 text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none bg-transparent transition-colors resize-none overflow-hidden"
            placeholder="Digite a resposta detalhada..."
          />
        );

      case 'select':
      case 'radio': {
        let options: string[] = ['Opção 1', 'Opção 2'];
        if (field.options) {
          try {
            const parsed = JSON.parse(field.options);
            if (Array.isArray(parsed)) options = parsed;
            else options = field.options.split('|').map(s => s.trim());
          } catch {
            options = field.options.split('|').map(s => s.trim());
          }
        }
        return (
          <div className="flex flex-wrap gap-1.5">
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => update(opt)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${value === opt ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
              >
                {opt}
              </button>
            ))}
          </div>
        );
      }

      case 'multiselect':
      case 'checkbox': {
        let options: string[] = ['Opção A', 'Opção B'];
        try {
          if (field.options) {
            try {
              const parsed = JSON.parse(field.options);
              if (Array.isArray(parsed)) options = parsed;
              else options = field.options.split('|').map(s => s.trim());
            } catch {
              options = field.options.split('|').map(s => s.trim());
            }
          }
        } catch (e) { console.error("Error parsing options", e); }
        const currentValues = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);

        const toggleOption = (opt: string) => {
          const newValues = currentValues.includes(opt)
            ? currentValues.filter((v: string) => v !== opt)
            : [...currentValues, opt];
          update(newValues);
        };

        return (
          <div className="flex flex-wrap gap-2">
            {options.map(opt => {
              const isActive = currentValues.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleOption(opt)}
                  className={`px-4 py-2 rounded-full text-xs font-medium border transition-all flex items-center gap-1 ${isActive ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >
                  {isActive && <CheckCircle size={12} />}
                  {opt}
                </button>
              );
            })}
          </div>
        );
      }

      case 'date':
        return (
          <div className="relative">
            <Calendar className="absolute left-0 top-3 text-slate-400 w-5 h-5" />
            <input
              type="date"
              value={value || ''}
              onChange={e => update(e.target.value)}
              className="w-full border-b border-slate-200 py-3 pl-8 text-slate-800 focus:border-blue-600 focus:outline-none bg-transparent"
            />
          </div>
        );

      case 'time':
        return (
          <div className="relative">
            <Clock className="absolute left-0 top-3 text-slate-400 w-5 h-5" />
            <input
              type="time"
              value={value || ''}
              onChange={e => update(e.target.value)}
              className="w-full border-b border-slate-200 py-3 pl-8 text-slate-800 focus:border-blue-600 focus:outline-none bg-transparent"
            />
          </div>
        );

      case 'rating':
        return (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => update(star)}
                className="p-1 hover:scale-110 transition-transform focus:outline-none"
              >
                <Star
                  size={24}
                  className={`${(Number(value) || 0) >= star ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`}
                />
              </button>
            ))}
          </div>
        );

      case 'file':
        return (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-200 transition-colors"
              onClick={() => {
                alert("Upload de arquivo de resposta (Simulação)");
                update("arquivo_simulado.pdf");
              }}
            >
              <Upload size={16} />
              {value ? 'Substituir Arquivo' : 'Carregar Arquivo'}
            </button>
            {value && <span className="text-sm text-blue-600 underline truncate max-w-[200px]">{value}</span>}
          </div>
        );

      case 'boolean':
        return (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => update(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${value === true ? 'bg-green-600 text-white border-green-600 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-green-300 hover:bg-green-50'}`}
            >
              <ThumbsUp size={14} />
              <span>Conforme</span>
            </button>
            <button
              type="button"
              onClick={() => update(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${value === false ? 'bg-red-600 text-white border-red-600 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-red-300 hover:bg-red-50'}`}
            >
              <ThumbsDown size={14} />
              <span>Não Conforme</span>
            </button>
          </div>
        );

      default:
        // Default to text if type not recognized
        return (
          <input
            type="text"
            value={value || ''}
            onChange={e => update(e.target.value)}
            className="w-full border-b border-slate-200 py-3 text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none bg-transparent transition-colors"
            placeholder="Digite a resposta..."
          />
        );
    }
  };

  return (
    <>
      {/* Hidden File Input for Media Actions */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
      />

      <InspectionList
        items={fields}
        onFinalize={handleFinalize}
        renderItem={(field, index) => {
          if (!field.id) return null;

          // Construct Item Object for UI
          const itemData = {
            id: field.id,
            description: field.field_name,
            category: 'Geral',
            response: responses[field.id],
            comment: itemsComments[field.id],
            aiAnalysis: itemsAnalysis[field.id],
            field_type: field.field_type
          };

          return (
            <InspectionItem
              key={field.id}
              item={itemData}
              media={itemsMedia[field.id] || []}
              complianceEnabled={field.compliance_enabled !== false}
              complianceMode={field.compliance_mode || 'auto'}
              complianceStatus={complianceStatuses[field.id] as any}
              onComplianceChange={showComplianceSelector ? (status: string) => updateComplianceStatus(field.id!, status) : undefined}
              onCommentChange={(val: string) => updateComment(field.id!, val)}
              onMediaUpload={(type: 'image' | 'audio' | 'video' | 'file', source?: 'camera' | 'upload') => handleMediaRequest(field.id!, type, source)}
              onMediaDelete={(mediaId: number) => handleMediaDelete(field.id!, mediaId)}
              onAiAnalysisRequest={(ids: number[]) => handleAiAnalysisRequest(field.id!, ids)}
              onAiActionPlanRequest={(ids: number[]) => handleAiActionPlanRequest(field.id!, ids)}
              onManualActionSave={(data: { title: string; priority: string; what_description?: string }) => handleManualActionSave(field.id!, data)}
              actionPlan={itemsActionPlan[field.id] || null}
              isAiAnalyzing={generatingResponse[field.id]}
              isCreatingAction={creatingAction[field.id]}
              isRecording={recording === 'audio' && activeMediaFieldId.current === field.id}
              recordingTime={recordingTime}
              index={index}
            >
              {renderInput(field)}
            </InspectionItem>
          );
        }}
      />

      {/* Embedded Camera Modal */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(blob) => {
          const fieldId = activeMediaFieldId.current;
          if (fieldId) {
            const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
            uploadFile(file, fieldId, 'image');
          }
        }}
      />
    </>
  );
}
