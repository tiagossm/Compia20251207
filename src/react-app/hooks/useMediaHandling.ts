// useMediaHandling - Hook for handling media uploads and recording

import { useState, useRef, useCallback } from 'react';
import { fetchWithAuth } from '@/react-app/utils/auth';

interface MediaItem {
    id: number;
    file_url: string;
    media_type: string;
    file_name: string;
}

interface UseMediaHandlingProps {
    inspectionId: number;
    onMediaUploaded?: (media: MediaItem) => void;
}

export function useMediaHandling({ inspectionId, onMediaUploaded }: UseMediaHandlingProps) {
    const [uploading, setUploading] = useState(false);
    const [recording, setRecording] = useState<'audio' | 'video' | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const uploadFile = useCallback(async (file: File, fieldId: number, type: 'image' | 'audio' | 'video' | 'file') => {
        if (!inspectionId) return null;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('inspection_id', String(inspectionId));
            formData.append('inspection_item_id', String(fieldId));
            formData.append('media_type', type);

            const response = await fetchWithAuth('/api/media/upload', {
                method: 'POST',
                body: formData,
                headers: {} // Let browser set Content-Type for FormData
            });

            if (response.ok) {
                const data = await response.json();
                const mediaItem: MediaItem = {
                    id: data.media?.id || data.id,
                    file_url: data.media?.file_url || data.file_url,
                    media_type: type,
                    file_name: file.name
                };

                if (onMediaUploaded) {
                    onMediaUploaded(mediaItem);
                }
                return mediaItem;
            } else {
                const error = await response.json().catch(() => ({}));
                console.error('Upload failed:', error);
                alert(error.error || 'Erro ao fazer upload');
                return null;
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Erro de conexão ao fazer upload');
            return null;
        } finally {
            setUploading(false);
        }
    }, [inspectionId, onMediaUploaded]);

    const startAudioRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.start(1000); // Collect data every second
            setRecording('audio');
            setRecordingTime(0);

            // Start timer
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error('Failed to start recording:', error);
            alert('Não foi possível acessar o microfone. Verifique as permissões.');
        }
    }, []);

    const stopRecording = useCallback((): Promise<Blob | null> => {
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
                resolve(null);
                return;
            }

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

                // Stop all tracks
                mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());

                // Clear timer
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }

                setRecording(null);
                setRecordingTime(0);

                resolve(blob);
            };

            mediaRecorderRef.current.stop();
        });
    }, []);

    return {
        uploadFile,
        startAudioRecording,
        stopRecording,
        uploading,
        recording,
        recordingTime
    };
}

export default useMediaHandling;
