import { useState, useRef, useEffect } from 'react';
import { Upload, X, Image, Video, Mic, FileText, Pause, Camera, Eye, Download, CheckSquare, Square, Trash2 } from 'lucide-react';
import { InspectionMediaType } from '@/shared/types';
import { fetchWithAuth } from '@/react-app/utils/auth';
import MediaViewer from './MediaViewer';
import MediaDownloader from './MediaDownloader';

interface MediaUploadProps {
  inspectionId: number;
  inspectionItemId?: number;
  onMediaUploaded: (media: InspectionMediaType) => void;
  existingMedia?: InspectionMediaType[];
  onMediaDeleted?: (mediaId: number) => void;
  inspectionTitle?: string;
}

export default function MediaUpload({
  inspectionId,
  inspectionItemId,
  onMediaUploaded,
  existingMedia = [],
  onMediaDeleted,
  inspectionTitle = 'Inspeção'
}: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [audioRecording, setAudioRecording] = useState(false);
  // videoRecording state removed - video recording disabled
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const [showDownloader, setShowDownloader] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // videoRef removed - video recording disabled
  const photoVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Navegação do visualizador
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!viewerOpen) return;

      if (e.key === 'ArrowLeft' && currentViewIndex > 0) {
        setCurrentViewIndex(prev => prev - 1);
      } else if (e.key === 'ArrowRight' && currentViewIndex < existingMedia.length - 1) {
        setCurrentViewIndex(prev => prev + 1);
      } else if (e.key === 'Escape') {
        setViewerOpen(false);
      }
    };

    const handleMediaNavigate = (e: CustomEvent) => {
      if (e.detail.direction === 'previous' && currentViewIndex > 0) {
        setCurrentViewIndex(prev => prev - 1);
      } else if (e.detail.direction === 'next' && currentViewIndex < existingMedia.length - 1) {
        setCurrentViewIndex(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mediaNavigate', handleMediaNavigate as EventListener);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mediaNavigate', handleMediaNavigate as EventListener);
    };
  }, [viewerOpen, currentViewIndex, existingMedia.length]);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await uploadFile(file);
    }
  };

  // File size limits in MB
  const FILE_SIZE_LIMITS = {
    image: 10,      // 10 MB
    video: 100,     // 100 MB
    audio: 20,      // 20 MB
    document: 50    // 50 MB
  };

  const validateFileSize = (file: File, mediaType: 'image' | 'video' | 'audio' | 'document'): boolean => {
    const limitMB = FILE_SIZE_LIMITS[mediaType];
    const fileSizeMB = file.size / 1024 / 1024;

    if (fileSizeMB > limitMB) {
      alert(`Arquivo muito grande! Limite para ${getMediaTypeLabel(mediaType)}: ${limitMB}MB\nTamanho do arquivo: ${fileSizeMB.toFixed(2)}MB`);
      return false;
    }
    return true;
  };

  const getMediaTypeLabel = (mediaType: string): string => {
    const labels = {
      'image': '📸 Imagens',
      'video': '🎥 Vídeos',
      'audio': '🎤 Áudios',
      'document': '📄 Documentos'
    };
    return labels[mediaType as keyof typeof labels] || mediaType;
  };

  const uploadFile = async (file: File) => {
    setUploading(true);

    try {
      const mediaType = getMediaType(file.type);

      // Validate file size
      if (!validateFileSize(file, mediaType)) {
        setUploading(false);
        return;
      }

      // Convert file to base64 for upload to backend
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetchWithAuth(`/api/inspections/${inspectionId}/media/upload`, {
        method: 'POST',
        body: JSON.stringify({
          inspection_id: inspectionId,
          inspection_item_id: inspectionItemId,
          media_type: mediaType,
          file_name: file.name,
          file_data: fileData,
          file_size: file.size,
          mime_type: file.type,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[MediaUpload] Upload result:', result);
        // Backend returns { success: true, media: { id: ..., ... } }
        const mediaData = result.media || result;

        onMediaUploaded({
          id: mediaData.id,
          inspection_id: inspectionId,
          inspection_item_id: inspectionItemId,
          media_type: mediaType,
          file_name: file.name,
          file_url: mediaData.file_url,
          file_size: file.size,
          mime_type: file.type,
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao fazer upload');
      }
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao fazer upload do arquivo';
      alert(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const getMediaType = (mimeType: string): 'image' | 'video' | 'audio' | 'document' => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  };

  const startPhotoCapture = async () => {
    try {
      setTakingPhoto(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment' // Preferir câmera traseira no mobile
        }
      });

      if (photoVideoRef.current) {
        photoVideoRef.current.srcObject = stream;
        photoVideoRef.current.play();
      }
    } catch (error) {
      console.error('Erro ao acessar câmera:', error);
      alert('Erro ao acessar câmera. Verifique as permissões.');
      setTakingPhoto(false);
    }
  };

  const capturePhoto = async () => {
    if (!photoVideoRef.current || !canvasRef.current) return;

    const video = photoVideoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the current frame from video to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to blob
    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await uploadFile(file);

      // Stop camera stream
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
      setTakingPhoto(false);
    }, 'image/jpeg', 0.9);
  };

  const cancelPhotoCapture = () => {
    if (photoVideoRef.current) {
      const stream = photoVideoRef.current.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      photoVideoRef.current.srcObject = null;
    }
    setTakingPhoto(false);
  };

  const startAudioRecording = async () => {
    try {
      console.log('[MediaUpload] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[MediaUpload] Microphone access granted');

      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
          console.log('[MediaUpload] Audio chunk received:', e.data.size);
        }
      };

      recorder.onstop = async () => {
        console.log('[MediaUpload] Recorder stopped. Total chunks:', chunks.length);
        if (chunks.length === 0) {
          console.error('[MediaUpload] No audio chunks recorded');
          alert('Erro: Nenhum áudio gravado. Verifique seu microfone.');
          return;
        }

        const blob = new Blob(chunks, { type: 'audio/webm' });
        console.log('[MediaUpload] Audio blob created, size:', blob.size);

        const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' });
        console.log('[MediaUpload] Uploading audio file...');
        await uploadFile(file);

        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      console.log('[MediaUpload] Recorder started');

      setMediaRecorder(recorder);
      setAudioRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error);
      alert('Erro ao acessar microfone: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // startVideoRecording function removed - video recording disabled

  const stopRecording = () => {
    console.log('[MediaUpload] Stopping recording...');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.requestData(); // Ensure we get the last chunk
      mediaRecorder.stop();
      console.log('[MediaUpload] Stop signal sent to recorder');
    }

    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }

    setAudioRecording(false);
    // setVideoRecording removed - video recording disabled
    setMediaRecorder(null);
    setRecordingTime(0);
  };

  const deleteMedia = async (mediaId: number) => {
    if (!onMediaDeleted) return;
    if (!confirm('Tem certeza que deseja excluir esta mídia?')) return;

    try {
      const response = await fetchWithAuth(`/api/inspections/${inspectionId}/media/${mediaId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onMediaDeleted(mediaId);
        setSelectedMedia(prev => prev.filter(id => id !== mediaId));
      }
    } catch (error) {
      console.error('Error deleting media:', error);
    }
  };

  const toggleMediaSelection = (mediaId: number) => {
    setSelectedMedia(prev => {
      if (prev.includes(mediaId)) {
        return prev.filter(id => id !== mediaId);
      } else {
        return [...prev, mediaId];
      }
    });
  };

  const selectAllMedia = () => {
    const allIds = existingMedia.map(m => m.id!).filter(id => id !== undefined);
    setSelectedMedia(allIds);
  };

  const deselectAllMedia = () => {
    setSelectedMedia([]);
  };

  const deleteSelectedMedia = async () => {
    if (!onMediaDeleted) return;
    if (selectedMedia.length === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedMedia.length} mídia(s) selecionada(s)?`)) return;

    for (const mediaId of selectedMedia) {
      try {
        const response = await fetchWithAuth(`/api/inspections/${inspectionId}/media/${mediaId}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          onMediaDeleted(mediaId);
        }
      } catch (error) {
        console.error('Error deleting media:', mediaId, error);
      }
    }
    setSelectedMedia([]);
    setIsSelectionMode(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getMediaIcon = (mediaType: string) => {
    switch (mediaType) {
      case 'image': return <Image className="w-5 h-5" />;
      case 'video': return <Video className="w-5 h-5" />;
      case 'audio': return <Mic className="w-5 h-5" />;
      default: return <FileText className="w-5 h-5" />;
    }
  };

  const openViewer = (index: number) => {
    setCurrentViewIndex(index);
    setViewerOpen(true);
  };

  const closeViewer = () => {
    setViewerOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Upload Controls - Compact Layout */}
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Left: Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || takingPhoto}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-all text-sm font-medium shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Arquivos
            </button>

            <button
              type="button"
              onClick={startPhotoCapture}
              disabled={uploading || takingPhoto || audioRecording}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-all text-sm font-medium shadow-sm"
            >
              <Camera className="w-4 h-4" />
              Câmera
            </button>

            {audioRecording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-2 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all text-sm font-medium shadow-sm animate-pulse"
              >
                <Pause className="w-4 h-4" />
                Parar ({formatTime(recordingTime)})
              </button>
            ) : (
              <button
                type="button"
                onClick={startAudioRecording}
                disabled={uploading || takingPhoto}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-all text-sm font-medium shadow-sm"
              >
                <Mic className="w-4 h-4" />
                Gravar
              </button>
            )}

            {uploading && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-slate-600"></div>
                <span>Enviando...</span>
              </div>
            )}
          </div>

          {/* Right: Media count and selection toggle */}
          {existingMedia.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                {existingMedia.length} {existingMedia.length === 1 ? 'mídia' : 'mídias'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  if (isSelectionMode) setSelectedMedia([]);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${isSelectionMode
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                  }`}
              >
                <CheckSquare className="w-4 h-4" />
                {isSelectionMode ? 'Sair da Seleção' : 'Selecionar'}
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,audio/*,.pdf,.doc,.docx"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>

      {/* Photo Capture Modal */}
      {takingPhoto && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Tirar Foto</h3>
              <p className="text-sm text-slate-600">Posicione a câmera e clique em "Capturar"</p>
            </div>

            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={photoVideoRef}
                className="w-full max-h-96 object-cover"
                autoPlay
                muted
                playsInline
              />
            </div>

            <div className="flex justify-center gap-4 mt-4">
              <button
                onClick={capturePhoto}
                className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Camera className="w-4 h-4 mr-2" />
                Capturar
              </button>
              <button
                onClick={cancelPhotoCapture}
                className="px-6 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />


      {/* Video Preview removed - video recording disabled */}

      {/* Media Gallery */}
      {existingMedia.length > 0 && (
        <div className="space-y-4">
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-900">Mídias enviadas</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDownloader(!showDownloader)}
                  className="flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Gerenciar Downloads
                </button>
              </div>
            </div>

            {/* Selection Actions Bar */}
            {isSelectionMode && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectedMedia.length === existingMedia.length ? deselectAllMedia : selectAllMedia}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    {selectedMedia.length === existingMedia.length ? (
                      <><Square className="w-4 h-4" /> Desmarcar Todos</>
                    ) : (
                      <><CheckSquare className="w-4 h-4" /> Selecionar Todos</>
                    )}
                  </button>
                </div>
                <span className="text-sm text-blue-700">
                  {selectedMedia.length} de {existingMedia.length} selecionado(s)
                </span>
                {selectedMedia.length > 0 && (
                  <button
                    onClick={deleteSelectedMedia}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 ml-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir Selecionados
                  </button>
                )}
              </div>
            )}
          </div>
          {/* Media Downloader */}
          {showDownloader && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <MediaDownloader
                media={existingMedia}
                inspectionTitle={inspectionTitle}
              />
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {existingMedia.map((media, index) => (
              <div
                key={media.id || `media-${index}`}
                className={`relative bg-slate-50 rounded-lg p-3 border group transition-all ${isSelectionMode && selectedMedia.includes(media.id!)
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-slate-200'
                  }`}
                onClick={isSelectionMode ? () => toggleMediaSelection(media.id!) : undefined}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-slate-600">
                    {isSelectionMode && (
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${selectedMedia.includes(media.id!)
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-slate-400 bg-white'
                        }`}>
                        {selectedMedia.includes(media.id!) && (
                          <CheckSquare className="w-3 h-3 text-white" />
                        )}
                      </div>
                    )}
                    {getMediaIcon(media.media_type)}
                    <span className="text-xs font-medium">{media.media_type.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); openViewer(index); }}
                      className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Visualizar em tamanho grande"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {onMediaDeleted && !isSelectionMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteMedia(media.id!); }}
                        className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {media.media_type === 'image' && (
                  <div
                    className="w-full h-24 rounded overflow-hidden cursor-pointer"
                    onClick={() => openViewer(index)}
                  >
                    <img
                      src={media.file_url}
                      alt={media.file_name}
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                    />
                  </div>
                )}

                {media.media_type === 'video' && (
                  <video
                    src={media.file_url}
                    className="w-full h-24 object-cover rounded"
                    controls
                  />
                )}

                {media.media_type === 'audio' && (
                  <div className="h-24 flex items-center justify-center">
                    <audio
                      src={media.file_url}
                      controls
                      className="w-full"
                    />
                  </div>
                )}

                {media.media_type === 'document' && (
                  <div className="h-24 flex items-center justify-center bg-slate-100 rounded">
                    <FileText className="w-8 h-8 text-slate-400" />
                  </div>
                )}

                <p className="text-xs text-slate-600 mt-2 truncate" title={media.file_name}>
                  {media.file_name}
                </p>
                {media.file_size && (
                  <p className="text-xs text-slate-500">
                    {(media.file_size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Media Viewer Modal */}
      <MediaViewer
        media={existingMedia}
        currentIndex={currentViewIndex}
        isOpen={viewerOpen}
        onClose={closeViewer}
      />
    </div>
  );
}
