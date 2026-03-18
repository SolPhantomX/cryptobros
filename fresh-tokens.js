(function() {
  "use strict";
  
  // ================== CONFIG ==================
  const CONFIG = {
    API_PROXY: 'https://cryptobros-proxy.workers.dev/?url=',
    FALLBACK_PROXY: 'https://api.allorigins.win/raw?url=',
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
    RATE_LIMIT_WINDOW: 1000
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
    loadMoreBtnInstance: null,
    proxyIndex: 0,
    proxyFailures: 0,
    isMounted: true,
    nextControllerId: 0,
    ws: null,
    wsReconnectTimer: null,
    clickHandler: null,
    rateLimit: {
      calls: [],
      queue: []
    },
    metrics: {
      apiCalls: 0,
      cacheHits: 0,
      errors: 0,
      renderTime: 0,
      lastMemoryWarning: 0
    },
    virtualScroll: {
      container: null,
      itemHeight: 100,
      visibleItems: 0,
      scrollTop: 0,
      renderTimer: null
    }
  };
  
  // ================== SECURE ESCAPE FUNCTIONS ==================
  const escapeHtml = (text) => {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
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
  
  const escapeTooltip = (text) => {
    if (!text) return '';
    return String(text)
      .replace(/[&<>"'\n\r\t]/g, (match) => {
        const map = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
          '\n': '&#10;',
          '\r': '&#13;',
          '\t': '&#9;'
        };
        return map[match];
      });
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
    return (!isNaN(num) && num > 0 && num < now + 86400000 && num > now - 31536000000) ? num : null;
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
    if (minutes < 1) return '<1m';
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
  
  const sleep = (ms) => new Promise(resolve => {
    const timeout = setTimeout(resolve, ms);
    return () => clearTimeout(timeout);
  });
  
  const generateHash = (obj) => {
    try {
      return btoa(JSON.stringify(obj)).slice(0, 32);
    } catch {
      return Date.now().toString();
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
          continue;
        }
        
        if (response.status >= 500 && i < retries - 1) {
          const delay = Math.min(baseDelay * Math.pow(2, i) + Math.random() * 1000, maxDelay);
          await sleep(delay);
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
      return existing.catch(err => {
        state.pendingRequests.delete(key);
        throw err;
      });
    }
    
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
  const processApiQueue = async () => {
    if (state.processingQueue || !state.isMounted) return;
    
    state.processingQueue = true;
    
    try {
      while (state.apiQueue.length > 0 && state.isMounted) {
        const waitTime = checkRateLimit();
        if (waitTime > 0) {
          await sleep(waitTime);
          continue;
        }
        
        const batch = state.apiQueue.splice(0, CONFIG.BATCH_SIZE);
        
        const results = await Promise.allSettled(batch.map(async ({ fn, resolve, reject, key, timeout }) => {
          clearTimeout(timeout);
          
          try {
            if (!state.isMounted) {
              reject(new Error('Component unmounted'));
              return;
            }
            
            const result = await fn();
            
            if (!state.isMounted) {
              reject(new Error('Component unmounted'));
              return;
            }
            
            if (key) state.pendingRequests.delete(key);
            resolve(result);
          } catch (error) {
            if (key) state.pendingRequests.delete(key);
            state.metrics.errors++;
            reject(error);
          }
        }));
        
        if (state.isMounted && state.apiQueue.length > 0) {
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
  
  // ================== ENCRYPTED API KEYS STORAGE ==================
  const encryptKeys = (keys) => {
    try {
      const encoded = btoa(JSON.stringify(keys));
      const salted = encoded + '.' + Date.now().toString(36);
      return salted.split('').reverse().join('');
    } catch {
      return null;
    }
  };
  
  const decryptKeys = (encrypted) => {
    try {
      if (!encrypted) return null;
      const reversed = encrypted.split('').reverse().join('');
      const [encoded] = reversed.split('.');
      return JSON.parse(atob(encoded));
    } catch {
      return null;
    }
  };
  
  // ================== LOAD API KEYS ==================
  async function loadApiKeys() {
    console.log('Loading API keys from backend...');
    
    const urls = [
      '/api/config',
      'https://raw.githubusercontent.com/SolPhantomX/cryptobros-backend/main/config.html',
      'https://solphantomx.github.io/cryptobros-backend/config.html'
    ];
    
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          cache: 'no-cache',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (response.ok) {
          const html = await response.text();
          
          const match = html.match(/API_KEYS\s*=\s*(\{[\s\S]*?\});/);
          if (match) {
            let jsonStr = match[1]
              .replace(/\/\/.*$/gm, '')
              .replace(/\/\*[\s\S]*?\*\//g, '');
            
            const keys = JSON.parse(jsonStr);
            
            if (keys && keys.GOPLUS_API && keys.HELIUS_RPC) {
              console.log(`✅ API keys loaded from ${url}`);
              
              const encrypted = encryptKeys(keys);
              if (encrypted) {
                safeLocalStorage.setItem('api_keys_enc', encrypted);
              }
              
              state.apiKeys = keys;
              return keys;
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to load from ${url}:`, e.message);
      }
    }
    
    const stored = safeLocalStorage.getItem('api_keys_enc');
    if (stored) {
      try {
        const keys = decryptKeys(stored);
        if (keys && keys.GOPLUS_API && keys.HELIUS_RPC) {
          console.log('✅ API keys loaded from encrypted localStorage');
          state.apiKeys = keys;
          return keys;
        }
      } catch (e) {
        console.warn('Failed to decrypt stored keys:', e.message);
      }
    }
    
    console.error('❌ Could not load API keys from any source');
    showToast('Failed to load API keys. Please refresh.', 'error');
    return null;
  }
  
  // ================== FETCH TOKEN AGE (GoPlus) ==================
  async function fetchTokenAge(address, retryCount = 0) {
    const MAX_RETRIES = 3;
    
    if (!address || !isValidSolanaAddress(address)) return null;
    if (!state.apiKeys?.GOPLUS_API_KEY) return null;
    if (!state.isMounted) return null;
    
    const cacheKey = `age_${address}`;
    
    if (state.ageCache.has(cacheKey)) {
      const cached = state.ageCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CONFIG.CACHE_MAX_AGE) {
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
          headers: {
            'X-API-Key': state.apiKeys.GOPLUS_API_KEY
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!state.isMounted) return null;
        
        if (response.status === 429) {
          if (retryCount < MAX_RETRIES) {
            const waitTime = 5000 * Math.pow(2, retryCount);
            showToast(`Rate limited, retrying in ${waitTime/1000}s...`, 'warning');
            await sleep(waitTime);
            return fetchTokenAge(address, retryCount + 1);
          }
          showToast('GoPlus rate limit exceeded', 'error');
          return null;
        }
        
        if (!response.ok) {
          console.warn(`GoPlus HTTP error: ${response.status}`);
          return null;
        }
        
        let data;
        try {
          data = await response.json();
        } catch (e) {
          console.warn('Failed to parse GoPlus response:', e);
          return null;
        }
        
        if (data.code === 1 && data.result) {
          const tokenData = data.result;
          
          const creationTime = tokenData.creation_time || 
                             tokenData.create_time || 
                             tokenData.created_at;
          
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
        
        console.warn('GoPlus: No creation time found');
        return null;
        
      } catch (e) {
        console.warn('GoPlus error:', e.message);
        return null;
      }
    }, cacheKey);
  }
  
  // ================== FETCH TOKEN HOLDERS (Helius) ==================
  async function fetchTokenHolders(address, retryCount = 0) {
    const MAX_RETRIES = 3;
    
    if (!address || !isValidSolanaAddress(address)) return null;
    if (!state.apiKeys?.HELIUS_RPC) return null;
    if (!state.isMounted) return null;
    
    const cacheKey = `holders_${address}`;
    
    if (state.holdersCache.has(cacheKey)) {
      const cached = state.holdersCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CONFIG.CACHE_MAX_AGE) {
        state.metrics.cacheHits++;
        return cached.value;
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
            showToast(`Helius rate limited, retrying in ${waitTime/1000}s...`, 'warning');
            await sleep(waitTime);
            return fetchTokenHolders(address, retryCount + 1);
          }
          showToast('Helius rate limit exceeded', 'error');
          return { count: 0, topConcentration: 0, isEstimate: true };
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('Helius returned non-JSON response');
          return { count: 0, topConcentration: 0, isEstimate: true };
        }
        
        let data;
        try {
          data = await response.json();
        } catch (e) {
          console.warn('Failed to parse Helius response:', e);
          return { count: 0, topConcentration: 0, isEstimate: true };
        }
        
        if (data.error) {
          console.warn('Helius RPC error:', data.error);
          return { count: 0, topConcentration: 0, isEstimate: true };
        }
        
        const accounts = data.result?.value || [];
        
        if (!accounts.length) {
          return { count: 0, topConcentration: 0, isEstimate: false };
        }
        
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
          const top20Sum = accounts.reduce((sum, acc) => sum + (acc.uiAmount || 0), 0);
          const top20Percentage = (top20Sum / totalSupply) * 100;
          
          if (top20Percentage < 50) {
            estimatedHolders = Math.min(
              Math.round(20 + (totalSupply - top20Sum) / (top20Sum / 20) * CONFIG.ESTIMATION_MULTIPLIER),
              CONFIG.MAX_HOLDERS_ESTIMATE
            );
            confidence = 'low';
          } else if (top20Percentage < 80) {
            estimatedHolders = Math.min(
              Math.round(20 + (totalSupply - top20Sum) / (top20Sum / 20) * (CONFIG.ESTIMATION_MULTIPLIER / 2)),
              CONFIG.MAX_HOLDERS_ESTIMATE
            );
            confidence = 'medium';
          } else {
            estimatedHolders = 20;
            confidence = 'high';
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
  
  // ================== FIXED WebSocket with cleanup ==================
  function initWebSocket() {
    if (!state.apiKeys?.HELIUS_WS) return;
    
    if (state.wsReconnectTimer) {
      clearTimeout(state.wsReconnectTimer);
      state.wsReconnectTimer = null;
    }
    
    if (state.ws) {
      try {
        state.ws.close(1000, 'Component unmounting');
      } catch (e) {}
      state.ws = null;
    }
    
    try {
      const urlObj = new URL(state.apiKeys.HELIUS_WS);
      if (urlObj.protocol !== 'wss:') {
        console.warn('WebSocket URL must use wss:// protocol, got:', urlObj.protocol);
        return;
      }
    } catch (e) {
      console.warn('Invalid WebSocket URL:', e.message);
      return;
    }
    
    try {
      const ws = new WebSocket(state.apiKeys.HELIUS_WS);
      
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
        }
      }, 5000);
      
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket connected');
        
        const subscribeMsg = {
          jsonrpc: '2.0',
          id: 1,
          method: 'programSubscribe',
          params: [
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            {
              encoding: 'jsonParsed',
              commitment: 'processed'
            }
          ]
        };
        
        ws.send(JSON.stringify(subscribeMsg));
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.method === 'programNotification' && 
              data.params?.result?.value?.account?.data?.parsed?.info) {
            
            const info = data.params.result.value.account.data.parsed.info;
            
            if (info.mint && isValidSolanaAddress(info.mint)) {
              console.log('New token detected:', info.mint);
            }
          }
        } catch (e) {
          console.warn('WebSocket message error:', e);
        }
      };
      
      ws.onerror = (error) => {
        console.warn('WebSocket error:', error);
        clearTimeout(connectionTimeout);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, 'Error occurred');
        }
      };
      
      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket closed:', event.code, event.reason);
        
        if (state.ws === ws) {
          state.ws = null;
        }
        
        if (state.wsReconnectTimer) {
          clearTimeout(state.wsReconnectTimer);
        }
        
        if (state.isMounted && !state.ws && event.code !== 1000) {
          state.wsReconnectTimer = setTimeout(() => {
            if (state.isMounted && !state.ws) {
              initWebSocket();
            }
          }, CONFIG.WS_RECONNECT_DELAY);
        }
      };
      
      state.ws = ws;
      
    } catch (e) {
      console.warn('WebSocket init failed:', e);
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
          
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            console.warn('Proxy returned non-JSON response');
            continue;
          }
          
          const text = await response.text();
          
          if (!text || text.trim() === '') {
            console.warn('Empty response from proxy');
            continue;
          }
          
          if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
            console.warn('Proxy returned HTML error page');
            continue;
          }
          
          try {
            return JSON.parse(text);
          } catch (e) {
            console.warn('Proxy returned invalid JSON');
            continue;
          }
          
        } catch (error) {
          console.warn(`Proxy attempt ${attempt + 1} failed:`, error.message);
        }
      }
      
      await sleep(1000 * Math.pow(2, attempt));
    }
    
    throw new Error('All proxies failed');
  }
  
  // ================== DEXSCREENER API ==================
  const fetchNewTokens = async () => {
    if (!state.isMounted) return [];
    
    try {
      const searchQueries = [
        '?q=created',
        '?q=pump.fun',
        '?q=raydium',
        '?q=new'
      ];
      
      const results = await Promise.allSettled(
        searchQueries.map(q => fetchWithProxy(`${CONFIG.DEXSCREENER_API}${q}`))
      );
      
      if (!state.isMounted) return [];
      
      const allPairs = [];
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && 
            result.value && 
            Array.isArray(result.value.pairs)) {
          allPairs.push(...result.value.pairs);
        }
      });
      
      const uniquePairs = new Map();
      
      allPairs
        .filter(p => p && p.chainId === 'solana')
        .forEach(p => {
          if (p.baseToken?.address && !uniquePairs.has(p.baseToken.address)) {
            uniquePairs.set(p.baseToken.address, p);
          }
        });
      
      const sortedPairs = Array.from(uniquePairs.values())
        .sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
        .slice(0, 100);
      
      return sortedPairs.map(p => ({
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
      showToast('Failed to fetch tokens', 'error');
      return [];
    }
  };
  
  // ================== FIXED loadTokens with proper abort order ==================
  const loadTokens = async () => {
    if (state.isRefreshing || state.isLoading) {
      console.log('Already loading tokens, skipping...');
      return;
    }
    if (!state.isMounted) return;
    
    state.isRefreshing = true;
    state.isLoading = true;
    
    abortAllRequests();
    
    const grid = getElement('tokenGrid');
    const refreshBtn = getElement('refreshBtn');
    const loadMoreBtn = document.querySelector('.load-more-btn');
    
    if (refreshBtn) refreshBtn.disabled = true;
    if (loadMoreBtn) loadMoreBtn.disabled = true;
    
    try {
      if (!state.apiKeys) {
        const keys = await loadApiKeys();
        if (!keys) {
          if (grid && state.isMounted) {
            grid.innerHTML = '<div class="empty error-message">❌ Failed to load API keys. Please refresh.</div>';
          }
          return;
        }
        
        if (state.ws) {
          try {
            state.ws.close();
          } catch (e) {}
          state.ws = null;
        }
        initWebSocket();
      }
      
      if (!state.isMounted) return;
      
      if (grid && state.isMounted) {
        grid.innerHTML = '<div class="loader">LOADING FRESH TOKENS...</div>';
      }
      
      const tokens = await fetchNewTokens();
      
      if (!state.isMounted) return;
      
      if (!tokens.length) {
        if (grid) {
          grid.innerHTML = '<div class="empty">✨ NO TOKENS FOUND</div>';
        }
        return;
      }
      
      const enriched = [];
      
      for (let i = 0; i < tokens.length; i += CONFIG.BATCH_SIZE) {
        if (!state.isMounted) return;
        
        const batch = tokens.slice(i, i + CONFIG.BATCH_SIZE);
        
        if (grid && state.isMounted) {
          grid.innerHTML = `<div class="loader">PROCESSING ${Math.min(i + CONFIG.BATCH_SIZE, tokens.length)}/${tokens.length} TOKENS...</div>`;
        }
        
        const batchPromises = batch.map(async (token) => {
          try {
            const [ageResult, holdersResult] = await Promise.allSettled([
              fetchTokenAge(token.address),
              fetchTokenHolders(token.address)
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
          } catch (e) {
            console.warn('Token enrichment failed:', token.address);
            return token;
          }
        });
        
        const results = await Promise.allSettled(batchPromises);
        if (!state.isMounted) return;
        
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
      
      renderTokensVirtual(state.filteredTokens.slice(0, state.displayedTokens));
      
      showToast(`Loaded ${enriched.length} tokens`, 'success');
      
    } catch (error) {
      console.error('Failed to load:', error);
      if (grid && state.isMounted) {
        grid.innerHTML = '<div class="empty error-message">❌ ERROR LOADING TOKENS</div>';
      }
      showToast('Failed to load tokens', 'error');
      state.metrics.errors++;
    } finally {
      state.isRefreshing = false;
      state.isLoading = false;
      
      if (refreshBtn) refreshBtn.disabled = false;
      if (loadMoreBtn) loadMoreBtn.disabled = false;
    }
  };
  
  // ================== OPTIMIZED FILTER WITH MEMOIZATION ==================
  const getFilteredTokens = () => {
    const currentFilters = {
      time: state.timeFilter,
      liq: state.liqFilter,
      platform: state.platformFilter,
      sort: state.sort
    };
    
    const currentTokensHash = state.lastTokensHash;
    
    const filtersChanged = JSON.stringify(state.lastFilters) !== JSON.stringify(currentFilters);
    const tokensChanged = state.lastTokensHash !== currentTokensHash;
    
    if (!filtersChanged && !tokensChanged && state.filteredTokensCache) {
      return state.filteredTokensCache;
    }
    
    const filtered = state.tokens.filter(t => {
      if (!t) return false;
      
      let age = null;
      
      if (t.exactAge !== null && t.exactAge !== undefined) {
        age = Math.max(0, Math.round((Date.now() - t.exactAge) / 60000));
      } else if (t.ageMinutes !== null && t.ageMinutes !== undefined) {
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
  
  // ================== VIRTUAL SCROLLING ==================
  const initVirtualScroll = () => {
    const grid = getElement('tokenGrid');
    if (!grid) return;
    
    state.virtualScroll.container = grid;
    
    const updateVisibleItems = () => {
      const containerHeight = grid.clientHeight;
      state.virtualScroll.visibleItems = Math.ceil(containerHeight / state.virtualScroll.itemHeight) + 
                                         CONFIG.VIRTUAL_SCROLL_BUFFER * 2;
    };
    
    updateVisibleItems();
    
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
    
    return () => {
      grid.removeEventListener('scroll', handleScroll);
    };
  };
  
  // ================== VIRTUAL RENDER ==================
  const renderTokensVirtual = (allTokens) => {
    const grid = getElement('tokenGrid');
    if (!grid || !state.isMounted) return;
    
    if (!allTokens || !allTokens.length) {
      grid.innerHTML = '<div class="empty">✨ NO TOKENS FOUND</div>';
      if (state.loadMoreBtnInstance && state.loadMoreBtnInstance.parentNode) {
        state.loadMoreBtnInstance.remove();
      }
      state.loadMoreBtnInstance = null;
      return;
    }
    
    const startTime = performance.now();
    
    const { scrollTop, container, itemHeight, visibleItems } = state.virtualScroll;
    
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - CONFIG.VIRTUAL_SCROLL_BUFFER);
    const endIndex = Math.min(allTokens.length, 
                              Math.ceil((scrollTop + container.clientHeight) / itemHeight) + 
                              CONFIG.VIRTUAL_SCROLL_BUFFER);
    
    const visibleTokens = allTokens.slice(startIndex, endIndex);
    
    const topPlaceholder = document.createElement('div');
    topPlaceholder.style.height = `${startIndex * itemHeight}px`;
    topPlaceholder.style.width = '100%';
    
    const bottomPlaceholder = document.createElement('div');
    bottomPlaceholder.style.height = `${(allTokens.length - endIndex) * itemHeight}px`;
    bottomPlaceholder.style.width = '100%';
    
    const fragment = document.createDocumentFragment();
    
    if (startIndex > 0) {
      fragment.appendChild(topPlaceholder);
    }
    
    visibleTokens.forEach(t => {
      if (!t) return;
      
      const card = createTokenCard(t);
      fragment.appendChild(card);
    });
    
    if (endIndex < allTokens.length) {
      fragment.appendChild(bottomPlaceholder);
    }
    
    if (state.displayedTokens < state.filteredTokens.length) {
      if (!state.loadMoreBtnInstance) {
        state.loadMoreBtnInstance = document.createElement('button');
        state.loadMoreBtnInstance.className = 'load-more-btn';
        state.loadMoreBtnInstance.onclick = loadMoreTokens;
      }
      state.loadMoreBtnInstance.textContent = `LOAD MORE (${state.filteredTokens.length - state.displayedTokens} LEFT)`;
      state.loadMoreBtnInstance.disabled = state.isRefreshing || state.isLoadingMore;
      fragment.appendChild(state.loadMoreBtnInstance);
    } else {
      if (state.loadMoreBtnInstance && state.loadMoreBtnInstance.parentNode) {
        state.loadMoreBtnInstance.remove();
      }
      state.loadMoreBtnInstance = null;
    }
    
    grid.innerHTML = '';
    grid.appendChild(fragment);
    
    state.metrics.renderTime = performance.now() - startTime;
    if (state.metrics.renderTime > 100) {
      console.warn(`Slow render: ${state.metrics.renderTime.toFixed(2)}ms`);
    }
  };
  
  // ================== CREATE TOKEN CARD ==================
  const createTokenCard = (t) => {
    let ageValue = null;
    let ageSource = 'dex';
    let ageIsEstimate = true;
    
    if (t.exactAge !== null && t.exactAge !== undefined) {
      const timestamp = Number(t.exactAge);
      if (!isNaN(timestamp) && timestamp > 0) {
        ageValue = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
        ageSource = t.ageSource || 'goplus';
        ageIsEstimate = false;
      }
    } else if (t.ageMinutes != null) {
      ageValue = Math.max(0, t.ageMinutes);
      ageSource = 'dex';
      ageIsEstimate = true;
    }
    
    const safeSymbol = escapeHtml(t.symbol);
    const safeAddress = escapeHtml(t.address || '');
    const safeAddressAttr = escapeAttribute(t.address || '');
    const platform = String(t.platform || '').toLowerCase();
    const safePlatform = escapeHtml(platform);
    const safeDexUrl = escapeUrl(t.url);
    
    let ageDisplay;
    let ageClass = '';
    if (ageIsEstimate) {
      ageDisplay = ageValue ? formatAge(ageValue) + ' (est)' : '? (est)';
      ageClass = 'source-estimate';
    } else {
      ageDisplay = ageValue ? formatAge(ageValue) : '?';
      ageClass = 'source-goplus';
    }
    
    let holdersDisplay = '?';
    let holdersClass = 'source-estimate';
    let holdersTooltip = 'Estimated holders count';
    let confidenceIndicator = '';
    
    if (t.holders !== undefined && t.holders !== null) {
      holdersDisplay = formatNumber(t.holders);
      if (t.holdersIsEstimate) {
        holdersClass = 'source-estimate';
        const rawCount = t.holdersRawCount || 20;
        holdersTooltip = `Estimated based on top ${rawCount} holders`;
        
        if (t.holdersConfidence === 'low') {
          confidenceIndicator = ' ⚠️';
          holdersTooltip += ' - Low confidence estimate';
        } else if (t.holdersConfidence === 'medium') {
          confidenceIndicator = ' 📊';
          holdersTooltip += ' - Medium confidence';
        }
      } else {
        holdersClass = 'source-helius';
        holdersTooltip = t.holders === 0 ? 'No holders found' : 'Exact holders count';
      }
    }
    
    let riskClass = 'risk-low';
    if (t.topHolder && t.topHolder > 20) riskClass = 'risk-high';
    else if (t.topHolder && t.topHolder > 10) riskClass = 'risk-medium';
    
    const topHolderDisplay = t.topHolder 
      ? `<span class="risk-badge ${riskClass}" title="Top 10 holders concentration">top ${escapeHtml(t.topHolder.toFixed(1))}%</span>` 
      : '';
    
    const card = document.createElement('div');
    card.className = 'token-card';
    card.setAttribute('data-address', safeAddressAttr);
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'token-header';
    
    const symbolDiv = document.createElement('div');
    symbolDiv.className = 'token-symbol';
    symbolDiv.textContent = safeSymbol;
    headerDiv.appendChild(symbolDiv);
    
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'token-tags';
    if (safePlatform.includes('pump')) {
      const tag = document.createElement('span');
      tag.className = 'tag tag-pump';
      tag.textContent = 'PUMP';
      tagsDiv.appendChild(tag);
    }
    if (safePlatform.includes('raydium')) {
      const tag = document.createElement('span');
      tag.className = 'tag tag-raydium';
      tag.textContent = 'RAY';
      tagsDiv.appendChild(tag);
    }
    headerDiv.appendChild(tagsDiv);
    card.appendChild(headerDiv);
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'token-info';
    
    const ageRow = document.createElement('div');
    ageRow.className = 'info-row';
    ageRow.innerHTML = `
      <span class="info-label">⏱️ Age <span class="source-badge ${ageClass}">${escapeHtml(ageSource)}</span></span>
      <span class="info-value" ${ageIsEstimate ? 'title="Estimated from DEX data"' : ''}>${escapeHtml(ageDisplay)}</span>
    `;
    infoDiv.appendChild(ageRow);
    
    const holdersRow = document.createElement('div');
    holdersRow.className = 'info-row';
    holdersRow.innerHTML = `
      <span class="info-label">👥 Holders <span class="source-badge ${holdersClass}" title="${escapeTooltip(holdersTooltip)}">${t.holdersIsEstimate ? 'est' : 'exact'}${escapeHtml(confidenceIndicator)}</span></span>
      <span class="info-value">
        ${escapeHtml(holdersDisplay)}
        ${topHolderDisplay}
      </span>
    `;
    infoDiv.appendChild(holdersRow);
    
    const mcRow = document.createElement('div');
    mcRow.className = 'info-row';
    mcRow.innerHTML = `
      <span class="info-label">💰 MC</span>
      <span class="info-value">$${escapeHtml(formatNumber(t.fdv))}</span>
    `;
    infoDiv.appendChild(mcRow);
    
    const liqRow = document.createElement('div');
    liqRow.className = 'info-row';
    liqRow.innerHTML = `
      <span class="info-label">💧 Liquidity</span>
      <span class="info-value">$${escapeHtml(formatNumber(t.liquidity))}</span>
    `;
    infoDiv.appendChild(liqRow);
    
    const changeRow = document.createElement('div');
    changeRow.className = 'info-row';
    const changeColor = t.priceChange5m > 0 ? '#00FF9D' : '#FF4D4D';
    changeRow.innerHTML = `
      <span class="info-label">📈 5m Change</span>
      <span class="info-value" style="color: ${changeColor}">
        ${t.priceChange5m > 0 ? '+' : ''}${((t.priceChange5m || 0) * 100).toFixed(1)}%
      </span>
    `;
    infoDiv.appendChild(changeRow);
    
    card.appendChild(infoDiv);
    
    const caDiv = document.createElement('div');
    caDiv.className = 'token-ca';
    caDiv.setAttribute('data-address', safeAddressAttr);
    caDiv.setAttribute('title', 'Click to copy address');
    caDiv.textContent = `📋 ${safeAddress.slice(0, 8)}...${safeAddress.slice(-6)}`;
    card.appendChild(caDiv);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'token-actions';
    
    const analyzeBtn = document.createElement('button');
    analyzeBtn.className = 'action-btn analyze-btn';
    analyzeBtn.setAttribute('data-address', safeAddressAttr);
    analyzeBtn.textContent = 'ANALYZE';
    actionsDiv.appendChild(analyzeBtn);
    
    const dexBtn = document.createElement('button');
    dexBtn.className = 'action-btn dex-btn';
    if (safeDexUrl && safeDexUrl !== '#') {
      dexBtn.setAttribute('data-url', safeDexUrl);
    } else {
      dexBtn.disabled = true;
    }
    dexBtn.textContent = 'DEX';
    actionsDiv.appendChild(dexBtn);
    
    card.appendChild(actionsDiv);
    
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
        const newDisplayCount = Math.min(
          state.displayedTokens + CONFIG.TOKENS_PER_PAGE,
          state.filteredTokens.length
        );
        
        if (newDisplayCount > state.displayedTokens) {
          state.displayedTokens = newDisplayCount;
          renderTokensVirtual(state.filteredTokens.slice(0, state.displayedTokens));
        }
      } finally {
        state.isLoadingMore = false;
      }
    });
  }, 200);
  
  // ================== FIXED EVENT DELEGATION ==================
  const setupEventDelegation = () => {
    const grid = getElement('tokenGrid');
    if (!grid) return;
    
    if (state.clickHandler) {
      grid.removeEventListener('click', state.clickHandler);
    }
    
    state.clickHandler = (e) => {
      const caElement = e.target.closest('.token-ca');
      if (caElement) {
        const address = caElement.getAttribute('data-address');
        if (address) copyAddress(address);
        e.preventDefault();
        return;
      }
      
      const analyzeBtn = e.target.closest('.action-btn.analyze-btn');
      if (analyzeBtn) {
        const address = analyzeBtn.getAttribute('data-address');
        if (address) {
          const safeAddress = encodeURIComponent(address);
          window.location.href = `https://www.cryptobros.pro/tribunal.html?address=${safeAddress}`;
        }
        e.preventDefault();
        return;
      }
      
      const dexBtn = e.target.closest('.action-btn.dex-btn');
      if (dexBtn && !dexBtn.disabled) {
        const url = dexBtn.getAttribute('data-url');
        if (url && url !== '#') {
          window.open(url, '_blank', 'noopener noreferrer');
        }
        e.preventDefault();
      }
    };
    
    grid.addEventListener('click', state.clickHandler);
  };
  
  // ================== BACK BUTTON ==================
  const initBackButton = () => {
    const backBtn = getElement('backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
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
    const themeToggle = getElement('themeToggle');
    if (!themeToggle) return;
    
    const savedTheme = safeLocalStorage.getItem('freshTheme');
    if (savedTheme === 'day') {
      document.body.classList.add('day-mode');
      themeToggle.innerHTML = '☀️';
    }
    
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('day-mode');
      const isDay = document.body.classList.contains('day-mode');
      themeToggle.innerHTML = isDay ? '☀️' : '🌙';
      
      safeLocalStorage.setItem('freshTheme', isDay ? 'day' : 'night');
    });
  };
  
  // ================== FILTER EVENT LISTENERS ==================
  const initFilters = () => {
    const timeFilter = getElement('timeFilter');
    const liqFilter = getElement('liqFilter');
    const platformFilter = getElement('platformFilter');
    const sortFilter = getElement('sortFilter');
    
    if (timeFilter) state.timeFilter = timeFilter.value;
    if (liqFilter) state.liqFilter = liqFilter.value;
    if (platformFilter) state.platformFilter = platformFilter.value;
    if (sortFilter) state.sort = sortFilter.value;
    
    const handleFilterChange = debounce(() => {
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
    
    if (timeFilter) {
      timeFilter.addEventListener('change', (e) => {
        state.timeFilter = e.target.value;
        handleFilterChange();
      });
    }
    
    if (liqFilter) {
      liqFilter.addEventListener('change', (e) => {
        state.liqFilter = e.target.value;
        handleFilterChange();
      });
    }
    
    if (platformFilter) {
      platformFilter.addEventListener('change', (e) => {
        state.platformFilter = e.target.value;
        handleFilterChange();
      });
    }
    
    if (sortFilter) {
      sortFilter.addEventListener('change', (e) => {
        state.sort = e.target.value;
        handleFilterChange();
      });
    }
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
  
  // ================== CLEANUP FUNCTION ==================
  const cleanup = () => {
    console.log('Cleaning up resources...');
    state.isMounted = false;
    
    abortAllRequests();
    
    state.apiQueue.forEach(req => {
      if (req.timeout) clearTimeout(req.timeout);
    });
    state.apiQueue = [];
    state.pendingRequests.clear();
    
    if (state.ws) {
      try {
        state.ws.close(1000, 'Component unmounting');
      } catch (e) {}
      state.ws = null;
    }
    
    if (state.wsReconnectTimer) {
      clearTimeout(state.wsReconnectTimer);
      state.wsReconnectTimer = null;
    }
    
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
    
    if (state.cleanupIntervalId) {
      clearInterval(state.cleanupIntervalId);
      state.cleanupIntervalId = null;
    }
    
    if (state.memoryMonitorId) {
      clearInterval(state.memoryMonitorId);
      state.memoryMonitorId = null;
    }
    
    if (state.virtualScroll.renderTimer) {
      cancelAnimationFrame(state.virtualScroll.renderTimer);
    }
    
    if (state.clickHandler) {
      const grid = getElement('tokenGrid');
      if (grid) {
        grid.removeEventListener('click', state.clickHandler);
      }
    }
    
    state.ageCache.clear();
    state.holdersCache.clear();
    state.tokens = [];
    state.filteredTokens = [];
    state.filteredTokensCache = null;
    state.loadMoreBtnInstance = null;
    
    console.log('Cleanup complete');
  };
  
  // ================== UNHANDLED REJECTION HANDLER ==================
  const setupErrorHandlers = () => {
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled rejection:', event.reason);
      
      if (event.reason?.name === 'AbortError' || 
          event.reason?.message?.includes('unmounted') ||
          event.reason?.message?.includes('aborted')) {
        return;
      }
      
      showToast('An error occurred', 'error');
    });
    
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      showToast('An error occurred', 'error');
    });
  };
  
  // ================== INIT ==================
  const init = async () => {
    console.log('🚀 Fresh Pumps initializing...');
    
    state.isMounted = true;
    
    setupErrorHandlers();
    initBackButton();
    initTheme();
    initFilters();
    setupEventDelegation();
    
    setTimeout(() => {
      if (state.isMounted) {
        initVirtualScroll();
      }
    }, 100);
    
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
      if (!document.hidden && !state.isRefreshing && !state.isLoading && state.tokens.length === 0) {
        loadTokens();
      }
    });
    
    state.cleanupIntervalId = setInterval(() => cleanupCache(false), CONFIG.CLEANUP_INTERVAL);
    
    window.addEventListener('beforeunload', cleanup);
    
    console.log('✅ Fresh Pumps initialized');
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
