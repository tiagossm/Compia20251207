import { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Copy, Check, Sparkles } from 'lucide-react';
import { fetchWithAuth } from '../utils/auth';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    suggestions?: string[];
}

const QUICK_ACTIONS = [
    { label: '📊 Converter dados para CSV', prompt: 'Quero converter uma lista de itens para o formato CSV de checklist' },
    { label: '❓ Como criar inspeção?', prompt: 'Como faço para criar uma nova inspeção no sistema?' },
    { label: '📋 O que é análise de conformidade?', prompt: 'Explique o que é a análise de conformidade e como funciona' },
    { label: '📥 Como importar checklist?', prompt: 'Como importo um checklist via CSV?' },
];

export default function FloatingAiAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const sendMessage = async (content: string) => {
        if (!content.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: content.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await fetchWithAuth('/api/ai-assistant/chat', {
                method: 'POST',
                body: JSON.stringify({
                    message: content,
                    history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
                }),
            });

            if (!response.ok) {
                throw new Error('Erro ao comunicar com o assistente');
            }

            const data = await response.json();

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.reply || 'Desculpe, não consegui processar sua solicitação.',
                timestamp: new Date(),
                suggestions: data.suggestions,
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('AI Assistant error:', error);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: '❌ Desculpe, ocorreu um erro. Por favor, tente novamente.',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(inputValue);
        }
    };

    const copyToClipboard = async (text: string, id: string) => {
        try {
            // Extract code blocks if present
            const codeMatch = text.match(/```[\s\S]*?\n([\s\S]*?)```/);
            const textToCopy = codeMatch ? codeMatch[1].trim() : text;

            await navigator.clipboard.writeText(textToCopy);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const formatMessage = (content: string) => {
        // Format code blocks
        const parts = content.split(/(```[\s\S]*?```)/g);
        return parts.map((part, index) => {
            if (part.startsWith('```')) {
                const code = part.replace(/```\w*\n?/g, '').replace(/```$/, '');
                return (
                    <pre key={index} className="bg-slate-800 text-green-400 p-3 rounded-lg my-2 overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                        {code}
                    </pre>
                );
            }
            // Format bold text
            return (
                <span key={index} dangerouslySetInnerHTML={{
                    __html: part
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\n/g, '<br/>')
                }} />
            );
        });
    };

    return (
        <>
            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-4 focus:ring-emerald-300 ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
                    }`}
                style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                }}
                aria-label="Abrir assistente IA"
            >
                <img
                    src="/compia-logo.png"
                    alt="COMPIA AI"
                    className="w-10 h-10 mx-auto filter brightness-0 invert"
                />
                {/* Pulse animation for first time */}
                {messages.length === 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping" />
                )}
            </button>

            {/* Chat Modal */}
            <div
                className={`fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl transition-all duration-300 origin-bottom-right ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'
                    }`}
                style={{ maxHeight: 'calc(100vh - 6rem)' }}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <img src="/compia-logo.png" alt="COMPIA" className="w-6 h-6 filter brightness-0 invert" />
                        <div>
                            <h3 className="font-bold text-sm">COMPIA AI</h3>
                            <p className="text-xs text-emerald-100">Seu assistente inteligente</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-1 hover:bg-white/20 rounded-full transition-colors"
                        aria-label="Fechar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Messages Area */}
                <div className="h-80 overflow-y-auto p-4 space-y-3 bg-slate-50">
                    {messages.length === 0 ? (
                        <div className="text-center py-4">
                            <Sparkles className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                            <p className="text-slate-600 text-sm mb-4">
                                Olá! Sou o assistente do COMPIA.<br />
                                Como posso ajudar?
                            </p>
                            <div className="space-y-2">
                                {QUICK_ACTIONS.map((action, index) => (
                                    <button
                                        key={index}
                                        onClick={() => sendMessage(action.prompt)}
                                        className="w-full text-left px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                                    >
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${message.role === 'user'
                                        ? 'bg-emerald-500 text-white rounded-br-md'
                                        : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-sm'
                                        }`}
                                >
                                    <div className="break-words">{formatMessage(message.content)}</div>

                                    {/* Copy button for assistant messages with code */}
                                    {message.role === 'assistant' && message.content.includes('```') && (
                                        <button
                                            onClick={() => copyToClipboard(message.content, message.id)}
                                            className="mt-2 flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 transition-colors"
                                        >
                                            {copiedId === message.id ? (
                                                <>
                                                    <Check className="w-3 h-3" />
                                                    Copiado!
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-3 h-3" />
                                                    Copiar CSV
                                                </>
                                            )}
                                        </button>
                                    )}

                                    {/* Suggestions */}
                                    {message.suggestions && message.suggestions.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                                            {message.suggestions.map((sug, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => sendMessage(sug)}
                                                    className="block w-full text-left text-xs text-emerald-600 hover:text-emerald-800 hover:underline"
                                                >
                                                    → {sug}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-slate-200 px-4 py-2 rounded-2xl rounded-bl-md shadow-sm">
                                <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-3 border-t border-slate-200 bg-white rounded-b-2xl">
                    <div className="flex gap-2">
                        <textarea
                            ref={inputRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Digite sua mensagem..."
                            className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-500"
                            rows={1}
                            disabled={isLoading}
                        />
                        <button
                            onClick={() => sendMessage(inputValue)}
                            disabled={!inputValue.trim() || isLoading}
                            className="px-3 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-xs text-slate-400 text-center mt-2">
                        Pressione Enter para enviar
                    </p>
                </div>
            </div>
        </>
    );
}
