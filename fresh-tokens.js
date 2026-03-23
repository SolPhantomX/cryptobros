// ================== VERSION & CONFIG ==================
const APP_VERSION = '3.0.2';
console.log(`🚀 Fresh Pumps v${APP_VERSION} initializing...`);

const CONFIG = {
  MAX_TOKENS: 100,
  POLL_INTERVAL_MS: 60000,
  REFRESH_COUNTDOWN_SEC: 60,
  DEX_BATCH_SIZE: 20,
  DEX_BATCH_DELAY_MS: 500,
  DEX_RATE_LIMIT_MS: 1000, // 60 req/min = 1 req/sec
  GOPLUS_PUBLIC_URL: 'https://api.gopluslabs.io/api/v1',
  GOPLUS_RATE_LIMIT_MS: 2000,
  HELIUS_RATE_LIMIT_MS: 600,
  AGE_CACHE_TTL_MS: 30 * 60 * 1000,
  NEGATIVE_CACHE_TTL_MS: 5 * 60 * 1000,
  HOLDERS_CACHE_TTL_MS: 5 * 60 * 1000,
  MAX_GOPLUS_DAILY_CALLS: 30000,
  CONFIG_URLS: [
    'https://raw.githubusercontent.com/SolPhantomX/cryptobros-backend/main/config.json',
    'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://raw.githubusercontent.com/SolPhantomX/cryptobros-backend/main/config.json')
  ]
};

// ================== GLOBAL STATE ==================
let allTokens = [];
let filteredTokens = [];
let holdersFilterActive = false;
let currentFilters = { time: 'all', liq: 'all', platform: 'all', sort: 'newest' };
let countdown = CONFIG.REFRESH_COUNTDOWN_SEC;
let countdownInterval = null;
let pollInterval = null;
let isRefreshing = false;
let isMounted = true;
let goPlusDailyCalls = 0;
let lastGoPlusResetDate = null;
let initialized = false;
let pendingTimeouts = [];
let activeControllers = [];

// API keys
let GOPLUS_API_KEY = null;
let HELIUS_RPC_URL = null;

// Caches with negative support
const ageCache = new Map();
const holdersCache = new Map();

// Rate limited queues with size limits
const MAX_QUEUE_SIZE = 500;
let goPlusQueue = [];
let goPlusProcessing = false;
let lastGoPlusCall = 0;
let goPlusTimeoutId = null;

let heliusQueue = [];
let heliusProcessing = false;
let lastHeliusCall = 0;
let heliusTimeoutId = null;

let dexQueue = [];
let dexProcessing = false;
let lastDexCall = 0;
let dexTimeoutId = null;

// ================== UTILITIES ==================
const getElement = (id) => document.getElementById(id);

const escapeHtml = (text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const formatNumber = (num) => {
  if (num == null || isNaN(num) || num === 0) return '—';
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
};

const formatAge = (minutes) => {
  if (minutes == null || isNaN(minutes) || minutes < 0) return '—';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return Math.round(minutes) + 'm';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const scheduleTimeout = (fn, delay) => {
  const id = setTimeout(fn, delay);
  pendingTimeouts.push(id);
  return id;
};

const clearAllTimeouts = () => {
  pendingTimeouts.forEach(id => clearTimeout(id));
  pendingTimeouts = [];
};

const abortAllControllers = () => {
  activeControllers.forEach(controller => controller.abort());
  activeControllers = [];
};

const showToast = (msg, type = 'info') => {
  if (!isMounted) return;
  const container = getElement('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  scheduleTimeout(() => toast.remove(), 3000);
};

const copyAddress = (addr) => {
  if (!addr) return;
  navigator.clipboard.writeText(addr).then(() => showToast('✅ Address copied')).catch(() => showToast('❌ Failed to copy', 'error'));
};

const resetGoPlusDailyCounter = () => {
  const today = new Date().toDateString();
  if (lastGoPlusResetDate !== today) {
    goPlusDailyCalls = 0;
    lastGoPlusResetDate = today;
  }
};

// ================== LOAD API KEYS FROM BACKEND ==================
async function loadApiKeys() {
  for (const url of CONFIG.CONFIG_URLS) {
    const controller = new AbortController();
    activeControllers.push(controller);
    
    try {
      const timeoutId = scheduleTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) continue;
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.warn(`Invalid JSON from ${url}:`, parseError.message);
        continue;
      }
      
      if (data.GOPLUS_API_KEY) GOPLUS_API_KEY = data.GOPLUS_API_KEY;
      if (data.HELIUS_RPC) HELIUS_RPC_URL = data.HELIUS_RPC;
      
      if (GOPLUS_API_KEY && HELIUS_RPC_URL) {
        console.log('✅ API keys loaded from backend');
        return true;
      }
    } catch (e) {
      if (e.name === 'AbortError') console.warn('Timeout loading from:', url);
      else console.warn('Failed to load from:', url, e.message);
    } finally {
      const index = activeControllers.indexOf(controller);
      if (index > -1) activeControllers.splice(index, 1);
    }
  }
  
  console.warn('⚠️ Using public GoPlus endpoint only (no API keys)');
  return false;
}

// ================== RATE LIMITED QUEUES ==================
async function addToGoPlusQueue(task) {
  if (!isMounted) throw new Error('Component unmounted');
  if (goPlusQueue.length >= MAX_QUEUE_SIZE) throw new Error('GoPlus queue overflow');
  
  return new Promise((resolve, reject) => {
    goPlusQueue.push({ task, resolve, reject });
    processGoPlusQueue();
  });
}

async function processGoPlusQueue() {
  if (goPlusProcessing || goPlusQueue.length === 0 || !isMounted) return;
  goPlusProcessing = true;
  
  try {
    while (goPlusQueue.length > 0 && isMounted) {
      resetGoPlusDailyCounter();
      if (goPlusDailyCalls >= CONFIG.MAX_GOPLUS_DAILY_CALLS) {
        showToast('GoPlus daily limit reached. Age data unavailable.', 'warning');
        const remaining = [...goPlusQueue];
        goPlusQueue = [];
        remaining.forEach(({ reject }) => reject(new Error('Daily rate limit exceeded')));
        break;
      }
      
      const now = Date.now();
      const wait = Math.max(0, CONFIG.GOPLUS_RATE_LIMIT_MS - (now - lastGoPlusCall));
      if (wait > 0) await sleep(wait);
      if (!isMounted) break;
      
      const { task, resolve, reject } = goPlusQueue.shift();
      lastGoPlusCall = Date.now();
      goPlusDailyCalls++;
      
      try {
        const result = await task();
        resolve(result);
      } catch (e) {
        reject(e);
      }
    }
  } finally {
    goPlusProcessing = false;
    if (goPlusQueue.length > 0 && isMounted && !goPlusTimeoutId) {
      goPlusTimeoutId = scheduleTimeout(() => {
        goPlusTimeoutId = null;
        processGoPlusQueue();
      }, 100);
    }
  }
}

async function addToHeliusQueue(task) {
  if (!isMounted) throw new Error('Component unmounted');
  if (heliusQueue.length >= MAX_QUEUE_SIZE) throw new Error('Helius queue overflow');
  
  return new Promise((resolve, reject) => {
    heliusQueue.push({ task, resolve, reject });
    processHeliusQueue();
  });
}

async function processHeliusQueue() {
  if (heliusProcessing || heliusQueue.length === 0 || !isMounted) return;
  heliusProcessing = true;
  
  try {
    while (heliusQueue.length > 0 && isMounted) {
      const now = Date.now();
      const wait = Math.max(0, CONFIG.HELIUS_RATE_LIMIT_MS - (now - lastHeliusCall));
      if (wait > 0) await sleep(wait);
      if (!isMounted) break;
      
      const { task, resolve, reject } = heliusQueue.shift();
      lastHeliusCall = Date.now();
      
      try {
        const result = await task();
        resolve(result);
      } catch (e) {
        reject(e);
      }
    }
  } finally {
    heliusProcessing = false;
    if (heliusQueue.length > 0 && isMounted && !heliusTimeoutId) {
      heliusTimeoutId = scheduleTimeout(() => {
        heliusTimeoutId = null;
        processHeliusQueue();
      }, 100);
    }
  }
}

async function addToDexQueue(task) {
  if (!isMounted) throw new Error('Component unmounted');
  if (dexQueue.length >= MAX_QUEUE_SIZE) throw new Error('DexScreener queue overflow');
  
  return new Promise((resolve, reject) => {
    dexQueue.push({ task, resolve, reject });
    processDexQueue();
  });
}

async function processDexQueue() {
  if (dexProcessing || dexQueue.length === 0 || !isMounted) return;
  dexProcessing = true;
  
  try {
    while (dexQueue.length > 0 && isMounted) {
      const now = Date.now();
      const wait = Math.max(0, CONFIG.DEX_RATE_LIMIT_MS - (now - lastDexCall));
      if (wait > 0) await sleep(wait);
      if (!isMounted) break;
      
      const { task, resolve, reject } = dexQueue.shift();
      lastDexCall = Date.now();
      
      try {
        const result = await task();
        resolve(result);
      } catch (e) {
        reject(e);
      }
    }
  } finally {
    dexProcessing = false;
    if (dexQueue.length > 0 && isMounted && !dexTimeoutId) {
      dexTimeoutId = scheduleTimeout(() => {
        dexTimeoutId = null;
        processDexQueue();
      }, 100);
    }
  }
}

// ================== API CALLS ==================
async function fetchTokenAge(address) {
  const cacheKey = `age_${address}`;
  const cached = ageCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CONFIG.AGE_CACHE_TTL_MS) return cached.value;
  if (cached && (Date.now() - cached.ts) < CONFIG.NEGATIVE_CACHE_TTL_MS && cached.value === null) return null;
  
  const makeRequest = async (useApiKey = true) => {
    let url = `${CONFIG.GOPLUS_PUBLIC_URL}/token_security/${address}?chain=solana`;
    let headers = {};
    
    if (useApiKey && GOPLUS_API_KEY) {
      headers = { 'x-api-key': GOPLUS_API_KEY };
    }
    
    const controller = new AbortController();
    activeControllers.push(controller);
    
    try {
      const timeoutId = scheduleTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 429 && useApiKey && GOPLUS_API_KEY) {
          return { fallbackNeeded: true };
        }
        return null;
      }
      
      const data = await response.json();
      if (data?.code === 1 && data.result?.create_time) {
        const timestamp = parseInt(data.result.create_time) * 1000;
        return { timestamp, source: useApiKey && GOPLUS_API_KEY ? 'goplus-key' : 'goplus-public' };
      }
      return null;
    } catch (e) {
      if (e.name === 'AbortError') console.warn(`GoPlus timeout for ${address}`);
      else console.warn(`GoPlus error for ${address}:`, e.message);
      return null;
    } finally {
      const index = activeControllers.indexOf(controller);
      if (index > -1) activeControllers.splice(index, 1);
    }
  };
  
  let result = await makeRequest(true);
  
  if (result?.fallbackNeeded) {
    console.warn(`Rate limited with key, trying public endpoint for ${address}`);
    result = await makeRequest(false);
  }
  
  if (result && !result.fallbackNeeded) {
    ageCache.set(cacheKey, { value: result, ts: Date.now() });
    return result;
  }
  
  ageCache.set(cacheKey, { value: null, ts: Date.now() });
  return null;
}

async function fetchTokenHolders(address) {
  if (!HELIUS_RPC_URL) return null;
  
  const cacheKey = `holders_${address}`;
  const cached = holdersCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CONFIG.HOLDERS_CACHE_TTL_MS) return cached.value;
  if (cached && (Date.now() - cached.ts) < CONFIG.NEGATIVE_CACHE_TTL_MS && cached.value === null) return null;
  
  const controller = new AbortController();
  activeControllers.push(controller);
  
  try {
    const timeoutId = scheduleTimeout(() => controller.abort(), 10000);
    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `holders-${address}`,
        method: 'getTokenLargestAccounts',
        params: [address]
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      holdersCache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }
    
    const data = await response.json();
    const accounts = data?.result?.value || [];
    
    const uniqueOwners = new Set();
    accounts.forEach(acc => {
      if (acc.owner) uniqueOwners.add(acc.owner);
    });
    
    let count = uniqueOwners.size;
    let isEstimate = accounts.length === 20;
    
    if (isEstimate && count === 20) {
      count = Math.min(Math.round(count * 1.3), 5000);
    }
    
    const result = { count, isEstimate };
    holdersCache.set(cacheKey, { value: result, ts: Date.now() });
    
    if (isEstimate && count > 0) {
      console.warn(`Holders for ${address} is estimated (~${count}), not exact`);
    }
    
    return result;
  } catch (e) {
    if (e.name === 'AbortError') console.warn(`Helius timeout for ${address}`);
    else console.warn(`Helius error for ${address}:`, e.message);
    holdersCache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
  } finally {
    const index = activeControllers.indexOf(controller);
    if (index > -1) activeControllers.splice(index, 1);
  }
}

async function fetchDexScreenerDetails(addresses) {
  if (!addresses.length) return [];
  
  const chunkSize = CONFIG.DEX_BATCH_SIZE;
  const chunks = [];
  for (let i = 0; i < addresses.length; i += chunkSize) {
    chunks.push(addresses.slice(i, i + chunkSize));
  }
  
  const allPairs = [];
  for (const chunk of chunks) {
    try {
      const query = chunk.join(',');
      const result = await addToDexQueue(async () => {
        const controller = new AbortController();
        activeControllers.push(controller);
        
        try {
          const timeoutId = scheduleTimeout(() => controller.abort(), 10000);
          const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${query}`, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!res.ok) {
            if (res.status === 429) throw new Error('Rate limited');
            throw new Error(`HTTP ${res.status}`);
          }
          
          const data = await res.json();
          return data.pairs || [];
        } catch (e) {
          if (e.name === 'AbortError') console.warn('DexScreener timeout');
          else console.warn('DexScreener error:', e.message);
          throw e;
        } finally {
          const index = activeControllers.indexOf(controller);
          if (index > -1) activeControllers.splice(index, 1);
        }
      });
      
      allPairs.push(...result);
    } catch (e) {
      console.warn('DexScreener chunk failed:', e.message);
    }
  }
  
  return allPairs;
}

async function fetchNewProfiles() {
  const controller = new AbortController();
  activeControllers.push(controller);
  
  try {
    const timeoutId = scheduleTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const profiles = await res.json();
    return profiles.filter(p => p.chainId === 'solana');
  } catch (e) {
    if (e.name === 'AbortError') console.error('Fetch profiles timeout');
    else console.error('Failed to fetch profiles:', e);
    return [];
  } finally {
    const index = activeControllers.indexOf(controller);
    if (index > -1) activeControllers.splice(index, 1);
  }
}

// ================== TOKEN MANAGEMENT ==================
async function refreshTokens() {
  if (isRefreshing || !isMounted) return;
  isRefreshing = true;
  
  try {
    const profiles = await fetchNewProfiles();
    if (!isMounted) return;
    
    const existingMints = new Set(allTokens.map(t => t.mint));
    const newTokens = profiles
      .filter(p => !existingMints.has(p.tokenAddress))
      .slice(0, CONFIG.MAX_TOKENS)
      .map(p => ({
        mint: p.tokenAddress,
        symbol: p.symbol || '???',
        name: p.name || p.symbol || 'Unknown',
        platform: p.url?.includes('pump.fun') ? 'pump' : 'raydium',
        liquidity: null,
        volume24h: null,
        price: null,
        ageTimestamp: null,
        ageSource: null,
        ageStatus: 'pending',
        holders: null,
        holdersIsEstimate: false,
        holdersStatus: 'pending',
        createdAt: Date.now()
      }));
    
    if (newTokens.length) {
      allTokens = [...newTokens, ...allTokens];
      allTokens.sort((a, b) => {
        const aLiq = a.liquidity || 0;
        const bLiq = b.liquidity || 0;
        if (aLiq !== bLiq) return bLiq - aLiq;
        const aCreated = a.createdAt || 0;
        const bCreated = b.createdAt || 0;
        return bCreated - aCreated;
      });
      
      const uniqueTokens = new Map();
      for (const token of allTokens) {
        if (!uniqueTokens.has(token.mint)) {
          uniqueTokens.set(token.mint, token);
        }
      }
      allTokens = Array.from(uniqueTokens.values()).slice(0, CONFIG.MAX_TOKENS);
      
      if (allTokens.length > 0) {
        applyFiltersAndRender();
      }
      
      await fetchDetailsForTokens(newTokens);
      if (isMounted) showToast(`🔄 ${newTokens.length} new tokens added`, 'success');
    } else if (allTokens.length === 0 && isMounted) {
      const grid = getElement('tokenGrid');
      if (grid) grid.innerHTML = '<div class="empty">✨ No tokens found. Waiting for new launches...</div>';
    }
  } catch (e) {
    console.error('Refresh error:', e);
    if (isMounted) showToast('Refresh failed, retrying soon...', 'error');
  } finally {
    isRefreshing = false;
  }
}

async function fetchDetailsForTokens(tokens) {
  for (let i = 0; i < tokens.length; i += CONFIG.DEX_BATCH_SIZE) {
    if (!isMounted) return;
    
    const batch = tokens.slice(i, i + CONFIG.DEX_BATCH_SIZE);
    const mints = batch.map(t => t.mint);
    
    try {
      const pairs = await fetchDexScreenerDetails(mints);
      if (!isMounted) return;
      
      batch.forEach(token => {
        const pair = pairs.find(p => p.baseToken?.address === token.mint);
        if (pair) {
          token.liquidity = pair.liquidity?.usd || null;
          token.volume24h = pair.volume?.h24 || null;
          token.price = pair.priceUsd ? parseFloat(pair.priceUsd) : null;
        }
        updateTokenCardUI(token);
      });
    } catch (e) {
      console.warn('Batch processing error:', e);
    }
    
    await sleep(CONFIG.DEX_BATCH_DELAY_MS);
  }
  
  const pendingAge = tokens.filter(t => t.ageStatus === 'pending' && isMounted);
  for (const token of pendingAge) {
    if (!isMounted) return;
    token.ageStatus = 'loading';
    updateTokenCardUI(token);
    
    try {
      await addToGoPlusQueue(async () => {
        const ageData = await fetchTokenAge(token.mint);
        if (!isMounted) return null;
        if (ageData && ageData.timestamp) {
          token.ageTimestamp = ageData.timestamp;
          token.ageSource = ageData.source;
          token.ageStatus = 'loaded';
        } else {
          token.ageStatus = 'error';
        }
        updateTokenCardUI(token);
        return null;
      });
    } catch (e) {
      if (isMounted) {
        token.ageStatus = 'error';
        updateTokenCardUI(token);
      }
    }
  }
}

// ================== UI RENDERING ==================
function createTokenCard(token) {
  const card = document.createElement('div');
  card.className = 'token-card';
  card.setAttribute('data-mint', token.mint);
  
  const mintId = token.mint.replace(/[^a-zA-Z0-9]/g, '_');
  
  let ageDisplay = '—';
  if (token.ageStatus === 'loaded' && token.ageTimestamp) {
    const ageMinutes = (Date.now() - token.ageTimestamp) / 60000;
    ageDisplay = formatAge(ageMinutes);
  } else if (token.ageStatus === 'loading') {
    ageDisplay = '⌛ loading...';
  } else if (token.ageStatus === 'error') {
    ageDisplay = '❌ error';
  }
  
  const holdersDisplay = token.holders ? (token.holdersIsEstimate ? `~${formatNumber(token.holders)}` : formatNumber(token.holders)) : '—';
  const holdersBtnDisabled = token.holdersStatus !== 'pending' && token.holdersStatus !== 'error';
  const holdersBtnText = token.holdersStatus === 'loading' ? '⏳ LOADING...' : '👥 LOAD HOLDERS';
  
  card.innerHTML = `
    <div class="token-header">
      <div class="token-symbol">${escapeHtml(token.symbol)}</div>
      <div style="display:flex;gap:6px;">
        <span class="tag ${token.platform === 'pump' ? 'tag-pump' : 'tag-raydium'}">${token.platform === 'pump' ? 'PUMP' : 'RAY'}</span>
      </div>
    </div>
    <div class="token-info">
      <div class="info-row"><span class="info-label">⏱️ Age</span><span class="info-value" id="age-${mintId}">${escapeHtml(ageDisplay)}</span></div>
      <div class="info-row"><span class="info-label">💰 Liquidity</span><span class="info-value">$${formatNumber(token.liquidity)}</span></div>
      <div class="info-row"><span class="info-label">👥 Holders</span><span class="info-value" id="holders-${mintId}">${escapeHtml(holdersDisplay)}</span></div>
      <div class="info-row"><span class="info-label">📈 24h Vol</span><span class="info-value">$${formatNumber(token.volume24h)}</span></div>
      <div class="info-row"><span class="info-label">💵 Price</span><span class="info-value">$${token.price ? token.price.toFixed(8) : '—'}</span></div>
    </div>
    <div class="token-ca" data-address="${escapeHtml(token.mint)}">🔑 ${token.mint.slice(0, 8)}...${token.mint.slice(-6)}</div>
    <div class="token-actions">
      <button class="action-btn" data-chart="${token.mint}">📊 CHART</button>
      <button class="action-btn load-holders-btn" data-load-holders="${token.mint}" ${holdersBtnDisabled ? 'disabled' : ''}>${holdersBtnText}</button>
    </div>
  `;
  
  return card;
}

function updateTokenCardUI(token) {
  const card = document.querySelector(`.token-card[data-mint="${token.mint}"]`);
  if (!card) return;
  
  const mintId = token.mint.replace(/[^a-zA-Z0-9]/g, '_');
  
  const ageSpan = card.querySelector(`#age-${mintId}`);
  if (ageSpan) {
    let ageDisplay = '—';
    if (token.ageStatus === 'loaded' && token.ageTimestamp) {
      const ageMinutes = (Date.now() - token.ageTimestamp) / 60000;
      ageDisplay = formatAge(ageMinutes);
    } else if (token.ageStatus === 'loading') {
      ageDisplay = '⌛ loading...';
    } else if (token.ageStatus === 'error') {
      ageDisplay = '❌ error';
    }
    ageSpan.textContent = ageDisplay;
  }
  
  const holdersSpan = card.querySelector(`#holders-${mintId}`);
  if (holdersSpan && token.holders !== undefined) {
    holdersSpan.textContent = token.holders ? (token.holdersIsEstimate ? `~${formatNumber(token.holders)}` : formatNumber(token.holders)) : '—';
  }
  
  const loadBtn = card.querySelector(`[data-load-holders="${token.mint}"]`);
  if (loadBtn) {
    const isPending = token.holdersStatus === 'pending';
    loadBtn.disabled = !isPending;
    loadBtn.textContent = token.holdersStatus === 'loading' ? '⏳ LOADING...' : '👥 LOAD HOLDERS';
  }
}

async function handleLoadHolders(mint) {
  const token = allTokens.find(t => t.mint === mint);
  if (!token || token.holdersStatus !== 'pending') return;
  
  token.holdersStatus = 'loading';
  updateTokenCardUI(token);
  
  try {
    const result = await addToHeliusQueue(() => fetchTokenHolders(mint));
    if (result && result.count && isMounted) {
      token.holders = result.count;
      token.holdersIsEstimate = result.isEstimate;
      token.holdersStatus = 'loaded';
      if (result.isEstimate) {
        showToast(`⚠️ Holders count for ${token.symbol} is estimated (~${formatNumber(result.count)})`, 'info');
      }
    } else if (isMounted) {
      token.holdersStatus = 'error';
      showToast(`❌ Failed to load holders for ${token.symbol}`, 'error');
    }
    if (isMounted) updateTokenCardUI(token);
  } catch (e) {
    if (isMounted) {
      token.holdersStatus = 'error';
      updateTokenCardUI(token);
      showToast(`❌ Error loading holders for ${token.symbol}`, 'error');
    }
  }
}

function applyFiltersAndRender() {
  if (!allTokens.length) {
    filteredTokens = [];
    renderTokens();
    return;
  }
  
  let filtered = [...allTokens];
  
  if (currentFilters.time !== 'all') {
    const maxMin = currentFilters.time === '5m' ? 5 : currentFilters.time === '30m' ? 30 : 60;
    filtered = filtered.filter(t => {
      if (!t.ageTimestamp || t.ageStatus !== 'loaded') return false;
      const ageMin = (Date.now() - t.ageTimestamp) / 60000;
      return ageMin <= maxMin;
    });
  }
  
  if (currentFilters.liq !== 'all') {
    const minLiq = currentFilters.liq === '5k' ? 5000 : currentFilters.liq === '10k' ? 10000 : 50000;
    filtered = filtered.filter(t => (t.liquidity || 0) >= minLiq);
  }
  
  if (currentFilters.platform !== 'all') {
    filtered = filtered.filter(t => t.platform === currentFilters.platform);
  }
  
  if (holdersFilterActive) {
    filtered = filtered.filter(t => t.holders && t.holders > 1000);
  }
  
  if (currentFilters.sort === 'holders') {
    filtered.sort((a, b) => (b.holders || 0) - (a.holders || 0));
  } else if (currentFilters.sort === 'newest') {
    filtered.sort((a, b) => (b.ageTimestamp || 0) - (a.ageTimestamp || 0));
  } else {
    filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  
  filteredTokens = filtered;
  renderTokens();
}

function renderTokens() {
  const grid = getElement('tokenGrid');
  if (!grid || !isMounted) return;
  
  if (!filteredTokens.length) {
    grid.innerHTML = '<div class="empty">✨ No tokens match filters</div>';
    return;
  }
  
  const fragment = document.createDocumentFragment();
  const tokenMap = new Map(filteredTokens.map(t => [t.mint, t]));
  
  filteredTokens.forEach(token => {
    fragment.appendChild(createTokenCard(token));
  });
  
  grid.innerHTML = '';
  grid.appendChild(fragment);
}

// ================== UI COMPONENTS (HEADER, FOOTER, BUTTONS) ==================
let headerListenersAttached = false;
let footerListenersAttached = false;

function renderHeader() {
  const headerContainer = getElement('headerContainer');
  if (!headerContainer) return;
  
  headerContainer.innerHTML = `
    <div class="header-glow">
      <h1 class="glow-title">
        <span class="shimmer">FRESH PUMPS</span>
        <span class="gradient-text">SOLANA SCANNER</span>
      </h1>
      <div class="header-controls">
        <button id="backBtn" class="back-button gold-border">
          ← BACK
        </button>
        <button id="refreshBtn" class="refresh-button">
          🔄 REFRESH
        </button>
        <button id="themeToggle" class="theme-toggle">🌙</button>
      </div>
    </div>
  `;
  
  if (!headerListenersAttached) {
    const backBtn = getElement('backBtn');
    const refreshBtn = getElement('refreshBtn');
    const themeToggle = getElement('themeToggle');
    
    if (backBtn) backBtn.addEventListener('click', () => window.history.back());
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      if (!isRefreshing) {
        countdown = CONFIG.REFRESH_COUNTDOWN_SEC;
        refreshTokens();
      }
    });
    if (themeToggle) {
      const saved = localStorage.getItem('freshTheme');
      if (saved === 'day') document.body.classList.add('day-mode');
      themeToggle.textContent = saved === 'day' ? '☀️' : '🌙';
      
      themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('day-mode');
        const isDay = document.body.classList.contains('day-mode');
        localStorage.setItem('freshTheme', isDay ? 'day' : 'night');
        themeToggle.textContent = isDay ? '☀️' : '🌙';
      });
    }
    headerListenersAttached = true;
  }
}

function renderFooter() {
  const footerContainer = getElement('footerContainer');
  if (!footerContainer) return;
  
  footerContainer.innerHTML = `
    <div class="footer-glow">
      <div class="footer-content">
        <div class="footer-links">
          <a href="#" onclick="return false;" class="footer-link">DexScreener</a>
          <span class="footer-divider">•</span>
          <a href="#" onclick="return false;" class="footer-link">GoPlus</a>
          <span class="footer-divider">•</span>
          <a href="#" onclick="return false;" class="footer-link">Helius</a>
        </div>
        <div class="footer-copyright">
          <span class="gradient-text">CRYPTOBROS 2026 ©</span>
          <span class="footer-version">v${APP_VERSION}</span>
        </div>
        <div class="footer-note">
          ⚠️ Holders count estimated from top 20 largest accounts
        </div>
      </div>
    </div>
  `;
}

// ================== FILTERS INITIALIZATION ==================
let filterListenersAttached = false;

function initFilters() {
  const timeSelect = getElement('timeFilter');
  const liqSelect = getElement('liqFilter');
  const platformSelect = getElement('platformFilter');
  const sortSelect = getElement('sortFilter');
  const holdersBtn = getElement('holdersFilterBtn');
  
  const update = () => {
    if (timeSelect) currentFilters.time = timeSelect.value;
    if (liqSelect) currentFilters.liq = liqSelect.value;
    if (platformSelect) currentFilters.platform = platformSelect.value;
    if (sortSelect) currentFilters.sort = sortSelect.value;
    applyFiltersAndRender();
  };
  
  if (!filterListenersAttached) {
    timeSelect?.addEventListener('change', update);
    liqSelect?.addEventListener('change', update);
    platformSelect?.addEventListener('change', update);
    sortSelect?.addEventListener('change', update);
    
    if (holdersBtn) {
      holdersBtn.addEventListener('click', () => {
        holdersFilterActive = !holdersFilterActive;
        holdersBtn.style.opacity = holdersFilterActive ? '1' : '0.7';
        holdersBtn.style.background = holdersFilterActive ? 'rgba(255,215,0,0.2)' : '';
        update();
        showToast(holdersFilterActive ? 'Filter: >1000 holders active' : 'Holders filter disabled');
      });
    }
    filterListenersAttached = true;
  }
}

// ================== EVENT DELEGATION ==================
let clickHandlerAttached = false;
let removeClickListener = null;

function setupEventDelegation() {
  if (clickHandlerAttached) return () => {};
  
  const handler = (e) => {
    const ca = e.target.closest('.token-ca');
    if (ca) {
      copyAddress(ca.getAttribute('data-address'));
      return;
    }
    const chart = e.target.closest('[data-chart]');
    if (chart) {
      const mint = chart.getAttribute('data-chart');
      window.open(`https://dexscreener.com/solana/${mint}`, '_blank');
      return;
    }
    const loadBtn = e.target.closest('[data-load-holders]');
    if (loadBtn && !loadBtn.disabled) {
      const mint = loadBtn.getAttribute('data-load-holders');
      handleLoadHolders(mint);
    }
  };
  
  document.addEventListener('click', handler);
  clickHandlerAttached = true;
  removeClickListener = () => {
    document.removeEventListener('click', handler);
    clickHandlerAttached = false;
  };
  
  return removeClickListener;
}

// ================== COUNTDOWN TIMER ==================
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    if (!isMounted) return;
    if (countdown > 0) {
      countdown--;
      const timerEl = getElement('updateTimer');
      if (timerEl) timerEl.textContent = `⏱️ ${countdown} SEC`;
      if (countdown === 0) {
        countdown = CONFIG.REFRESH_COUNTDOWN_SEC;
        refreshTokens().catch(e => console.warn('Refresh in countdown failed:', e));
      }
    } else {
      countdown = CONFIG.REFRESH_COUNTDOWN_SEC;
    }
  }, 1000);
}

// ================== MAIN INITIALIZATION ==================
async function init() {
  if (initialized) {
    console.warn('Init already called, skipping');
    return;
  }
  initialized = true;
  
  console.log(`🚀 Fresh Pumps v${APP_VERSION} ready`);
  isMounted = true;
  
  renderHeader();
  renderFooter();
  
  await loadApiKeys();
  
  initFilters();
  const cleanupClickHandler = setupEventDelegation();
  
  const grid = getElement('tokenGrid');
  if (grid) grid.innerHTML = '<div class="loader">LOADING FRESH TOKENS...</div>';
  
  await refreshTokens();
  startCountdown();
  
  pollInterval = setInterval(() => {
    if (!isRefreshing && isMounted && document.visibilityState !== 'hidden') {
      refreshTokens().catch(e => console.warn('Poll refresh failed:', e));
    }
  }, CONFIG.POLL_INTERVAL_MS);
  
  const cleanup = () => {
    isMounted = false;
    if (countdownInterval) clearInterval(countdownInterval);
    if (pollInterval) clearInterval(pollInterval);
    clearAllTimeouts();
    abortAllControllers();
    if (goPlusTimeoutId) clearTimeout(goPlusTimeoutId);
    if (heliusTimeoutId) clearTimeout(heliusTimeoutId);
    if (dexTimeoutId) clearTimeout(dexTimeoutId);
    cleanupClickHandler();
    goPlusQueue = [];
    heliusQueue = [];
    dexQueue = [];
  };
  
  window.addEventListener('beforeunload', cleanup);
}

init();
