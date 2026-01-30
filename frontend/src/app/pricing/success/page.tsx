'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Crown, CheckCircle, Loader2, XCircle } from 'lucide-react';
import '../pricing.css';

const BACKEND_URL = 'http://localhost:5000';

function SuccessContent() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('Activating your Pro subscription...');

    useEffect(() => {
        if (user) {
            activateSubscription();
        }
    }, [user]);

    const activateSubscription = async () => {
        if (!user) return;

        try {
            const token = await user.getIdToken();
            // Get subscription details from session storage
            const pendingData = sessionStorage.getItem('pending_subscription');
            if (!pendingData) {
                setStatus('error');
                setMessage('Subscription data not found. Please try again.');
                return;
            }

            const { subscription_id, plan_type } = JSON.parse(pendingData);

            // Activate the subscription
            const response = await fetch(`${BACKEND_URL}/api/subscription/activate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    subscription_id,
                    plan_type,
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setStatus('success');
                setMessage('Welcome to Pro! Redirecting to dashboard...');
                sessionStorage.removeItem('pending_subscription');

                // Redirect to dashboard after 2 seconds
                setTimeout(() => {
                    router.push('/dashboard');
                }, 2000);
            } else {
                setStatus('error');
                setMessage(data.error || 'Failed to activate subscription');
            }
        } catch (err) {
            console.error('Activation error:', err);
            setStatus('error');
            setMessage('Failed to activate subscription. Please contact support.');
        }
    };

    return (
        <div className="pricing-page">
            <div className="pricing-container" style={{ marginTop: '6rem' }}>
                <div className="pricing-card" style={{ textAlign: 'center', padding: '3rem' }}>
                    {status === 'loading' && (
                        <>
                            <Loader2 size={64} className="spinner" style={{ color: '#a5b4fc', marginBottom: '1.5rem' }} />
                            <h2 style={{ color: '#fff', marginBottom: '1rem' }}>Processing...</h2>
                            <p style={{ color: 'rgba(255,255,255,0.7)' }}>{message}</p>
                        </>
                    )}

                    {status === 'success' && (
                        <>
                            <div style={{
                                width: '100px',
                                height: '100px',
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 1.5rem',
                                boxShadow: '0 10px 40px rgba(16, 185, 129, 0.4)',
                            }}>
                                <CheckCircle size={48} color="#fff" />
                            </div>
                            <h2 style={{ color: '#fff', marginBottom: '0.5rem' }}>🎉 You're Pro Now!</h2>
                            <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem' }}>{message}</p>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#ffd700' }}>
                                <Crown size={24} />
                                <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>Unlimited Access Unlocked</span>
                            </div>
                        </>
                    )}

                    {status === 'error' && (
                        <>
                            <div style={{
                                width: '100px',
                                height: '100px',
                                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 1.5rem',
                            }}>
                                <XCircle size={48} color="#fff" />
                            </div>
                            <h2 style={{ color: '#fff', marginBottom: '1rem' }}>Something went wrong</h2>
                            <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem' }}>{message}</p>
                            <button
                                onClick={() => router.push('/pricing')}
                                style={{
                                    padding: '1rem 2rem',
                                    background: 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '12px',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                }}
                            >
                                Try Again
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function SubscriptionSuccessPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#0a0015] flex items-center justify-center"><Loader2 className="animate-spin text-white" size={48} /></div>}>
            <SuccessContent />
        </Suspense>
    );
}
