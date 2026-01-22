'use client';

import React, { useEffect, useMemo, useCallback } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    Node,
    Edge,
    Position,
    Handle,
    NodeProps,
    ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import clsx from 'clsx';
import { CheckCircle2, Lock, Sparkles, ArrowDown, ArrowRight, Plus } from 'lucide-react';

// --- Types ---
export type NodeStatus = 'locked' | 'active' | 'completed';
export type ExpansionType = 'deeper' | 'broader';

export interface LearningNodeData extends Record<string, unknown> {
    title: string;
    status: NodeStatus;
    description?: string;
    nodeId?: string;
    onExpand?: (nodeId: string, nodeTitle: string, type: ExpansionType) => void;
}

export type LearningNodeType = Node<LearningNodeData>;

interface JourneyMapProps {
    initialNodes: LearningNodeType[];
    initialEdges: Edge[];
    onNodeClick?: (event: React.MouseEvent, node: Node) => void;
    onExpand?: (nodeId: string, nodeTitle: string, type: ExpansionType) => void;
    className?: string;
}

// --- Custom Fog of War Node Component with Expansion Buttons ---
function LearningNode({ data, id }: { data: LearningNodeData; id: string }) {
    const title = data?.title || 'Untitled';
    const status = data?.status || 'locked';
    const description = data?.description || '';
    const onExpand = data?.onExpand;

    // Status-based styling with fog of war theme
    const getNodeStyles = () => {
        switch (status) {
            case 'completed':
                return {
                    container: 'bg-gradient-to-br from-yellow-900/40 to-amber-800/30 border-yellow-500/80 shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:shadow-[0_0_40px_rgba(234,179,8,0.6)]',
                    text: 'text-yellow-200',
                    subtext: 'text-yellow-300/70',
                    iconBg: 'bg-yellow-500/20',
                    icon: <CheckCircle2 className="w-5 h-5 text-yellow-400" />,
                    handle: '!bg-yellow-500 !border-yellow-400'
                };
            case 'active':
                return {
                    container: 'bg-gradient-to-br from-purple-900/50 to-pink-900/40 border-purple-400 shadow-[0_0_40px_rgba(168,85,247,0.5)] hover:shadow-[0_0_50px_rgba(168,85,247,0.7)] cursor-pointer ring-2 ring-purple-400/50',
                    text: 'text-white',
                    subtext: 'text-purple-200/80',
                    iconBg: 'bg-purple-500/20',
                    icon: <Sparkles className="w-5 h-5 text-purple-300" />,
                    handle: '!bg-purple-500 !border-purple-400'
                };
            case 'locked':
            default:
                return {
                    container: 'bg-gray-900/40 border-gray-700/50 opacity-60 cursor-not-allowed',
                    text: 'text-gray-500',
                    subtext: 'text-gray-600/50',
                    iconBg: 'bg-gray-800/50',
                    icon: <Lock className="w-4 h-4 text-gray-600" />,
                    handle: '!bg-gray-700 !border-gray-600'
                };
        }
    };

    const styles = getNodeStyles();

    const handleExpandClick = (e: React.MouseEvent, type: ExpansionType) => {
        e.stopPropagation(); // Prevent node click event
        if (onExpand) {
            onExpand(id, title, type);
        }
    };

    return (
        <div className="relative group">
            {/* Fog overlay for locked nodes */}
            {status === 'locked' && (
                <div className="absolute -inset-4 rounded-3xl pointer-events-none"
                    style={{ background: 'radial-gradient(circle, transparent 30%, rgba(10,0,21,0.6) 100%)' }} />
            )}

            <div
                className={clsx(
                    'relative px-5 py-4 rounded-xl border-2 min-w-[200px] max-w-[280px] min-h-[120px] transition-all duration-500',
                    styles.container
                )}
            >
                <Handle
                    type="target"
                    position={Position.Top}
                    className={clsx("!w-3 !h-3 !border-2", styles.handle)}
                />

                <div className="flex items-start gap-3">
                    <div className={clsx(
                        "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                        styles.iconBg
                    )}>
                        {styles.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className={clsx("font-bold text-sm leading-tight", styles.text)}>
                            {title}
                        </div>
                        {description && (
                            <div className={clsx("text-xs mt-1 line-clamp-2", styles.subtext)}>
                                {description}
                            </div>
                        )}
                    </div>
                </div>

                {/* Active node call-to-action */}
                {status === 'active' && (
                    <div className="mt-3 text-center">
                        <span className="text-xs text-purple-300 font-medium bg-purple-500/20 px-3 py-1 rounded-full">
                            Click to Start →
                        </span>
                    </div>
                )}

                {/* Expansion buttons for completed nodes */}
                {status === 'completed' && onExpand && (
                    <div className="mt-3 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button
                            onClick={(e) => handleExpandClick(e, 'deeper')}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500/20 hover:bg-blue-500/40 border border-blue-500/50 rounded-lg text-blue-300 text-xs font-medium transition-all hover:scale-105"
                            title="Go deeper into this topic"
                        >
                            <ArrowDown className="w-3 h-3" />
                            <span>Deeper</span>
                        </button>
                        <button
                            onClick={(e) => handleExpandClick(e, 'broader')}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500/20 hover:bg-green-500/40 border border-green-500/50 rounded-lg text-green-300 text-xs font-medium transition-all hover:scale-105"
                            title="Explore related topics"
                        >
                            <ArrowRight className="w-3 h-3" />
                            <span>Related</span>
                        </button>
                    </div>
                )}

                <Handle
                    type="source"
                    position={Position.Bottom}
                    className={clsx("!w-3 !h-3 !border-2", styles.handle)}
                />

                {/* Side handles for broader connections (both directions) */}
                <Handle
                    type="source"
                    position={Position.Right}
                    id="right-source"
                    className={clsx("!w-3 !h-3 !border-2", styles.handle)}
                />
                <Handle
                    type="source"
                    position={Position.Left}
                    id="left-source"
                    className={clsx("!w-3 !h-3 !border-2", styles.handle)}
                />
                <Handle
                    type="target"
                    position={Position.Left}
                    id="left-target"
                    className={clsx("!w-3 !h-3 !border-2", styles.handle)}
                />
                <Handle
                    type="target"
                    position={Position.Right}
                    id="right-target"
                    className={clsx("!w-3 !h-3 !border-2", styles.handle)}
                />
            </div>
        </div>
    );
}

// --- Layout Helper with support for broader (horizontal) expansions ---
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const nodeWidth = 260;
    const nodeHeight = 120; // Must match the CSS min-h-[120px] on the node container

    dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 120 });

    // Build a map of node id to parent id for broader nodes
    const broaderNodeParents: Map<string, string> = new Map();
    edges.forEach((edge) => {
        const targetNode = nodes.find(n => n.id === edge.target);
        const targetData = targetNode?.data as LearningNodeData & { expansion_type?: string };
        if (targetData?.expansion_type === 'broader') {
            broaderNodeParents.set(edge.target, edge.source);
        }
    });

    // For Dagre layout, temporarily exclude edges to broader nodes
    // so they don't get placed in the next rank
    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        // Skip edges to broader nodes - we'll position them manually
        if (!broaderNodeParents.has(edge.target)) {
            dagreGraph.setEdge(edge.source, edge.target);
        }
    });

    dagre.layout(dagreGraph);

    // First pass: position all non-broader nodes
    const nodePositions: Map<string, { x: number; y: number }> = new Map();
    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        if (nodeWithPosition) {
            nodePositions.set(node.id, {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2
            });
        }
    });

    // Second pass: position broader nodes at the same Y level as their parent
    // Alternate between right and left sides for visual balance
    broaderNodeParents.forEach((parentId, nodeId) => {
        const parentPos = nodePositions.get(parentId);
        if (parentPos) {
            // Count how many broader nodes share the same parent to offset them horizontally
            const siblingsWithSameParent = Array.from(broaderNodeParents.entries())
                .filter(([_, pId]) => pId === parentId)
                .map(([nId, _]) => nId);
            const siblingIndex = siblingsWithSameParent.indexOf(nodeId);

            // Alternate sides: even indices go right, odd indices go left
            const isRightSide = siblingIndex % 2 === 0;
            // Calculate distance from parent (1st right, 1st left, 2nd right, 2nd left, etc.)
            const distanceMultiplier = Math.floor(siblingIndex / 2) + 1;
            const baseOffset = (nodeWidth + 80) * distanceMultiplier;
            const xOffset = isRightSide ? baseOffset : -baseOffset;

            nodePositions.set(nodeId, {
                x: parentPos.x + xOffset,
                y: parentPos.y  // Same Y level as parent
            });
        }
    });

    const newNodes = nodes.map((node) => {
        const position = nodePositions.get(node.id) || { x: 0, y: 0 };

        return {
            ...node,
            targetPosition: Position.Top,
            sourcePosition: Position.Bottom,
            position: position,
        };
    });

    return { nodes: newNodes, edges };
};

// --- Main Component Content ---
const JourneyMapContent = ({ initialNodes, initialEdges, onNodeClick, onExpand, className }: JourneyMapProps) => {

    // Inject onExpand callback into node data
    const nodesWithCallbacks = useMemo(() => {
        return initialNodes.map(node => ({
            ...node,
            data: {
                ...node.data,
                nodeId: node.id,
                onExpand: onExpand
            }
        }));
    }, [initialNodes, onExpand]);

    const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
        return getLayoutedElements(nodesWithCallbacks, initialEdges);
    }, [nodesWithCallbacks, initialEdges]);

    const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

    useEffect(() => {
        const nodesWithCb = initialNodes.map(node => ({
            ...node,
            data: {
                ...node.data,
                nodeId: node.id,
                onExpand: onExpand
            }
        }));
        const { nodes: lNodes, edges: lEdges } = getLayoutedElements(nodesWithCb, initialEdges);
        setNodes(lNodes);
        setEdges(lEdges);
    }, [initialNodes, initialEdges, onExpand, setNodes, setEdges]);

    const nodeTypes = useMemo(() => ({ learningNode: LearningNode }), []);

    // Custom edge styling based on source node status and expansion type
    const styledEdges = useMemo(() => {
        return edges.map((edge) => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            const targetNode = nodes.find(n => n.id === edge.target);
            const sourceStatus = (sourceNode?.data as LearningNodeData)?.status;
            const targetData = targetNode?.data as LearningNodeData & { expansion_type?: string };
            const isCompleted = sourceStatus === 'completed';
            const isActive = sourceStatus === 'active';
            const isBroader = targetData?.expansion_type === 'broader';

            // Determine if broader node is on the left or right of parent
            let sourceHandle: string | undefined = undefined;
            let targetHandle: string | undefined = undefined;

            if (isBroader && sourceNode && targetNode) {
                const sourceX = sourceNode.position?.x ?? 0;
                const targetX = targetNode.position?.x ?? 0;
                const isOnRight = targetX > sourceX;

                if (isOnRight) {
                    sourceHandle = 'right-source';
                    targetHandle = 'left-target';
                } else {
                    sourceHandle = 'left-source';
                    targetHandle = 'right-target';
                }
            }

            return {
                ...edge,
                type: 'smoothstep',
                animated: isActive || isCompleted,
                sourceHandle,
                targetHandle,
                style: {
                    stroke: isBroader
                        ? '#10B981' // Green for broader connections
                        : isCompleted ? '#EAB308' : isActive ? '#A855F7' : '#374151',
                    strokeWidth: isCompleted || isActive ? 3 : 2,
                    opacity: isCompleted ? 0.8 : isActive ? 0.9 : 0.3,
                },
            };
        });
    }, [edges, nodes]);

    return (
        <div className={clsx("w-full h-full min-h-[500px]", className)} style={{ height: 'calc(100vh - 80px)' }}>
            <ReactFlow
                nodes={nodes}
                edges={styledEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.4 }}
                minZoom={0.5}
                maxZoom={1.5}
                attributionPosition="bottom-right"
                proOptions={{ hideAttribution: true }}
            >
                <Controls
                    className="!bg-purple-900/50 !border-purple-500/30 !rounded-xl [&>button]:!bg-purple-800/50 [&>button]:!border-purple-500/30 [&>button]:!text-purple-200 [&>button:hover]:!bg-purple-700/50"
                />
                <MiniMap
                    className="!bg-purple-900/30 !border-purple-500/20 !rounded-lg"
                    nodeColor={(n) => {
                        const status = (n.data as LearningNodeData)?.status;
                        if (status === 'completed') return '#EAB308';
                        if (status === 'active') return '#A855F7';
                        return '#374151';
                    }}
                    maskColor="rgba(10, 0, 21, 0.8)"
                />
                <Background gap={30} size={1} color="rgba(168, 85, 247, 0.08)" />
            </ReactFlow>
        </div>
    );
};

// --- Exported Wrapper ---
export default function JourneyMap(props: JourneyMapProps) {
    return (
        <ReactFlowProvider>
            <JourneyMapContent {...props} />
        </ReactFlowProvider>
    );
}
