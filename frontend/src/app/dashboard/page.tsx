'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import {
    Book, Trophy, Zap, BookOpen, ChevronRight, Plus,
    LogOut, Target, Flame, Star, TrendingUp, Clock,
    FileText, Code, CheckCircle, Layers, Crown, AlertCircle
} from 'lucide-react';
import AITutorChat from '@/components/AITutorChat';
import FlashcardReview from '@/components/FlashcardReview';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

interface Journey {
    id: string;
    topic: string;
    mode: 'topic' | 'syllabus';
    nodes?: any[];
    completedNodes?: string[];
    nodeProgress?: Record<string, { completedSteps: number; currentStepIndex: number }>;
    currentNodeIndex?: number;
    createdAt?: any;
}

interface Badge {
    id: string;
    name: string;
    icon: string;
    xp_required: number;
    description: string;
}

// All badge definitions for display
const ALL_BADGES: Badge[] = [
    { id: 'novice_explorer', name: 'Novice Explorer', icon: '🌱', xp_required: 0, description: 'Just started the journey' },
    { id: 'quick_learner', name: 'Quick Learner', icon: '⚡', xp_required: 100, description: 'Earned 100 XP' },
    { id: 'knowledge_seeker', name: 'Knowledge Seeker', icon: '📚', xp_required: 250, description: 'Earned 250 XP' },
    { id: 'rising_star', name: 'Rising Star', icon: '⭐', xp_required: 500, description: 'Earned 500 XP' },
    { id: 'dedicated_scholar', name: 'Dedicated Scholar', icon: '🎓', xp_required: 1000, description: 'Earned 1000 XP' },
    { id: 'expert_adventurer', name: 'Expert Adventurer', icon: '🏆', xp_required: 2500, description: 'Earned 2500 XP' },
    { id: 'master_of_learning', name: 'Master of Learning', icon: '👑', xp_required: 5000, description: 'Earned 5000 XP' },
];

export default function DashboardPage() {
    const router = useRouter();
    const { user, userData, loading, logOut, refreshUserData } = useAuth();
    const [journeys, setJourneys] = useState<Journey[]>([]);
    const [loadingJourneys, setLoadingJourneys] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createMode, setCreateMode] = useState<'topic' | 'syllabus'>('topic');
    const [inputValue, setInputValue] = useState('');
    const [creating, setCreating] = useState(false);
    const [creatingMessage, setCreatingMessage] = useState('');
    const [showBadgePanel, setShowBadgePanel] = useState(false);

    // Flashcard state
    const [showFlashcardReview, setShowFlashcardReview] = useState(false);
    const [dueCards, setDueCards] = useState<any[]>([]);
    const [dueCardCount, setDueCardCount] = useState(0);

    // Subscription & Usage state
    const [userUsage, setUserUsage] = useState<{
        tier: 'free' | 'pro';
        daily_used: number;
        daily_limit: number;
        remaining: number;
        limit_exceeded: boolean;
        subscription_status?: string;
    } | null>(null);

    // Diagnostic Q&A state
    const [diagnosticState, setDiagnosticState] = useState<{
        active: boolean;
        sessionId: string;
        topic: string;
        question: string;
        questionNumber: number;
    }>({ active: false, sessionId: '', topic: '', question: '', questionNumber: 0 });
    const [diagnosticAnswer, setDiagnosticAnswer] = useState('');

    // Redirect if not logged in
    useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [user, loading, router]);

    // Fetch user's journeys
    useEffect(() => {
        const fetchJourneys = async () => {
            if (!user) return;

            try {
                const token = await user.getIdToken();
                const response = await fetch(`${BACKEND_URL}/api/user/journeys`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    setJourneys(data.journeys || []);
                }
            } catch (error) {
                console.error('Error fetching journeys:', error);
            } finally {
                setLoadingJourneys(false);
            }
        };

        if (user) {
            fetchJourneys();
        }
    }, [user]);

    // Debug active configuration
    const [debugInfo, setDebugInfo] = useState<{
        url: string;
        error: string | null;
        tokenStatus: string;
    }>({
        url: BACKEND_URL,
        error: null,
        tokenStatus: 'Checking...'
    });

    useEffect(() => {
        if (user) {
            user.getIdToken().then(() => {
                setDebugInfo(prev => ({ ...prev, tokenStatus: 'Valid' }));
            }).catch(err => {
                setDebugInfo(prev => ({ ...prev, tokenStatus: `Error: ${err.message}` }));
            });
        } else {
            setDebugInfo(prev => ({ ...prev, tokenStatus: 'No User' }));
        }
    }, [user]);

    // Fetch due flashcards
    useEffect(() => {
        const fetchDueCards = async () => {
            if (!user) return;

            try {
                const token = await user.getIdToken();
                const response = await fetch(`${BACKEND_URL}/api/flashcards/due`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    setDueCards(data.cards || []);
                    setDueCardCount(data.due_count || 0);
                } else {
                    console.warn('Flashcard fetch failed', response.status);
                }
            } catch (error) {
                console.error('Error fetching flashcards:', error);
            }
        };

        if (user) {
            fetchDueCards();
        }
    }, [user]);

    // Fetch user usage stats
    useEffect(() => {
        const fetchUsage = async () => {
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const response = await fetch(`${BACKEND_URL}/api/user/usage`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setUserUsage(data);
                }
            } catch (error) {
                console.error('Error fetching usage:', error);
            }
        };

        if (user) {
            fetchUsage();
            // Poll for usage updates periodically
            const interval = setInterval(fetchUsage, 60000); // Every minute
            return () => clearInterval(interval);
        }
    }, [user]);

    const handleReviewCard = async (cardId: string, quality: number) => {
        if (!user) return;

        const token = await user.getIdToken();
        await fetch(`${BACKEND_URL}/api/flashcards/${cardId}/review`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ quality })
        });
    };

    const handleFlashcardComplete = () => {
        setShowFlashcardReview(false);
        setDueCards([]);
        setDueCardCount(0);
        // Refresh count
        if (user) {
            user.getIdToken().then(token => {
                fetch(`${BACKEND_URL}/api/flashcards/stats`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                    .then(res => res.json())
                    .then(data => setDueCardCount(data.due || 0))
                    .catch(() => { });
            });
        }
    };

    const handleCreateJourney = async () => {
        if (!inputValue.trim() || !user) return;

        setCreating(true);
        setCreatingMessage('Starting...');

        try {
            const token = await user.getIdToken();

            if (createMode === 'topic') {
                // Topic mode: Start diagnostic Q&A flow
                setCreatingMessage('Starting diagnostic assessment...');
                const response = await fetch(`${BACKEND_URL}/api/journey/topic/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ topic: inputValue })
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.status === 'chatting') {
                        // Start diagnostic flow - show Q&A in modal
                        setDiagnosticState({
                            active: true,
                            sessionId: data.session_id,
                            topic: inputValue,
                            question: data.message,
                            questionNumber: 1
                        });
                        setCreating(false);
                        setCreatingMessage('');
                    } else if (data.job_id) {
                        // Journey being created
                        await handleJourneyPolling(data.job_id, inputValue, 'topic', token);
                    }
                } else {
                    if (response.status === 403) {
                        const errorData = await response.json();
                        if (errorData.limit_exceeded) {
                            router.push('/pricing?reason=limit_exceeded');
                            return;
                        }
                    }
                    console.error('Failed to start diagnostic');
                    setCreating(false);
                }
            } else {
                // Syllabus mode: Direct journey creation
                setCreatingMessage('Analyzing syllabus...');
                const response = await fetch(`${BACKEND_URL}/api/journey/syllabus`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ text: inputValue, async: true })
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.job_id) {
                        await handleJourneyPolling(data.job_id, inputValue.slice(0, 50), 'syllabus', token);
                    } else if (data.journey_id) {
                        sessionStorage.setItem(`journey-${data.journey_id}`, JSON.stringify(data));
                        router.push(`/journey/${data.journey_id}`);
                    }
                } else {
                    if (response.status === 403) {
                        const errorData = await response.json();
                        if (errorData.limit_exceeded) {
                            router.push('/pricing?reason=limit_exceeded');
                            return;
                        }
                    }
                    const errorData = await response.json().catch(() => ({}));
                    console.error('Failed to create syllabus journey:', errorData);
                    setCreatingMessage(errorData.error || 'Failed to create journey. Please try again.');
                    setTimeout(() => setCreating(false), 2000);
                }
            }
        } catch (error) {
            console.error('Error creating journey:', error);
            setCreating(false);
            setShowCreateModal(false);
        }
    };

    // Handle diagnostic answer submission
    const handleDiagnosticAnswer = async () => {
        if (!diagnosticAnswer.trim() || !user || !diagnosticState.active) return;

        setCreating(true);
        setCreatingMessage('Processing your answer...');

        try {
            const token = await user.getIdToken();
            const response = await fetch(`${BACKEND_URL}/api/journey/topic/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    session_id: diagnosticState.sessionId,
                    answer: diagnosticAnswer,
                    topic: diagnosticState.topic
                })
            });

            if (response.ok) {
                const data = await response.json();

                if (data.status === 'chatting') {
                    // Continue with next question
                    setDiagnosticState(prev => ({
                        ...prev,
                        question: data.message,
                        questionNumber: prev.questionNumber + 1
                    }));
                    setDiagnosticAnswer('');
                    setCreating(false);
                    setCreatingMessage('');
                } else if (data.status === 'processing' && data.job_id) {
                    // Diagnostic complete, journey being created
                    setCreatingMessage(`Assessment complete! Level: ${data.level}. Creating your journey...`);
                    await handleJourneyPolling(data.job_id, diagnosticState.topic, 'topic', token);
                }
            } else {
                if (response.status === 403) {
                    const errorData = await response.json();
                    if (errorData.limit_exceeded) {
                        router.push('/pricing?reason=limit_exceeded');
                        return;
                    }
                }
            }
        } catch (error) {
            console.error('Error submitting answer:', error);
            setCreating(false);
        }
    };

    // Handle skipping the diagnostic
    const handleSkipDiagnostic = async () => {
        if (!user || !diagnosticState.active) return;

        setCreating(true);
        setCreatingMessage('Skipping assessment, creating beginner journey...');

        try {
            const token = await user.getIdToken();
            const response = await fetch(`${BACKEND_URL}/api/journey/topic/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    session_id: diagnosticState.sessionId,
                    topic: diagnosticState.topic,
                    skip: true
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
                if (data.job_id) {
                    await handleJourneyPolling(data.job_id, diagnosticState.topic, 'topic', token);
                }
            }
        } catch (error) {
            console.error('Error skipping diagnostic:', error);
            setCreating(false);
        }
    };

    // Poll for journey result and redirect
    const handleJourneyPolling = async (jobId: string, topic: string, mode: 'topic' | 'syllabus', token: string) => {
        setCreatingMessage('Creating your personalized learning path...');
        const journey = await pollForResult(jobId);

        if (journey) {
            // For syllabus mode, use the topic from the journey response (LLM extracts the subject name)
            // For topic mode, use the user-provided topic
            const journeyTopic = mode === 'syllabus' && journey.topic ? journey.topic : topic;

            // Save journey to user's collection
            await fetch(`${BACKEND_URL}/api/user/journeys`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ...journey, topic: journeyTopic, mode })
            });

            // Store in session and redirect
            const journeyId = journey.journey_id || `journey-${Date.now()}`;
            sessionStorage.setItem(`journey-${journeyId}`, JSON.stringify(journey));
            router.push(`/journey/${journeyId}`);
        } else {
            setCreating(false);
            setShowCreateModal(false);
            setDiagnosticState({ active: false, sessionId: '', topic: '', question: '', questionNumber: 0 });
        }
    };

    // Poll for job result
    const pollForResult = async (jobId: string): Promise<any> => {
        const maxAttempts = 60;
        let consecutiveErrors = 0;

        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await fetch(`${BACKEND_URL}/api/job/${jobId}`);

                if (response.status === 404) {
                    consecutiveErrors++;
                    if (consecutiveErrors >= 3) {
                        // Job was lost (possibly due to server restart)
                        setCreatingMessage('Server connection lost. Please try again.');
                        return null;
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }

                consecutiveErrors = 0;
                const data = await response.json();

                if (data.status === 'completed') {
                    return data.result;
                } else if (data.status === 'failed') {
                    console.error('Job failed:', data.error);
                    setCreatingMessage(`Error: ${data.error || 'Job failed'}`);
                    return null;
                }

                // Wait 2 seconds before next poll
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.error('Polling error:', error);
                consecutiveErrors++;
                if (consecutiveErrors >= 5) {
                    setCreatingMessage('Connection error. Please check your network.');
                    return null;
                }
            }
        }
        setCreatingMessage('Request timed out. Please try again.');
        return null;
    };

    const handleLogout = async () => {
        await logOut();
        router.push('/');
    };

    const getProgressPercentage = (journey: Journey) => {
        if (!journey.nodes || journey.nodes.length === 0) return 0;

        // Calculate total steps across all nodes
        let totalSteps = 0;
        let completedSteps = 0;

        journey.nodes.forEach((node: any) => {
            const nodeStepCount = node.steps?.length || 5; // Default 5 steps per node
            totalSteps += nodeStepCount;

            // Check if node is fully completed
            if (journey.completedNodes?.includes(node.id)) {
                completedSteps += nodeStepCount;
            } else if (journey.nodeProgress?.[node.id]) {
                // Add partial step progress
                completedSteps += journey.nodeProgress[node.id].completedSteps;
            }
        });

        return totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    };

    const getNextBadge = (): Badge | null => {
        const xp = userData?.xp || 0;
        for (const badge of ALL_BADGES) {
            if (xp < badge.xp_required) {
                return badge;
            }
        }
        return null; // User has all badges
    };

    const getHighestBadge = (): Badge => {
        const badges = userData?.badges || [];
        if (badges.length === 0) return ALL_BADGES[0];
        // Return the last badge (highest XP requirement)
        return badges[badges.length - 1] || ALL_BADGES[0];
    };

    const getNextBadgeProgress = (): number => {
        const xp = userData?.xp || 0;
        const nextBadge = getNextBadge();
        if (!nextBadge) return 100; // All badges earned

        const currentBadge = getHighestBadge();
        const startXP = currentBadge.xp_required;
        const endXP = nextBadge.xp_required;
        const progress = ((xp - startXP) / (endXP - startXP)) * 100;
        return Math.min(Math.max(progress, 0), 100);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0015] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-[#0a0015] text-white">
            {/* Background Effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] bg-purple-600/20 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-[-10%] right-[-5%] w-[300px] h-[300px] bg-pink-600/15 rounded-full blur-[80px]"></div>
            </div>

            {/* Header */}
            <header className="relative z-20 border-b border-purple-500/10">
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="relative w-8 h-8 md:w-10 md:h-10">
                            <Image
                                src="/logo.svg"
                                alt="Learning Companion Logo"
                                fill
                                className="object-contain"
                            />
                        </div>
                        <span className="text-lg md:text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Learning Companion
                        </span>
                    </div>

                    <div className="flex items-center gap-2 md:gap-4">
                        {/* Token/Pro Status Widget */}
                        {userUsage && (
                            <div className="hidden md:flex items-center gap-2">
                                {userUsage.tier === 'pro' && userUsage.subscription_status === 'active' && (
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 rounded-lg text-yellow-500">
                                        <Crown className="w-4 h-4 text-yellow-400 fill-yellow-400/20" />
                                        <span className="font-bold text-sm">PRO</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* XP/Badge Widget - Clickable */}
                        <div className="relative">
                            <button
                                onClick={() => setShowBadgePanel(!showBadgePanel)}
                                className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 bg-purple-500/10 border border-purple-500/30 rounded-xl hover:bg-purple-500/20 transition-all touch-target"
                            >
                                <span className="text-lg md:text-xl">{getHighestBadge().icon}</span>
                                <div className="flex items-center gap-1 md:gap-1.5 text-purple-400">
                                    <Zap className="w-4 h-4" />
                                    <span className="font-bold text-sm md:text-base">{userData?.xp || 0}</span>
                                    <span className="text-purple-300/70 text-xs md:text-sm hidden sm:inline">XP</span>
                                </div>
                            </button>

                            {/* Badge Panel Dropdown - Bottom sheet on mobile */}
                            {showBadgePanel && (
                                <>
                                    {/* Backdrop to close */}
                                    <div
                                        className="fixed inset-0 z-10 bg-black/50 md:bg-transparent"
                                        onClick={() => setShowBadgePanel(false)}
                                    />
                                    <div className="fixed inset-x-0 bottom-0 md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 w-full md:w-[480px] p-4 md:p-5 bg-[#12001f] border-t md:border border-purple-500/30 rounded-t-2xl md:rounded-2xl shadow-2xl shadow-purple-900/50 z-20 max-h-[70vh] md:max-h-none overflow-y-auto safe-area-inset">
                                        {/* Header row */}
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center text-2xl shadow-lg shadow-green-500/20">
                                                    {getHighestBadge().icon}
                                                </div>
                                                <div>
                                                    <div className="text-lg font-bold text-white">{getHighestBadge().name}</div>
                                                    {getNextBadge() ? (
                                                        <div className="text-sm text-gray-400">
                                                            {getNextBadge()!.xp_required - (userData?.xp || 0)} XP to {getNextBadge()!.name}
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-green-400">✨ All badges earned!</div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-pink-400">
                                                <TrendingUp className="w-5 h-5" />
                                                <span className="font-bold">{userData?.xp || 0} Total XP</span>
                                            </div>
                                        </div>

                                        {/* Progress Bar */}
                                        {getNextBadge() && (
                                            <div className="h-1.5 bg-purple-900/50 rounded-full overflow-hidden mb-5">
                                                <div
                                                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                                                    style={{ width: `${getNextBadgeProgress()}%` }}
                                                ></div>
                                            </div>
                                        )}

                                        {/* Badges Row */}
                                        <div className="flex flex-wrap gap-2">
                                            {ALL_BADGES.map((badge) => {
                                                const isEarned = (userData?.xp || 0) >= badge.xp_required;
                                                const isCurrent = badge.id === getHighestBadge().id;
                                                return (
                                                    <div
                                                        key={badge.id}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-default ${isCurrent
                                                            ? 'bg-purple-600/40 border border-purple-500 text-white'
                                                            : isEarned
                                                                ? 'bg-purple-500/10 border border-purple-500/30 text-gray-300'
                                                                : 'bg-gray-900/50 border border-gray-700/30 text-gray-500'
                                                            }`}
                                                        title={badge.description}
                                                    >
                                                        <span className={isEarned ? 'text-lg' : 'text-lg grayscale opacity-50'}>{badge.icon}</span>
                                                        <span className="text-xs font-medium">{badge.name}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Flashcard Due Widget */}
                        <button
                            onClick={() => setShowFlashcardReview(true)}
                            className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20 transition-all touch-target"
                        >
                            <Layers className="w-4 h-4 text-blue-400" />
                            <span className="font-medium text-blue-300 text-sm md:text-base">
                                {dueCardCount > 0 ? `${dueCardCount}` : ''}
                            </span>
                            {dueCardCount > 0 && (
                                <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                            )}
                        </button>

                        {/* User Profile */}
                        <div className="flex items-center gap-2 md:gap-3">
                            {userUsage?.tier !== 'pro' && (
                                <button
                                    onClick={() => router.push('/pricing')}
                                    className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 hover:from-purple-500/20 hover:to-pink-500/20 border border-purple-500/30 rounded-lg transition-all group"
                                >
                                    <Crown className="w-4 h-4 text-purple-400 group-hover:text-purple-300" />
                                    <span className="text-xs font-bold text-purple-400 group-hover:text-purple-300">UPGRADE TO PRO</span>
                                </button>
                            )}
                            {userData?.photoURL ? (
                                <img
                                    src={userData.photoURL}
                                    alt=""
                                    className="w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-purple-500/50"
                                />
                            ) : (
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-purple-500/30 rounded-full flex items-center justify-center">
                                    <span className="text-base md:text-lg font-bold">{userData?.displayName?.[0] || 'U'}</span>
                                </div>
                            )}
                            <button
                                onClick={handleLogout}
                                className="p-2 text-gray-400 hover:text-white hover:bg-purple-500/20 rounded-lg transition-colors touch-target"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Mobile Upgrade Button (Visible only on mobile) */}
                        <div className="md:hidden">
                            {userUsage?.tier !== 'pro' && (
                                <button
                                    onClick={() => router.push('/pricing')}
                                    className="p-2 text-yellow-400 hover:bg-yellow-500/10 rounded-lg border border-yellow-500/30"
                                >
                                    <Crown className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">

                {/* Welcome Banner - Lighter Gradient Style */}
                <div className="mb-6 md:mb-8 p-5 md:p-8 rounded-2xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 relative overflow-hidden">
                    {/* Decorative elements */}
                    <div className="absolute top-0 right-0 w-32 md:w-64 h-32 md:h-64 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-1/2 w-24 md:w-48 h-24 md:h-48 bg-pink-500/5 rounded-full blur-2xl"></div>

                    <div className="relative z-10">
                        <h1 className="text-2xl md:text-4xl font-bold mb-2 md:mb-3 bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                            Welcome back, {userData?.displayName?.split(' ')[0] || 'Learner'}!
                        </h1>
                        <p className="text-purple-200/70 text-base md:text-lg mb-4 md:mb-6">
                            Ready to continue your learning adventure? Let's conquer new skills!
                        </p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 bg-purple-500/10 hover:bg-purple-500/20 text-white rounded-xl font-medium border border-purple-500/30 transition-all shadow-lg hover:shadow-xl touch-target text-sm md:text-base"
                        >
                            Start a New Journey
                            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                        </button>
                    </div>
                </div>


                {/* Active Journeys */}
                <div>
                    <h2 className="text-lg md:text-xl font-bold mb-3 md:mb-4 flex items-center gap-2">
                        <Flame className="w-5 h-5 md:w-6 md:h-6 text-orange-400" />
                        Your Quests
                    </h2>

                    {loadingJourneys ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : journeys.length === 0 ? (
                        <div className="text-center py-10 md:py-12 text-gray-500">
                            <Trophy className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-gray-600" />
                            <p className="text-base md:text-lg">No quests yet!</p>
                            <p className="text-sm">Create your first learning journey to get started.</p>

                            {/* Debug Info Panel - Remove after fixing */}
                            <div className="mt-8 p-4 bg-gray-900 border border-gray-700 rounded-lg text-left text-xs font-mono text-gray-400 max-w-md mx-auto">
                                <p className="font-bold text-gray-300 mb-2">Debug Info:</p>
                                <p>Backend URL: <span className="text-yellow-400">{debugInfo.url}</span></p>
                                <p>Auth Token: <span className={debugInfo.tokenStatus === 'Valid' ? 'text-green-400' : 'text-red-400'}>{debugInfo.tokenStatus}</span></p>
                                <p>Env Var: {process.env.NEXT_PUBLIC_BACKEND_URL ? 'Set' : 'Missing'}</p>
                                {debugInfo.error && (
                                    <p className="mt-2 text-red-400 font-bold border-t border-gray-700 pt-2">
                                        ERROR: {debugInfo.error}
                                    </p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                            {journeys.map((journey) => (
                                <div
                                    key={journey.id}
                                    onClick={() => {
                                        // Store journey data in sessionStorage before navigating
                                        sessionStorage.setItem(`journey-${journey.id}`, JSON.stringify({
                                            journey_id: journey.id,
                                            topic: journey.topic,
                                            mode: journey.mode,
                                            nodes: journey.nodes || [],
                                            completedNodes: journey.completedNodes || [],
                                            nodeProgress: journey.nodeProgress || {}
                                        }));
                                        router.push(`/journey/${journey.id}`);
                                    }}
                                    className="p-4 md:p-6 bg-purple-500/5 border border-purple-500/20 rounded-2xl hover:border-purple-500/40 hover:bg-purple-500/10 transition-all duration-300 cursor-pointer group"
                                >
                                    <div className="flex items-start justify-between mb-3 md:mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400 group-hover:bg-purple-500/30 transition-colors">
                                                <BookOpen className="w-5 h-5 md:w-6 md:h-6" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-base md:text-lg line-clamp-1">{journey.topic}</h3>
                                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                                    <span className="capitalize">{journey.mode}</span>
                                                    <span>•</span>
                                                    <span>{journey.nodes?.length || 0} modules</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="mb-3">
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="text-gray-400">Progress</span>
                                            <span className="text-purple-400 font-medium">{getProgressPercentage(journey)}%</span>
                                        </div>
                                        <div className="h-2 bg-purple-900/50 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                                                style={{ width: `${getProgressPercentage(journey)}%` }}
                                            ></div>
                                        </div>
                                    </div>

                                    <button className="w-full py-2.5 bg-purple-500/20 hover:bg-purple-500/30 rounded-xl text-purple-300 font-medium flex items-center justify-center gap-2 transition-colors">
                                        Continue Quest <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center">
                    <div className="bg-[#0f0020] border-t md:border border-purple-500/30 rounded-t-2xl md:rounded-2xl p-5 md:p-8 max-w-2xl w-full max-h-[90vh] md:max-h-none overflow-y-auto safe-area-inset">

                        {/* Diagnostic Q&A Mode */}
                        {diagnosticState.active ? (
                            <>
                                <div className="flex items-center justify-between mb-4 md:mb-6">
                                    <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 md:gap-3">
                                        <Target className="w-6 h-6 md:w-7 md:h-7 text-purple-400" />
                                        Skill Assessment
                                    </h2>
                                    <span className="px-3 py-1 bg-purple-500/20 rounded-full text-purple-300 text-sm">
                                        Q{diagnosticState.questionNumber}
                                    </span>
                                </div>

                                <div className="mb-2 text-sm text-gray-400">
                                    Topic: <span className="text-purple-400">{diagnosticState.topic}</span>
                                </div>

                                {/* Question */}
                                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl mb-4">
                                    <p className="text-white whitespace-pre-wrap">{diagnosticState.question}</p>
                                </div>

                                {/* Answer Input */}
                                <textarea
                                    value={diagnosticAnswer}
                                    onChange={(e) => setDiagnosticAnswer(e.target.value)}
                                    placeholder="Type your answer here..."
                                    className="w-full h-20 md:h-24 p-3 md:p-4 bg-purple-500/5 border border-purple-500/30 rounded-xl resize-none focus:outline-none focus:border-purple-500 text-white placeholder-gray-500 mobile-input"
                                    disabled={creating}
                                />

                                {/* Actions */}
                                <div className="flex flex-col-reverse md:flex-row gap-3 mt-4">
                                    <button
                                        onClick={handleSkipDiagnostic}
                                        disabled={creating}
                                        className="flex-1 py-3.5 md:py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 font-medium transition-colors disabled:opacity-50 touch-target"
                                    >
                                        Skip Assessment
                                    </button>
                                    <button
                                        onClick={handleDiagnosticAnswer}
                                        disabled={creating || !diagnosticAnswer.trim()}
                                        className="flex-1 py-3.5 md:py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 rounded-xl text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-target"
                                    >
                                        {creating ? (
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                Submit Answer
                                                <ChevronRight className="w-5 h-5" />
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Creating Status */}
                                {creating && creatingMessage && (
                                    <div className="mt-4 text-center text-purple-300 text-sm animate-pulse">
                                        {creatingMessage}
                                    </div>
                                )}
                            </>
                        ) : (
                            /* Initial Input Mode */
                            <>
                                <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
                                    <Target className="w-6 h-6 md:w-7 md:h-7 text-purple-400" />
                                    Start New Quest
                                </h2>

                                {/* Mode Tabs */}
                                <div className="flex gap-2 mb-4 md:mb-6">
                                    <button
                                        onClick={() => setCreateMode('topic')}
                                        disabled={creating}
                                        className={`flex-1 py-3 md:py-3 rounded-xl font-medium transition-all touch-target ${createMode === 'topic'
                                            ? 'bg-purple-500 text-white'
                                            : 'bg-purple-500/10 text-purple-300 hover:bg-purple-500/20'
                                            }`}
                                    >
                                        <Target className="w-5 h-5 inline mr-2" />
                                        Topic
                                    </button>
                                    <button
                                        onClick={() => setCreateMode('syllabus')}
                                        disabled={creating}
                                        className={`flex-1 py-3 md:py-3 rounded-xl font-medium transition-all touch-target ${createMode === 'syllabus'
                                            ? 'bg-purple-500 text-white'
                                            : 'bg-purple-500/10 text-purple-300 hover:bg-purple-500/20'
                                            }`}
                                    >
                                        <FileText className="w-5 h-5 inline mr-2" />
                                        Syllabus
                                    </button>
                                </div>

                                {/* Mode description */}
                                <p className="text-gray-400 text-sm mb-4">
                                    {createMode === 'topic'
                                        ? '📝 We\'ll ask a few questions to assess your level and personalize your journey.'
                                        : '📄 Paste your syllabus and we\'ll create a structured learning path.'}
                                </p>

                                {/* Input */}
                                <textarea
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder={createMode === 'topic' ? 'What do you want to learn? (e.g., React Hooks, Machine Learning)' : 'Paste your syllabus here...'}
                                    className="w-full h-28 md:h-32 p-3 md:p-4 bg-purple-500/5 border border-purple-500/30 rounded-xl resize-none focus:outline-none focus:border-purple-500 text-white placeholder-gray-500 mobile-input"
                                    disabled={creating}
                                />

                                {/* Actions */}
                                <div className="flex flex-col-reverse md:flex-row gap-3 mt-4 md:mt-6">
                                    <button
                                        onClick={() => { setShowCreateModal(false); setInputValue(''); }}
                                        disabled={creating}
                                        className="flex-1 py-3.5 md:py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 font-medium transition-colors disabled:opacity-50 touch-target"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreateJourney}
                                        disabled={creating || !inputValue.trim()}
                                        className="flex-1 py-3.5 md:py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 rounded-xl text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-target"
                                    >
                                        {creating ? (
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                <Zap className="w-5 h-5" />
                                                {createMode === 'topic' ? 'Start Assessment' : 'Create Journey'}
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Creating Status */}
                                {creating && creatingMessage && (
                                    <div className="mt-4 text-center text-purple-300 text-sm animate-pulse">
                                        {creatingMessage}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* AI Tutor Chat */}
            <AITutorChat />

            {/* Flashcard Review */}
            {showFlashcardReview && (
                <FlashcardReview
                    cards={dueCards}
                    onClose={() => setShowFlashcardReview(false)}
                    onReview={handleReviewCard}
                    onComplete={handleFlashcardComplete}
                />
            )}
        </div>
    );
}
