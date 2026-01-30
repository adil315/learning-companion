'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
    MessageCircle, X, Send, Trash2, Loader2, Bot, User, Sparkles
} from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

interface Message {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
}

export default function AITutorChat() {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Load chat history when opened
    useEffect(() => {
        if (isOpen && user && messages.length === 0) {
            loadChatHistory();
        }
    }, [isOpen, user]);

    const loadChatHistory = async () => {
        if (!user) return;

        setIsLoadingHistory(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch(`${BACKEND_URL}/api/tutor/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setMessages(data.messages || []);
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const sendMessage = async () => {
        if (!inputValue.trim() || !user || isLoading) return;

        const userMessage: Message = {
            role: 'user',
            content: inputValue.trim()
        };

        // Add user message immediately
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            const token = await user.getIdToken();
            const response = await fetch(`${BACKEND_URL}/api/tutor/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: userMessage.content })
            });

            if (response.ok) {
                const data = await response.json();
                const assistantMessage: Message = {
                    role: 'assistant',
                    content: data.response
                };
                setMessages(prev => [...prev, assistantMessage]);
            } else {
                // Show error message
                const errorMessage: Message = {
                    role: 'assistant',
                    content: "I'm sorry, something went wrong. Please try again."
                };
                setMessages(prev => [...prev, errorMessage]);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage: Message = {
                role: 'assistant',
                content: "I'm having trouble connecting. Please check your connection and try again."
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const clearHistory = async () => {
        if (!user) return;

        try {
            const token = await user.getIdToken();
            await fetch(`${BACKEND_URL}/api/tutor/history`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setMessages([]);
        } catch (error) {
            console.error('Error clearing history:', error);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Format message content with basic markdown
    const formatContent = (content: string) => {
        // Handle code blocks
        const parts = content.split(/(```[\s\S]*?```)/g);

        return parts.map((part, index) => {
            if (part.startsWith('```')) {
                const codeContent = part.replace(/```\w*\n?/g, '').replace(/```$/, '');
                return (
                    <pre key={index} className="bg-black/30 rounded-lg p-3 my-2 overflow-x-auto text-sm">
                        <code>{codeContent}</code>
                    </pre>
                );
            }

            // Handle inline code and basic formatting
            const formatted = part
                .split(/(`[^`]+`)/g)
                .map((segment, i) => {
                    if (segment.startsWith('`') && segment.endsWith('`')) {
                        return (
                            <code key={i} className="bg-purple-500/20 px-1.5 py-0.5 rounded text-purple-300 text-sm">
                                {segment.slice(1, -1)}
                            </code>
                        );
                    }
                    return segment;
                });

            return <span key={index}>{formatted}</span>;
        });
    };

    if (!user) return null;

    return (
        <>
            {/* Chat Bubble Button - Always on top */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[60] w-12 h-12 md:w-14 md:h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 touch-target ${isOpen
                    ? 'bg-gray-800 hover:bg-gray-700'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 hover:scale-110'
                    }`}
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                {isOpen ? (
                    <X className="w-5 h-5 md:w-6 md:h-6 text-white" />
                ) : (
                    <MessageCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
                )}
            </button>

            {/* Chat Panel - Full screen on mobile */}
            {isOpen && (
                <div className="fixed inset-0 md:inset-auto md:bottom-24 md:right-6 z-50 w-full md:w-[400px] h-full md:h-[550px] bg-[#0f0020] md:border md:border-purple-500/30 md:rounded-2xl shadow-2xl shadow-purple-900/50 flex flex-col overflow-hidden safe-area-inset">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600/20 to-pink-600/20 border-b border-purple-500/20">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white">AI Tutor</h3>
                                <p className="text-xs text-purple-300">Ask me anything!</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={clearHistory}
                                className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors touch-target"
                                title="Clear chat history"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                            {/* Close button - visible on mobile */}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="md:hidden p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors touch-target"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {isLoadingHistory ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                                <Bot className="w-12 h-12 mb-3 text-purple-400/50" />
                                <p className="text-sm">Hi! I'm your AI tutor 👋</p>
                                <p className="text-xs mt-1">Ask me anything about your learning journey!</p>
                            </div>
                        ) : (
                            messages.map((message, index) => (
                                <div
                                    key={index}
                                    className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                                >
                                    {/* Avatar */}
                                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${message.role === 'user'
                                        ? 'bg-purple-500/30'
                                        : 'bg-gradient-to-br from-purple-500 to-pink-500'
                                        }`}>
                                        {message.role === 'user' ? (
                                            <User className="w-4 h-4 text-purple-300" />
                                        ) : (
                                            <Bot className="w-4 h-4 text-white" />
                                        )}
                                    </div>

                                    {/* Message Bubble */}
                                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl ${message.role === 'user'
                                        ? 'bg-purple-500/20 text-white rounded-tr-sm'
                                        : 'bg-gray-800/80 text-gray-100 rounded-tl-sm'
                                        }`}>
                                        <div className="text-sm whitespace-pre-wrap break-words">
                                            {formatContent(message.content)}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Loading indicator */}
                        {isLoading && (
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                                    <Bot className="w-4 h-4 text-white" />
                                </div>
                                <div className="bg-gray-800/80 rounded-2xl rounded-tl-sm px-4 py-3">
                                    <div className="flex gap-1">
                                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 md:p-4 border-t border-purple-500/20 bg-[#0a0015]">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Ask a question..."
                                disabled={isLoading}
                                className="flex-1 px-4 py-3 md:py-2.5 bg-purple-500/10 border border-purple-500/30 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50 mobile-input"
                            />
                            <button
                                onClick={sendMessage}
                                disabled={isLoading || !inputValue.trim()}
                                className="px-4 py-3 md:py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 rounded-xl text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-target"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Send className="w-5 h-5" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
