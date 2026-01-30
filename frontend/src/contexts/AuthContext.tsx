'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, onAuthStateChanged, signInWithGoogle, signInWithEmail, signUpWithEmail, logOut, User } from '@/lib/firebase';

interface Badge {
    id: string;
    name: string;
    icon: string;
    xp_required: number;
    description: string;
}

interface UserData {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    xp: number;
    badges: Badge[];
}

interface XPResult {
    xp: number;
    xp_gained: number;
    badges: Badge[];
    newly_unlocked: Badge[];
    next_badge: Badge | null;
}

interface AuthContextType {
    user: User | null;
    userData: UserData | null;
    loading: boolean;
    signInWithGoogle: () => Promise<{ user: User | null; error: string | null }>;
    signInWithEmail: (email: string, password: string) => Promise<{ user: User | null; error: string | null }>;
    signUpWithEmail: (email: string, password: string) => Promise<{ user: User | null; error: string | null }>;
    logOut: () => Promise<{ error: string | null }>;
    refreshUserData: () => Promise<void>;
    awardXP: (amount: number) => Promise<XPResult | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch user data from backend
    const fetchUserData = async (firebaseUser: User) => {
        try {
            const token = await firebaseUser.getIdToken();
            const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setUserData({
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    displayName: firebaseUser.displayName || data.displayName,
                    photoURL: firebaseUser.photoURL || data.photoURL,
                    xp: data.xp || 0,
                    badges: data.badges || []
                });
            } else {
                // User doesn't exist in backend yet, create them
                const createResponse = await fetch(`${BACKEND_URL}/api/user/create`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        displayName: firebaseUser.displayName,
                        email: firebaseUser.email,
                        photoURL: firebaseUser.photoURL
                    })
                });

                if (createResponse.ok) {
                    const data = await createResponse.json();
                    setUserData({
                        uid: firebaseUser.uid,
                        email: firebaseUser.email,
                        displayName: firebaseUser.displayName,
                        photoURL: firebaseUser.photoURL,
                        xp: data.xp || 0,
                        badges: data.badges || []
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            // Set basic data from Firebase even if backend fails
            setUserData({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                photoURL: firebaseUser.photoURL,
                xp: 0,
                badges: []
            });
        }
    };

    const refreshUserData = async () => {
        if (user) {
            await fetchUserData(user);
        }
    };

    // Award XP to the current user
    const awardXP = async (amount: number): Promise<XPResult | null> => {
        if (!user) return null;

        try {
            const token = await user.getIdToken();
            const response = await fetch(`${BACKEND_URL}/api/user/xp`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ xp: amount })
            });

            if (response.ok) {
                const result: XPResult = await response.json();

                // Update local user data
                setUserData(prev => prev ? {
                    ...prev,
                    xp: result.xp,
                    badges: result.badges
                } : null);

                return result;
            }
            return null;
        } catch (error) {
            console.error('Error awarding XP:', error);
            return null;
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                await fetchUserData(firebaseUser);
            } else {
                setUserData(null);
            }

            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const value: AuthContextType = {
        user,
        userData,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        logOut,
        refreshUserData,
        awardXP
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
