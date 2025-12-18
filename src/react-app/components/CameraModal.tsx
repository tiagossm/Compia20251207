import { useRef, useState, useEffect } from 'react';
import { Camera, X, RefreshCw, Zap } from 'lucide-react';

interface CameraModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (blob: Blob) => void;
}

export default function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [permissionError, setPermissionError] = useState(false);
    const [loading, setLoading] = useState(false);
    const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

    useEffect(() => {
        if (isOpen) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isOpen, facingMode]);

    const startCamera = async () => {
        setLoading(true);
        setPermissionError(false);
        try {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });

            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (error) {
            console.error("Camera access error:", error);
            setPermissionError(true);
        } finally {
            setLoading(false);
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            if (context) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        onCapture(blob);
                        onClose();
                    }
                }, 'image/jpeg', 0.85);
            }
        }
    };

    const switchCamera = () => {
        setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
            <div className="relative w-full h-full max-w-lg mx-auto flex flex-col items-center justify-center p-4">

                {/* Close Button */}
                <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-black/50 text-white z-50">
                    <X size={24} />
                </button>

                {/* Viewfinder */}
                <div className="relative w-full aspect-[3/4] max-h-[70vh] bg-black rounded-lg overflow-hidden ring-1 ring-white/20 shadow-2xl">
                    {!permissionError ? (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-white/50 p-4 text-center">
                            <Camera size={48} className="mb-4 opacity-50" />
                            <p>Sem acesso à câmera. Verifique as permissões do navegador.</p>
                        </div>
                    )}

                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <div className="w-8 h-8 hover:animate-spin rounded-full border-2 border-white border-t-transparent" />
                        </div>
                    )}

                    <canvas ref={canvasRef} className="hidden" />
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between w-full mt-8 px-8">
                    <button
                        onClick={switchCamera}
                        className="p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all"
                    >
                        <RefreshCw size={24} />
                    </button>

                    <button
                        onClick={handleCapture}
                        disabled={loading || permissionError}
                        className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                        <div className="w-12 h-12 rounded-full bg-white" />
                    </button>

                    <button className="p-3 opacity-0 pointer-events-none">
                        <Zap size={24} />
                    </button>
                </div>
            </div>
        </div>
    );
}
