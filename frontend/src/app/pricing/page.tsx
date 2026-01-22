'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Crown, Check, Zap, ArrowLeft, Loader2, Sparkles } from 'lucide-react';

const BACKEND_URL = 'http://localhost:5000';

interface PricingPlan {
    price: number;
    original_price: number;
    currency: string;
    name: string;
    description: string;
    savings: number;
    monthly_equivalent?: number;
}

interface PricingData {
    monthly: PricingPlan;
    yearly: PricingPlan;
}

const features = [
    'Unlimited AI learning sessions',
    'Unlimited lesson generations',
    'Unlimited quiz attempts',
    'Unlimited AI tutor chats',
    'Unlimited flashcard creation',
    'Priority support',
    'No daily limits',
];

export default function PricingPage() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [pricing, setPricing] = useState<PricingData | null>(null);
    const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [limitExceeded, setLimitExceeded] = useState(false);

    useEffect(() => {
        // Check if redirected due to limit exceeded
        if (searchParams.get('reason') === 'limit_exceeded') {
            setLimitExceeded(true);
        }

        // Fetch pricing
        fetchPricing();
    }, [searchParams]);

    const fetchPricing = async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/subscription/pricing`);
            if (response.ok) {
                const data = await response.json();
                setPricing(data);
            }
        } catch (err) {
            console.error('Failed to fetch pricing:', err);
        }
    };

    const handleSubscribe = async () => {
        if (!user) {
            router.push('/');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const token = await user.getIdToken();
            const response = await fetch(`${BACKEND_URL}/api/subscription/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ plan_type: selectedPlan }),
            });

            const data = await response.json();

            if (response.ok && data.approval_url) {
                // Store subscription ID for activation after return
                sessionStorage.setItem('pending_subscription', JSON.stringify({
                    subscription_id: data.subscription_id,
                    plan_type: selectedPlan,
                }));

                // Redirect to PayPal
                window.location.href = data.approval_url;
            } else {
                setError(data.error || 'Failed to create subscription');
            }
        } catch (err) {
            console.error('Subscription error:', err);
            setError('Failed to connect to payment service');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0015] text-white p-4 md:p-8">
            {/* Background effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-pink-600/15 rounded-full blur-[80px]"></div>
            </div>

            <div className="relative z-10 max-w-4xl mx-auto">
                <button
                    onClick={() => router.push('/dashboard')}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8"
                >
                    <ArrowLeft size={20} />
                    Back to Dashboard
                </button>

                {limitExceeded && (
                    <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-4">
                        <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Zap className="w-6 h-6 text-amber-500" />
                        </div>
                        <div>
                            <h3 className="font-bold text-amber-500">You've reached your daily limit</h3>
                            <p className="text-amber-200/80 text-sm">Upgrade to Pro for unlimited access to all features!</p>
                        </div>
                    </div>
                )}

                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/20">
                        <Crown size={32} className="text-white" />
                    </div>
                    <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-4">
                        Upgrade to Pro
                    </h1>
                    <p className="text-gray-400 text-lg">Unlock unlimited learning potential with our premium features</p>
                </div>

                <div className="flex justify-center mb-10">
                    <div className="bg-white/5 p-1 rounded-full border border-white/10 flex relative">
                        <button
                            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${selectedPlan === 'monthly'
                                    ? 'bg-purple-600 text-white shadow-lg'
                                    : 'text-gray-400 hover:text-white'
                                }`}
                            onClick={() => setSelectedPlan('monthly')}
                        >
                            Monthly
                        </button>
                        <button
                            className={`px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${selectedPlan === 'yearly'
                                    ? 'bg-purple-600 text-white shadow-lg'
                                    : 'text-gray-400 hover:text-white'
                                }`}
                            onClick={() => setSelectedPlan('yearly')}
                        >
                            Yearly
                            <span className="text-[10px] font-bold bg-green-500 text-white px-1.5 py-0.5 rounded-full">
                                SAVE 20%
                            </span>
                        </button>
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm relative">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500"></div>

                    <div className="p-8 md:p-10">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-white/5 pb-8">
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-2">Pro Subscription</h2>
                                <p className="text-gray-400">Everything you need to master any subject</p>
                            </div>
                            <div className="text-right">
                                {pricing ? (
                                    <>
                                        <div className="flex items-end justify-end gap-2">
                                            <span className="text-gray-500 line-through text-lg">
                                                ${pricing[selectedPlan].original_price}
                                            </span>
                                            <span className="text-4xl font-bold text-white">
                                                ${pricing[selectedPlan].price}
                                            </span>
                                        </div>
                                        <div className="text-gray-400 text-sm">
                                            per {selectedPlan === 'monthly' ? 'month' : 'year'}
                                        </div>
                                        {selectedPlan === 'yearly' && (
                                            <div className="text-green-400 text-sm font-medium mt-1">
                                                Just ${pricing.yearly.monthly_equivalent}/mo equivalent
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="h-16 w-32 bg-white/5 rounded animate-pulse"></div>
                                )}
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4 mb-8">
                            {features.map((feature, index) => (
                                <div key={index} className="flex items-center gap-3 text-gray-300">
                                    <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Check className="w-3 h-3 text-green-400" />
                                    </div>
                                    <span>{feature}</span>
                                </div>
                            ))}
                        </div>

                        {error && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200 text-sm text-center">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleSubscribe}
                            disabled={loading}
                            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-900/40 hover:shadow-purple-900/60 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5" />
                                    Subscribe with PayPal
                                </>
                            )}
                        </button>
                        <p className="text-center text-gray-500 text-sm mt-4">
                            Cancel anytime. Subscription renews automatically.
                        </p>
                    </div>
                </div>

                <div className="mt-12 text-center">
                    <h3 className="text-lg font-medium text-white mb-2">Free Tier</h3>
                    <p className="text-gray-400">10 AI generations per day • Resets at midnight UTC</p>
                </div>
            </div>
        </div>
    );
}
