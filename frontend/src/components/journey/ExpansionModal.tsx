'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowDown, ArrowRight, Loader2, Sparkles, Search } from 'lucide-react';
import clsx from 'clsx';

interface ExpansionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (topic: string) => void;
    expansionType: 'deeper' | 'broader';
    parentNodeTitle: string;
    isLoading?: boolean;
}

export default function ExpansionModal({
    isOpen,
    onClose,
    onSubmit,
    expansionType,
    parentNodeTitle,
    isLoading = false
}: ExpansionModalProps) {
    const [customTopic, setCustomTopic] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);

    // Fetch AI suggestions when modal opens
    useEffect(() => {
        if (isOpen && parentNodeTitle) {
            fetchSuggestions();
        }
        // Reset state when modal opens
        if (isOpen) {
            setCustomTopic('');
            setSelectedSuggestion(null);
        }
    }, [isOpen, parentNodeTitle, expansionType]);

    const fetchSuggestions = async () => {
        setLoadingSuggestions(true);
        try {
            const response = await fetch('http://localhost:5000/api/journey/suggest-topics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parent_topic: parentNodeTitle,
                    expansion_type: expansionType
                })
            });
            const data = await response.json();
            if (data.suggestions) {
                setSuggestions(data.suggestions);
            }
        } catch (error) {
            console.error('Failed to fetch suggestions:', error);
            // Fallback suggestions
            setSuggestions([
                `Advanced ${parentNodeTitle}`,
                `${parentNodeTitle} in Practice`,
                `${parentNodeTitle} Patterns`,
                `Beyond ${parentNodeTitle}`
            ]);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    const handleSubmit = () => {
        const topic = selectedSuggestion || customTopic.trim();
        if (topic) {
            onSubmit(topic);
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        setSelectedSuggestion(suggestion);
        setCustomTopic(''); // Clear custom input when selecting a suggestion
    };

    if (!isOpen) return null;

    const isDeeper = expansionType === 'deeper';

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full md:max-w-lg max-h-[90vh] md:max-h-none overflow-y-auto bg-gradient-to-br from-gray-900 to-purple-900/50 border-t md:border border-purple-500/30 rounded-t-2xl md:rounded-2xl shadow-2xl shadow-purple-500/20 safe-area-inset">
                {/* Header */}
                <div className={clsx(
                    "px-4 md:px-6 py-4 border-b",
                    isDeeper
                        ? "border-blue-500/30 bg-blue-500/10"
                        : "border-green-500/30 bg-green-500/10"
                )}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className={clsx(
                                "w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center",
                                isDeeper ? "bg-blue-500/20" : "bg-green-500/20"
                            )}>
                                {isDeeper
                                    ? <ArrowDown className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
                                    : <ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
                                }
                            </div>
                            <div>
                                <h2 className="text-base md:text-lg font-bold text-white">
                                    {isDeeper ? 'Go Deeper' : 'Explore Related Topics'}
                                </h2>
                                <p className="text-xs md:text-sm text-gray-400 line-clamp-1">
                                    {isDeeper
                                        ? `Dive into sub-topics of "${parentNodeTitle}"`
                                        : `Explore topics related to "${parentNodeTitle}"`
                                    }
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors touch-target"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 md:p-6 space-y-4 md:space-y-5">
                    {/* AI Suggestions */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-4 h-4 text-purple-400" />
                            <span className="text-sm font-medium text-purple-300">AI Suggestions</span>
                        </div>

                        {loadingSuggestions ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                                <span className="ml-2 text-gray-400 text-sm">Generating suggestions...</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {suggestions.map((suggestion, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSuggestionClick(suggestion)}
                                        className={clsx(
                                            "px-4 py-3 rounded-lg border text-left text-sm transition-all touch-target",
                                            selectedSuggestion === suggestion
                                                ? "border-purple-500 bg-purple-500/20 text-white"
                                                : "border-gray-700 bg-gray-800/50 text-gray-300 hover:border-purple-500/50 hover:bg-purple-500/10"
                                        )}
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-gray-700" />
                        <span className="text-xs text-gray-500">or enter your own</span>
                        <div className="flex-1 h-px bg-gray-700" />
                    </div>

                    {/* Custom Input */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Search className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-300">Custom Topic</span>
                        </div>
                        <input
                            type="text"
                            value={customTopic}
                            onChange={(e) => {
                                setCustomTopic(e.target.value);
                                setSelectedSuggestion(null); // Clear selection when typing
                            }}
                            placeholder={isDeeper
                                ? "e.g., QuickSort, Memory Management..."
                                : "e.g., Linked Lists, Hash Tables..."
                            }
                            className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors mobile-input"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (customTopic.trim() || selectedSuggestion)) {
                                    handleSubmit();
                                }
                            }}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-4 md:px-6 py-4 border-t border-gray-700/50 bg-black/20 flex flex-col-reverse md:flex-row items-stretch md:items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-3 md:py-2 text-gray-400 hover:text-white transition-colors touch-target text-center"
                        disabled={isLoading}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading || (!customTopic.trim() && !selectedSuggestion)}
                        className={clsx(
                            "px-5 py-3 md:py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all touch-target",
                            isLoading || (!customTopic.trim() && !selectedSuggestion)
                                ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                                : isDeeper
                                    ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/25"
                                    : "bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 text-white shadow-lg shadow-green-500/25"
                        )}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Creating...</span>
                            </>
                        ) : (
                            <>
                                {isDeeper ? <ArrowDown className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                                <span>Add {isDeeper ? 'Deeper' : 'Related'} Topic</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
