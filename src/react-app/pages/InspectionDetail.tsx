import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchWithAuth } from '@/react-app/utils/auth';
import Layout from '@/react-app/components/Layout';
import {
  ArrowLeft,
  Plus,
  Check,
  X,
  AlertTriangle,
  Calendar,
  User,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  Navigation,
  Brain,
  FileText,
  Image as ImageIcon,
  Target,
  PenTool,
  FileCheck,
  Eye,
  Share2,
  Sparkles,
  Trash2
} from 'lucide-react';
import { InspectionType, InspectionItemType, InspectionMediaType } from '@/shared/types';
import { FieldResponse } from '@/shared/checklist-types';
import ChecklistForm from '@/react-app/components/ChecklistForm';
import MediaUpload from '@/react-app/components/MediaUpload';
import InspectionSignature from '@/react-app/components/InspectionSignature';
import InspectionSummary from '@/react-app/components/InspectionSummary';
import InspectionShare from '@/react-app/components/InspectionShare';
import PDFGenerator from '@/react-app/components/PDFGenerator';
import LoadingSpinner from '@/react-app/components/LoadingSpinner';
import { useToast } from '@/react-app/hooks/useToast';

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error, warning } = useToast();
  const [inspection, setInspection] = useState<InspectionType | null>(null);
  const [items, setItems] = useState<InspectionItemType[]>([]);
  const [templateItems, setTemplateItems] = useState<any[]>([]);
  const [media, setMedia] = useState<InspectionMediaType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [actionPlan, setActionPlan] = useState<any>(null);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [showSignatures, setShowSignatures] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPDFGenerator, setShowPDFGenerator] = useState(false);
  const [signatures, setSignatures] = useState<{ inspector?: string; responsible?: string }>({});
  const [responses, setResponses] = useState<Record<number, any>>({});
  const [newItem, setNewItem] = useState({
    category: '',
    item_description: '',
    is_compliant: null as boolean | null,
    observations: ''
  });
  const [showNewAction, setShowNewAction] = useState(false);
  const [newAction, setNewAction] = useState({
    title: '',
    what_description: '',
    where_location: '',
    why_reason: '',
    how_method: '',
    who_responsible: '',
    when_deadline: '',
    how_much_cost: '',
    status: 'pending' as const,
    priority: 'media' as 'baixa' | 'media' | 'alta'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Only fetch if ID is valid (truthy and not the literal string "undefined")
    if (id && id !== 'undefined') {
      fetchInspectionDetails();
    } else {
      console.warn('[InspectionDetail] Invalid inspection ID:', id);
      setLoading(false);
      // Redirect to list to avoid stuck state
      navigate('/inspections');
    }
  }, [id]);

  const fetchInspectionDetails = async () => {
    try {
      const response = await fetchWithAuth(`/api/inspections/${id}`);
      if (response.ok) {
        const data = await response.json();
        setInspection(data.inspection);

        // Separate template-based items from manual items
        const allItems = data.items || [];
        const manualItems = allItems.filter((item: any) => !item.template_id);
        const templateBasedItems = allItems.filter((item: any) => item.template_id);

        console.log('[DEBUG_FE] All Items:', allItems.length, allItems);
        console.log('[DEBUG_FE] Manual Items:', manualItems.length);
        console.log('[DEBUG_FE] Template Items:', templateBasedItems.length);
        if (templateBasedItems.length > 0) {
          console.log('[DEBUG_FE] First Template Item:', templateBasedItems[0]);
          if (templateBasedItems[0].item_description) {
            console.log('[DEBUG_FE] First Item Description:', templateBasedItems[0].item_description);
          }
        }
        setItems(manualItems);
        setTemplateItems(templateBasedItems);
        setMedia(data.media || []);

        // Parse action plan if available
        if (data.inspection.action_plan) {
          try {
            setActionPlan(JSON.parse(data.inspection.action_plan));
          } catch (error) {
            console.error('Error parsing action plan:', error);
          }
        }

        // Load action items from the action_items table - use direct route
        try {
          const actionItemsResponse = await fetchWithAuth(`/api/inspections/${id}/action-items`);
          if (actionItemsResponse.ok) {
            const actionItemsData = await actionItemsResponse.json();
            // Response is array directly, not nested in action_items
            const inspectionActionItems = Array.isArray(actionItemsData) ? actionItemsData : (actionItemsData.action_items || []);
            setActionItems(inspectionActionItems);
            console.log(`[ACTION-ITEMS] Loaded ${inspectionActionItems.length} action items for inspection ${id}`);
          }
        } catch (actionItemsError) {
          console.error('Error loading action items:', actionItemsError);
        }

        // Load signatures with cache busting
        console.log('Loading signatures for inspection:', id);
        const signaturesResponse = await fetchWithAuth(`/api/inspections/${id}/signatures?_t=${Date.now()}`);
        if (signaturesResponse.ok) {
          const signaturesData = await signaturesResponse.json();
          console.log('Signatures loaded from API:', {
            inspector: signaturesData.inspector_signature ? 'Present' : 'Missing',
            responsible: signaturesData.responsible_signature ? 'Present' : 'Missing',
            responsible_name: signaturesData.responsible_name || '(sem nome)'
          });
          setSignatures({
            inspector: signaturesData.inspector_signature,
            responsible: signaturesData.responsible_signature
          });
        } else {
          console.error('Failed to load signatures:', signaturesResponse.status);
        }

        // Load template responses with improved null handling and type conversion
        const templateResponses = templateBasedItems.reduce((acc: Record<number, any>, item: any) => {
          if (item.field_responses) {
            try {
              const fieldData = JSON.parse(item.field_responses);

              // Always set a default value based on field type, even if response_value is null
              let parsedValue = fieldData.response_value;

              // Set appropriate default values for different field types
              if (parsedValue === null || parsedValue === undefined) {
                switch (fieldData.field_type) {
                  case 'boolean':
                    parsedValue = null; // Keep null for boolean to show unselected state
                    break;
                  case 'multiselect':
                    parsedValue = []; // Empty array for multiselect
                    break;
                  case 'select':
                  case 'radio':
                    parsedValue = ''; // Empty string for select
                    break;
                  case 'number':
                  case 'rating':
                    parsedValue = null; // Keep null for numbers
                    break;
                  case 'text':
                  case 'textarea':
                    parsedValue = ''; // Empty string for text fields
                    break;
                  default:
                    parsedValue = null;
                }
              } else {
                // Process non-null values with enhanced type conversion
                if (fieldData.field_type === 'boolean') {
                  if (typeof parsedValue === 'string') {
                    parsedValue = parsedValue.toLowerCase() === 'true' || parsedValue === '1';
                  } else if (typeof parsedValue === 'number') {
                    parsedValue = parsedValue === 1;
                  }
                } else if (fieldData.field_type === 'multiselect') {
                  if (typeof parsedValue === 'string') {
                    try {
                      const parsed = JSON.parse(parsedValue);
                      if (Array.isArray(parsed)) {
                        parsedValue = parsed;
                      } else {
                        parsedValue = parsedValue.split(',').map((s: string) => s.trim()).filter((s: string) => s);
                      }
                    } catch {
                      parsedValue = parsedValue.split(',').map((s: string) => s.trim()).filter((s: string) => s);
                    }
                  } else if (!Array.isArray(parsedValue)) {
                    parsedValue = [];
                  }
                } else if (fieldData.field_type === 'number' || fieldData.field_type === 'rating') {
                  if (typeof parsedValue === 'string') {
                    const numValue = parseFloat(parsedValue);
                    parsedValue = isNaN(numValue) ? null : numValue;
                  }
                } else if (typeof parsedValue === 'string' && parsedValue !== '') {
                  // Try to parse stringified JSON values for other types
                  try {
                    const tempParsed = JSON.parse(parsedValue);
                    if (typeof tempParsed === 'boolean' ||
                      typeof tempParsed === 'number' ||
                      Array.isArray(tempParsed)) {
                      parsedValue = tempParsed;
                    }
                  } catch (parseError) {
                    // Keep as string if not valid JSON
                  }
                }
              }

              // Always set the field value, even if null (for proper form rendering)
              acc[fieldData.field_id] = parsedValue;

              // Load existing comments
              if (fieldData.comment) {
                (acc as Record<string, any>)[`comment_${fieldData.field_id}`] = fieldData.comment;
              }

            } catch (error) {
              console.error('[TEMPLATE-RESPONSE] Error parsing field response:', error, 'item:', item);
            }
          }
          return acc;
        }, {});

        setResponses(templateResponses);
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: number, isTemplateItem: boolean = false) => {
    if (!confirm('Tem certeza que deseja excluir este item? ' + (isTemplateItem ? 'Isso removerá a pergunta do relatório.' : ''))) return;

    try {
      const response = await fetchWithAuth(`/api/inspection-items/${itemId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Falha ao excluir item');

      // Update local state
      setItems(prev => prev.filter(i => i.id !== itemId));
      setTemplateItems(prev => prev.filter(i => i.id !== itemId));

      // Update responses state to remove deleted field
      setResponses(prev => {
        const newResponses = { ...prev };
        // We might need to find which field_id corresponds to this item_id if we store by field_id
        // But here we are just removing the item from the list.
        return newResponses;
      });

    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Erro ao excluir item: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleAddItem = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/inspections/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          inspection_id: parseInt(id!)
        })
      });

      if (response.ok) {
        setNewItem({
          category: '',
          item_description: '',
          is_compliant: null,
          observations: ''
        });
        setShowAddItem(false);
        success('Item adicionado', 'Item foi adicionado com sucesso ao checklist');
        fetchInspectionDetails();
      } else {
        error('Erro ao adicionar item', 'Não foi possível adicionar o item. Tente novamente.');
      }
    } catch (err) {
      console.error('Erro ao adicionar item:', err);
      error('Erro ao adicionar item', 'Ocorreu um erro inesperado. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateItemCompliance = async (itemId: number, isCompliant: boolean) => {
    try {
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      await fetchWithAuth(`/api/inspection-items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          is_compliant: isCompliant
        })
      });

      fetchInspectionDetails();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
    }
  };

  const handleFormSubmit = async (formResponses: FieldResponse[]) => {
    setIsSubmitting(true);
    try {
      // Prepare responses for database - map responses to inspection items
      const responseUpdates: Record<string, any> = {};

      formResponses.forEach((response) => {
        // Find the inspection item corresponding to this field_id
        const item = templateItems.find(i => {
          try {
            const fieldData = JSON.parse(i.field_responses);
            return fieldData.field_id === response.field_id;
          } catch {
            return false;
          }
        });

        if (item?.id) {
          try {
            const fieldData = JSON.parse(item.field_responses);

            // Update values
            fieldData.response_value = response.value;
            // Note: comment might need to be preserved if not present in this update
            // usually formResponses from ChecklistForm includes value only?
            // Actually ChecklistForm submits FieldResponse which has value and possibly comment if modified?
            // Let's check FieldResponse type. 
            // Assuming for now we just update value. Ideally we should merge.

            responseUpdates[item.id] = fieldData;
          } catch (error) {
            console.error('Error preparing field data:', error);
          }
        }
      });

      // Use the new template responses endpoint
      const response = await fetchWithAuth(`/api/inspections/${id}/template-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses: responseUpdates
        })
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar respostas');
      }

      // Update local responses state
      const newResponses = formResponses.reduce((acc, response) => {
        acc[response.field_id] = response.value;
        return acc;
      }, {} as Record<number, any>);
      // Merge with existing logic to preserve other fields/comments if needed
      setResponses(prev => ({
        ...prev,
        ...newResponses
      }));

      success('Respostas salvas', 'Respostas do checklist foram salvas com sucesso!');

      // Forces a refresh to ensure we have the latest server state (including compliance status logic)
      // fetchInspectionDetails(); 
      // User requested not to refresh? "Don't refresh inspection details after manual save to prevent losing form state"
      // But if we saved successfully, refreshing is safer.
    } catch (err) {
      console.error('Erro ao salvar respostas:', err);
      error('Erro ao salvar respostas', 'Não foi possível salvar as respostas. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignatureSaved = async (type: 'inspector' | 'responsible', signature: string) => {
    console.log(`Signature saved for ${type}:`, signature ? `Data length: ${signature.length}` : 'No signature data');
    if (signature && signature.length > 0) {
      setSignatures(prev => {
        const updated = { ...prev, [type]: signature };
        console.log('Updated signatures state:', {
          inspector: updated.inspector ? 'Present' : 'Missing',
          responsible: updated.responsible ? 'Present' : 'Missing'
        });
        return updated;
      });
      success('Assinatura salva', `Assinatura do ${type === 'inspector' ? 'inspetor' : 'responsável'} foi capturada com sucesso`);

      // Immediately save signature to database
      try {
        const saveResponse = await fetchWithAuth(`/api/inspections/${id}/signatures`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inspector_signature: type === 'inspector' ? signature : signatures.inspector,
            responsible_signature: type === 'responsible' ? signature : signatures.responsible
          })
        });

        if (!saveResponse.ok) {
          console.error('Failed to save signature to database:', saveResponse.status);
        }
      } catch (saveError) {
        console.error('Error saving signature to database:', saveError);
      }
    } else {
      error('Erro na assinatura', 'Não foi possível capturar a assinatura. Tente novamente.');
    }
  };

  const handleFinalizeInspection = async () => {
    // Validate signatures with better checks
    const hasInspectorSignature = signatures.inspector && signatures.inspector.trim() !== '';
    const hasResponsibleSignature = signatures.responsible && signatures.responsible.trim() !== '';

    if (!hasInspectorSignature || !hasResponsibleSignature) {
      const missingSignatures = [];
      if (!hasInspectorSignature) missingSignatures.push('inspetor');
      if (!hasResponsibleSignature) missingSignatures.push('responsável');

      warning(
        'Assinaturas obrigatórias',
        `É necessário ter a(s) assinatura(s) do(s) ${missingSignatures.join(' e ')} para finalizar a inspeção. Por favor, desenhe as assinaturas nos campos correspondentes.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      console.log('Finalizing inspection with signatures:', {
        inspector: hasInspectorSignature ? `Present (${signatures.inspector!.length} chars)` : 'Missing',
        responsible: hasResponsibleSignature ? `Present (${signatures.responsible!.length} chars)` : 'Missing'
      });

      // First, save signatures to database with responsible info
      const signaturesResponse = await fetchWithAuth(`/api/inspections/${id}/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspector_signature: signatures.inspector,
          responsible_signature: signatures.responsible,
          responsible_name: inspection?.responsible_name,
          responsible_email: inspection?.responsible_email
        })
      });

      if (!signaturesResponse.ok) {
        const errorData = await signaturesResponse.text();
        console.error('Failed to save signatures:', signaturesResponse.status, errorData);
        throw new Error('Erro ao salvar assinaturas');
      }

      // Then finalize the inspection
      const finalizeResponse = await fetchWithAuth(`/api/inspections/${id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspector_signature: signatures.inspector,
          responsible_signature: signatures.responsible,
          responsible_name: inspection?.responsible_name,
          responsible_email: inspection?.responsible_email
        })
      });

      if (!finalizeResponse.ok) {
        const errorData = await finalizeResponse.text();
        console.error('Failed to finalize inspection:', finalizeResponse.status, errorData);
        throw new Error('Erro ao finalizar inspeção');
      }

      console.log('Inspection finalized successfully');
      success('Inspeção finalizada', 'Inspeção foi finalizada com sucesso! As assinaturas foram salvas.');
      setShowSignatures(false);
      setShowSummary(true);

      // Invalidate signatures cache and fetch updated data
      try {
        const updatedSignaturesResponse = await fetchWithAuth(`/api/inspections/${id}/signatures?_t=${Date.now()}`);
        if (updatedSignaturesResponse.ok) {
          const updatedSignatures = await updatedSignaturesResponse.json();
          setSignatures(updatedSignatures);
          console.log('Updated signatures after finalization:', updatedSignatures);
        }
      } catch (cacheError) {
        console.error('Failed to refresh signatures cache:', cacheError);
      }

      // Fetch updated inspection details to ensure all data is current
      await fetchInspectionDetails();
    } catch (err) {
      console.error('Erro ao finalizar inspeção:', err);
      error('Erro ao finalizar inspeção', err instanceof Error ? err.message : 'Não foi possível finalizar a inspeção. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };



  const handleMediaUploaded = (newMedia: InspectionMediaType) => {
    setMedia(prev => [newMedia, ...prev]);
  };

  const handleMediaDeleted = (mediaId: number) => {
    setMedia(prev => prev.filter(m => m.id !== mediaId));
  };

  const handleCreateManualAction = async () => {
    if (!newAction.title.trim()) {
      error('Título obrigatório', 'Por favor, informe o título da ação');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetchWithAuth(`/api/inspections/${id}/action-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newAction,
          inspection_id: parseInt(id!)
        })
      });

      if (response.ok) {
        setNewAction({
          title: '',
          what_description: '',
          where_location: '',
          why_reason: '',
          how_method: '',
          who_responsible: '',
          when_deadline: '',
          how_much_cost: '',
          status: 'pending' as const,
          priority: 'media' as 'baixa' | 'media' | 'alta'
        });
        setShowNewAction(false);
        success('Ação criada', 'Ação manual foi criada com sucesso!');

        // Refresh inspection details to show the new action
        await fetchInspectionDetails();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao criar ação');
      }
    } catch (err) {
      console.error('Erro ao criar ação:', err);
      error('Erro ao criar ação', err instanceof Error ? err.message : 'Não foi possível criar a ação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateAIAnalysis = async () => {
    if (!inspection) return;

    setAiAnalyzing(true);

    try {
      const nonCompliantItems = items
        .filter(item => item.is_compliant === false)
        .map(item => `${item.category}: ${item.item_description}${item.observations ? ` (${item.observations})` : ''}`);

      if (nonCompliantItems.length === 0) {
        warning('Análise IA não disponível', 'Nenhum item não conforme encontrado para análise');
        return;
      }

      const mediaUrls = media.map(m => m.file_url);

      const response = await fetchWithAuth(`/api/inspections/${id}/ai-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspection_id: parseInt(id!),
          media_urls: mediaUrls,
          inspection_context: `Inspeção: ${inspection.title} - Local: ${inspection.location} - Empresa: ${inspection.company_name || 'N/A'}`,
          non_compliant_items: nonCompliantItems
        })
      });

      if (response.ok) {
        const result = await response.json();
        setActionPlan(result.action_plan);
        success('Plano de ação gerado', 'Análise da IA foi concluída e plano de ação foi gerado!');

        // Refresh inspection details to ensure action plan is saved and loaded
        await fetchInspectionDetails();
      } else {
        throw new Error('Erro na análise de IA');
      }
    } catch (err) {
      console.error('Erro ao gerar análise:', err);
      error('Erro na análise IA', 'Não foi possível gerar a análise. Verifique se há itens não conformes.');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pendente':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'em_andamento':
        return <AlertTriangle className="w-5 h-5 text-blue-500" />;
      case 'concluida':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'cancelada':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pendente': return 'Pendente';
      case 'em_andamento': return 'Em Andamento';
      case 'concluida': return 'Concluída';
      case 'cancelada': return 'Cancelada';
      default: return status;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'baixa': return 'bg-green-100 text-green-800';
      case 'media': return 'bg-yellow-100 text-yellow-800';
      case 'alta': return 'bg-orange-100 text-orange-800';
      case 'critica': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner size="lg" text="Carregando detalhes da inspeção..." />
        </div>
      </Layout>
    );
  }

  if (!inspection) {
    return (
      <Layout>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Inspeção não encontrada</h2>
          <Link to="/inspections" className="text-blue-600 hover:underline">
            Voltar para inspeções
          </Link>
        </div>
      </Layout>
    );
  }

  // Show summary if inspection is finalized and summary is requested
  if (showSummary && inspection.status === 'concluida') {
    return (
      <Layout>
        <InspectionSummary
          inspection={inspection}
          items={items}
          templateItems={templateItems}
          media={media}
          responses={responses}
          signatures={signatures}
          actionItems={actionItems}
        />
      </Layout>
    );
  }



  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/inspections')}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-heading text-3xl font-bold text-slate-900">
              {inspection.title}
            </h1>
            <p className="text-slate-600 mt-1">Detalhes da inspeção</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full ${getPriorityColor(inspection.priority)}`}>
              {inspection.priority.charAt(0).toUpperCase() + inspection.priority.slice(1)}
            </span>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
              {getStatusIcon(inspection.status)}
              <span className="text-sm font-medium text-slate-700">
                {getStatusLabel(inspection.status)}
              </span>
            </div>
            {inspection.status === 'concluida' ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPDFGenerator(true)}
                  className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Gerar PDF"
                >
                  <FileText className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowSummary(true)}
                  className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Ver Resumo"
                >
                  <Eye className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowShareModal(true)}
                  className="p-2 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  title="Compartilhar"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowShareModal(true)}
                  className="p-2 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  title="Compartilhar"
                >
                  <Share2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowSignatures(true)}
                  className="flex items-center px-4 py-2 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-all shadow-sm"
                >
                  <PenTool className="w-4 h-4 mr-2" />
                  Finalizar Inspeção
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Inspection Info - Clean Design */}
        <div className="bg-white rounded-xl border border-slate-100 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {inspection.company_name && (
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Empresa</p>
                  <p className="font-medium text-slate-900">{inspection.company_name}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Local</p>
                <p className="font-medium text-slate-900">{inspection.location}</p>
                {inspection.address && (
                  <p className="text-sm text-slate-500">{inspection.address}</p>
                )}
              </div>
            </div>
            {(inspection.latitude && inspection.longitude) && (
              <div className="flex items-center gap-3">
                <Navigation className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Coordenadas GPS</p>
                  <p className="font-medium text-slate-900 text-xs">
                    {inspection.latitude.toFixed(6)}, {inspection.longitude.toFixed(6)}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Inspetor</p>
                <p className="font-medium text-slate-900">{inspection.inspector_name}</p>
                {inspection.inspector_email && (
                  <p className="text-sm text-slate-500">{inspection.inspector_email}</p>
                )}
              </div>
            </div>
            {inspection.scheduled_date && (
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Data Agendada</p>
                  <p className="font-medium text-slate-900">
                    {new Date(inspection.scheduled_date).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            )}
            {inspection.cep && (
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">CEP</p>
                  <p className="font-medium text-slate-900">{inspection.cep}</p>
                </div>
              </div>
            )}
          </div>
          {inspection.description && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-sm text-slate-500 mb-2">Descrição</p>
              <p className="text-slate-700">{inspection.description}</p>
            </div>
          )}
        </div>

        {/* Items List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-heading text-xl font-semibold text-slate-900">
              Checklist de Inspeção
            </h2>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              {/* Grupo: Plano de Ação */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Link
                  to={`/inspections/${id}/action-plan`}
                  className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2 bg-white text-purple-700 border border-purple-200 text-sm font-medium rounded-lg hover:bg-purple-50 transition-colors shadow-sm"
                  title="Visualizar todas as ações geradas ou criadas manualmente"
                >
                  <Target className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Ver Plano de Ação</span>
                  <span className="sm:hidden">Ação</span>
                </Link>
                <button
                  onClick={generateAIAnalysis}
                  disabled={aiAnalyzing || isSubmitting}
                  className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  title="Gera análise automática (5W2H) para todos os itens não conformes"
                >
                  {aiAnalyzing ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {aiAnalyzing ? 'Analisando...' : (
                    <>
                      <span className="hidden sm:inline">Gerar Análises (IA)</span>
                      <span className="sm:hidden">IA</span>
                    </>
                  )}
                </button>
              </div>

              <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

              {/* Grupo: Adicionar */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowNewAction(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 transition-colors shadow-sm"
                  title="Criar uma ação manual"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Nova Ação</span>
                  <span className="sm:hidden">Ação</span>
                </button>
                <button
                  onClick={() => setShowAddItem(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center px-3 py-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 text-sm font-medium rounded-lg transition-colors"
                  title="Adicionar Item ao Checklist"
                >
                  <Plus className="w-4 h-4 mr-2 sm:mr-0" />
                  <span className="sm:hidden">Add Item</span>
                </button>
              </div>
            </div>
          </div>

          {/* New Action Form */}
          {showNewAction && (
            <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <h3 className="font-heading text-lg font-semibold text-slate-900 mb-4">
                Nova Ação Manual
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Título da Ação *
                  </label>
                  <input
                    type="text"
                    required
                    value={newAction.title}
                    onChange={(e) => setNewAction({ ...newAction, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Ex: Instalar equipamento de proteção"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <span className="text-red-600">O que?</span> (Descrição)
                  </label>
                  <textarea
                    value={newAction.what_description}
                    onChange={(e) => setNewAction({ ...newAction, what_description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="O que precisa ser feito..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <span className="text-green-600">Onde?</span> (Local)
                  </label>
                  <input
                    type="text"
                    value={newAction.where_location}
                    onChange={(e) => setNewAction({ ...newAction, where_location: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Local específico..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <span className="text-blue-600">Por que?</span> (Justificativa)
                  </label>
                  <textarea
                    value={newAction.why_reason}
                    onChange={(e) => setNewAction({ ...newAction, why_reason: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Justificativa da ação..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <span className="text-indigo-600">Como?</span> (Método)
                  </label>
                  <textarea
                    value={newAction.how_method}
                    onChange={(e) => setNewAction({ ...newAction, how_method: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Como será executado..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <span className="text-purple-600">Quem?</span> (Responsável)
                  </label>
                  <input
                    type="text"
                    value={newAction.who_responsible}
                    onChange={(e) => setNewAction({ ...newAction, who_responsible: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Responsável pela execução..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <span className="text-yellow-600">Quando?</span> (Prazo)
                  </label>
                  <input
                    type="date"
                    value={newAction.when_deadline}
                    onChange={(e) => setNewAction({ ...newAction, when_deadline: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Prioridade</label>
                  <select
                    value={newAction.priority}
                    onChange={(e) => setNewAction({ ...newAction, priority: e.target.value as 'baixa' | 'media' | 'alta' })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <span className="text-orange-600">Quanto?</span> (Custo estimado)
                  </label>
                  <input
                    type="text"
                    value={newAction.how_much_cost}
                    onChange={(e) => setNewAction({ ...newAction, how_much_cost: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Estimativa de custo..."
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={handleCreateManualAction}
                  disabled={!newAction.title || isSubmitting}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <LoadingSpinner size="sm" />
                      Criando...
                    </div>
                  ) : (
                    'Criar Ação'
                  )}
                </button>
                <button
                  onClick={() => setShowNewAction(false)}
                  className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Add Item Form */}
          {showAddItem && (
            <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Categoria (ex: EPIs, Equipamentos)"
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Descrição do item"
                  value={newItem.item_description}
                  onChange={(e) => setNewItem({ ...newItem, item_description: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <textarea
                placeholder="Observações (opcional)"
                value={newItem.observations}
                onChange={(e) => setNewItem({ ...newItem, observations: e.target.value })}
                className="w-full mt-4 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={2}
              />
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={handleAddItem}
                  disabled={!newItem.category || !newItem.item_description || isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <LoadingSpinner size="sm" />
                      Adicionando...
                    </div>
                  ) : (
                    'Adicionar'
                  )}
                </button>
                <button
                  onClick={() => setShowAddItem(false)}
                  className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Template Checklist */}
          {templateItems.length > 0 && (
            <div className="mb-8">
              <h3 className="font-heading text-lg font-semibold text-slate-900 mb-4">
                Checklist do Template
              </h3>
              <div className="bg-slate-50 rounded-lg p-4 mb-4">
                <ChecklistForm
                  fields={templateItems.map((item, index) => {
                    const fieldData = JSON.parse(item.field_responses);
                    return {
                      id: fieldData.field_id,
                      // Prioritize item_description from DB column over JSON which might be stale/corrupt
                      field_name: item.item_description || fieldData.field_name,
                      field_type: fieldData.field_type,
                      is_required: fieldData.is_required || false,
                      options: fieldData.options || null,
                      order_index: index,
                      template_id: item.template_id,
                      compliance_enabled: fieldData.compliance_enabled ?? true,
                      compliance_mode: fieldData.compliance_mode ?? 'auto',
                      compliance_config: fieldData.compliance_config
                    };
                  })}
                  onSubmit={handleFormSubmit}
                  initialValues={responses}
                  readonly={false}
                  inspectionId={parseInt(id!)}
                  inspectionItems={templateItems}
                  showComplianceSelector={inspection?.compliance_enabled !== false}
                  onAutoSave={async (formResponses: Record<string, any>, comments: Record<string, any>) => {
                    // Prevent multiple simultaneous auto-save calls
                    if (isSubmitting) return;

                    try {
                      // Don't update local state during auto-save to prevent field disappearing
                      // The ChecklistForm component will handle its own state

                      // Prepare responses for database - map responses to inspection items
                      const responseUpdates: Record<string, any> = {};

                      Object.entries(formResponses).forEach(([fieldId, value]) => {
                        const field = templateItems.find(item => {
                          try {
                            const fieldData = JSON.parse(item.field_responses);
                            return fieldData.field_id === parseInt(fieldId);
                          } catch {
                            return false;
                          }
                        });

                        if (field?.id) {
                          const comment = comments[parseInt(fieldId)] || '';

                          // Update the field_responses with the new value and comment
                          try {
                            const fieldData = JSON.parse(field.field_responses);
                            fieldData.response_value = value;
                            fieldData.comment = comment;
                            responseUpdates[field.id] = fieldData;
                          } catch (error) {
                            console.error('[AUTO-SAVE] Error updating field data:', error);
                          }
                        }
                      });

                      if (Object.keys(responseUpdates).length === 0) return;

                      const response = await fetch(`/api/inspections/${id}/template-responses`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          responses: responseUpdates
                        })
                      });

                      if (!response.ok) {
                        console.error('[AUTO-SAVE] Failed to save responses:', response.status);
                        const errorData = await response.text();
                        console.error('[AUTO-SAVE] Error details:', errorData);
                      } else {
                        // Update local responses state after successful save
                        setResponses(prevResponses => ({
                          ...prevResponses,
                          ...formResponses
                        }));
                      }

                    } catch (error) {
                      console.error('[AUTO-SAVE] Error during auto-save:', error);
                      // Don't show error to user for auto-save failures
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Manual Items */}
          <div className="space-y-4">
            <h3 className="font-heading text-lg font-semibold text-slate-900">
              Itens Manuais
            </h3>

            {items.length === 0 && templateItems.length === 0 ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">Nenhum item de checklist adicionado</p>
                <p className="text-slate-400 text-sm mt-1">
                  Adicione itens para começar a inspeção
                </p>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-slate-500 text-sm">Nenhum item manual adicionado</p>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-start gap-4 p-4 border border-slate-200 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded">
                        {item.category}
                      </span>
                    </div>
                    <p className="font-medium text-slate-900 mb-1">{item.item_description}</p>
                    {item.observations && (
                      <p className="text-sm text-slate-600">{item.observations}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.is_compliant === null ? (
                      <>
                        <button
                          onClick={() => updateItemCompliance(item.id!, true)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Marcar como conforme"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => updateItemCompliance(item.id!, false)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Marcar como não conforme"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => item.id && handleDeleteItem(item.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${item.is_compliant
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                        }`}>
                        {item.is_compliant ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                        <span className="text-sm font-medium">
                          {item.is_compliant ? 'Conforme' : 'Não Conforme'}
                        </span>
                      </div>
                    )
                    }
                  </div >
                </div >
              ))
            )}
          </div >
        </div >

        {/* Media Upload Section */}
        < div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6" >
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-slate-600" />
            <h2 className="font-heading text-xl font-semibold text-slate-900">
              Mídias da Inspeção
            </h2>
          </div>
          <MediaUpload
            inspectionId={parseInt(id!)}
            onMediaUploaded={handleMediaUploaded}
            existingMedia={media}
            onMediaDeleted={handleMediaDeleted}
            inspectionTitle={inspection.title}
          />
        </div >

        {/* Action Items Section */}
        {
          actionItems.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-slate-600" />
                <h2 className="font-heading text-xl font-semibold text-slate-900">
                  Itens de Ação
                </h2>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                  {actionItems.length} {actionItems.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              <div className="space-y-4">
                {actionItems.map((action: any, index: number) => (
                  <div key={action.id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="font-medium text-slate-900">
                        {index + 1}. {action.title}
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${action.priority === 'alta' || action.priority === 'critica' ? 'bg-red-100 text-red-800' :
                          action.priority === 'media' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                          {action.priority}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${action.status === 'completed' ? 'bg-green-100 text-green-800' :
                          action.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                          {action.status === 'pending' ? 'Pendente' :
                            action.status === 'in_progress' ? 'Em Progresso' :
                              action.status === 'completed' ? 'Concluído' : action.status}
                        </span>
                      </div>
                    </div>

                    {action.is_ai_generated && (
                      <div className="mb-3 flex items-center gap-1 text-xs text-purple-600">
                        <Brain className="w-3 h-3" />
                        <span>Gerado por IA</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {action.what_description && (
                        <div>
                          <span className="font-medium text-red-600">O que:</span>
                          <p className="text-slate-700 mt-1">{action.what_description}</p>
                        </div>
                      )}
                      {action.where_location && (
                        <div>
                          <span className="font-medium text-green-600">Onde:</span>
                          <p className="text-slate-700 mt-1">{action.where_location}</p>
                        </div>
                      )}
                      {action.why_reason && (
                        <div>
                          <span className="font-medium text-blue-600">Por que:</span>
                          <p className="text-slate-700 mt-1">{action.why_reason}</p>
                        </div>
                      )}
                      {action.how_method && (
                        <div>
                          <span className="font-medium text-indigo-600">Como:</span>
                          <p className="text-slate-700 mt-1">{action.how_method}</p>
                        </div>
                      )}
                      {action.who_responsible && (
                        <div>
                          <span className="font-medium text-purple-600">Quem:</span>
                          <p className="text-slate-700 mt-1">{action.who_responsible}</p>
                        </div>
                      )}
                      {action.when_deadline && (
                        <div>
                          <span className="font-medium text-yellow-600">Quando:</span>
                          <p className="text-slate-700 mt-1">
                            {new Date(action.when_deadline).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      )}
                      {action.how_much_cost && (
                        <div className="md:col-span-2">
                          <span className="font-medium text-orange-600">Quanto:</span>
                          <p className="text-slate-700 mt-1">{action.how_much_cost}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        }

        {/* AI Action Plan Section - Legacy support */}
        {
          actionPlan && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-slate-600" />
                <h2 className="font-heading text-xl font-semibold text-slate-900">
                  Plano de Ação 5W2H
                </h2>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${actionPlan.priority_level === 'alta' ? 'bg-red-100 text-red-800' :
                  actionPlan.priority_level === 'media' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                  Prioridade {actionPlan.priority_level}
                </span>
              </div>

              {actionPlan.summary && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-medium text-blue-900 mb-2">Resumo Executivo</h3>
                  <p className="text-blue-800 text-sm">{actionPlan.summary}</p>
                  {actionPlan.estimated_completion && (
                    <p className="text-blue-700 text-sm mt-2">
                      <strong>Conclusão Estimada:</strong> {actionPlan.estimated_completion}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {actionPlan.actions && actionPlan.actions.map((action: any, index: number) => (
                  <div key={index} className="border border-slate-200 rounded-lg p-4">
                    <h4 className="font-medium text-slate-900 mb-3">
                      {index + 1}. {action.item}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm font-medium text-red-600">O que (What):</span>
                        <p className="text-sm text-slate-700 mt-1">{action.what}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-blue-600">Por que (Why):</span>
                        <p className="text-sm text-slate-700 mt-1">{action.why}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-green-600">Onde (Where):</span>
                        <p className="text-sm text-slate-700 mt-1">{action.where}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-yellow-600">Quando (When):</span>
                        <p className="text-sm text-slate-700 mt-1">{action.when}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-purple-600">Quem (Who):</span>
                        <p className="text-sm text-slate-700 mt-1">{action.who}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-indigo-600">Como (How):</span>
                        <p className="text-sm text-slate-700 mt-1">{action.how}</p>
                      </div>
                      <div className="md:col-span-2">
                        <span className="text-sm font-medium text-orange-600">Quanto (How Much):</span>
                        <p className="text-sm text-slate-700 mt-1">{action.how_much}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        }

        {/* Signatures Modal - Mobile Optimized */}
        {
          showSignatures && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[95vh] overflow-y-auto">
                <div className="p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h2 className="font-heading text-xl sm:text-2xl font-bold text-slate-900">
                      Finalizar Inspeção
                    </h2>
                    <button
                      onClick={() => setShowSignatures(false)}
                      className="text-slate-500 hover:text-slate-700 p-1"
                    >
                      <X className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  </div>

                  <div className="space-y-4 sm:space-y-6">
                    {/* Debug block - Only show in development */}
                    {process.env.NODE_ENV === 'development' && (
                      <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="text-sm text-yellow-800 font-mono">
                          Debug - Signatures object:
                        </p>
                        <pre className="text-xs text-yellow-700 mt-1">
                          {JSON.stringify({
                            inspector: signatures.inspector ? 'Present' : 'Missing',
                            responsible: signatures.responsible ? 'Present' : 'Missing'
                          }, null, 2)}
                        </pre>
                      </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                      <InspectionSignature
                        onSignatureSaved={(signature) => handleSignatureSaved('inspector', signature)}
                        existingSignature={signatures.inspector}
                        signerName={inspection.inspector_name}
                        signerRole="Inspetor Responsável"
                      />
                      <InspectionSignature
                        onSignatureSaved={(signature) => handleSignatureSaved('responsible', signature)}
                        existingSignature={signatures.responsible}
                        signerName={inspection.responsible_name || "Responsável Técnico"}
                        signerRole="Empresa"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 pt-4 sm:pt-6 border-t border-slate-200">
                      <button
                        onClick={() => setShowSignatures(false)}
                        className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors order-2 sm:order-1"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleFinalizeInspection}
                        disabled={!signatures.inspector || !signatures.responsible || isSubmitting}
                        className="flex items-center justify-center px-6 py-3 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors order-1 sm:order-2"
                      >
                        {isSubmitting ? (
                          <>
                            <LoadingSpinner size="sm" />
                            <span className="ml-2">Finalizando...</span>
                          </>
                        ) : (
                          <>
                            <FileCheck className="w-4 h-4 mr-2" />
                            <span>Finalizar Inspeção</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        }

        {/* Share Modal */}
        <InspectionShare
          inspectionId={parseInt(id!)}
          inspectionTitle={inspection.title}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
        />

        {/* PDF Generator Modal */}
        <PDFGenerator
          inspection={inspection}
          items={items}
          templateItems={templateItems}
          media={media}
          responses={responses}
          signatures={signatures}
          isOpen={showPDFGenerator}
          onClose={() => setShowPDFGenerator(false)}
          actionItems={actionItems}
          organizationLogoUrl={undefined}
          parentOrganizationLogoUrl={undefined}
          organizationName={inspection.company_name || 'Organização'}
          parentOrganizationName="Matriz"
        />
      </div >
    </Layout >
  );
}
