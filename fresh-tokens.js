(function() {
  "use strict";
  
  // ================== CONFIG ==================
  const CONFIG = {
    API_PROXY: 'https://cryptobros-proxy.workers.dev/?url=', // CHANGE THIS
    FALLBACK_PROXY: 'https://api.allorigins.win/raw?url=',
    DEXSCREENER_API: 'https://api.dexscreener.com/latest/dex/search',
    REFRESH_INTERVAL: 60,
    REQUEST_TIMEOUT: 10000,
    BATCH_SIZE: 3,
    MAX_RETRIES: 2,
    MAX_PROXY_RETRIES: 5,
    CACHE_MAX_AGE: 5 * 60 * 1000,
    TOKENS_PER_PAGE: 20,
    MAX_HOLDERS_ESTIMATE: 5000,
    CLEANUP_INTERVAL: 5 * 60 * 1000
  };
  
  // ================== STATE ==================
  const state = {
    timeFilter: 'all',
    liqFilter: 'all',
    platformFilter: 'all',
    sort: 'newest',
    countdown: CONFIG.REFRESH_INTERVAL,
    intervalId: null,
    tokens: [],
    filteredTokens: [],
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
    renderScheduled: false,
    loadMoreBtnInstance: null,
    proxyIndex: 0,
    proxyFailures: 0,
    isMounted: true,
    nextControllerId: 0
  };
  
  // ================== SECURE ESCAPE FUNCTIONS ==================
  const escapeHtml = (text) => {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
  
  const escapeAttribute = (text) => {
    if (text === null || text === undefined) return '';
    return String(text).replace(/[&<>"'\/]/g, function(match) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;'
      }[match];
    });
  };
  
  const escapeUrl = (url) => {
    if (!url || url === '#') return '#';
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '#';
      }
      return parsed.toString();
    } catch {
      return '#';
    }
  };
  
  // ================== UTILITY FUNCTIONS ==================
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (state.isMounted) {
          func.apply(this, args);
        }
      }, wait);
    };
  };
  
  const throttle = (func, limit) => {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        if (state.isMounted) {
          func.apply(this, args);
        }
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
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
    if (minutes < 0) return 'just now';
    if (minutes < 1) return '<1m';
    if (minutes < 60) return Math.round(minutes) + 'm';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };
  
  const getElement = (id) => document.getElementById(id);
  
  const isValidSolanaAddress = (address) => {
    if (!address || typeof address !== 'string') return false;
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  };
  
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  const cleanupCache = () => {
    if (!state.isMounted) return;
    const now = Date.now();
    if (now - state.lastCacheCleanup < CONFIG.CLEANUP_INTERVAL) return;
    
    for (const [key, value] of state.ageCache) {
      if (now - value.timestamp > CONFIG.CACHE_MAX_AGE) {
        state.ageCache.delete(key);
      }
    }
    
    for (const [key, value] of state.holdersCache) {
      if (now - value.timestamp > CONFIG.CACHE_MAX_AGE) {
        state.holdersCache.delete(key);
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
      state.abortControllers.delete(id);
    });
    
    return controller;
  };
  
  const abortAllRequests = () => {
    state.abortControllers.forEach((controller, id) => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
      state.abortControllers.delete(id);
    });
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
  
  // ================== FIXED LOAD API KEYS ==================
  async function loadApiKeys() {
    console.log('Loading API keys...');
    
    // TRY LOCALSTORAGE FIRST
    try {
      const stored = localStorage.getItem('api_keys');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.timestamp && (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000)) {
          if (parsed.keys && parsed.keys.GOPLUS_API) {
            console.log('✅ API keys loaded from localStorage');
            state.apiKeys = parsed.keys;
            return parsed.keys;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load keys from localStorage');
    }
    
    // TRY TO LOAD FROM SECURE ENDPOINT
    try {
      const response = await fetch('/api/config', {
        cache: 'no-cache',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.keys && data.keys.GOPLUS_API) {
          console.log('✅ API keys loaded from server');
          
          // Save to localStorage
          try {
            localStorage.setItem('api_keys', JSON.stringify({
              keys: data.keys,
              timestamp: Date.now()
            }));
          } catch (e) {}
          
          state.apiKeys = data.keys;
          return data.keys;
        }
      }
    } catch (e) {
      console.warn('Failed to load keys from server:', e.message);
    }
    
    // PRODUCTION: NO FALLBACK KEYS - show error
    console.error('❌ Could not load API keys');
    showToast('Failed to load API keys. Please refresh.', 'error');
    return null;
  }
  
  // ================== FETCH WITH TIMEOUT AND RETRY ==================
  const fetchWithTimeout = async (url, options = {}, retries = CONFIG.MAX_RETRIES) => {
    if (!state.isMounted) throw new Error('Component unmounted');
    
    const controller = createAbortController();
    let timeoutId = null;
    
    try {
      for (let i = 0; i < retries; i++) {
        if (!state.isMounted) throw new Error('Component unmounted');
        
        if (timeoutId) clearTimeout(timeoutId);
        
        timeoutId = setTimeout(() => {
          if (!controller.signal.aborted) {
            controller.abort();
          }
        }, CONFIG.REQUEST_TIMEOUT);
        
        try {
          const response = await fetch(url, { 
            ...options, 
            signal: controller.signal 
          });
          
          clearTimeout(timeoutId);
          
          if (!state.isMounted) throw new Error('Component unmounted');
          
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After')) || 5;
            showToast(`Rate limited, retrying in ${retryAfter}s`, 'warning');
            await sleep(retryAfter * 1000);
            continue;
          }
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          return response;
          
        } catch (error) {
          clearTimeout(timeoutId);
          
          if (error.name === 'AbortError') {
            console.warn('Request timeout:', url);
            if (i === retries - 1) {
              throw new Error('Request timeout');
            }
          } else {
            if (i === retries - 1) {
              throw error;
            }
          }
          
          await sleep(1000 * Math.pow(2, i));
        }
      }
      
      throw new Error('Max retries exceeded');
      
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }
  };
  
  // ================== FIXED FETCH WITH PROXY (NO RECURSION) ==================
  async function fetchWithProxy(url) {
    if (!state.isMounted) throw new Error('Component unmounted');
    
    const proxies = [
      CONFIG.API_PROXY + encodeURIComponent(url),
      CONFIG.FALLBACK_PROXY + encodeURIComponent(url)
    ];
    
    for (let attempt = 0; attempt < CONFIG.MAX_PROXY_RETRIES; attempt++) {
      if (!state.isMounted) throw new Error('Component unmounted');
      
      const startProxy = state.proxyIndex;
      
      for (let i = 0; i < proxies.length; i++) {
        if (!state.isMounted) throw new Error('Component unmounted');
        
        const proxyIndex = (startProxy + i) % proxies.length;
        const proxyUrl = proxies[proxyIndex];
        
        try {
          const controller = createAbortController();
          const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
          
          const response = await fetch(proxyUrl, {
            signal: controller.signal,
            headers: {
              'Origin': window.location.origin,
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
          
          clearTimeout(timeoutId);
          controller.abort();
          
          if (!state.isMounted) throw new Error('Component unmounted');
          
          if (response.status === 403 || response.status === 429) {
            console.warn(`Proxy ${proxyIndex} returned ${response.status}`);
            continue;
          }
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const text = await response.text();
          
          // Check if response is HTML (error page)
          if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
            console.warn(`Proxy ${proxyIndex} returned HTML`);
            continue;
          }
          
          try {
            const data = JSON.parse(text);
            state.proxyIndex = proxyIndex;
            state.proxyFailures = 0;
            return data;
          } catch (e) {
            console.warn(`Proxy ${proxyIndex} returned non-JSON:`, text.substring(0, 100));
            continue;
          }
        } catch (error) {
          console.warn(`Proxy ${proxyIndex} failed:`, error.message);
          state.proxyFailures++;
          
          if (state.proxyFailures > proxies.length * 2) {
            showToast('API proxy issues, please refresh', 'warning');
          }
        }
      }
      
      // Wait before next retry
      await sleep(1000 * Math.pow(2, attempt));
    }
    
    showToast('All proxies failed after multiple retries', 'error');
    throw new Error('All proxies failed');
  }
  
  // ================== FIXED API QUEUE ==================
  const processApiQueue = async () => {
    if (state.processingQueue) return;
    
    state.processingQueue = true;
    
    const processBatch = async () => {
      while (state.apiQueue.length > 0 && state.isMounted) {
        const batch = state.apiQueue.splice(0, CONFIG.BATCH_SIZE);
        
        await Promise.allSettled(batch.map(async ({ fn, resolve, reject, key }) => {
          try {
            const result = await fn();
            if (key) state.pendingRequests.delete(key);
            if (state.isMounted) resolve(result);
          } catch (error) {
            if (key) state.pendingRequests.delete(key);
            if (state.isMounted) reject(error);
          }
        }));
        
        if (state.isMounted) await sleep(300);
      }
    };
    
    await processBatch();
    state.processingQueue = false;
    
    // Check if new items were added while processing
    if (state.apiQueue.length > 0 && state.isMounted) {
      processApiQueue();
    }
  };
  
  const queueApiCall = (fn, key = null) => {
    if (key && state.pendingRequests.has(key)) {
      return state.pendingRequests.get(key);
    }
    
    const promise = new Promise((resolve, reject) => {
      state.apiQueue.push({ fn, resolve, reject, key });
      processApiQueue();
    });
    
    if (key) {
      state.pendingRequests.set(key, promise);
      promise.finally(() => {
        if (state.pendingRequests.get(key) === promise) {
          state.pendingRequests.delete(key);
        }
      });
    }
    
    return promise;
  };
  
  // ================== FETCH TOKEN AGE (GoPlus) ==================
  async function fetchTokenAge(address) {
    if (!isValidSolanaAddress(address) || !state.apiKeys) return null;
    if (!state.isMounted) return null;
    
    const cacheKey = `age_${address}`;
    
    cleanupCache();
    if (state.ageCache.has(cacheKey)) {
      const cached = state.ageCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CONFIG.CACHE_MAX_AGE) {
        return cached.value;
      }
    }
    
    return queueApiCall(async () => {
      try {
        const url = `${state.apiKeys.GOPLUS_API}/solana?contract_addresses=${address}`;
        const response = await fetchWithTimeout(url, {
          headers: {
            'Api-Key': state.apiKeys.GOPLUS_API_KEY
          }
        });
        
        if (!state.isMounted) return null;
        
        const data = await response.json();
        
        if (data.code !== 1) {
          console.warn('GoPlus returned error code:', data.code);
          return null;
        }
        
        const tokenData = data.result?.[address];
        const ts = tokenData?.creation_timestamp;
        
        if (ts && !isNaN(parseInt(ts))) {
          const timestamp = parseInt(ts) * 1000;
          const result = { timestamp, source: 'goplus' };
          
          try {
            state.ageCache.set(cacheKey, {
              value: result,
              timestamp: Date.now()
            });
          } catch (e) {}
          
          return result;
        }
      } catch (e) {
        console.warn('GoPlus error:', e.message);
        if (e.message.includes('429')) {
          showToast('GoPlus rate limit reached', 'warning');
        }
      }
      return null;
    }, cacheKey);
  }
  
  // ================== FETCH TOKEN HOLDERS (Helius) ==================
  async function fetchTokenHolders(address) {
    if (!isValidSolanaAddress(address) || !state.apiKeys) return null;
    if (!state.isMounted) return null;
    
    const cacheKey = `holders_${address}`;
    
    cleanupCache();
    if (state.holdersCache.has(cacheKey)) {
      const cached = state.holdersCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CONFIG.CACHE_MAX_AGE) {
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
        
        const data = await response.json();
        
        if (data.error) {
          console.warn('Helius RPC error:', data.error);
          return { count: 0, topConcentration: 0, isEstimate: true, error: true };
        }
        
        const accounts = data.result?.value || [];
        
        if (!accounts.length) {
          return { count: 0, topConcentration: 0, isEstimate: false };
        }
        
        accounts.sort((a, b) => (b.uiAmount || 0) - (a.uiAmount || 0));
        
        const totalSupply = accounts.reduce((sum, acc) => sum + (acc.uiAmount || 0), 0);
        
        if (totalSupply === 0) {
          return { count: 0, topConcentration: 0, isEstimate: false };
        }
        
        const top10Supply = accounts.slice(0, 10).reduce((sum, acc) => sum + (acc.uiAmount || 0), 0);
        const topConcentration = (top10Supply / totalSupply) * 100;
        
        let estimatedHolders = accounts.length;
        let confidence = 'high';
        
        if (accounts.length === 20) {
          const top20Sum = accounts.reduce((sum, acc) => sum + (acc.uiAmount || 0), 0);
          const top20Percentage = (top20Sum / totalSupply) * 100;
          
          if (top20Percentage < 50) {
            // Widely distributed - use log scale
            const distributionFactor = (100 - top20Percentage) / 50;
            estimatedHolders = Math.min(
              Math.round(20 + (totalSupply - top20Sum) / (top20Sum / 20) * 2 * distributionFactor),
              CONFIG.MAX_HOLDERS_ESTIMATE
            );
            confidence = 'low';
          } else if (top20Percentage < 80) {
            // Moderately distributed
            const distributionFactor = (100 - top20Percentage) / 20;
            estimatedHolders = Math.min(
              Math.round(20 + (totalSupply - top20Sum) / (top20Sum / 20) * 1.2 * distributionFactor),
              CONFIG.MAX_HOLDERS_ESTIMATE
            );
            confidence = 'medium';
          } else {
            // Highly concentrated
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
        
        try {
          state.holdersCache.set(cacheKey, {
            value: result,
            timestamp: Date.now()
          });
        } catch (e) {}
        
        return result;
        
      } catch (e) {
        console.warn('Helius error:', e.message);
        return { count: 0, topConcentration: 0, isEstimate: true, confidence: 'low' };
      }
    }, cacheKey);
  }
  
  // ================== FIXED DEXSCREENER API ==================
  const fetchNewTokens = async () => {
    if (!state.isMounted) return [];
    
    const controller = createAbortController();
    
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
        if (result.status === 'fulfilled' && result.value.pairs) {
          allPairs.push(...result.value.pairs);
        }
      });
      
      const uniquePairs = new Map();
      
      allPairs
        .filter(p => p.chainId === 'solana')
        .forEach(p => {
          if (p.baseToken?.address && !uniquePairs.has(p.baseToken.address)) {
            uniquePairs.set(p.baseToken.address, p);
          }
        });
      
      const sortedPairs = Array.from(uniquePairs.values())
        .sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
        .slice(0, 100);
      
      return sortedPairs.map(p => ({
        address: p.baseToken?.address,
        symbol: String(p.baseToken?.symbol || '???').substring(0, 20),
        pairCreatedAt: p.pairCreatedAt,
        liquidity: p.liquidity?.usd || 0,
        priceChange5m: p.priceChange?.m5 || 0,
        fdv: p.fdv || 0,
        platform: String(p.dexId || 'unknown').toLowerCase(),
        url: p.url || ''
      }))
      .filter(t => t.address && isValidSolanaAddress(t.address));
      
    } catch (error) {
      console.error('DexScreener error:', error);
      showToast('Failed to fetch tokens', 'error');
      return [];
    } finally {
      controller.abort();
    }
  };
  
  // ================== LOAD TOKENS ==================
  const loadTokens = async () => {
    if (state.isRefreshing || state.isLoading) return;
    if (!state.isMounted) return;
    
    if (!state.apiKeys) {
      state.isLoading = true;
      const keys = await loadApiKeys();
      state.isLoading = false;
      
      if (!keys) {
        const grid = getElement('tokenGrid');
        if (grid) {
          grid.innerHTML = '<div class="empty error-message">❌ Failed to load API keys. Please refresh.</div>';
        }
        return;
      }
    }
    
    state.isRefreshing = true;
    abortAllRequests();
    
    const grid = getElement('tokenGrid');
    const refreshBtn = getElement('refreshBtn');
    const loadMoreBtn = document.querySelector('.load-more-btn');
    
    if (refreshBtn) refreshBtn.disabled = true;
    if (loadMoreBtn) loadMoreBtn.disabled = true;
    
    try {
      if (grid) {
        grid.innerHTML = '<div class="loader">LOADING FRESH TOKENS...</div>';
      }
      
      const tokens = await fetchNewTokens();
      
      if (!state.isMounted) return;
      
      if (!tokens.length) {
        grid.innerHTML = '<div class="empty">✨ NO TOKENS FOUND</div>';
        return;
      }
      
      const enriched = [];
      
      for (let i = 0; i < tokens.length; i += CONFIG.BATCH_SIZE) {
        if (!state.isMounted) return;
        
        const batch = tokens.slice(i, i + CONFIG.BATCH_SIZE);
        
        if (grid && !state.renderScheduled) {
          grid.innerHTML = `<div class="loader">PROCESSING ${Math.min(i + CONFIG.BATCH_SIZE, tokens.length)}/${tokens.length} TOKENS...</div>`;
        }
        
        const batchPromises = batch.map(async (token) => {
          try {
            const [ageResult, holdersResult] = await Promise.allSettled([
              fetchTokenAge(token.address),
              fetchTokenHolders(token.address)
            ]);
            
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
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value) {
            enriched.push(r.value);
          }
        });
      }
      
      if (!state.isMounted) return;
      
      state.tokens = enriched;
      state.displayedTokens = CONFIG.TOKENS_PER_PAGE;
      state.filteredTokens = getFilteredTokens();
      renderTokens(state.filteredTokens.slice(0, state.displayedTokens));
      
      showToast(`Loaded ${enriched.length} tokens`, 'success');
      
    } catch (error) {
      console.error('Failed to load:', error);
      if (grid) {
        grid.innerHTML = '<div class="empty error-message">❌ ERROR LOADING TOKENS</div>';
      }
      showToast('Failed to load tokens', 'error');
    } finally {
      state.isRefreshing = false;
      state.isLoading = false;
      if (refreshBtn) refreshBtn.disabled = false;
      if (loadMoreBtn) loadMoreBtn.disabled = false;
    }
  };
  
  // ================== FILTER ==================
  const getFilteredTokens = () => {
    return state.tokens.filter(t => {
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
        if (t.liquidity < min) return false;
      }
      
      if (state.platformFilter !== 'all') {
        const platform = String(t.platform || '').toLowerCase();
        if (state.platformFilter === 'pump' && !platform.includes('pump')) return false;
        if (state.platformFilter === 'raydium' && !platform.includes('raydium')) return false;
      }
      
      return true;
    }).sort((a, b) => {
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
  };
  
  // ================== LOAD MORE ==================
  const loadMoreTokens = debounce(() => {
    if (state.isRefreshing || state.isLoadingMore) return;
    if (!state.isMounted) return;
    
    if (state.displayedTokens >= state.filteredTokens.length) {
      return;
    }
    
    state.isLoadingMore = true;
    
    const newDisplayCount = Math.min(
      state.displayedTokens + CONFIG.TOKENS_PER_PAGE,
      state.filteredTokens.length
    );
    
    if (newDisplayCount > state.displayedTokens) {
      renderTokens(state.filteredTokens.slice(0, newDisplayCount));
      state.displayedTokens = newDisplayCount;
    }
    
    state.isLoadingMore = false;
  }, 200);
  
  // ================== RENDER ==================
  const renderTokens = (tokensToRender) => {
    const grid = getElement('tokenGrid');
    if (!grid || !state.isMounted) return;
    
    state.renderScheduled = false;
    
    if (!tokensToRender.length) {
      grid.innerHTML = '<div class="empty">✨ NO TOKENS FOUND</div>';
      if (state.loadMoreBtnInstance && state.loadMoreBtnInstance.parentNode) {
        state.loadMoreBtnInstance.remove();
      }
      state.loadMoreBtnInstance = null;
      return;
    }
    
    const fragment = document.createDocumentFragment();
    
    tokensToRender.forEach(t => {
      let ageValue = null;
      let ageSource = 'dex';
      let ageIsEstimate = true;
      
      if (t.exactAge !== null && t.exactAge !== undefined) {
        ageValue = Math.max(0, Math.round((Date.now() - t.exactAge) / 60000));
        ageSource = t.ageSource || 'goplus';
        ageIsEstimate = false;
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
          holdersTooltip = `Estimated based on top ${t.holdersRawCount || 20} holders`;
          
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
        <span class="info-label">👥 Holders <span class="source-badge ${holdersClass}" title="${escapeHtml(holdersTooltip)}">${t.holdersIsEstimate ? 'est' : 'exact'}${confidenceIndicator}</span></span>
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
      
      fragment.appendChild(card);
    });
    
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
  };
  
  // ================== EVENT DELEGATION ==================
  const setupEventDelegation = () => {
    const grid = getElement('tokenGrid');
    if (!grid) return;
    
    grid.addEventListener('click', (e) => {
      const caElement = e.target.closest('.token-ca');
      if (caElement) {
        const address = caElement.getAttribute('data-address');
        if (address) copyAddress(address);
        return;
      }
      
      const analyzeBtn = e.target.closest('.action-btn.analyze-btn');
      if (analyzeBtn) {
        const address = analyzeBtn.getAttribute('data-address');
        if (address) {
          const safeAddress = encodeURIComponent(address);
          window.location.href = `https://www.cryptobros.pro/tribunal.html?address=${safeAddress}`;
        }
        return;
      }
      
      const dexBtn = e.target.closest('.action-btn.dex-btn');
      if (dexBtn && !dexBtn.disabled) {
        const url = dexBtn.getAttribute('data-url');
        if (url && url !== '#') {
          window.open(url, '_blank', 'noopener noreferrer');
        }
      }
    });
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
    
    try {
      const savedTheme = localStorage.getItem('freshTheme');
      if (savedTheme === 'day') {
        document.body.classList.add('day-mode');
        themeToggle.innerHTML = '☀️';
      }
    } catch (e) {
      console.warn('LocalStorage not available');
    }
    
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('day-mode');
      const isDay = document.body.classList.contains('day-mode');
      themeToggle.innerHTML = isDay ? '☀️' : '🌙';
      
      try {
        localStorage.setItem('freshTheme', isDay ? 'day' : 'night');
      } catch (e) {
        console.warn('LocalStorage not available');
      }
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
      state.filteredTokens = getFilteredTokens();
      state.displayedTokens = CONFIG.TOKENS_PER_PAGE;
      state.renderScheduled = true;
      renderTokens(state.filteredTokens.slice(0, state.displayedTokens));
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
        if (!document.hidden && !state.isRefreshing) {
          loadTokens();
        }
      }
    }, 1000);
  };
  
  // ================== INIT ==================
  const init = async () => {
    console.log('🚀 Fresh Pumps initializing...');
    
    initBackButton();
    initTheme();
    initFilters();
    setupEventDelegation();
    
    await loadApiKeys();
    loadTokens();
    startCountdown();
    
    const refreshBtn = getElement('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', throttle(() => {
        if (state.isRefreshing) return;
        state.countdown = CONFIG.REFRESH_INTERVAL;
        loadTokens();
      }, 1000));
    }
    
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !state.isRefreshing && state.tokens.length === 0) {
        loadTokens();
      }
    });
    
    window.addEventListener('beforeunload', () => {
      abortAllRequests();
      state.isMounted = false;
      if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = null;
      }
    });
    
    setInterval(cleanupCache, CONFIG.CLEANUP_INTERVAL);
    
    console.log('✅ Fresh Pumps initialized');
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
