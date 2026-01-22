import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { mode, text } = body;

        let journeyData;

        if (mode === 'syllabus') {
            // Syllabus Mode: Direct to syllabus endpoint with async
            const response = await fetch(`${BACKEND_URL}/api/journey/syllabus`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, async: true }),
            });

            if (!response.ok) {
                throw new Error('Backend request failed');
            }

            const data = await response.json();

            // If async, poll for result
            if (data.job_id) {
                journeyData = await pollForResult(data.job_id);
            } else {
                journeyData = data;
            }
        } else {
            // Topic Mode: Start diagnostic chat
            const response = await fetch(`${BACKEND_URL}/api/journey/topic/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: text }),
            });

            if (!response.ok) {
                throw new Error('Backend request failed');
            }

            const data = await response.json();

            // For now, return a temporary journey ID 
            // Full diagnostic flow would need multi-turn chat
            if (data.status === 'chatting') {
                // Return session info for diagnostic flow
                return NextResponse.json({
                    journeyId: `diagnostic-${data.sessionId}`,
                    status: 'diagnostic',
                    message: data.message,
                    sessionId: data.sessionId,
                });
            } else if (data.status === 'processing' && data.job_id) {
                journeyData = await pollForResult(data.job_id);
            } else if (data.status === 'complete') {
                journeyData = data.journey;
            } else {
                throw new Error('Unexpected response from topic mode');
            }
        }

        return NextResponse.json({
            journeyId: journeyData?.journey_id || `journey-${Date.now()}`,
            ...journeyData,
        });
    } catch (error) {
        console.error('Journey start error:', error);
        return NextResponse.json(
            { error: 'Failed to start journey' },
            { status: 500 }
        );
    }
}

async function pollForResult(jobId: string, maxAttempts = 30, intervalMs = 2000): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
        const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:5000'}/api/job/${jobId}`);

        if (!response.ok) {
            throw new Error('Failed to poll job status');
        }

        const data = await response.json();

        if (data.status === 'completed') {
            return data.result;
        } else if (data.status === 'failed') {
            throw new Error(data.error || 'Job failed');
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Job timed out');
}
