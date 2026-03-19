(function() {
  "use strict";
  
  // ================== VERSION ==================
  const VERSION = '1.0.2';
  console.log(`🚀 Fresh Pumps v${VERSION} initializing...`);
  
  // ================== CONFIG ==================
  const CONFIG = {
    API_PROXY: 'https://api.allorigins.win/raw?url=',
    FALLBACK_PROXY: 'https://api.codetabs.com/v1/proxy/?quest=',
    DEXSCREENER_API: 'https://api.dexscreener.com/latest/dex/search',
    REFRESH_INTERVAL: 60,
    REQUEST_TIMEOUT: 15000,
    BATCH_SIZE: 3,
    MAX_RETRIES: 3,
    MAX_PROXY_RETRIES: 5,
    CACHE_MAX_AGE: 5 * 60 * 1000,
    TOKENS_PER_PAGE: 20,
    MAX_HOLDERS_ESTIMATE: 5000,
    CLEANUP_INTERVAL: 5 * 60 * 1000,
    MAX_CACHE_AGE: 30 * 60 * 1000,
    WS_RECONNECT_DELAY: 5000,
    MAX_QUEUE_SIZE: 100,
    QUEUE_TIMEOUT: 20000,
    MAX_MEMORY_THRESHOLD: 80,
    VIRTUAL_SCROLL_BUFFER: 10,
    ESTIMATION_MULTIPLIER: 1.5,
    RATE_LIMIT_CALLS: 10,
    RATE_LIMIT_WINDOW: 1000,
    CONFIG_URLS: [
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://raw.githubusercontent.com/SolPhantomX/cryptobros-backend/main/config.html'),
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://solphantomx.github.io/cryptobros-backend/config.html')
    ],
    MAX_TOKEN_AGE_DAYS: 365,
    ESCAPE_CACHE_MAX_SIZE: 500,
    ESCAPE_CACHE_TTL: 3600000 // 1 hour
  };
  
  // ================== STATE ==================
  const state = {
    timeFilter: 'all',
    liqFilter: 'all',
    platformFilter: 'all',
    sort: 'newest',
    countdown: CONFIG.REFRESH_INTERVAL,
    intervalId: null,
    cleanupIntervalId: null,
    memoryMonitorId: null,
    tokens: [],
    filteredTokens: [],
    filteredTokensCache: null,
    lastFilters: {},
    lastTokensHash: '',
    displayedTokens: 20,
    isRefreshing: false,
    isLoadingMore: false,
    ageCache: new Map(),
    holdersCache: new Map(),
    apiQueue: [],
    processingQueue: false,
    abortControllers: new Map(),
    pendingRequests: new Map(),
    lastCacheCleanup: Date.now(),
    apiKeys: null,
    isLoading: false,
    loadPromise: null,
    isMounted: true,
    nextControllerId: 0,
    ws: null,
    wsReconnectTimer: null,
    wsPingInterval: null,
    clickHandler: null,
    resizeHandler: null,
    metrics: {
      apiCalls: 0,
      cacheHits: 0,
      errors: 0,
      renderTime: 0,
      lastMemoryWarning: 0
    },
    virtualScroll: {
      container: null,
      itemHeight: 400,
      visibleItems: 0,
      scrollTop: 0,
      renderTimer: null,
      cardHeightMeasured: false
    },
    rateLimit: {
      calls: []
    }
  };
  
  // ================== CACHED ESCAPE FUNCTIONS ==================
  const escapeCache = new Map();
  
  const escapeHtml = (text) => {
    if (text === null || text === undefined) return '';
    const key = String(text);
    
    // Check cache with TTL
    if (escapeCache.has(key)) {
      const cached = escapeCache.get(key);
      if (Date.now() - cached.timestamp < CONFIG.ESCAPE_CACHE_TTL) {
        return cached.value;
      }
      escapeCache.delete(key);
    }
    
    const div = document.createElement('div');
    div.textContent = key;
    const escaped = div.innerHTML;
    
    // Cache with size limit
    if (escapeCache.size < CONFIG.ESCAPE_CACHE_MAX_SIZE) {
      escapeCache.set(key, {
        value: escaped,
        timestamp: Date.now()
      });
    } else {
      // Clean old entries
      const now = Date.now();
      for (const [k, v] of escapeCache) {
        if (now - v.timestamp > CONFIG.ESCAPE_CACHE_TTL) {
          escapeCache.delete(k);
        }
        if (escapeCache.size < CONFIG.ESCAPE_CACHE_MAX_SIZE) break;
      }
    }
    
    return escaped;
  };
  
  const escapeAttribute = (text) => {
    if (text === null || text === undefined) return '';
    return String(text).replace(/[&<>"'\/]/g, (match) => {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;'
      };
      return map[match];
    });
  };
  
  const escapeUrl = (url) => {
    if (!url || url === '#') return '#';
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '#';
      }
      if (parsed.href.includes('javascript:') || parsed.href.includes('data:')) {
        return '#';
      }
      return parsed.toString();
    } catch {
      return '#';
    }
  };
  
  // Simple sanitizer for tooltips - avoid using user data in title attributes
  const sanitizeForTooltip = (text) => {
    if (!text) return '';
    // Remove any HTML and limit length
    return String(text).replace(/[<>]/g, '').substring(0, 100);
  };
  
  // ================== SAFE UTILITIES ==================
  const safeGet = (obj, path, defaultValue = null) => {
    try {
      return path.split('.').reduce((o, p) => o?.[p], obj) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  };
  
  const safeLocalStorage = {
    getItem: (key) => {
      try {
        if (typeof localStorage !== 'undefined') {
          return localStorage.getItem(key);
        }
      } catch (e) {
        console.warn('localStorage not available:', e.message);
      }
      return null;
    },
    setItem: (key, value) => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, value);
        }
      } catch (e) {
        console.warn('localStorage not available:', e.message);
      }
    }
  };
  
  const safeParseTimestamp = (creationTime) => {
    if (!creationTime) return null;
    
    const str = String(creationTime).trim();
    if (!/^\d+$/.test(str)) return null;
    
    const num = str.length === 10 ? Number(str) * 1000 : Number(str);
    const now = Date.now();
    const maxAge = CONFIG.MAX_TOKEN_AGE_DAYS * 24 * 60 * 60 * 1000;
    
    return (!isNaN(num) && num > 0 && num < now + 86400000 && num > now - maxAge) ? num : null;
  };
  
  const calculateAgeMinutes = (timestamp) => {
    if (!timestamp) return null;
    
    const now = Date.now();
    const ageMs = now - timestamp;
    const ageMinutes = Math.round(ageMs / 60000);
    const maxAgeMinutes = CONFIG.MAX_TOKEN_AGE_DAYS * 24 * 60;
    
    if (ageMinutes > maxAgeMinutes) return null;
    if (ageMinutes < -1) return null;
    
    return Math.max(0, ageMinutes);
  };
  
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        if (state.isMounted) {
          func.apply(this, args);
        }
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };
  
  const throttle = (func, limit) => {
    let inThrottle;
    let lastResult;
    return function(...args) {
      if (!inThrottle && state.isMounted) {
        lastResult = func.apply(this, args);
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
        }, limit);
      }
      return lastResult;
    };
  };
  
  const formatNumber = (num) => {
    if (num == null || isNaN(num)) return '0';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
  };
  
  const formatAge = (minutes) => {
    if (minutes == null || isNaN(minutes)) return '?';
    if (minutes < 1) return '< 1m';
    if (minutes < 60) return Math.round(minutes) + 'm';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };
  
  const getElement = (id) => document.getElementById(id);
  
  const isValidSolanaAddress = (address) => {
    if (!address || typeof address !== 'string') return false;
    return address.length >= 32 && 
           address.length <= 44 && 
           /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
  };
  
  const sleep = (ms) => new Promise((resolve) => {
    if (!state.isMounted) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, ms);
    return () => clearTimeout(timeout);
  });
  
  const generateHash = (obj) => {
    try {
      if (!obj || typeof obj !== 'object') return Date.now().toString();
      const str = JSON.stringify(obj);
      // Safe base64 encoding for Unicode
      const utf8Str = unescape(encodeURIComponent(str));
      return btoa(utf8Str).slice(0, 32);
    } catch {
      return Date.now().toString();
    }
  };
  
  // API Key validation
  const isValidGoPlusKey = (key) => {
    return typeof key === 'string' && 
           /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  };
  
  const isValidHeliusUrl = (url) => {
    return typeof url === 'string' && 
           url.includes('rpc.helius.xyz') && 
           url.includes('api-key=');
  };
  
  const parseApiKeys = (jsonStr) => {
    try {
      const cleaned = jsonStr
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/'/g, '"')
        .replace(/(\w+):/g, '"$1":')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .trim();
      
      const raw = JSON.parse(cleaned);
      
      const keys = {
        GOPLUS_API: raw.GOPLUS_API_KEY || raw.GOPLUS_API || raw.GOPLUS,
        HELIUS_RPC: raw.HELIUS_RPC || raw.HELIUS_API_KEY || raw.HELIUS
      };
      
      // Validate keys format
      if (!isValidGoPlusKey(keys.GOPLUS_API)) {
        console.warn('Invalid GoPlus API key format');
        return null;
      }
      
      if (!isValidHeliusUrl(keys.HELIUS_RPC)) {
        console.warn('Invalid Helius RPC URL format');
        return null;
      }
      
      return keys;
    } catch (e) {
      console.warn('Failed to parse API keys:', e);
      return null;
    }
  };
  
  // ================== RATE LIMITING ==================
  const checkRateLimit = () => {
    const now = Date.now();
    state.rateLimit.calls = state.rateLimit.calls.filter(t => now - t < CONFIG.RATE_LIMIT_WINDOW);
    
    if (state.rateLimit.calls.length >= CONFIG.RATE_LIMIT_CALLS) {
      const oldestCall = state.rateLimit.calls[0];
      const waitTime = CONFIG.RATE_LIMIT_WINDOW - (now - oldestCall);
      return waitTime > 0 ? waitTime : 0;
    }
    
    state.rateLimit.calls.push(now);
    return 0;
  };
  
  // ================== MEMORY MONITORING ==================
  const initMemoryMonitoring = () => {
    if (!performance.memory) return;
    
    state.memoryMonitorId = setInterval(() => {
      if (!state.isMounted) {
        clearInterval(state.memoryMonitorId);
        return;
      }
      
      const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
      const usagePercent = (usedJSHeapSize / jsHeapSizeLimit) * 100;
      
      if (usagePercent > CONFIG.MAX_MEMORY_THRESHOLD) {
        const now = Date.now();
        if (now - state.metrics.lastMemoryWarning > 60000) {
          console.warn(`High memory usage: ${usagePercent.toFixed(1)}%`);
          state.metrics.lastMemoryWarning = now;
          cleanupCache(true);
          
          if (usagePercent > 90) {
            state.ageCache.clear();
            state.holdersCache.clear();
            escapeCache.clear();
          }
        }
      }
    }, 30000);
  };
  
  // ================== COMBINED CACHE CLEANUP ==================
  const cleanupCache = (aggressive = false) => {
    if (!state.isMounted) return;
    const now = Date.now();
    const maxAge = aggressive ? 60000 : CONFIG.MAX_CACHE_AGE;
    
    for (const [key, value] of state.ageCache.entries()) {
      if (now - value.timestamp > maxAge) {
        state.ageCache.delete(key);
      }
    }
    
    for (const [key, value] of state.holdersCache.entries()) {
      if (now - value.timestamp > maxAge) {
        state.holdersCache.delete(key);
      }
    }
    
    for (const [key, promise] of state.pendingRequests.entries()) {
      if (promise._timestamp && now - promise._timestamp > maxAge) {
        state.pendingRequests.delete(key);
      }
    }
    
    if (aggressive && escapeCache.size > 100) {
      escapeCache.clear();
    }
    
    state.lastCacheCleanup = now;
  };
  
  // ================== FIXED ABORT CONTROLLER ==================
  const createAbortController = () => {
    const id = state.nextControllerId++;
    const controller = new AbortController();
    
    state.abortControllers.set(id, controller);
    
    controller.signal.addEventListener('abort', () => {
      if (state.abortControllers.get(id) === controller) {
        state.abortControllers.delete(id);
      }
    }, { once: true });
    
    return controller;
  };
  
  const abortAllRequests = () => {
    state.abortControllers.forEach((controller) => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    });
    state.abortControllers.clear();
  };
  
  // ================== TOAST NOTIFICATIONS ==================
  const showToast = (message, type = 'success', duration = 3000) => {
    if (!state.isMounted) return;
    const container = getElement('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    container.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'slideIn 0.3s reverse';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  };
  
  // ================== COPY ADDRESS ==================
  const copyAddress = (address) => {
    if (!address) {
      showToast('Invalid address', 'error');
      return;
    }
    
    navigator.clipboard.writeText(address).then(() => {
      showToast('Address copied!');
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = address;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('Address copied!');
      } catch {
        showToast('Failed to copy', 'error');
      }
      document.body.removeChild(textarea);
    });
  };
  
  // ================== FETCH WITH TIMEOUT AND EXPONENTIAL BACKOFF ==================
  const fetchWithTimeout = async (url, options = {}, retries = CONFIG.MAX_RETRIES) => {
    if (!state.isMounted) throw new Error('Component unmounted');
    
    const baseDelay = 1000;
    const maxDelay = 30000;
    
    for (let i = 0; i < retries; i++) {
      if (!state.isMounted) throw new Error('Component unmounted');
      
      const controller = createAbortController();
      let timeoutId = null;
      
      try {
        timeoutId = setTimeout(() => {
          if (!controller.signal.aborted) {
            controller.abort();
          }
        }, CONFIG.REQUEST_TIMEOUT);
        
        const response = await fetch(url, { 
          ...options, 
          signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        timeoutId = null;
        
        if (!state.isMounted) throw new Error('Component unmounted');
        
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After')) || 
                            Math.min(baseDelay * Math.pow(2, i), maxDelay) / 1000;
          await sleep(retryAfter * 1000);
          if (!state.isMounted) throw new Error('Component unmounted');
          continue;
        }
        
        if (response.status === 404) {
          throw new Error('Not found');
        }
        
        // Handle proxy blocking
        if (response.status === 403) {
          if (i < retries - 1) {
            await sleep(1000);
            continue;
          }
          throw new Error('Proxy blocked');
        }
        
        if (response.status >= 500 && i < retries - 1) {
          const delay = Math.min(baseDelay * Math.pow(2, i) + Math.random() * 1000, maxDelay);
          await sleep(delay);
          if (!state.isMounted) throw new Error('Component unmounted');
          continue;
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        return response;
        
      } catch (error) {
        clearTimeout(timeoutId);
        timeoutId = null;
        
        if (!state.isMounted) throw new Error('Component unmounted');
        
        if (error.name === 'AbortError') {
          if (i === retries - 1) throw new Error('Request timeout');
        } else {
          if (i === retries - 1) throw error;
        }
        
        const delay = Math.min(baseDelay * Math.pow(2, i) + Math.random() * 1000, maxDelay);
        await sleep(delay);
        if (!state.isMounted) throw new Error('Component unmounted');
      }
    }
    throw new Error('Max retries exceeded');
  };
  
  // ================== FIXED API QUEUE WITH TIMEOUT ==================
  const queueApiCall = (fn, key = null, priority = false) => {
    if (!state.isMounted) {
      return Promise.reject(new Error('Component unmounted'));
    }
    
    state.metrics.apiCalls++;
    
    if (state.apiQueue.length >= CONFIG.MAX_QUEUE_SIZE) {
      const removed = state.apiQueue.shift();
      if (removed?.reject) {
        clearTimeout(removed.timeout);
        removed.reject(new Error('Queue full, request dropped'));
      }
    }
    
    if (key && state.pendingRequests.has(key)) {
      state.metrics.cacheHits++;
      const existing = state.pendingRequests.get(key);
      
      return existing.finally(() => {
        if (state.pendingRequests.get(key) === existing) {
          state.pendingRequests.delete(key);
        }
      });
    }
    
    const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = state.apiQueue.findIndex(r => r.key === key);
        if (index !== -1) {
          const [request] = state.apiQueue.splice(index, 1);
          clearTimeout(request.timeout);
          reject(new Error('Request timeout in queue'));
        }
      }, CONFIG.QUEUE_TIMEOUT);
      
      const request = { 
        fn, 
        resolve, 
        reject, 
        key, 
        id: requestId,
        timestamp: Date.now(),
        timeout
      };
      
      if (priority) {
        state.apiQueue.unshift(request);
      } else {
        state.apiQueue.push(request);
      }
      
      if (!state.processingQueue) {
        setTimeout(() => processApiQueue(), 0);
      }
    });
    
    promise._timestamp = Date.now();
    promise._id = requestId;
    
    if (key) {
      state.pendingRequests.set(key, promise);
      promise
        .catch(() => {})
        .finally(() => {
          if (state.pendingRequests.get(key) === promise) {
            state.pendingRequests.delete(key);
          }
        });
    }
    
    return promise;
  };
  
  // ================== FIXED processApiQueue ==================
  const clearQueueAndReject = () => {
    state.apiQueue.forEach(req => {
      clearTimeout(req.timeout);
      req.reject(new Error('Component unmounted'));
    });
    state.apiQueue = [];
  };
  
  const processApiQueue = async () => {
    if (state.processingQueue) return;
    
    state.processingQueue = true;
    
    try {
      while (state.apiQueue.length > 0) {
        if (!state.isMounted) {
          clearQueueAndReject();
          return;
        }
        
        const waitTime = checkRateLimit();
        if (waitTime > 0) {
          await sleep(waitTime);
          continue;
        }
        
        const batch = state.apiQueue.splice(0, CONFIG.BATCH_SIZE);
        
        await Promise.allSettled(batch.map(async ({ fn, resolve, reject, key, id, timeout }) => {
          clearTimeout(timeout);
          
          if (!state.isMounted) {
            reject(new Error('Component unmounted'));
            return;
          }
          
          const pendingCheck = key ? state.pendingRequests.get(key) : null;
          if (key && pendingCheck && pendingCheck._id !== id) {
            try {
              const result = await pendingCheck;
              resolve(result);
            } catch (error) {
              reject(error);
            }
            return;
          }
          
          try {
            const result = await fn();
            if (state.isMounted) {
              resolve(result);
            } else {
              reject(new Error('Component unmounted'));
            }
          } catch (error) {
            state.metrics.errors++;
            reject(error);
          }
        }));
        
        if (state.apiQueue.length > 0 && state.isMounted) {
          await sleep(300);
        }
      }
    } finally {
      state.processingQueue = false;
    }
    
    if (state.apiQueue.length > 0 && state.isMounted) {
      setTimeout(() => processApiQueue(), 0);
    }
  };
  
  // ================== IMPROVED KEY OBFUSCATION ==================
  const obfuscateKeys = (keys) => {
    try {
      const str = JSON.stringify(keys);
      const mask = 'fresh-pumps-2024';
      let result = '';
      
      for (let i = 0; i < str.length; i++) {
        result += String.fromCharCode(str.charCodeAt(i) ^ mask.charCodeAt(i % mask.length));
      }
      
      return btoa(result);
    } catch {
      return null;
    }
  };
  
  const deobfuscateKeys = (obfuscated) => {
    try {
      if (!obfuscated) return null;
      
      const decoded = atob(obfuscated);
      const mask = 'fresh-pumps-2024';
      let result = '';
      
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ mask.charCodeAt(i % mask.length));
      }
      
      return JSON.parse(result);
    } catch {
      return null;
    }
  };
  
  // ================== FIXED LOAD API KEYS ==================
  let loadingKeys = false;
  
  async function loadApiKeys() {
    console.log('Loading API keys...');
    
    if (loadingKeys) {
      console.log('Already loading keys, waiting...');
      while (loadingKeys) {
        await sleep(100);
      }
      return state.apiKeys;
    }
    
    loadingKeys = true;
    
    try {
      // Try localStorage first
      const stored = safeLocalStorage.getItem('api_keys_enc');
      if (stored) {
        try {
          const keys = deobfuscateKeys(stored);
          if (keys?.GOPLUS_API && keys?.HELIUS_RPC) {
            if (isValidGoPlusKey(keys.GOPLUS_API) && isValidHeliusUrl(keys.HELIUS_RPC)) {
              console.log('✅ API keys loaded from localStorage');
              state.apiKeys = keys;
              return keys;
            }
          }
        } catch (e) {
          console.warn('Failed to decrypt stored keys:', e);
        }
      }
      
      // Try loading from config URLs
      for (const url of CONFIG.CONFIG_URLS) {
        try {
          console.log('Trying to load from:', url);
          
          const controller = createAbortController();
          const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
          
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'Accept': 'text/plain' }
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            console.warn(`HTTP ${response.status} from ${url}`);
            continue;
          }
          
          const text = await response.text();
          
          // Try different patterns to find API_KEYS
          const patterns = [
            /const\s+API_KEYS\s*=\s*(\{[\s\S]*?\});/,
            /let\s+API_KEYS\s*=\s*(\{[\s\S]*?\});/,
            /var\s+API_KEYS\s*=\s*(\{[\s\S]*?\});/,
            /API_KEYS\s*=\s*(\{[\s\S]*?\});/,
            /<script>[\s\S]*?API_KEYS\s*=\s*(\{[\s\S]*?\});/
          ];
          
          let match = null;
          for (const pattern of patterns) {
            match = text.match(pattern);
            if (match) break;
          }
          
          if (!match) {
            console.warn('No API_KEYS pattern found');
            continue;
          }
          
          const keys = parseApiKeys(match[1]);
          
          if (keys?.GOPLUS_API && keys?.HELIUS_RPC) {
            console.log('✅ API keys loaded from config URL');
            
            const obfuscated = obfuscateKeys(keys);
            if (obfuscated) {
              safeLocalStorage.setItem('api_keys_enc', obfuscated);
            }
            
            state.apiKeys = keys;
            return keys;
          }
          
        } catch (e) {
          console.warn(`Failed to load from ${url}:`, e.message);
        }
      }
      
      console.error('❌ Could not load API keys');
      showToast('Failed to load API keys. Please refresh.', 'error');
      return null;
      
    } finally {
      loadingKeys = false;
    }
  }
  
  // ================== FETCH WITH PROXY ==================
  async function fetchWithProxy(url) {
    if (!state.isMounted) throw new Error('Component unmounted');
    
    let cleanUrl;
    try {
      cleanUrl = new URL(url).toString();
    } catch {
      throw new Error('Invalid URL');
    }
    
    const proxies = [
      CONFIG.API_PROXY + encodeURIComponent(cleanUrl),
      CONFIG.FALLBACK_PROXY + encodeURIComponent(cleanUrl)
    ].filter(p => p && p.startsWith('http'));
    
    if (proxies.length === 0) {
      throw new Error('No valid proxies available');
    }
    
    let lastError = null;
    
    for (let attempt = 0; attempt < CONFIG.MAX_PROXY_RETRIES; attempt++) {
      if (!state.isMounted) throw new Error('Component unmounted');
      
      for (let i = 0; i < proxies.length; i++) {
        try {
          const controller = createAbortController();
          const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
          
          const response = await fetch(proxies[i], {
            signal: controller.signal,
            headers: {
              'Origin': window.location.origin,
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
          
          clearTimeout(timeoutId);
          
          if (!state.isMounted) throw new Error('Component unmounted');
          
          // Handle 403 immediately - try next proxy
          if (response.status === 403) {
            console.warn('Proxy 403, trying next...');
            continue;
          }
          
          const contentType = response.headers.get('content-type') || '';
          
          if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
            console.warn('Proxy returned unexpected content type:', contentType);
            continue;
          }
          
          const text = await response.text();
          
          if (!text || text.trim() === '') {
            console.warn('Empty response from proxy');
            continue;
          }
          
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
          
        } catch (error) {
          lastError = error;
          console.warn(`Proxy attempt ${attempt + 1} failed:`, error.message);
        }
      }
      
      if (attempt < CONFIG.MAX_PROXY_RETRIES - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await sleep(delay);
      }
    }
    
    throw lastError || new Error('All proxies failed');
  }
  
  // ================== FETCH TOKEN AGE (GoPlus) ==================
  async function fetchTokenAge(address, retryCount = 0) {
    const MAX_RETRIES = 3;
    
    if (!address || !isValidSolanaAddress(address)) return null;
    if (!state.apiKeys?.GOPLUS_API) return null;
    if (!state.isMounted) return null;
    
    const cacheKey = `age_${address}`;
    
    if (state.ageCache.has(cacheKey)) {
      const cached = state.ageCache.get(cacheKey);
      if (cached.value && Date.now() - cached.timestamp < CONFIG.CACHE_MAX_AGE) {
        state.metrics.cacheHits++;
        return cached.value;
      }
    }
    
    return queueApiCall(async () => {
      try {
        const url = `https://api.gopluslabs.io/api/v1/token_security/${address}?chain=solana`;
        
        const controller = createAbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'x-api-key': state.apiKeys.GOPLUS_API } // Fixed header case
        });
        
        clearTimeout(timeoutId);
        
        if (!state.isMounted) return null;
        
        if (response.status === 429) {
          if (retryCount < MAX_RETRIES) {
            const waitTime = 5000 * Math.pow(2, retryCount);
            await sleep(waitTime);
            if (!state.isMounted) return null;
            return fetchTokenAge(address, retryCount + 1);
          }
          return null;
        }
        
        if (response.status === 404) return null;
        if (!response.ok) return null;
        
        const data = await response.json();
        
        if (data.code === 1 && data.result) {
          const creationTime = data.result.creation_time || 
                             data.result.create_time || 
                             data.result.created_at;
          
          const timestamp = safeParseTimestamp(creationTime);
          
          if (timestamp) {
            const result = { timestamp, source: 'goplus' };
            
            state.ageCache.set(cacheKey, {
              value: result,
              timestamp: Date.now()
            });
            
            return result;
          }
        }
        
        return null;
        
      } catch (e) {
        if (e.name === 'AbortError') return null;
        console.warn('GoPlus error:', e.message);
        return null;
      }
    }, cacheKey);
  }
  
  // ================== FETCH TOKEN HOLDERS (Helius) ==================
  async function fetchTokenHolders(address, retryCount = 0, liquidity = 0) {
    const MAX_RETRIES = 3;
    
    if (!address || !isValidSolanaAddress(address)) return null;
    if (!state.apiKeys?.HELIUS_RPC) return null;
    if (!state.isMounted) return null;
    
    const cacheKey = `holders_${address}`;
    
    if (state.holdersCache.has(cacheKey)) {
      const cached = state.holdersCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CONFIG.CACHE_MAX_AGE) {
        const isValid = cached.value && 
                       (typeof cached.value.count === 'number') &&
                       (cached.value.count >= 0);
        if (isValid) {
          state.metrics.cacheHits++;
          return cached.value;
        }
      }
    }
    
    return queueApiCall(async () => {
      try {
        const response = await fetchWithTimeout(state.apiKeys.HELIUS_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `holders-${address}-${Date.now()}`,
            method: 'getTokenLargestAccounts',
            params: [address]
          })
        });
        
        if (!state.isMounted) return null;
        
        if (response.status === 429) {
          if (retryCount < MAX_RETRIES) {
            const waitTime = 5000 * Math.pow(2, retryCount);
            await sleep(waitTime);
            if (!state.isMounted) return null;
            return fetchTokenHolders(address, retryCount + 1, liquidity);
          }
          return { count: 0, topConcentration: 0, isEstimate: true };
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          return { count: 0, topConcentration: 0, isEstimate: true };
        }
        
        const data = await response.json();
        
        if (data.error) {
          if (data.error.code === -32602) return null;
          return { count: 0, topConcentration: 0, isEstimate: true };
        }
        
        const accounts = data.result?.value || [];
        if (!accounts.length) return { count: 0, topConcentration: 0, isEstimate: false };
        
        accounts.sort((a, b) => (b.uiAmount || 0) - (a.uiAmount || 0));
        
        const totalSupply = accounts.reduce((sum, acc) => sum + (acc.uiAmount || 0), 0);
        if (totalSupply === 0) {
          return { count: accounts.length, topConcentration: 0, isEstimate: false };
        }
        
        const top10Supply = accounts.slice(0, 10).reduce((sum, acc) => sum + (acc.uiAmount || 0), 0);
        const topConcentration = (top10Supply / totalSupply) * 100;
        
        let estimatedHolders = accounts.length;
        let confidence = 'high';
        
        if (accounts.length === 20) {
          const top20Sum = accounts.slice(0, 20).reduce((sum, acc) => sum + (acc.uiAmount || 0), 0);
          const top20Percentage = (top20Sum / totalSupply) * 100;
          
          let maxEstimate = CONFIG.MAX_HOLDERS_ESTIMATE;
          if (liquidity < 1000) maxEstimate = 100;
          else if (liquidity < 5000) maxEstimate = 500;
          else if (liquidity < 10000) maxEstimate = 1000;
          else if (liquidity < 50000) maxEstimate = 5000;
          
          if (top20Percentage < 50) {
            estimatedHolders = Math.min(
              Math.round(20 + (totalSupply - top20Sum) / (top20Sum / 20) * CONFIG.ESTIMATION_MULTIPLIER),
              maxEstimate
            );
            confidence = 'low';
          } else if (top20Percentage < 80) {
            estimatedHolders = Math.min(
              Math.round(20 + (totalSupply - top20Sum) / (top20Sum / 20) * (CONFIG.ESTIMATION_MULTIPLIER / 2)),
              maxEstimate
            );
            confidence = 'medium';
          }
        }
        
        const result = { 
          count: estimatedHolders, 
          topConcentration, 
          isEstimate: accounts.length === 20,
          confidence,
          rawCount: accounts.length
        };
        
        state.holdersCache.set(cacheKey, {
          value: result,
          timestamp: Date.now()
        });
        
        return result;
        
      } catch (e) {
        console.warn('Helius error:', e.message);
        return { count: 0, topConcentration: 0, isEstimate: true };
      }
    }, cacheKey);
  }
  
  // ================== FIXED WebSocket ==================
  function initWebSocket() {
    if (!state.apiKeys?.HELIUS_RPC) return;
    if (!state.isMounted) return;
    
    try {
      // Fix WebSocket URL conversion
      const url = new URL(state.apiKeys.HELIUS_RPC);
      url.protocol = 'wss:';
      const wsUrl = url.toString();
      
      // Clean up existing WebSocket
      if (state.ws) {
        try {
          state.ws.onclose = null;
          state.ws.onerror = null;
          state.ws.onopen = null;
          state.ws.onmessage = null;
          state.ws.close(1000, 'Reconnecting');
        } catch (e) {}
        state.ws = null;
      }
      
      if (state.wsReconnectTimer) {
        clearTimeout(state.wsReconnectTimer);
        state.wsReconnectTimer = null;
      }
      
      if (state.wsPingInterval) {
        clearInterval(state.wsPingInterval);
        state.wsPingInterval = null;
      }
      
      const ws = new WebSocket(wsUrl);
      
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
        }
      }, 5000);
      
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        if (!state.isMounted) {
          ws.close(1000, 'Component unmounted');
          return;
        }
        
        console.log('✅ WebSocket connected');
        state.ws = ws;
        
        const subscribeMsg = {
          jsonrpc: '2.0',
          id: 1,
          method: 'logsSubscribe',
          params: [{
            mentions: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA']
          }, {
            commitment: 'processed'
          }]
        };
        
        ws.send(JSON.stringify(subscribeMsg));
        
        state.wsPingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN && state.isMounted) {
            ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: Date.now() }));
          }
        }, 30000);
      };
      
      ws.onmessage = (event) => {
        if (!state.isMounted) return;
        
        try {
          const data = JSON.parse(event.data);
          
          if (data.method === 'logsNotification' && data.params?.result?.value) {
            const log = data.params.result.value;
            
            if (log.logs?.some(l => 
              l.includes('initialize mint') || 
              l.includes('create mint')
            )) {
              if (!state.isRefreshing && !state.isLoading) {
                loadTokens();
              }
            }
          }
        } catch (e) {
          console.warn('WebSocket message error:', e);
        }
      };
      
      ws.onerror = () => {
        clearTimeout(connectionTimeout);
      };
      
      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        
        if (state.ws === ws) {
          state.ws = null;
        }
        
        if (state.wsPingInterval) {
          clearInterval(state.wsPingInterval);
          state.wsPingInterval = null;
        }
        
        // Don't reconnect on auth error (4001) or normal close (1000)
        if (state.isMounted && event.code !== 1000 && event.code !== 4001) {
          if (state.wsReconnectTimer) clearTimeout(state.wsReconnectTimer);
          state.wsReconnectTimer = setTimeout(() => {
            if (state.isMounted && !state.ws) {
              initWebSocket();
            }
          }, CONFIG.WS_RECONNECT_DELAY);
        }
      };
      
    } catch (e) {
      console.warn('WebSocket init failed:', e);
    }
  }
  
  // ================== DEXSCREENER API ==================
  const fetchNewTokens = async () => {
    if (!state.isMounted) return [];
    
    try {
      const searchQueries = ['?q=created', '?q=pump.fun', '?q=raydium', '?q=new'];
      
      const results = await Promise.allSettled(
        searchQueries.map(q => fetchWithProxy(`${CONFIG.DEXSCREENER_API}${q}`))
      );
      
      if (!state.isMounted) return [];
      
      const allPairs = [];
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value?.pairs) {
          allPairs.push(...result.value.pairs);
        }
      });
      
      const uniquePairs = new Map();
      
      allPairs
        .filter(p => p?.chainId === 'solana')
        .forEach(p => {
          if (p.baseToken?.address && !uniquePairs.has(p.baseToken.address)) {
            uniquePairs.set(p.baseToken.address, p);
          }
        });
      
      return Array.from(uniquePairs.values())
        .sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
        .slice(0, 100)
        .map(p => ({
          address: safeGet(p, 'baseToken.address'),
          symbol: String(safeGet(p, 'baseToken.symbol', '???')).substring(0, 20),
          pairCreatedAt: p.pairCreatedAt || 0,
          liquidity: safeGet(p, 'liquidity.usd', 0),
          priceChange5m: safeGet(p, 'priceChange.m5', 0),
          fdv: p.fdv || 0,
          platform: String(p.dexId || 'unknown').toLowerCase(),
          url: p.url || ''
        }))
        .filter(t => t.address && isValidSolanaAddress(t.address));
      
    } catch (error) {
      console.error('DexScreener error:', error);
      return [];
    }
  };
  
  // ================== FIXED loadTokens ==================
  const loadTokens = async () => {
    // Prevent multiple simultaneous loads
    if (state.loadPromise) {
      return state.loadPromise;
    }
    
    if (state.isRefreshing || state.isLoading) {
      console.log('Already loading tokens, skipping...');
      return;
    }
    
    state.loadPromise = (async () => {
      if (!state.isMounted) return;
      
      state.isRefreshing = true;
      state.isLoading = true;
      
      abortAllRequests();
      
      const grid = getElement('tokenGrid');
      const refreshBtn = getElement('refreshBtn');
      
      if (refreshBtn) refreshBtn.disabled = true;
      
      try {
        if (!state.apiKeys) {
          const keys = await loadApiKeys();
          if (!keys) {
            if (grid && state.isMounted) {
              grid.innerHTML = '<div class="empty error-message">❌ Failed to load API keys. Please refresh.</div>';
            }
            return;
          }
          initWebSocket();
        }
        
        if (!state.isMounted) return;
        
        if (grid) grid.innerHTML = '<div class="loader">LOADING FRESH TOKENS...</div>';
        
        const tokens = await fetchNewTokens();
        
        if (!state.isMounted) return;
        
        if (!tokens.length) {
          if (grid) grid.innerHTML = '<div class="empty">✨ NO TOKENS FOUND</div>';
          return;
        }
        
        const enriched = [];
        
        for (let i = 0; i < tokens.length; i += CONFIG.BATCH_SIZE) {
          if (!state.isMounted) return;
          
          const batch = tokens.slice(i, i + CONFIG.BATCH_SIZE);
          
          if (grid) {
            grid.innerHTML = `<div class="loader">PROCESSING ${Math.min(i + CONFIG.BATCH_SIZE, tokens.length)}/${tokens.length} TOKENS...</div>`;
          }
          
          const batchPromises = batch.map(async (token) => {
            try {
              const [ageResult, holdersResult] = await Promise.allSettled([
                fetchTokenAge(token.address),
                fetchTokenHolders(token.address, 0, token.liquidity)
              ]);
              
              if (!state.isMounted) return null;
              
              const ageData = ageResult.status === 'fulfilled' ? ageResult.value : null;
              const holdersData = holdersResult.status === 'fulfilled' ? holdersResult.value : null;
              
              return {
                ...token,
                exactAge: ageData?.timestamp || null,
                ageSource: ageData?.source || null,
                holders: holdersData?.count,
                topHolder: holdersData?.topConcentration,
                holdersIsEstimate: holdersData?.isEstimate || false,
                holdersConfidence: holdersData?.confidence || 'low',
                holdersRawCount: holdersData?.rawCount,
                ageMinutes: token.pairCreatedAt ? 
                  Math.max(0, Math.round((Date.now() - token.pairCreatedAt) / 60000)) : null
              };
            } catch {
              return token;
            }
          });
          
          const results = await Promise.allSettled(batchPromises);
          
          results.forEach(r => {
            if (r.status === 'fulfilled' && r.value) {
              enriched.push(r.value);
            }
          });
        }
        
        if (!state.isMounted) return;
        
        state.tokens = enriched;
        state.displayedTokens = CONFIG.TOKENS_PER_PAGE;
        state.filteredTokensCache = null;
        state.lastTokensHash = generateHash(enriched);
        state.filteredTokens = getFilteredTokens();
        
        measureCardHeight();
        renderTokensVirtual(state.filteredTokens.slice(0, state.displayedTokens));
        
        showToast(`Loaded ${enriched.length} tokens`, 'success');
        
      } catch (error) {
        console.error('Failed to load:', error);
        if (grid && state.isMounted) {
          grid.innerHTML = '<div class="empty error-message">❌ ERROR LOADING TOKENS</div>';
        }
        state.metrics.errors++;
      } finally {
        state.isRefreshing = false;
        state.isLoading = false;
        if (refreshBtn) refreshBtn.disabled = false;
        state.loadPromise = null;
      }
    })();
    
    return state.loadPromise;
  };
  
  // ================== MEASURE CARD HEIGHT ==================
  const measureCardHeight = () => {
    if (state.virtualScroll.cardHeightMeasured) return;
    
    const grid = getElement('tokenGrid');
    if (!grid) return;
    
    const testCard = createTokenCard({
      address: 'test',
      symbol: 'TEST',
      pairCreatedAt: Date.now(),
      liquidity: 10000,
      priceChange5m: 5,
      fdv: 100000,
      platform: 'raydium',
      url: '#',
      holders: 100,
      topHolder: 15
    });
    
    testCard.style.visibility = 'hidden';
    testCard.style.position = 'absolute';
    grid.appendChild(testCard);
    
    const height = testCard.offsetHeight;
    if (height > 0) {
      state.virtualScroll.itemHeight = height;
      state.virtualScroll.cardHeightMeasured = true;
    }
    
    testCard.remove();
    
    const containerHeight = grid.clientHeight;
    state.virtualScroll.visibleItems = Math.ceil(containerHeight / state.virtualScroll.itemHeight) + 
                                       CONFIG.VIRTUAL_SCROLL_BUFFER * 2;
  };
  
  // ================== OPTIMIZED FILTER ==================
  const getFilteredTokens = () => {
    const currentFilters = {
      time: state.timeFilter,
      liq: state.liqFilter,
      platform: state.platformFilter,
      sort: state.sort
    };
    
    const filtersChanged = JSON.stringify(state.lastFilters) !== JSON.stringify(currentFilters);
    const tokensChanged = state.lastTokensHash !== generateHash(state.tokens);
    
    if (!filtersChanged && !tokensChanged && state.filteredTokensCache) {
      return state.filteredTokensCache;
    }
    
    const filtered = state.tokens.filter(t => {
      if (!t) return false;
      
      let age = null;
      
      if (t.exactAge) {
        age = calculateAgeMinutes(t.exactAge);
      } else if (t.ageMinutes != null) {
        age = t.ageMinutes;
      }
      
      if (state.timeFilter !== 'all' && age !== null) {
        const max = state.timeFilter === '5m' ? 5 : state.timeFilter === '30m' ? 30 : 60;
        if (age > max) return false;
      }
      
      if (state.liqFilter !== 'all') {
        const min = state.liqFilter === '5k' ? 5000 : state.liqFilter === '10k' ? 10000 : 50000;
        if ((t.liquidity || 0) < min) return false;
      }
      
      if (state.platformFilter !== 'all') {
        const platform = String(t.platform || '').toLowerCase();
        if (state.platformFilter === 'pump' && !platform.includes('pump')) return false;
        if (state.platformFilter === 'raydium' && !platform.includes('raydium')) return false;
      }
      
      return true;
    });
    
    const sorted = filtered.sort((a, b) => {
      if (state.sort === 'holders') {
        return (b.holders || 0) - (a.holders || 0);
      }
      if (state.sort === 'growth') {
        return (b.priceChange5m || 0) - (a.priceChange5m || 0);
      }
      
      const aTime = a.exactAge || a.pairCreatedAt;
      const bTime = b.exactAge || b.pairCreatedAt;
      
      if (!aTime && !bTime) return 0;
      if (!aTime) return 1;
      if (!bTime) return -1;
      return bTime - aTime;
    });
    
    state.lastFilters = currentFilters;
    state.filteredTokensCache = sorted;
    
    return sorted;
  };
  
  // ================== VIRTUAL SCROLL ==================
  const initVirtualScroll = () => {
    const grid = getElement('tokenGrid');
    if (!grid) return;
    
    state.virtualScroll.container = grid;
    
    if (!state.virtualScroll.cardHeightMeasured) {
      measureCardHeight();
    }
    
    const handleScroll = throttle(() => {
      if (!state.isMounted) return;
      
      const newScrollTop = grid.scrollTop;
      
      if (Math.abs(newScrollTop - state.virtualScroll.scrollTop) > state.virtualScroll.itemHeight) {
        state.virtualScroll.scrollTop = newScrollTop;
        
        if (state.virtualScroll.renderTimer) {
          cancelAnimationFrame(state.virtualScroll.renderTimer);
        }
        
        state.virtualScroll.renderTimer = requestAnimationFrame(() => {
          if (state.isMounted) {
            renderTokensVirtual(state.filteredTokens.slice(0, state.displayedTokens));
          }
        });
      }
      
      if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 200) {
        if (!state.isLoadingMore && state.displayedTokens < state.filteredTokens.length) {
          loadMoreTokens();
        }
      }
    }, 100);
    
    grid.addEventListener('scroll', handleScroll);
    
    return () => grid.removeEventListener('scroll', handleScroll);
  };
  
  // ================== RESIZE HANDLER ==================
  const handleResize = debounce(() => {
    if (state.isMounted) {
      state.virtualScroll.cardHeightMeasured = false;
      measureCardHeight();
      renderTokensVirtual(state.filteredTokens.slice(0, state.displayedTokens));
    }
  }, 250);
  
  // ================== VIRTUAL RENDER ==================
  const renderTokensVirtual = (allTokens) => {
    const grid = getElement('tokenGrid');
    if (!grid || !state.isMounted) return;
    
    if (!allTokens?.length) {
      grid.innerHTML = '<div class="empty">✨ NO TOKENS FOUND</div>';
      return;
    }
    
    const startTime = performance.now();
    
    const { scrollTop, itemHeight } = state.virtualScroll;
    const containerHeight = grid.clientHeight;
    
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - CONFIG.VIRTUAL_SCROLL_BUFFER);
    const endIndex = Math.min(allTokens.length, 
                              Math.ceil((scrollTop + containerHeight) / itemHeight) + 
                              CONFIG.VIRTUAL_SCROLL_BUFFER);
    
    const visibleTokens = allTokens.slice(startIndex, endIndex);
    
    const fragment = document.createDocumentFragment();
    
    if (startIndex > 0) {
      const topPlaceholder = document.createElement('div');
      topPlaceholder.style.height = `${startIndex * itemHeight}px`;
      topPlaceholder.style.width = '100%';
      fragment.appendChild(topPlaceholder);
    }
    
    visibleTokens.forEach(t => {
      if (t) fragment.appendChild(createTokenCard(t));
    });
    
    if (endIndex < allTokens.length) {
      const bottomPlaceholder = document.createElement('div');
      bottomPlaceholder.style.height = `${(allTokens.length - endIndex) * itemHeight}px`;
      bottomPlaceholder.style.width = '100%';
      fragment.appendChild(bottomPlaceholder);
    }
    
    grid.innerHTML = '';
    grid.appendChild(fragment);
    
    state.metrics.renderTime = performance.now() - startTime;
  };
  
  // ================== CREATE TOKEN CARD ==================
  const createTokenCard = (t) => {
    let ageValue = null;
    let ageSource = 'dex';
    let ageIsEstimate = true;
    
    if (t.exactAge) {
      const age = calculateAgeMinutes(t.exactAge);
      if (age !== null) {
        ageValue = age;
        ageSource = t.ageSource || 'goplus';
        ageIsEstimate = false;
      }
    } else if (t.ageMinutes != null) {
      ageValue = t.ageMinutes;
      ageSource = 'dex';
      ageIsEstimate = true;
    }
    
    const safeSymbol = escapeHtml(t.symbol);
    const safeAddress = escapeHtml(t.address || '');
    const safeAddressAttr = escapeAttribute(t.address || '');
    const platform = String(t.platform || '').toLowerCase();
    const safeDexUrl = escapeUrl(t.url);
    
    const ageDisplay = ageValue ? formatAge(ageValue) + (ageIsEstimate ? ' (est)' : '') : '?';
    const ageClass = ageSource === 'goplus' ? 'source-goplus' : 'source-estimate';
    
    let holdersDisplay = '?';
    let holdersClass = 'source-estimate';
    let holdersTooltip = 'Estimated holders count';
    let confidenceIndicator = '';
    
    if (t.holders !== undefined && t.holders !== null && !isNaN(t.holders)) {
      holdersDisplay = formatNumber(t.holders);
      if (t.holdersIsEstimate) {
        holdersClass = 'source-estimate';
        holdersTooltip = `Estimated based on top ${t.holdersRawCount || 20} holders`;
        
        if (t.holdersConfidence === 'low') {
          confidenceIndicator = ' ⚠️';
          holdersTooltip += ' - Low confidence';
        } else if (t.holdersConfidence === 'medium') {
          confidenceIndicator = ' 📊';
          holdersTooltip += ' - Medium confidence';
        }
      } else {
        holdersClass = 'source-helius';
        holdersTooltip = t.holders === 0 ? 'No holders found' : 'Exact holders count';
      }
    }
    
    let topHolderDisplay = '';
    if (t.topHolder && !isNaN(t.topHolder) && t.topHolder > 0) {
      const value = Number(t.topHolder).toFixed(1);
      let riskClass = 'risk-low';
      if (t.topHolder > 20) riskClass = 'risk-high';
      else if (t.topHolder > 10) riskClass = 'risk-medium';
      
      topHolderDisplay = `<span class="risk-badge ${riskClass}">top ${escapeHtml(value)}%</span>`;
    }
    
    const card = document.createElement('div');
    card.className = 'token-card';
    card.setAttribute('data-address', safeAddressAttr);
    
    card.innerHTML = `
      <div class="token-header">
        <div class="token-symbol">${safeSymbol}</div>
        <div class="token-tags">
          ${platform.includes('pump') ? '<span class="tag tag-pump">PUMP</span>' : ''}
          ${platform.includes('raydium') ? '<span class="tag tag-raydium">RAY</span>' : ''}
        </div>
      </div>
      <div class="token-info">
        <div class="info-row">
          <span class="info-label">⏱️ Age <span class="source-badge ${ageClass}">${escapeHtml(ageSource)}</span></span>
          <span class="info-value">${escapeHtml(ageDisplay)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">👥 Holders <span class="source-badge ${holdersClass}" title="${sanitizeForTooltip(holdersTooltip)}">${t.holdersIsEstimate ? 'est' : 'exact'}${escapeHtml(confidenceIndicator)}</span></span>
          <span class="info-value">${escapeHtml(holdersDisplay)} ${topHolderDisplay}</span>
        </div>
        <div class="info-row">
          <span class="info-label">💰 MC</span>
          <span class="info-value">$${escapeHtml(formatNumber(t.fdv))}</span>
        </div>
        <div class="info-row">
          <span class="info-label">💧 Liquidity</span>
          <span class="info-value">$${escapeHtml(formatNumber(t.liquidity))}</span>
        </div>
        <div class="info-row">
          <span class="info-label">📈 5m Change</span>
          <span class="info-value" style="color: ${t.priceChange5m > 0 ? '#00FF9D' : '#FF4D4D'}">
            ${t.priceChange5m > 0 ? '+' : ''}${((t.priceChange5m || 0) * 100).toFixed(1)}%
          </span>
        </div>
      </div>
      <div class="token-ca" data-address="${safeAddressAttr}" title="Click to copy address">
        📋 ${safeAddress.slice(0, 8)}...${safeAddress.slice(-6)}
      </div>
      <div class="token-actions">
        <button class="action-btn analyze-btn" data-address="${safeAddressAttr}">ANALYZE</button>
        ${safeDexUrl !== '#' ? 
          `<button class="action-btn dex-btn" data-url="${escapeAttribute(safeDexUrl)}">DEX</button>` : 
          '<button class="action-btn dex-btn" disabled>DEX</button>'}
      </div>
    `;
    
    return card;
  };
  
  // ================== LOAD MORE TOKENS ==================
  const loadMoreTokens = throttle(() => {
    if (state.isRefreshing || state.isLoadingMore) return;
    if (!state.isMounted) return;
    if (state.displayedTokens >= state.filteredTokens.length) return;
    
    state.isLoadingMore = true;
    
    requestAnimationFrame(() => {
      try {
        state.displayedTokens = Math.min(
          state.displayedTokens + CONFIG.TOKENS_PER_PAGE,
          state.filteredTokens.length
        );
        renderTokensVirtual(state.filteredTokens.slice(0, state.displayedTokens));
      } finally {
        state.isLoadingMore = false;
      }
    });
  }, 200);
  
  // ================== EVENT DELEGATION ==================
  const setupEventDelegation = () => {
    const grid = getElement('tokenGrid');
    if (!grid) return;
    
    if (state.clickHandler) {
      grid.removeEventListener('click', state.clickHandler);
    }
    
    state.clickHandler = (e) => {
      const ca = e.target.closest('.token-ca');
      if (ca) {
        const addr = ca.getAttribute('data-address');
        if (addr) copyAddress(addr);
        e.preventDefault();
        return;
      }
      
      const analyze = e.target.closest('.analyze-btn');
      if (analyze) {
        const addr = analyze.getAttribute('data-address');
        if (addr) {
          window.location.href = `https://www.cryptobros.pro/tribunal.html?address=${encodeURIComponent(addr)}`;
        }
        e.preventDefault();
        return;
      }
      
      const dex = e.target.closest('.dex-btn');
      if (dex && !dex.disabled) {
        const url = dex.getAttribute('data-url');
        if (url && url !== '#') {
          window.open(url, '_blank', 'noopener');
        }
        e.preventDefault();
      }
    };
    
    grid.addEventListener('click', state.clickHandler);
  };
  
  // ================== BACK BUTTON ==================
  const initBackButton = () => {
    const btn = getElement('backBtn');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (document.referrer && document.referrer.includes(window.location.host)) {
          window.history.back();
        } else {
          window.location.href = 'https://www.cryptobros.pro/';
        }
      });
    }
  };
  
  // ================== THEME ==================
  const initTheme = () => {
    const toggle = getElement('themeToggle');
    if (!toggle) return;
    
    const saved = safeLocalStorage.getItem('freshTheme');
    if (saved === 'day') {
      document.body.classList.add('day-mode');
      toggle.innerHTML = '☀️';
    }
    
    toggle.addEventListener('click', () => {
      document.body.classList.toggle('day-mode');
      const isDay = document.body.classList.contains('day-mode');
      toggle.innerHTML = isDay ? '☀️' : '🌙';
      safeLocalStorage.setItem('freshTheme', isDay ? 'day' : 'night');
    });
  };
  
  // ================== FILTERS ==================
  const initFilters = () => {
    const time = getElement('timeFilter');
    const liq = getElement('liqFilter');
    const platform = getElement('platformFilter');
    const sort = getElement('sortFilter');
    
    if (time) state.timeFilter = time.value;
    if (liq) state.liqFilter = liq.value;
    if (platform) state.platformFilter = platform.value;
    if (sort) state.sort = sort.value;
    
    const handleChange = debounce(() => {
      if (!state.tokens.length) return;
      
      state.filteredTokensCache = null;
      state.filteredTokens = getFilteredTokens();
      state.displayedTokens = CONFIG.TOKENS_PER_PAGE;
      
      if (state.virtualScroll.container) {
        state.virtualScroll.container.scrollTop = 0;
        state.virtualScroll.scrollTop = 0;
      }
      
      renderTokensVirtual(state.filteredTokens.slice(0, state.displayedTokens));
    }, 300);
    
    if (time) time.addEventListener('change', (e) => { state.timeFilter = e.target.value; handleChange(); });
    if (liq) liq.addEventListener('change', (e) => { state.liqFilter = e.target.value; handleChange(); });
    if (platform) platform.addEventListener('change', (e) => { state.platformFilter = e.target.value; handleChange(); });
    if (sort) sort.addEventListener('change', (e) => { state.sort = e.target.value; handleChange(); });
  };
  
  // ================== COUNTDOWN ==================
  const startCountdown = () => {
    if (state.intervalId) clearInterval(state.intervalId);
    
    state.intervalId = setInterval(() => {
      const timer = getElement('updateTimer');
      if (!timer || !state.isMounted) return;
      
      state.countdown--;
      timer.textContent = `⏱️ ${state.countdown} SEC`;
      
      if (state.countdown <= 0) {
        state.countdown = CONFIG.REFRESH_INTERVAL;
        if (!document.hidden && !state.isRefreshing && !state.isLoading) {
          loadTokens();
        }
      }
    }, 1000);
  };
  
  // ================== FIXED CLEANUP ==================
  const cleanup = () => {
    console.log('🧹 Cleaning up Fresh Pumps...');
    state.isMounted = false;
    
    abortAllRequests();
    clearQueueAndReject();
    
    // Clear rate limit
    state.rateLimit.calls = [];
    
    // Proper timer cleanup
    [state.wsPingInterval, state.wsReconnectTimer, state.intervalId, 
     state.cleanupIntervalId, state.memoryMonitorId].forEach(id => {
      if (id) {
        if (typeof id === 'number') {
          clearInterval(id);
        } else {
          clearTimeout(id);
        }
      }
    });
    
    if (state.ws) {
      try {
        state.ws.onclose = null;
        state.ws.close(1000, 'Cleanup');
      } catch (e) {}
      state.ws = null;
    }
    
    if (state.virtualScroll.renderTimer) {
      cancelAnimationFrame(state.virtualScroll.renderTimer);
    }
    
    if (state.clickHandler) {
      getElement('tokenGrid')?.removeEventListener('click', state.clickHandler);
    }
    
    if (state.resizeHandler) {
      window.removeEventListener('resize', state.resizeHandler);
    }
    
    state.ageCache.clear();
    state.holdersCache.clear();
    escapeCache.clear();
    state.tokens = [];
    state.filteredTokens = [];
  };
  
  // ================== ERROR HANDLERS ==================
  const setupErrorHandlers = () => {
    window.addEventListener('unhandledrejection', (event) => {
      if (!event.reason?.message?.includes('unmounted')) {
        console.error('Unhandled rejection:', event.reason);
        showToast('An error occurred', 'error');
      }
    });
    
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      showToast('An error occurred', 'error');
    });
  };
  
  // ================== INIT ==================
  const init = async () => {
    console.log(`🚀 Fresh Pumps v${VERSION} initializing...`);
    
    state.isMounted = true;
    
    setupErrorHandlers();
    initBackButton();
    initTheme();
    initFilters();
    setupEventDelegation();
    
    if (document.readyState === 'complete') {
      initVirtualScroll();
    } else {
      window.addEventListener('load', () => state.isMounted && initVirtualScroll());
    }
    
    // Add resize handler
    state.resizeHandler = handleResize;
    window.addEventListener('resize', state.resizeHandler);
    
    await loadApiKeys();
    loadTokens();
    startCountdown();
    initMemoryMonitoring();
    
    const refreshBtn = getElement('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', throttle(() => {
        if (state.isRefreshing || state.isLoading) {
          showToast('Already loading...', 'warning');
          return;
        }
        state.countdown = CONFIG.REFRESH_INTERVAL;
        loadTokens();
      }, 1000));
    }
    
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !state.isRefreshing && !state.isLoading && !state.tokens.length) {
        loadTokens();
      }
    });
    
    state.cleanupIntervalId = setInterval(() => cleanupCache(), CONFIG.CLEANUP_INTERVAL);
    window.addEventListener('beforeunload', cleanup);
    
    console.log('✅ Fresh Pumps initialized successfully');
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
