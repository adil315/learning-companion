'use client';

import { useState, useEffect } from 'react';
import { X, RotateCcw, Check, ChevronRight, Book, Layers } from 'lucide-react';

interface Flashcard {
    id: string;
    front: string;
    back: string;
    tags?: string[];
}

interface FlashcardReviewProps {
    cards: Flashcard[];
    onClose: () => void;
    onReview: (cardId: string, quality: number) => Promise<void>;
    onComplete: () => void;
}

export default function FlashcardReview({ cards, onClose, onReview, onComplete }: FlashcardReviewProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const currentCard = cards[currentIndex];
    const progress = cards.length > 0 ? ((currentIndex) / cards.length) * 100 : 0;

    const handleFlip = () => {
        setIsFlipped(!isFlipped);
    };

    const handleRating = async (quality: number) => {
        if (isSubmitting || !currentCard) return;

        setIsSubmitting(true);
        try {
            await onReview(currentCard.id, quality);

            // Move to next card or complete
            if (currentIndex < cards.length - 1) {
                setCurrentIndex(prev => prev + 1);
                setIsFlipped(false);
            } else {
                onComplete();
            }
        } catch (error) {
            console.error('Error submitting review:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (cards.length === 0) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center">
                <div className="bg-[#0f0020] border-t md:border border-purple-500/30 rounded-t-2xl md:rounded-2xl p-6 md:p-8 w-full md:max-w-md text-center safe-area-inset">
                    <Book className="w-12 h-12 md:w-16 md:h-16 text-purple-400 mx-auto mb-4" />
                    <h2 className="text-xl md:text-2xl font-bold text-white mb-2">All Caught Up!</h2>
                    <p className="text-gray-400 mb-6">No flashcards due for review right now.</p>
                    <button
                        onClick={onClose}
                        className="px-6 py-3 bg-purple-500 hover:bg-purple-400 text-white rounded-xl font-medium transition-colors touch-target w-full md:w-auto"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center">
            <div className="bg-[#0f0020] border-t md:border border-purple-500/30 rounded-t-2xl md:rounded-2xl p-4 md:p-6 w-full md:max-w-lg max-h-[90vh] md:max-h-none overflow-y-auto safe-area-inset">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Layers className="w-5 h-5 md:w-6 md:h-6 text-purple-400" />
                        <span className="text-base md:text-lg font-semibold text-white">Flashcard Review</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-purple-500/20 rounded-lg transition-colors touch-target"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="mb-6">
                    <div className="flex justify-between text-sm text-gray-400 mb-1">
                        <span>Card {currentIndex + 1} of {cards.length}</span>
                        <span>{Math.round(progress)}% complete</span>
                    </div>
                    <div className="h-2 bg-purple-900/50 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Card */}
                <div
                    className="perspective-1000 cursor-pointer mb-4 md:mb-6"
                    onClick={handleFlip}
                >
                    <div
                        className={`relative w-full min-h-[180px] md:min-h-[200px] transition-transform duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
                    >
                        {/* Front */}
                        <div
                            className="absolute inset-0 p-4 md:p-6 bg-gradient-to-br from-purple-900 via-purple-800 to-pink-900 border border-purple-500/50 rounded-xl flex flex-col justify-center items-center text-center backface-hidden"
                        >
                            <p className="text-base md:text-lg text-white font-medium leading-relaxed">{currentCard?.front}</p>
                            <p className="mt-4 text-sm text-purple-300/70">Tap to reveal answer</p>
                        </div>

                        {/* Back */}
                        <div
                            className="absolute inset-0 p-4 md:p-6 bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900 border border-green-500/50 rounded-xl flex flex-col justify-center items-center text-center backface-hidden rotate-y-180"
                        >
                            <p className="text-base md:text-lg text-white font-medium leading-relaxed">{currentCard?.back}</p>
                        </div>
                    </div>
                </div>

                {/* Rating Buttons - Show only when flipped */}
                {isFlipped && (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-400 text-center mb-3">How well did you remember?</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <button
                                onClick={() => handleRating(0)}
                                disabled={isSubmitting}
                                className="py-3.5 md:py-3 px-3 md:px-2 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-xl text-red-300 font-medium transition-colors disabled:opacity-50 text-sm touch-target"
                            >
                                <RotateCcw className="w-4 h-4 mx-auto mb-1" />
                                Again
                            </button>
                            <button
                                onClick={() => handleRating(2)}
                                disabled={isSubmitting}
                                className="py-3.5 md:py-3 px-3 md:px-2 bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/30 rounded-xl text-orange-300 font-medium transition-colors disabled:opacity-50 text-sm touch-target"
                            >
                                Hard
                            </button>
                            <button
                                onClick={() => handleRating(4)}
                                disabled={isSubmitting}
                                className="py-3.5 md:py-3 px-3 md:px-2 bg-blue-500/20 hover:bg-blue-500/40 border border-blue-500/30 rounded-xl text-blue-300 font-medium transition-colors disabled:opacity-50 text-sm touch-target"
                            >
                                <Check className="w-4 h-4 mx-auto mb-1" />
                                Good
                            </button>
                            <button
                                onClick={() => handleRating(5)}
                                disabled={isSubmitting}
                                className="py-3.5 md:py-3 px-3 md:px-2 bg-green-500/20 hover:bg-green-500/40 border border-green-500/30 rounded-xl text-green-300 font-medium transition-colors disabled:opacity-50 text-sm touch-target"
                            >
                                <ChevronRight className="w-4 h-4 mx-auto mb-1" />
                                Easy
                            </button>
                        </div>
                    </div>
                )}

                {/* Tags */}
                {currentCard?.tags && currentCard.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 justify-center">
                        {currentCard.tags.map((tag, i) => (
                            <span key={i} className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full">
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
