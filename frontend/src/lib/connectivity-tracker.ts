type ConnectivityIssue = 'offline' | 'slow' | null;

type ConnectivityState = {
    isOffline: boolean;
    isSlow: boolean;
    hasFailure: boolean;
    activeTrackedRequests: number;
    slowSince: number | null;
    issue: ConnectivityIssue;
};

type ConnectivityListener = (state: ConnectivityState) => void;

type StartRequestOptions = {
    track?: boolean;
    retryAction?: (() => Promise<unknown> | unknown) | null;
};

type EndRequestOptions = {
    networkError?: boolean;
};

export const DEFAULT_DEBOUNCE_MS = 300;
export const SLOW_CONNECTION_EXTRA_MS = 2200;
export const CONNECTIVITY_SLOW_THRESHOLD_MS = DEFAULT_DEBOUNCE_MS + SLOW_CONNECTION_EXTRA_MS;
export const CONNECTIVITY_MAX_LOADING_MS = 12000;
export const CONNECTIVITY_HINT_THRESHOLD_MS = 1200;

const TRACKED_ROUTE_PREFIXES = [
    '/',
    '/search',
    '/country',
    '/categories',
    '/admin',
    '/dashboard',
    '/enterprise',
    '/org/dashboard',
    '/org/upgrade',
    '/api-docs'
];

const listeners = new Set<ConnectivityListener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let offlineTimer: ReturnType<typeof setTimeout> | null = null;

let requestCounter = 0;
let lastRetryAction: (() => Promise<unknown> | unknown) | null = null;

let state: ConnectivityState = {
    isOffline: false,
    isSlow: false,
    hasFailure: false,
    activeTrackedRequests: 0,
    slowSince: null,
    issue: null
};

const isBrowser = () => typeof window !== 'undefined';

const emit = () => {
    for (const listener of listeners) {
        listener({ ...state });
    }
};

const clearOfflineTimer = () => {
    if (offlineTimer) {
        clearTimeout(offlineTimer);
        offlineTimer = null;
    }
};

const scheduleOffline = () => {
    clearOfflineTimer();
    offlineTimer = setTimeout(() => {
        state.isOffline = true;
        state.isSlow = false;
        state.hasFailure = true;
        state.slowSince = null;
        recomputeIssue();
        emit();
    }, CONNECTIVITY_SLOW_THRESHOLD_MS);
};

const recomputeIssue = () => {
    if (state.isOffline) {
        state.issue = 'offline';
        return;
    }
    if (state.isSlow) {
        state.issue = 'slow';
        return;
    }
    state.issue = null;
};

export const isConnectivityRouteTracked = (pathname: string | null | undefined): boolean => {
    if (!pathname) return false;
    return TRACKED_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
};

export const shouldTrackConnectivityRequest = (trackConnectivity?: boolean): boolean => {
    if (trackConnectivity === false) return false;
    if (!isBrowser()) return false;
    if (trackConnectivity === true) return true;
    return isConnectivityRouteTracked(window.location.pathname);
};

export const getConnectivityState = (): ConnectivityState => ({ ...state });

export const subscribeConnectivity = (listener: ConnectivityListener): (() => void) => {
    listeners.add(listener);
    listener({ ...state });
    return () => {
        listeners.delete(listener);
    };
};

export const setConnectivityOffline = (isOffline: boolean) => {
    if (isOffline) {
        scheduleOffline();
        return;
    }

    clearOfflineTimer();
    state.isOffline = isOffline;
    if (!isOffline && state.activeTrackedRequests === 0) {
        state.hasFailure = false;
    }
    recomputeIssue();
    emit();
};

export const dismissSlowConnection = () => {
    state.isSlow = false;
    state.slowSince = null;
    recomputeIssue();
    emit();
};

export const startConnectivityRequest = (options: StartRequestOptions = {}): number | null => {
    if (!shouldTrackConnectivityRequest(options.track)) {
        return null;
    }

    if (typeof options.retryAction === 'function') {
        lastRetryAction = options.retryAction;
    }

    if (state.activeTrackedRequests === 0) {
        state.isSlow = false;
        state.hasFailure = false;
        state.slowSince = null;
    }

    const requestId = ++requestCounter;
    state.activeTrackedRequests += 1;
    clearOfflineTimer();

    const timer = setTimeout(() => {
        if (!timers.has(requestId)) return;
        if (!state.isOffline) {
            state.isSlow = true;
            if (!state.slowSince) state.slowSince = Date.now();
            recomputeIssue();
            emit();
        }
    }, CONNECTIVITY_SLOW_THRESHOLD_MS);

    timers.set(requestId, timer);
    recomputeIssue();
    emit();
    return requestId;
};

export const endConnectivityRequest = (requestId: number | null, options: EndRequestOptions = {}) => {
    if (requestId === null) return;

    const timer = timers.get(requestId);
    if (timer) {
        clearTimeout(timer);
        timers.delete(requestId);
    }

    state.activeTrackedRequests = Math.max(0, state.activeTrackedRequests - 1);

    if (state.activeTrackedRequests === 0) {
        state.isSlow = false;
        state.slowSince = null;
    }

    if (options.networkError) {
        state.hasFailure = true;
        if (isBrowser() && !window.navigator.onLine) {
            scheduleOffline();
        } else {
            clearOfflineTimer();
            state.isOffline = false;
        }
    } else if (state.activeTrackedRequests === 0) {
        clearOfflineTimer();
        state.hasFailure = false;
        if (isBrowser() && window.navigator.onLine) {
            state.isOffline = false;
        }
    }

    recomputeIssue();
    emit();
};

export const runConnectivityRetry = async (
    fallbackAction?: (() => Promise<unknown> | unknown) | null
): Promise<boolean> => {
    const action = lastRetryAction || fallbackAction;
    if (!action) return false;

    try {
        await Promise.resolve(action());
        clearOfflineTimer();
        if (isBrowser() && window.navigator.onLine) {
            state.isOffline = false;
        }
        state.isSlow = false;
        state.hasFailure = false;
        state.slowSince = null;
        recomputeIssue();
        emit();
        return true;
    } catch {
        state.hasFailure = true;
        if (isBrowser() && !window.navigator.onLine) {
            scheduleOffline();
        } else {
            state.isOffline = false;
            state.isSlow = true;
            if (!state.slowSince) state.slowSince = Date.now();
        }
        recomputeIssue();
        emit();
        return false;
    }
};
