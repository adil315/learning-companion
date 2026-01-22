/**
 * Centralized API client for Learning Companion frontend.
 * 
 * Features:
 * - Request deduplication (prevents duplicate in-flight requests)
 * - Response caching with TTL
 * - Automatic retry with exponential backoff
 * - Request timeout handling
 */

const BACKEND_URL = 'http://localhost:5000';

// In-flight request tracking for deduplication
const inFlightRequests: Map<string, Promise<Response>> = new Map();

// Simple response cache with TTL
interface CacheEntry {
    data: any;
    timestamp: number;
    ttl: number;
}
const responseCache: Map<string, CacheEntry> = new Map();

// Default TTLs in milliseconds
const CACHE_TTL = {
    badges: 60 * 60 * 1000,      // 1 hour
    userProfile: 5 * 60 * 1000,  // 5 minutes
    journeys: 2 * 60 * 1000,     // 2 minutes
    lesson: 30 * 60 * 1000,      // 30 minutes
    default: 60 * 1000,          // 1 minute
};

/**
 * Get cache key for a request
 */
function getCacheKey(url: string, options?: RequestInit): string {
    const method = options?.method || 'GET';
    const body = options?.body ? JSON.stringify(options.body) : '';
    return `${method}:${url}:${body}`;
}

/**
 * Check if cached response is still valid
 */
function getCachedResponse(key: string): any | null {
    const entry = responseCache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
        responseCache.delete(key);
        return null;
    }

    return entry.data;
}

/**
 * Store response in cache
 */
function setCachedResponse(key: string, data: any, ttl: number): void {
    responseCache.set(key, {
        data,
        timestamp: Date.now(),
        ttl,
    });

    // Clean up old entries periodically (max 100 entries)
    if (responseCache.size > 100) {
        const now = Date.now();
        for (const [k, v] of responseCache.entries()) {
            if (now - v.timestamp > v.ttl) {
                responseCache.delete(k);
            }
        }
    }
}

/**
 * Fetch with retry, timeout, deduplication, and caching
 */
export async function apiFetch<T = any>(
    endpoint: string,
    options: RequestInit = {},
    config: {
        cacheTtl?: number;
        maxRetries?: number;
        timeout?: number;
        deduplicate?: boolean;
    } = {}
): Promise<T> {
    const {
        cacheTtl = 0,
        maxRetries = 3,
        timeout = 30000,
        deduplicate = true,
    } = config;

    const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint}`;
    const cacheKey = getCacheKey(url, options);

    // Check cache for GET requests
    if (options.method !== 'POST' && cacheTtl > 0) {
        const cached = getCachedResponse(cacheKey);
        if (cached) {
            console.log(`[API] Cache hit: ${endpoint}`);
            return cached;
        }
    }

    // Deduplicate in-flight requests
    if (deduplicate && inFlightRequests.has(cacheKey)) {
        console.log(`[API] Deduplicating request: ${endpoint}`);
        const existing = await inFlightRequests.get(cacheKey)!;
        return existing.clone().json();
    }

    // Create fetch promise with retry logic
    const fetchWithRetry = async (): Promise<Response> => {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers,
                    },
                });

                clearTimeout(timeoutId);

                if (response.ok || (response.status >= 400 && response.status < 500)) {
                    return response;
                }

                lastError = new Error(`Server error: ${response.status}`);
            } catch (err: any) {
                lastError = err;
                console.warn(`[API] Attempt ${attempt}/${maxRetries} failed:`, err.message);
            }

            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError || new Error('Fetch failed after retries');
    };

    // Track in-flight request
    const promise = fetchWithRetry();
    if (deduplicate) {
        inFlightRequests.set(cacheKey, promise);
    }

    try {
        const response = await promise;
        const data = await response.json();

        // Cache successful GET responses
        if (response.ok && options.method !== 'POST' && cacheTtl > 0) {
            setCachedResponse(cacheKey, data, cacheTtl);
        }

        return data;
    } finally {
        inFlightRequests.delete(cacheKey);
    }
}

// =============================================================================
// TYPED API METHODS
// =============================================================================

export const api = {
    /**
     * Health check
     */
    health: () => apiFetch('/api/health', {}, { cacheTtl: CACHE_TTL.default }),

    /**
     * Get user profile
     */
    getUserProfile: (token: string) => apiFetch('/api/user/profile', {
        headers: { Authorization: `Bearer ${token}` }
    }, { cacheTtl: CACHE_TTL.userProfile }),

    /**
     * Get badge definitions
     */
    getBadges: () => apiFetch('/api/badges', {}, { cacheTtl: CACHE_TTL.badges }),

    /**
     * Get user journeys
     */
    getJourneys: (token: string) => apiFetch('/api/user/journeys', {
        headers: { Authorization: `Bearer ${token}` }
    }, { cacheTtl: CACHE_TTL.journeys }),

    /**
     * Generate lesson (no caching - each generation is unique)
     */
    generateLesson: (data: {
        title: string;
        user_level: string;
        context: string;
        journey_id: string;
        node_id: string;
        step_id: string;
    }) => apiFetch('/api/lesson/generate', {
        method: 'POST',
        body: JSON.stringify(data),
    }, { timeout: 60000, maxRetries: 2 }),  // Longer timeout for AI generation

    /**
     * Generate quiz
     */
    generateQuiz: (data: {
        type: 'mcq' | 'coding';
        lesson_content: string;
        step_title: string;
        difficulty: string;
    }) => apiFetch('/api/quiz/generate', {
        method: 'POST',
        body: JSON.stringify(data),
    }, { timeout: 45000, maxRetries: 2 }),

    /**
     * Clear cache (useful for logout or refresh)
     */
    clearCache: () => {
        responseCache.clear();
        console.log('[API] Cache cleared');
    },
};

export default api;
