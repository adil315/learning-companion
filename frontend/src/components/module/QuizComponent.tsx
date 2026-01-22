import { useState } from 'react';
import { clsx } from "clsx";

interface QuizProps {
    onComplete: () => void;
}

export function QuizComponent({ onComplete }: QuizProps) {
    const [selected, setSelected] = useState<number | null>(null);
    const [submitted, setSubmitted] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);

    // Mock question data
    const question = {
        text: "What is the output of `print(type([]))` in Python?",
        options: [
            "<class 'list'>",
            "<class 'dict'>",
            "<class 'tuple'>",
            "<class 'array'>"
        ],
        correct: 0
    };

    const handleSubmit = () => {
        if (selected === null) return;

        const correct = selected === question.correct;
        setSubmitted(true);
        setIsCorrect(correct);

        if (correct) {
            onComplete();
        }
    };

    return (
        <div className="p-6 space-y-6">
            <h3 className="text-xl font-semibold text-gray-200">Knowledge Check</h3>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <p className="text-lg text-gray-300 mb-6">{question.text}</p>

                <div className="space-y-3">
                    {question.options.map((option, idx) => (
                        <button
                            key={idx}
                            onClick={() => !submitted && setSelected(idx)}
                            className={clsx(
                                "w-full text-left p-4 rounded-lg border transition-all duration-200",
                                selected === idx
                                    ? "border-blue-500 bg-blue-500/10 text-blue-200"
                                    : "border-white/10 hover:bg-white/5 text-gray-400",
                                submitted && idx === question.correct && "border-green-500 bg-green-500/10 text-green-200",
                                submitted && selected === idx && idx !== question.correct && "border-red-500 bg-red-500/10 text-red-200",
                                submitted && "cursor-default"
                            )}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex justify-end">
                {!submitted && (
                    <button
                        onClick={handleSubmit}
                        disabled={selected === null}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Submit Answer
                    </button>
                )}
                {submitted && isCorrect && (
                    <div className="text-green-400 font-medium animate-in fade-in">Correct! Proceeding...</div>
                )}
                {submitted && !isCorrect && (
                    <div className="text-red-400 font-medium animate-in fade-in">Incorrect, try again.</div>
                )}
            </div>
        </div>
    );
}
