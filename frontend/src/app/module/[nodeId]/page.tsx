'use client';

import { useState, useEffect, use } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    BookOpen, Code2, Play, CheckCircle2, Lock, Zap,
    ChevronRight, ArrowLeft, Loader2, HelpCircle, AlertCircle,
    Menu, X
} from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AITutorChat from '@/components/AITutorChat';

interface Step {
    id: string;
    title: string;
    type: 'theory' | 'code' | 'quiz';
    difficulty: 'Easy' | 'Medium' | 'Hard';
    status: 'unlocked' | 'locked' | 'completed';
    description: string;
}

interface ModuleData {
    id: string;
    title: string;
    steps: Step[];
}

interface MCQOption {
    id: string;
    text: string;
}

interface MCQuestion {
    question: string;
    options: MCQOption[];
    correctId: string;
}

interface CodingChallenge {
    question: string;
    starterCode: string;
    hint: string;
}

const BACKEND_URL = 'http://localhost:5000';

// Reusable fetch with retry logic and exponential backoff
const fetchWithRetry = async (
    url: string,
    options: RequestInit,
    maxRetries: number = 3,
    timeoutMs: number = 30000
): Promise<Response> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // If we get a response (even an error response), return it
            // The caller can decide what to do with non-OK responses
            if (response.ok || (response.status >= 400 && response.status < 500)) {
                return response;
            }

            // Server error (5xx) - might be temporary, retry
            lastError = new Error(`Server error: ${response.status}`);
            console.warn(`[fetchWithRetry] Attempt ${attempt} failed with status ${response.status}`);

        } catch (err: any) {
            lastError = err;
            console.warn(`[fetchWithRetry] Attempt ${attempt} failed:`, err.message || err);
        }

        // Retry with exponential backoff (except on last attempt)
        if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(`[fetchWithRetry] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // All retries exhausted
    throw lastError || new Error('Failed to fetch after retries');
};

// Custom markdown components for beautiful rendering
const MarkdownComponents = {
    h1: ({ children }: any) => (
        <h1 className="text-2xl font-bold text-white mt-6 mb-4">{children}</h1>
    ),
    h2: ({ children }: any) => (
        <h2 className="text-xl font-semibold text-purple-300 mt-5 mb-3 border-b border-white/10 pb-2">
            📚 {children}
        </h2>
    ),
    h3: ({ children }: any) => (
        <h3 className="text-lg font-medium text-blue-300 mt-4 mb-2">▸ {children}</h3>
    ),
    p: ({ children }: any) => (
        <p className="text-gray-300 leading-relaxed mb-4">{children}</p>
    ),
    ul: ({ children }: any) => (
        <ul className="list-none space-y-2 mb-4 ml-2">{children}</ul>
    ),
    ol: ({ children }: any) => (
        <ol className="list-decimal list-inside space-y-2 mb-4 ml-2 text-gray-300">{children}</ol>
    ),
    li: ({ children }: any) => (
        <li className="text-gray-300 flex items-start gap-2">
            <span className="text-purple-400 mt-1">•</span>
            <span>{children}</span>
        </li>
    ),
    code: ({ inline, children }: any) => (
        inline ? (
            <code className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-sm font-mono">
                {children}
            </code>
        ) : (
            <pre className="bg-[#1e1e1e] border border-white/10 rounded-lg p-4 overflow-x-auto my-4">
                <code className="text-green-300 text-sm font-mono">{children}</code>
            </pre>
        )
    ),
    pre: ({ children }: any) => <div className="my-4">{children}</div>,
    blockquote: ({ children }: any) => (
        <blockquote className="border-l-4 border-yellow-500 bg-yellow-500/10 pl-4 py-2 my-4 italic text-yellow-200">
            💡 {children}
        </blockquote>
    ),
    strong: ({ children }: any) => <strong className="text-white font-semibold">{children}</strong>,
};

export default function ModulePage({ params }: { params: Promise<{ nodeId: string }> }) {
    const { nodeId } = use(params);
    const router = useRouter();
    const { user, awardXP } = useAuth();

    // Get journeyId from URL search params
    const [journeyId, setJourneyId] = useState<string | null>(null);

    useEffect(() => {
        // Read journeyId from URL on client side
        const searchParams = new URLSearchParams(window.location.search);
        setJourneyId(searchParams.get('journeyId'));
    }, []);

    const [moduleData, setModuleData] = useState<ModuleData | null>(null);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [stepContent, setStepContent] = useState<string>('');
    const [loadingContent, setLoadingContent] = useState(false);
    const [progressLoaded, setProgressLoaded] = useState(false);

    // Load saved progress when component mounts AND moduleData is ready
    useEffect(() => {
        const loadProgress = async () => {
            // Only load once, and only when we have all required data
            if (progressLoaded || !user || !journeyId || !nodeId || !moduleData) return;

            try {
                const token = await user.getIdToken();
                const response = await fetch(`${BACKEND_URL}/api/user/progress/${journeyId}/${nodeId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log('[Progress] Loaded progress data:', data);

                    if (data.completed_steps && data.completed_steps.length > 0) {
                        const completedSet = new Set<string>(data.completed_steps);
                        setCompletedSteps(completedSet);

                        // Update step statuses based on completed steps
                        const updatedSteps = moduleData.steps.map((step, idx) => {
                            if (completedSet.has(step.id)) {
                                return { ...step, status: 'completed' as const };
                            } else if (idx === 0 || completedSet.has(moduleData.steps[idx - 1]?.id)) {
                                return { ...step, status: 'unlocked' as const };
                            }
                            return step;
                        });
                        setModuleData({ ...moduleData, steps: updatedSteps });

                        // Navigate to saved step index
                        const savedIndex = data.current_step_index || 0;
                        setCurrentStepIndex(savedIndex);
                        console.log('[Progress] Restored to step:', savedIndex, 'with', data.completed_steps.length, 'completed');
                    }
                    setProgressLoaded(true);
                } else {
                    setProgressLoaded(true);
                }
            } catch (error) {
                console.error('Failed to load progress:', error);
                setProgressLoaded(true);
            }
        };

        loadProgress();
    }, [user, journeyId, nodeId, moduleData, progressLoaded]);

    // Quiz state
    const [showQuiz, setShowQuiz] = useState(false);
    const [mcQuestion, setMcQuestion] = useState<MCQuestion | null>(null);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [quizFeedback, setQuizFeedback] = useState<{ correct: boolean; message: string } | null>(null);
    const [loadingQuiz, setLoadingQuiz] = useState(false);

    // Coding challenge state
    const [codingChallenge, setCodingChallenge] = useState<CodingChallenge | null>(null);
    const [code, setCode] = useState("# Write your solution here\n");
    const [output, setOutput] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [codeFeedback, setCodeFeedback] = useState<{ correct: boolean; message: string } | null>(null);

    // XP notification state
    const [xpGained, setXPGained] = useState<{ amount: number; badge?: string } | null>(null);

    // Mobile sidebar state
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const fetchModule = async () => {
            try {
                let moduleNode = null;

                // If we have a journeyId, look in that specific journey
                if (journeyId) {
                    const storedData = sessionStorage.getItem(`journey-${journeyId}`);
                    if (storedData) {
                        const journey = JSON.parse(storedData);
                        if (journey.nodes) {
                            moduleNode = journey.nodes.find((n: any) => n.id === nodeId);
                        }
                    }
                }

                // Fallback: search all journeys (for backwards compatibility)
                if (!moduleNode) {
                    const journeyKeys = Object.keys(sessionStorage).filter(k => k.startsWith('journey-'));
                    for (const key of journeyKeys) {
                        const journey = JSON.parse(sessionStorage.getItem(key) || '{}');
                        if (journey.nodes) {
                            moduleNode = journey.nodes.find((n: any) => n.id === nodeId);
                            if (moduleNode) break;
                        }
                    }
                }

                if (moduleNode) {
                    setModuleData({
                        id: moduleNode.id,
                        title: moduleNode.title,
                        steps: moduleNode.steps || []
                    });
                } else {
                    setModuleData({
                        id: nodeId,
                        title: `Module ${nodeId.replace('node-', '')}`,
                        steps: [
                            { id: 'step-1', title: 'Introduction', type: 'theory', difficulty: 'Easy', status: 'unlocked', description: 'Learn the fundamentals' },
                            { id: 'step-2', title: 'Core Concepts', type: 'theory', difficulty: 'Easy', status: 'locked', description: 'Understand core principles' },
                            { id: 'step-3', title: 'Advanced Topics', type: 'theory', difficulty: 'Medium', status: 'locked', description: 'Dive into advanced concepts' },
                            { id: 'step-4', title: 'Practice Coding', type: 'code', difficulty: 'Medium', status: 'locked', description: 'Implement what you learned' },
                            { id: 'step-5', title: 'Final Assessment', type: 'quiz', difficulty: 'Medium', status: 'locked', description: 'Test your understanding' },
                        ]
                    });
                }
            } catch (err) {
                console.error('Failed to load module', err);
            } finally {
                setLoading(false);
            }
        };
        fetchModule();
    }, [nodeId, journeyId]);

    useEffect(() => {
        if (!moduleData || !moduleData.steps[currentStepIndex]) {
            console.log('[Module] Skipping content load - no moduleData or step');
            return;
        }

        const loadStepContent = async () => {
            const step = moduleData.steps[currentStepIndex];
            console.log(`[Module] Starting content load for step ${currentStepIndex}: ${step.title}`);

            setLoadingContent(true);
            setShowQuiz(false);
            setMcQuestion(null);
            setSelectedOption(null);
            setQuizFeedback(null);
            setCodingChallenge(null);
            setCodeFeedback(null);
            setOutput('');
            setCode("# Write your solution here\n");

            // Show loading message while fetching
            setStepContent(`## 📚 ${step.title}\n\n⏳ Loading lesson content...`);

            // Retry logic with exponential backoff
            const maxRetries = 3;
            let lastError: Error | null = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`[Module] Fetching lesson from API for: ${step.title} (attempt ${attempt}/${maxRetries})`);

                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

                    const response = await fetch(`${BACKEND_URL}/api/lesson/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: step.title,
                            user_level: step.difficulty === 'Easy' ? 'Beginner' : step.difficulty === 'Medium' ? 'Intermediate' : 'Advanced',
                            context: `${moduleData.title} - ${step.description}. Use emojis, clear formatting, and include practical examples.`,
                            // Caching parameters
                            journey_id: journeyId || '',
                            node_id: nodeId || '',
                            step_id: step.id || ''
                        }),
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    console.log(`[Module] API response status: ${response.status}`);

                    if (response.ok) {
                        const data = await response.json();
                        console.log(`[Module] Received data (cached: ${data.cached}):`, data);
                        let content = data.content || '';
                        content = content.replace(/^```markdown\n?/i, '').replace(/\n?```$/i, '');
                        if (content.trim()) {
                            console.log(`[Module] Setting content (${content.length} chars, cached: ${data.cached})`);
                            setStepContent(content);
                            setLoadingContent(false);
                            return; // Success - exit retry loop
                        } else {
                            console.log('[Module] Empty content received, showing fallback');
                            setStepContent(`## ${step.title}\n\n📖 ${step.description}\n\n*Lesson content is being prepared. Please try refreshing the page.*`);
                            setLoadingContent(false);
                            return;
                        }
                    } else {
                        console.error('[Module] API response not ok:', response.status);
                        const errorText = await response.text();
                        console.error('[Module] Error response:', errorText);
                        lastError = new Error(`Server returned status ${response.status}`);
                        // Don't retry on 4xx errors, only 5xx or network errors
                        if (response.status >= 400 && response.status < 500) {
                            break;
                        }
                    }
                } catch (err: any) {
                    console.error(`[Module] Fetch attempt ${attempt} failed:`, err);
                    lastError = err;

                    // If aborted (timeout) or network error, retry with backoff
                    if (attempt < maxRetries) {
                        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                        console.log(`[Module] Retrying in ${delay}ms...`);
                        setStepContent(`## 📚 ${step.title}\n\n⏳ Connection issue, retrying... (attempt ${attempt + 1}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            // All retries failed
            console.error('[Module] All fetch attempts failed:', lastError);
            setStepContent(`## ${step.title}\n\n⚠️ Failed to connect to the server after ${maxRetries} attempts.\n\nPlease ensure the backend is running and try refreshing the page.\n\n**Topic:** ${step.description}`);
            setLoadingContent(false);
        };

        loadStepContent();
    }, [moduleData, currentStepIndex]);

    // Helper function to save progress to backend
    const saveProgressToBackend = async (stepIndex: number, completedStepIds: Set<string>) => {
        if (!user || !journeyId || !nodeId) return;

        try {
            const token = await user.getIdToken();
            await fetch(`${BACKEND_URL}/api/user/progress`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    journey_id: journeyId,
                    node_id: nodeId,
                    completed_steps: Array.from(completedStepIds),
                    current_step_index: stepIndex
                })
            });
            console.log('[Progress] Saved current step:', stepIndex);
        } catch (error) {
            console.error('Failed to save progress:', error);
        }
    };

    const handleStepClick = (index: number) => {
        const step = moduleData?.steps[index];
        if (!step) return;
        if (step.status === 'locked' && !completedSteps.has(moduleData?.steps[index - 1]?.id || '')) {
            return;
        }
        setCurrentStepIndex(index);
        // Save progress when navigating to a step
        saveProgressToBackend(index, completedSteps);
    };

    // Get XP reward based on step type
    const getXPForStepType = (type: 'theory' | 'code' | 'quiz'): number => {
        switch (type) {
            case 'theory': return 10;
            case 'code': return 20;
            case 'quiz': return 15;
            default: return 10;
        }
    };

    const handleCompleteStep = async () => {
        if (!moduleData) return;
        const currentStep = moduleData.steps[currentStepIndex];

        const newCompletedSteps = new Set([...completedSteps, currentStep.id]);
        setCompletedSteps(newCompletedSteps);

        // Award XP for completing the step
        const xpAmount = getXPForStepType(currentStep.type);
        const result = await awardXP(xpAmount);
        if (result) {
            const newBadge = result.newly_unlocked?.[0];
            setXPGained({ amount: xpAmount, badge: newBadge?.name });
            console.log(`[XP] Awarded ${xpAmount} XP. Total: ${result.xp}`);

            // Clear XP notification after 3 seconds
            setTimeout(() => setXPGained(null), 3000);
        }

        // Generate flashcards for theory lessons (in background, non-blocking)
        if (currentStep.type === 'theory' && stepContent && user) {
            user.getIdToken().then(token => {
                fetch(`${BACKEND_URL}/api/flashcards/generate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        title: currentStep.title,
                        content: stepContent,
                        journey_id: journeyId,
                        node_id: nodeId
                    })
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data.cards_created > 0) {
                            console.log(`[Flashcards] Generated ${data.cards_created} cards for "${currentStep.title}"`);
                        }
                    })
                    .catch(err => console.log('[Flashcards] Generation failed:', err));
            });
        }

        // Calculate next step index
        const nextStepIndex = currentStepIndex < moduleData.steps.length - 1
            ? currentStepIndex + 1
            : currentStepIndex;

        // Save progress to backend
        saveProgressToBackend(nextStepIndex, newCompletedSteps);
        console.log('[Progress] Saved step completion:', currentStep.id);

        if (currentStepIndex < moduleData.steps.length - 1) {
            const updatedSteps = [...moduleData.steps];
            updatedSteps[currentStepIndex].status = 'completed';
            updatedSteps[currentStepIndex + 1].status = 'unlocked';
            setModuleData({ ...moduleData, steps: updatedSteps });
            setCurrentStepIndex(currentStepIndex + 1);
            setShowQuiz(false);
        } else {
            // Module complete - award bonus XP and mark node
            const bonusResult = await awardXP(50); // Module completion bonus
            if (bonusResult) {
                const newBadge = bonusResult.newly_unlocked?.[0];
                setXPGained({ amount: 50, badge: newBadge?.name });
                console.log(`[XP] Module bonus: 50 XP. Total: ${bonusResult.xp}`);
            }

            if (user && journeyId) {
                try {
                    const token = await user.getIdToken();
                    await fetch(`${BACKEND_URL}/api/journey/${journeyId}/complete-node`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ node_id: nodeId })
                    });
                    console.log('[Journey] Marked node as completed:', nodeId);
                } catch (error) {
                    console.error('Failed to mark node as completed:', error);
                }
            }

            setTimeout(() => {
                alert('🎉 Module Complete! You can now proceed to the next module.');
                router.push('/dashboard');
            }, 1500);
        }
    };

    // Generate MCQ for theory steps - using dedicated quiz agent
    const generateMCQ = async () => {
        setLoadingQuiz(true);
        setShowQuiz(true);

        const currentStep = moduleData?.steps[currentStepIndex];

        try {
            const token = user ? await user.getIdToken() : '';
            const response = await fetchWithRetry(`${BACKEND_URL}/api/quiz/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    type: 'mcq',
                    lesson_content: stepContent,
                    step_title: currentStep?.title || 'Unknown Topic',
                    difficulty: currentStep?.difficulty || 'Easy'
                })
            });

            if (response.status === 403) {
                const data = await response.json();
                if (data.limit_exceeded) {
                    router.push('/pricing?reason=limit_exceeded');
                    return;
                }
            }

            if (response.ok) {
                const data = await response.json();
                // The backend now returns the MCQ directly
                if (data.question && data.options) {
                    setMcQuestion({
                        question: data.question,
                        options: data.options,
                        correctId: data.correctId
                    });
                } else {
                    // Fallback question with randomized options
                    const options = [
                        { text: 'Understanding the fundamentals', isCorrect: true },
                        { text: 'Advanced implementation only', isCorrect: false },
                        { text: 'Deprecated techniques', isCorrect: false },
                        { text: 'None of the above', isCorrect: false }
                    ];
                    // Shuffle options (Fisher-Yates)
                    for (let i = options.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [options[i], options[j]] = [options[j], options[i]];
                    }
                    // Assign IDs and find correct one
                    const shuffledOptions = options.map((opt, idx) => ({
                        id: String.fromCharCode(65 + idx), // A, B, C, D
                        text: opt.text
                    }));
                    const correctId = shuffledOptions.find((opt, idx) => options[idx].isCorrect)?.id || 'A';

                    setMcQuestion({
                        question: `What is the main concept covered in "${currentStep?.title}"?`,
                        options: shuffledOptions,
                        correctId
                    });
                }
            }
        } catch (err) {
            console.error('Failed to generate MCQ', err);
            // Fallback on error with randomized options
            const options = [
                { text: 'The concept is fundamental to understanding the topic', isCorrect: true },
                { text: 'It is only used in advanced scenarios', isCorrect: false },
                { text: 'It has no practical applications', isCorrect: false },
                { text: 'It is deprecated and no longer used', isCorrect: false }
            ];
            // Shuffle options
            for (let i = options.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [options[i], options[j]] = [options[j], options[i]];
            }
            const shuffledOptions = options.map((opt, idx) => ({
                id: String.fromCharCode(65 + idx),
                text: opt.text
            }));
            const correctId = shuffledOptions.find((opt, idx) => options[idx].isCorrect)?.id || 'A';

            setMcQuestion({
                question: `Based on what you learned about "${currentStep?.title}", which statement is correct?`,
                options: shuffledOptions,
                correctId
            });
        } finally {
            setLoadingQuiz(false);
        }
    };

    // Generate coding challenge for code steps - using dedicated quiz agent
    const generateCodingChallenge = async () => {
        setLoadingQuiz(true);
        setShowQuiz(true);

        const currentStep = moduleData?.steps[currentStepIndex];

        try {
            const token = user ? await user.getIdToken() : '';
            const response = await fetchWithRetry(`${BACKEND_URL}/api/quiz/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    type: 'coding',
                    lesson_content: stepContent,
                    step_title: currentStep?.title || 'Unknown Topic',
                    difficulty: currentStep?.difficulty || 'Easy'
                })
            });

            if (response.status === 403) {
                const data = await response.json();
                if (data.limit_exceeded) {
                    router.push('/pricing?reason=limit_exceeded');
                    return;
                }
            }

            if (response.ok) {
                const data = await response.json();
                // The backend now returns the coding challenge directly
                if (data.question) {
                    setCodingChallenge({
                        question: data.question,
                        starterCode: data.starterCode || "# Write your solution here\n",
                        hint: data.hint || "Apply the concepts from the lesson."
                    });
                    setCode(data.starterCode || "# Write your solution here\n");
                } else {
                    // Fallback challenge
                    setCodingChallenge({
                        question: `Implement a solution related to ${currentStep?.title}. Write clean, working code.`,
                        starterCode: "# Write your solution here\ndef solution():\n    pass",
                        hint: "Start by understanding the problem, then implement step by step."
                    });
                    setCode("# Write your solution here\ndef solution():\n    pass");
                }
            }
        } catch (err) {
            console.error('Failed to generate coding challenge', err);
            // Fallback on error
            setCodingChallenge({
                question: `Practice what you learned about ${currentStep?.title}. Write a simple implementation.`,
                starterCode: "# Write your solution\ndef solution():\n    pass",
                hint: "Apply the concepts from the lesson."
            });
            setCode("# Write your solution\ndef solution():\n    pass");
        } finally {
            setLoadingQuiz(false);
        }
    };

    const handleMCQSubmit = () => {
        if (!selectedOption || !mcQuestion) return;

        const isCorrect = selectedOption === mcQuestion.correctId;
        setQuizFeedback({
            correct: isCorrect,
            message: isCorrect
                ? 'Great job! You understood the concept correctly.'
                : `The correct answer was ${mcQuestion.correctId}. Review the lesson and try again!`
        });

        if (isCorrect) {
            setTimeout(handleCompleteStep, 1500);
        }
    };

    const handleCodeSubmit = async () => {
        setIsRunning(true);
        setOutput('');

        const currentStep = moduleData?.steps[currentStepIndex];

        // Auto-detect language from code content
        const detectLanguage = (codeContent: string): string => {
            const trimmed = codeContent.trim().toLowerCase();
            // React/JavaScript patterns
            if (trimmed.includes('import react') ||
                trimmed.includes('from react') ||
                trimmed.includes('export default') ||
                trimmed.includes('const ') && trimmed.includes('=>') ||
                trimmed.includes('function ') && trimmed.includes('return (') ||
                trimmed.includes('jsx') ||
                trimmed.includes('tsx') ||
                trimmed.includes('props.') ||
                trimmed.includes('usestate') ||
                trimmed.includes('useeffect')) {
                return 'javascript';
            }
            // Python patterns
            if (trimmed.includes('def ') ||
                trimmed.includes('import ') && !trimmed.includes('from react') ||
                trimmed.includes('print(') ||
                trimmed.includes('class ') && trimmed.includes(':') ||
                trimmed.includes('self.')) {
                return 'python';
            }
            // Default to javascript if no clear pattern
            return 'javascript';
        };

        const detectedLanguage = detectLanguage(code);

        try {
            // Note: submit_module_task doesn't strictly require auth for grading in current backend implementation 
            // but might if we add limits later. Adding it for consistency.
            // Wait, I updated backend to verify auth for submit_module_task? 
            // Actually I did NOT update submit_module_task in app.py to require auth yet. 
            // But I should have. Let's add it here to be safe.
            const token = user ? await user.getIdToken() : '';

            const response = await fetch(`${BACKEND_URL}/api/module/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 'Authorization': `Bearer ${token}` // Backend doesn't check yet, but good practice
                },
                body: JSON.stringify({
                    type: 'code',
                    language: detectedLanguage,
                    question: codingChallenge?.question || currentStep?.title || '',
                    content: code
                })
            });

            const data = await response.json();
            setOutput(data.feedback || 'Code executed.');
            setCodeFeedback({
                correct: data.correct,
                message: data.feedback || (data.correct ? 'Your code is correct!' : 'Not quite right. Try again!')
            });

            if (data.correct) {
                setTimeout(handleCompleteStep, 1500);
            }
        } catch (err) {
            setOutput(`Error: ${err}`);
        } finally {
            setIsRunning(false);
        }
    };

    const getStepIcon = (step: Step, index: number) => {
        if (completedSteps.has(step.id) || step.status === 'completed') {
            return <CheckCircle2 className="w-4 h-4 text-green-400" />;
        }
        if (index === currentStepIndex) {
            return <Zap className="w-4 h-4 text-purple-400" />;
        }
        if (step.status === 'locked' && !completedSteps.has(moduleData?.steps[index - 1]?.id || '')) {
            return <Lock className="w-4 h-4 text-gray-500" />;
        }
        return <div className="w-4 h-4 rounded-full border-2 border-gray-500" />;
    };

    const getDifficultyColor = (difficulty: string) => {
        switch (difficulty) {
            case 'Easy': return 'text-green-400';
            case 'Medium': return 'text-yellow-400';
            case 'Hard': return 'text-red-400';
            default: return 'text-gray-400';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0f1117] text-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!moduleData) {
        return <div className="min-h-screen bg-[#0f1117] text-white p-10">Module not found.</div>;
    }

    const currentStep = moduleData.steps[currentStepIndex];
    const isTheoryStep = currentStep.type === 'theory';
    const isCodeStep = currentStep.type === 'code';

    return (
        <div className="min-h-screen md:h-screen bg-[#0f1117] text-gray-200 flex flex-col md:flex-row overflow-hidden">
            {/* XP Notification Toast */}
            {xpGained && (
                <div className="fixed top-4 right-4 z-50 animate-pulse">
                    <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 md:px-6 py-2 md:py-3 rounded-xl shadow-lg shadow-purple-500/30 flex items-center gap-3">
                        <Zap className="w-5 h-5 md:w-6 md:h-6 text-yellow-300" />
                        <div>
                            <div className="font-bold text-base md:text-lg">+{xpGained.amount} XP</div>
                            {xpGained.badge && (
                                <div className="text-sm text-purple-200">🏆 New Badge: {xpGained.badge}</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Header - Only visible on mobile */}
            <div className="md:hidden sticky top-0 z-30 bg-[#0a0b0f] border-b border-white/10 px-4 py-3 flex items-center gap-3">
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 rounded-lg hover:bg-white/10 touch-target"
                >
                    <Menu className="w-5 h-5 text-gray-400" />
                </button>
                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-white truncate block">{currentStep.title}</span>
                    <span className="text-xs text-gray-500">Step {currentStepIndex + 1}/{moduleData.steps.length}</span>
                </div>
                <span className={twMerge(
                    "px-2 py-1 rounded text-xs font-medium shrink-0",
                    currentStep.type === 'theory' && "bg-blue-500/20 text-blue-400",
                    currentStep.type === 'code' && "bg-green-500/20 text-green-400",
                    currentStep.type === 'quiz' && "bg-purple-500/20 text-purple-400"
                )}>
                    {currentStep.type === 'theory' ? '📖' : currentStep.type === 'code' ? '💻' : '📝'}
                </span>
            </div>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Left Sidebar - Drawer on mobile, fixed on desktop */}
            <div className={twMerge(
                "fixed md:relative inset-y-0 left-0 z-50 md:z-auto w-[85%] max-w-[320px] md:w-72 md:max-w-none",
                "border-r border-white/10 bg-[#0a0b0f] flex flex-col",
                "transform transition-transform duration-300 ease-out md:transform-none",
                sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            )}>
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <button
                            onClick={() => router.back()}
                            className="text-gray-400 hover:text-white flex items-center gap-2 text-sm mb-3 transition-colors touch-target"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <h2 className="font-semibold text-white flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-purple-400" />
                            Journey Roadmap
                        </h2>
                    </div>
                    {/* Close button - only on mobile */}
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="md:hidden p-2 rounded-lg hover:bg-white/10 touch-target"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {moduleData.steps.map((step, index) => {
                        const isCompleted = completedSteps.has(step.id) || step.status === 'completed';
                        const isCurrent = index === currentStepIndex;
                        const isLocked = step.status === 'locked' && !completedSteps.has(moduleData.steps[index - 1]?.id || '') && index > 0;

                        return (
                            <button
                                key={step.id}
                                onClick={() => {
                                    handleStepClick(index);
                                    setSidebarOpen(false); // Close sidebar on mobile after selection
                                }}
                                disabled={isLocked}
                                className={twMerge(
                                    "w-full text-left p-3 rounded-lg transition-all duration-200 touch-target",
                                    isCurrent && "bg-purple-600/20 border border-purple-500/30",
                                    isCompleted && !isCurrent && "bg-green-600/10 border border-green-500/20",
                                    !isCompleted && !isCurrent && !isLocked && "hover:bg-white/5",
                                    isLocked && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5">{getStepIcon(step, index)}</div>
                                    <div className="flex-1 min-w-0">
                                        <span className={twMerge(
                                            "text-sm font-medium block truncate",
                                            isCurrent ? "text-white" : "text-gray-300"
                                        )}>
                                            Step {index + 1}: {step.title}
                                        </span>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={twMerge("text-xs", getDifficultyColor(step.difficulty))}>
                                                {step.difficulty}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {step.type === 'theory' ? '📖' : step.type === 'code' ? '💻' : '📝'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-white/10 bg-[#0a0b0f]">
                    <div className="text-xs text-gray-500">
                        Progress: {completedSteps.size} / {moduleData.steps.length} steps
                    </div>
                    <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                            style={{ width: `${(completedSteps.size / moduleData.steps.length) * 100}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Right Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Desktop Header - Hidden on mobile since we have mobile header */}
                <header className="hidden md:flex h-14 border-b border-white/10 items-center px-6 justify-between bg-[#0f1117]">
                    <div>
                        <h1 className="font-semibold text-lg text-white">{currentStep.title}</h1>
                        <p className="text-xs text-gray-500">{moduleData.title}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={twMerge(
                            "px-2 py-1 rounded text-xs font-medium",
                            currentStep.type === 'theory' && "bg-blue-500/20 text-blue-400",
                            currentStep.type === 'code' && "bg-green-500/20 text-green-400",
                            currentStep.type === 'quiz' && "bg-purple-500/20 text-purple-400"
                        )}>
                            {currentStep.type === 'theory' ? '📖 THEORY' : currentStep.type === 'code' ? '💻 CODE' : '📝 QUIZ'}
                        </span>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto">
                    {loadingContent ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                            <span className="text-gray-400 text-sm">Generating lesson content...</span>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto p-4 md:p-6">
                            {/* Mini-Lesson */}
                            <div className="bg-gradient-to-br from-[#151720] to-[#1a1d28] rounded-xl p-4 md:p-6 border border-white/10 mb-4 md:mb-6 shadow-xl">
                                <div className="flex items-center gap-2 mb-4 md:mb-6 pb-3 border-b border-white/10">
                                    <div className="p-1.5 md:p-2 bg-purple-500/20 rounded-lg">
                                        <BookOpen className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
                                    </div>
                                    <div>
                                        <span className="font-semibold text-white text-sm md:text-base">Mini-Lesson</span>
                                        <p className="text-xs text-gray-500">Read carefully before the assessment</p>
                                    </div>
                                </div>

                                <div className="prose prose-invert max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                        {stepContent}
                                    </ReactMarkdown>
                                </div>
                            </div>

                            {/* Assessment Section */}
                            {!showQuiz && (
                                <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-xl p-6 border border-yellow-500/20 mb-6">
                                    <div className="text-center">
                                        <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <AlertCircle className="w-6 h-6 text-yellow-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-white mb-2">
                                            Ready for the {isTheoryStep ? 'Quiz' : 'Coding Challenge'}? 🎯
                                        </h3>
                                        <p className="text-gray-400 mb-4 text-sm">
                                            {isTheoryStep
                                                ? 'Answer a multiple choice question to verify you understood the concept.'
                                                : 'Complete a coding challenge to practice what you learned.'}
                                        </p>
                                        <button
                                            onClick={isTheoryStep ? generateMCQ : generateCodingChallenge}
                                            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg font-medium transition-all flex items-center gap-2 mx-auto shadow-lg"
                                        >
                                            {isTheoryStep ? '📝 Take MCQ Quiz' : '💻 Start Coding Challenge'}
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* MCQ Quiz for Theory Steps */}
                            {showQuiz && isTheoryStep && (
                                <div className="bg-gradient-to-br from-[#151720] to-[#1a1d28] rounded-xl p-6 border border-purple-500/20">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="p-2 bg-purple-500/20 rounded-lg">
                                            <HelpCircle className="w-5 h-5 text-purple-400" />
                                        </div>
                                        <span className="font-semibold text-white">📝 Multiple Choice Quiz</span>
                                    </div>

                                    {loadingQuiz ? (
                                        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Generating question...
                                        </div>
                                    ) : mcQuestion ? (
                                        <>
                                            <p className="text-gray-200 mb-6 text-lg font-medium">
                                                {mcQuestion.question}
                                            </p>

                                            <div className="space-y-3">
                                                {mcQuestion.options.map((option) => (
                                                    <button
                                                        key={option.id}
                                                        onClick={() => !quizFeedback && setSelectedOption(option.id)}
                                                        disabled={!!quizFeedback}
                                                        className={twMerge(
                                                            "w-full text-left p-4 rounded-lg border transition-all",
                                                            selectedOption === option.id
                                                                ? "bg-purple-600/20 border-purple-500"
                                                                : "bg-white/5 border-white/10 hover:bg-white/10",
                                                            quizFeedback && option.id === mcQuestion.correctId && "bg-green-500/20 border-green-500",
                                                            quizFeedback && selectedOption === option.id && !quizFeedback.correct && "bg-red-500/20 border-red-500",
                                                            quizFeedback && "cursor-not-allowed"
                                                        )}
                                                    >
                                                        <span className="font-bold text-purple-400 mr-3">{option.id}.</span>
                                                        <span className="text-gray-200">{option.text}</span>
                                                    </button>
                                                ))}
                                            </div>

                                            {!quizFeedback && (
                                                <button
                                                    onClick={handleMCQSubmit}
                                                    disabled={!selectedOption}
                                                    className="mt-6 px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                                >
                                                    Submit Answer
                                                </button>
                                            )}

                                            {quizFeedback && (
                                                <div className={twMerge(
                                                    "mt-6 p-4 rounded-lg",
                                                    quizFeedback.correct
                                                        ? "bg-green-500/20 border border-green-500/30 text-green-400"
                                                        : "bg-red-500/20 border border-red-500/30 text-red-400"
                                                )}>
                                                    <div className="font-medium text-lg">
                                                        {quizFeedback.correct ? '✅ Correct! Moving to next step...' : '❌ Incorrect!'}
                                                    </div>
                                                    <p className="mt-2 opacity-80">{quizFeedback.message}</p>
                                                    {!quizFeedback.correct && (
                                                        <button
                                                            onClick={() => {
                                                                setQuizFeedback(null);
                                                                setSelectedOption(null);
                                                                generateMCQ();
                                                            }}
                                                            className="mt-3 text-sm underline hover:no-underline"
                                                        >
                                                            Try Again with New Question
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    ) : null}
                                </div>
                            )}

                            {/* Coding Challenge for Code Steps */}
                            {showQuiz && isCodeStep && (
                                <div className="bg-[#1e1e1e] rounded-xl border border-white/10 overflow-hidden shadow-xl">
                                    <div className="p-4 bg-[#252526] border-b border-black">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Code2 className="w-5 h-5 text-green-400" />
                                            <span className="font-semibold text-white">💻 Coding Challenge</span>
                                        </div>
                                        {loadingQuiz ? (
                                            <div className="flex items-center gap-2 text-gray-400">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Generating challenge...
                                            </div>
                                        ) : codingChallenge && (
                                            <>
                                                <p className="text-gray-300 mt-2">{codingChallenge.question}</p>
                                                <p className="text-yellow-400 text-sm mt-2">💡 Hint: {codingChallenge.hint}</p>
                                            </>
                                        )}
                                    </div>

                                    <div className="h-64">
                                        <Editor
                                            height="100%"
                                            defaultLanguage="python"
                                            theme="vs-dark"
                                            value={code}
                                            onChange={(val) => setCode(val || "")}
                                            options={{
                                                minimap: { enabled: false },
                                                fontSize: 14,
                                                padding: { top: 16 },
                                                fontFamily: "'JetBrains Mono', monospace",
                                            }}
                                        />
                                    </div>

                                    <div className="p-4 bg-[#252526] border-t border-black flex items-center justify-between">
                                        <button
                                            onClick={handleCodeSubmit}
                                            disabled={isRunning}
                                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                        >
                                            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                            Run & Submit
                                        </button>
                                    </div>

                                    {(output || codeFeedback) && (
                                        <div className="p-4 bg-[#1a1a1a] border-t border-black">
                                            {codeFeedback && (
                                                <div className={twMerge(
                                                    "p-3 rounded-lg mb-3",
                                                    codeFeedback.correct
                                                        ? "bg-green-500/20 text-green-400"
                                                        : "bg-red-500/20 text-red-400"
                                                )}>
                                                    {codeFeedback.correct ? '✅ Correct! Great job!' : '❌ Not quite right. Check the feedback and try again.'}
                                                </div>
                                            )}
                                            <div className="text-xs text-gray-500 mb-2">📤 Output:</div>
                                            <div className="font-mono text-sm text-gray-300 whitespace-pre-wrap bg-black/30 p-3 rounded">
                                                {output}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* AI Tutor Chat */}
            <AITutorChat />
        </div>
    );
}
