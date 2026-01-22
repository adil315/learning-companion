'use client';

import { useEffect, useState, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import JourneyMap, { LearningNodeType, ExpansionType } from '@/components/journey/JourneyMap';
import ExpansionModal from '@/components/journey/ExpansionModal';
import { Edge, Node } from '@xyflow/react';
import { ArrowLeft, Loader2, Sparkles, Trophy, Map, Zap } from 'lucide-react';
import AITutorChat from '@/components/AITutorChat';

interface JourneyPageProps {
    params: Promise<{
        journeyId: string;
    }>;
}

interface JourneyNode {
    id: string;
    title: string;
    status?: string;
    prerequisites?: string[];
    parent_id?: string;
    expansion_type?: 'deeper' | 'broader';
    steps?: Array<{
        id: string;
        title: string;
        description?: string;
        type?: string;
        status?: string;
    }>;
}

interface JourneyData {
    journey_id: string;
    topic?: string;
    mode?: string;
    user_level?: string;
    nodes: JourneyNode[];
}

export default function JourneyPage({ params }: JourneyPageProps) {
    const { journeyId } = use(params);
    const router = useRouter();
    const [journeyData, setJourneyData] = useState<JourneyData | null>(null);
    const [nodes, setNodes] = useState<LearningNodeType[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Expansion modal state
    const [showExpansionModal, setShowExpansionModal] = useState(false);
    const [expansionNodeId, setExpansionNodeId] = useState<string>('');
    const [expansionNodeTitle, setExpansionNodeTitle] = useState<string>('');
    const [expansionType, setExpansionType] = useState<ExpansionType>('deeper');
    const [isExpanding, setIsExpanding] = useState(false);

    // Helper to transform backend nodes to ReactFlow format
    const transformNodesToReactFlow = useCallback((data: JourneyData) => {
        const rfNodes: LearningNodeType[] = data.nodes.map((node, index) => ({
            id: node.id,
            position: { x: 250, y: index * 150 },
            data: {
                title: node.title,
                status: node.status === 'completed' ? 'completed' :
                    node.status === 'active' ? 'active' :
                        index === 0 ? 'active' : 'locked',
                description: node.steps?.[0]?.description || `Module ${index + 1}`,
                expansion_type: node.expansion_type
            },
            type: 'learningNode'
        }));

        const rfEdges: Edge[] = [];
        data.nodes.forEach((node, index) => {
            if (node.prerequisites && node.prerequisites.length > 0) {
                node.prerequisites.forEach((prereqId: string) => {
                    rfEdges.push({
                        id: `${prereqId}-${node.id}`,
                        source: prereqId,
                        target: node.id,
                        type: 'smoothstep',
                    });
                });
            } else if (index > 0 && !node.parent_id) {
                // Only create automatic edges for nodes without explicit parent
                rfEdges.push({
                    id: `${data.nodes[index - 1].id}-${node.id}`,
                    source: data.nodes[index - 1].id,
                    target: node.id,
                    type: 'smoothstep',
                });
            }
        });

        return { rfNodes, rfEdges };
    }, []);

    useEffect(() => {
        const loadJourney = () => {
            try {
                const storedData = sessionStorage.getItem(`journey-${journeyId}`);

                if (storedData) {
                    const data: JourneyData = JSON.parse(storedData);
                    setJourneyData(data);

                    const { rfNodes, rfEdges } = transformNodesToReactFlow(data);
                    setNodes(rfNodes);
                    setEdges(rfEdges);
                } else {
                    setError('Journey data not found. Please create a new journey.');
                }
            } catch (err) {
                console.error('Error loading journey:', err);
                setError('Failed to load journey map');
            } finally {
                setLoading(false);
            }
        };

        if (journeyId) {
            loadJourney();
        }
    }, [journeyId, transformNodesToReactFlow]);

    const handleNodeClick = (event: React.MouseEvent, node: Node) => {
        const nodeData = node.data as { status?: string };
        // Only allow clicking active or completed nodes
        if (nodeData.status === 'active' || nodeData.status === 'completed') {
            router.push(`/module/${node.id}?journeyId=${journeyId}`);
        }
    };

    // Handle expansion button click from JourneyMap
    const handleExpand = useCallback((nodeId: string, nodeTitle: string, type: ExpansionType) => {
        setExpansionNodeId(nodeId);
        setExpansionNodeTitle(nodeTitle);
        setExpansionType(type);
        setShowExpansionModal(true);
    }, []);

    // Handle expansion submission
    const handleExpansionSubmit = async (topic: string) => {
        setIsExpanding(true);

        try {
            // Get auth token from localStorage (Firebase)
            const authData = localStorage.getItem('firebase:authUser');
            let token = '';

            if (authData) {
                try {
                    // Try to find the token in various possible storage formats
                    const parsed = JSON.parse(authData);
                    token = parsed?.stsTokenManager?.accessToken || '';
                } catch {
                    // If parsing fails, try other auth storage methods
                }
            }

            // Also check for direct token storage (some Firebase setups)
            if (!token) {
                // Try to get token from Firebase auth state
                const { getAuth } = await import('firebase/auth');
                const auth = getAuth();
                if (auth.currentUser) {
                    token = await auth.currentUser.getIdToken();
                }
            }

            const response = await fetch('http://localhost:5000/api/journey/expand', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    journey_id: journeyId,
                    parent_node_id: expansionNodeId,
                    expansion_type: expansionType,
                    topic: topic
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to expand journey');
            }

            // Add the new node and edge to our state
            const newNode: LearningNodeType = {
                id: data.node.id,
                position: { x: 0, y: 0 }, // Will be repositioned by layout
                data: {
                    title: data.node.title,
                    status: 'active',
                    description: data.node.steps?.[0]?.description || 'New module',
                    expansion_type: data.node.expansion_type
                },
                type: 'learningNode'
            };

            const newEdge: Edge = {
                id: data.edge.id,
                source: data.edge.source,
                target: data.edge.target,
                type: 'smoothstep'
            };

            // Update journey data
            const updatedJourneyData: JourneyData = {
                ...journeyData!,
                nodes: [...journeyData!.nodes, data.node]
            };
            setJourneyData(updatedJourneyData);

            // Update React Flow state
            setNodes(prev => [...prev, newNode]);
            setEdges(prev => [...prev, newEdge]);

            // Persist to sessionStorage
            sessionStorage.setItem(`journey-${journeyId}`, JSON.stringify(updatedJourneyData));

            // Close modal
            setShowExpansionModal(false);

        } catch (err) {
            console.error('Expansion error:', err);
            alert(`Failed to create new topic: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsExpanding(false);
        }
    };

    // Calculate progress
    const getProgress = () => {
        if (!nodes.length) return { completed: 0, total: 0, percentage: 0 };
        const completed = nodes.filter(n => n.data.status === 'completed').length;
        return {
            completed,
            total: nodes.length,
            percentage: Math.round((completed / nodes.length) * 100)
        };
    };

    const progress = getProgress();

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0015] flex items-center justify-center">
                <div className="text-center">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                        <Sparkles className="w-6 h-6 text-purple-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <p className="mt-4 text-purple-300 animate-pulse">Loading your quest...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#0a0015] flex flex-col items-center justify-center">
                <div className="text-center p-8 bg-red-500/10 border border-red-500/30 rounded-2xl max-w-md">
                    <h2 className="text-xl text-red-400 mb-4">{error}</h2>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="text-purple-400 hover:text-purple-300 flex items-center gap-2 mx-auto"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-h-screen bg-[#0a0015] flex flex-col relative overflow-hidden">
            {/* Background Effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[150px]"></div>
                <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-pink-600/10 rounded-full blur-[120px]"></div>
                <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] bg-yellow-600/5 rounded-full blur-[100px]"></div>
            </div>

            {/* Header */}
            <header className="relative z-20 border-b border-purple-500/20 bg-black/40 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
                    <div className="flex items-center justify-between gap-3">
                        {/* Back Button */}
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="flex items-center gap-1.5 md:gap-2 text-gray-400 hover:text-white transition-colors group shrink-0 touch-target"
                        >
                            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 group-hover:-translate-x-1 transition-transform" />
                            <span className="hidden md:inline">Dashboard</span>
                        </button>

                        {/* Journey Title */}
                        <div className="text-center flex-1 px-2 md:px-4 min-w-0">
                            <div className="flex items-center justify-center gap-1.5 md:gap-2 mb-0.5 md:mb-1">
                                <Map className="w-4 h-4 md:w-5 md:h-5 text-purple-400 shrink-0" />
                                <h1 className="text-base md:text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent truncate">
                                    {journeyData?.topic || 'Learning Quest'}
                                </h1>
                            </div>
                            {journeyData?.user_level && (
                                <div className="flex items-center justify-center gap-1.5 md:gap-2">
                                    <Zap className="w-3 h-3 text-yellow-400" />
                                    <span className="text-xs text-gray-500">Level: {journeyData.user_level}</span>
                                </div>
                            )}
                        </div>

                        {/* Progress */}
                        <div className="flex items-center gap-2 md:gap-3 min-w-0 justify-end shrink-0">
                            <div className="text-right hidden sm:block">
                                <div className="flex items-center gap-1 text-yellow-400">
                                    <Trophy className="w-4 h-4" />
                                    <span className="font-bold text-sm md:text-base">{progress.completed}/{progress.total}</span>
                                </div>
                                <div className="text-xs text-gray-500">modules</div>
                            </div>
                            <div className="w-10 h-10 md:w-12 md:h-12 relative">
                                <svg className="w-full h-full -rotate-90">
                                    <circle
                                        cx="50%"
                                        cy="50%"
                                        r="40%"
                                        fill="none"
                                        stroke="rgba(168,85,247,0.2)"
                                        strokeWidth="3"
                                    />
                                    <circle
                                        cx="50%"
                                        cy="50%"
                                        r="40%"
                                        fill="none"
                                        stroke="url(#progressGradient)"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                        strokeDasharray={`${progress.percentage * 1.256} 125.6`}
                                    />
                                    <defs>
                                        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#A855F7" />
                                            <stop offset="100%" stopColor="#EC4899" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] md:text-xs font-bold text-white">
                                    {progress.percentage}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Journey Map */}
            <div className="flex-1 relative z-10">
                {nodes.length > 0 ? (
                    <JourneyMap
                        initialNodes={nodes}
                        initialEdges={edges}
                        onNodeClick={handleNodeClick}
                        onExpand={handleExpand}
                        className="bg-transparent"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                            <Map className="w-16 h-16 mx-auto mb-4 text-gray-700" />
                            <p>No modules found in this quest</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Expansion Modal */}
            <ExpansionModal
                isOpen={showExpansionModal}
                onClose={() => setShowExpansionModal(false)}
                onSubmit={handleExpansionSubmit}
                expansionType={expansionType}
                parentNodeTitle={expansionNodeTitle}
                isLoading={isExpanding}
            />

            {/* AI Tutor Chat */}
            <AITutorChat />
        </div>
    );
}
