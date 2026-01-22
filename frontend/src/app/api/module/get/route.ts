import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { node_id } = body;

        if (!node_id) {
            return NextResponse.json(
                { status: 'error', message: 'No node_id provided' },
                { status: 400 }
            );
        }

        // Try to get module info from sessionStorage data passed via headers or generate new
        // For now, we'll generate lesson content based on the node_id

        // Extract a title from node_id (e.g., "node-1" -> "Module 1")
        // In a real app, you'd look this up from stored journey data
        const nodeNumber = node_id.replace('node-', '');
        const titles: { [key: string]: string } = {
            '1': 'Arrays and Basic Data Structures',
            '2': 'Linked Lists',
            '3': 'Trees and Graphs',
            '4': 'Sorting Algorithms',
        };

        const title = titles[nodeNumber] || `Module ${nodeNumber}`;

        // Call the Flask backend to generate lesson content
        const response = await fetch(`${BACKEND_URL}/api/lesson/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title,
                user_level: 'Beginner',
                context: 'Data Structures and Algorithms course'
            }),
        });

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        const lessonData = await response.json();

        return NextResponse.json({
            status: 'success',
            data: {
                id: node_id,
                title: lessonData.title || title,
                content: lessonData.content || 'No content available',
                type: 'theory', // or 'code' or 'quiz' based on step type
                level: lessonData.level || 'Beginner'
            }
        });

    } catch (error) {
        console.error('Module get error:', error);
        return NextResponse.json(
            {
                status: 'error',
                message: 'Failed to fetch module content',
                data: {
                    id: 'error',
                    title: 'Error Loading Module',
                    content: 'Failed to load lesson content. Please try again.',
                    type: 'theory'
                }
            },
            { status: 500 }
        );
    }
}
