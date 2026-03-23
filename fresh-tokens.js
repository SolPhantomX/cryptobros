// ================== VERSION & CONFIG ==================
const APP_VERSION = '3.0.1';
console.log(`🚀 Fresh Pumps v${APP_VERSION} initializing...`);

const CONFIG = {
  MAX_TOKENS: 100,
  POLL_INTERVAL_MS: 60000,
  REFRESH_COUNTDOWN_SEC: 60,
  DEX_BATCH_SIZE: 20,
  DEX_BATCH_DELAY_MS: 500,
  GOPLUS_PUBLIC_URL: 'https://api.gopluslabs.io/api/v1',
  GOPLUS_RATE_LIMIT_MS: 2000,
  HELIUS_RATE_LIMIT_MS: 600,
  AGE_CACHE_TTL_MS: 30 * 60 * 1000,
  HOLDERS_CACHE_TTL_MS: 5 * 60 * 1000,
  MAX_GOPLUS_DAILY_CALLS: 30000,
  NEGATIVE_CACHE_TTL_MS: 5 * 60 * 1000, // Cache failures temporarily
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
let initialized = false; // Prevent double init
let pendingTimeouts = []; // Track timeouts for cleanup

// API keys (loaded from backend)
let GOPLUS_API_KEY = null;
let HELIUS_RPC_URL = null;

// Caches with negative caching
const ageCache = new Map();
const holdersCache = new Map();

// Rate limited queues
let goPlusQueue = [];
let goPlusProcessing = false;
let lastGoPlusCall = 0;
let goPlusTimeoutId = null;

let heliusQueue = [];
let heliusProcessing = false;
let lastHeliusCall = 0;
let heliusTimeoutId = null;

// ================== UTILITIES ==================
const getElement = (id) => document.getElementById(id);

const escapeHtml = (text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const formatNumber = (num) => {
  if (num == null || isNaN(num)) return '0';
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
};

const formatAge = (minutes) => {
  if (minutes == null || isNaN(minutes) || minutes < 0) return '?';
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
    try {
      const controller = new AbortController();
      const timeoutId = scheduleTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) continue;
      
      const data = await response.json();
      
      if (data.GOPLUS_API_KEY) GOPLUS_API_KEY = data.GOPLUS_API_KEY;
      if (data.HELIUS_RPC) HELIUS_RPC_URL = data.HELIUS_RPC;
      
      if (GOPLUS_API_KEY && HELIUS_RPC_URL) {
        console.log('✅ API keys loaded from backend');
        return true;
      }
    } catch (e) {
      console.warn('Failed to load from:', url, e.message);
    }
  }
  
  console.warn('⚠️ Using public GoPlus endpoint only (no API keys)');
  return false;
}

// ================== RATE LIMITED QUEUES ==================
async function addToGoPlusQueue(task) {
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
        // Reject all remaining promises
        while (goPlusQueue.length) {
          const { reject } = goPlusQueue.shift();
          reject(new Error('Daily rate limit exceeded'));
        }
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
    // Schedule next processing if queue not empty
    if (goPlusQueue.length > 0 && isMounted && !goPlusTimeoutId) {
      goPlusTimeoutId = scheduleTimeout(() => {
        goPlusTimeoutId = null;
        processGoPlusQueue();
      }, 100);
    }
  }
}

async function addToHeliusQueue(task) {
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
    // Schedule next processing if queue not empty
    if (heliusQueue.length > 0 && isMounted && !heliusTimeoutId) {
      heliusTimeoutId = scheduleTimeout(() => {
        heliusTimeoutId = null;
        processHeliusQueue();
      }, 100);
    }
  }
}

// ================== API CALLS ==================
async function fetchTokenAge(address) {
  const cacheKey = `age_${address}`;
  const cached = ageCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CONFIG.AGE_CACHE_TTL_MS) return cached.value;
  
  try {
    let url = `${CONFIG.GOPLUS_PUBLIC_URL}/token_security/${address}?chain=solana`;
    let headers = {};
    
    if (GOPLUS_API_KEY) {
      headers = { 'x-api-key': GOPLUS_API_KEY };
    }
    
    const response = await fetch(url, { headers });
    
    // Handle rate limit with fallback
    if (response.status === 429 && GOPLUS_API_KEY) {
      const fallbackRes = await fetch(`${CONFIG.GOPLUS_PUBLIC_URL}/token_security/${address}?chain=solana`);
      if (!fallbackRes.ok) {
        // Cache negative result
        ageCache.set(cacheKey, { value: null, ts: Date.now() });
        return null;
      }
      const data = await fallbackRes.json();
      if (data?.code === 1 && data.result?.create_time) {
        const timestamp = parseInt(data.result.create_time) * 1000;
        const result = { timestamp, source: 'public' };
        ageCache.set(cacheKey, { value: result, ts: Date.now() });
        return result;
      }
      // Cache negative result
      ageCache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }
    
    if (!response.ok) {
      ageCache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }
    
    const data = await response.json();
    if (data?.code === 1 && data.result?.create_time) {
      const timestamp = parseInt(data.result.create_time) * 1000;
      const result = { timestamp, source: GOPLUS_API_KEY ? 'goplus-key' : 'goplus-public' };
      ageCache.set(cacheKey, { value: result, ts: Date.now() });
      return result;
    }
    
    // Cache negative result to avoid repeated failed requests
    ageCache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
  } catch (e) {
    console.warn(`GoPlus error for ${address}:`, e.message);
    // Cache negative result on error
    ageCache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
  }
}

async function fetchTokenHolders(address) {
  if (!HELIUS_RPC_URL) return null;
  
  const cacheKey = `holders_${address}`;
  const cached = holdersCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CONFIG.HOLDERS_CACHE_TTL_MS) return cached.value;
  
  try {
    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `holders-${address}`,
        method: 'getTokenLargestAccounts',
        params: [address]
      })
    });
    
    if (!response.ok) {
      holdersCache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }
    
    const data = await response.json();
    const accounts = data?.result?.value || [];
    
    // Deduplicate owners (one wallet may have multiple token accounts)
    const uniqueOwners = new Set();
    accounts.forEach(acc => {
      if (acc.owner) uniqueOwners.add(acc.owner);
    });
    
    let count = uniqueOwners.size;
    let isEstimate = accounts.length === 20;
    
    // More accurate estimation: if we got 20 accounts and there are likely more
    if (isEstimate && count === 20) {
      // Conservative estimate, not exact science
      count = Math.min(Math.round(count * 1.3), 5000);
    }
    
    const result = { count, isEstimate };
    holdersCache.set(cacheKey, { value: result, ts: Date.now() });
    
    // Warning for users about estimation
    if (isEstimate && count > 0) {
      console.warn(`Holders for ${address} is estimated (~${count}), not exact`);
    }
    
    return result;
  } catch (e) {
    console.warn(`Helius error for ${address}:`, e.message);
    holdersCache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
  }
}

async function fetchDexScreenerDetails(addresses) {
  if (!addresses.length) return [];
  
  // Limit query length to avoid URL too long (DexScreener allows ~20-30 tokens)
  const chunkSize = 25;
  const chunks = [];
  for (let i = 0; i < addresses.length; i += chunkSize) {
    chunks.push(addresses.slice(i, i + chunkSize));
  }
  
  const allPairs = [];
  for (const chunk of chunks) {
    const query = chunk.join(',');
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${query}`);
      const data = await res.json();
      if (data.pairs) allPairs.push(...data.pairs);
      await sleep(100); // Small delay between chunks
    } catch (e) {
      console.warn('DexScreener chunk error:', e);
    }
  }
  
  return allPairs;
}

async function fetchNewProfiles() {
  try {
    const controller = new AbortController();
    const timeoutId = scheduleTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', { signal: controller.signal });
    clearTimeout(timeoutId);
    const profiles = await res.json();
    return profiles.filter(p => p.chainId === 'solana');
  } catch (e) {
    console.error('Failed to fetch profiles:', e);
    return [];
  }
}

// ================== TOKEN MANAGEMENT ==================
async function refreshTokens() {
  if (isRefreshing) return;
  isRefreshing = true;
  
  try {
    const profiles = await fetchNewProfiles();
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
      // Add new tokens to the front, then sort by priority before slicing
      allTokens = [...newTokens, ...allTokens];
      // Sort by liquidity (higher first) and age (newer first) before truncating
      allTokens.sort((a, b) => {
        const aLiq = a.liquidity || 0;
        const bLiq = b.liquidity || 0;
        if (aLiq !== bLiq) return bLiq - aLiq;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      allTokens = allTokens.slice(0, CONFIG.MAX_TOKENS);
      
      // Render immediately to show loading states
      applyFiltersAndRender();
      
      // Load details in background
      await fetchDetailsForTokens(newTokens);
      showToast(`🔄 ${newTokens.length} new tokens added`, 'success');
    }
  } catch (e) {
    console.error('Refresh error:', e);
    showToast('Refresh failed, retrying soon...', 'error');
  } finally {
    isRefreshing = false;
  }
}

async function fetchDetailsForTokens(tokens) {
  for (let i = 0; i < tokens.length; i += CONFIG.DEX_BATCH_SIZE) {
    const batch = tokens.slice(i, i + CONFIG.DEX_BATCH_SIZE);
    const mints = batch.map(t => t.mint);
    const pairs = await fetchDexScreenerDetails(mints);
    
    batch.forEach(token => {
      const pair = pairs.find(p => p.baseToken?.address === token.mint);
      if (pair) {
        token.liquidity = pair.liquidity?.usd || 0;
        token.volume24h = pair.volume?.h24 || 0;
        token.price = pair.priceUsd || 0;
      }
      updateTokenCardUI(token);
    });
    
    await sleep(CONFIG.DEX_BATCH_DELAY_MS);
    if (!isMounted) return;
  }
  
  // Load ages for tokens that need it
  const pendingAge = tokens.filter(t => t.ageStatus === 'pending');
  for (const token of pendingAge) {
    if (!isMounted) return;
    token.ageStatus = 'loading';
    updateTokenCardUI(token);
    
    // Handle promise rejection properly
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

// ================== UI RENDERING WITH DIFFING ==================
function createTokenCard(token) {
  const card = document.createElement('div');
  card.className = 'token-card';
  card.setAttribute('data-mint', token.mint);
  
  const ageMinutes = (token.ageTimestamp && token.ageStatus === 'loaded') 
    ? Math.round((Date.now() - token.ageTimestamp) / 60000) 
    : null;
  const ageDisplay = token.ageStatus === 'loaded' ? formatAge(ageMinutes) : 
                     token.ageStatus === 'loading' ? 'loading...' : 
                     token.ageStatus === 'error' ? '❌ error' : '?';
  
  const holdersDisplay = token.holders ? (token.holdersIsEstimate ? `~${formatNumber(token.holders)}` : formatNumber(token.holders)) : '?';
  const holdersBtnDisabled = token.holdersStatus !== 'pending' && token.holdersStatus !== 'error';
  
  card.innerHTML = `
    <div class="token-header">
      <div class="token-symbol">${escapeHtml(token.symbol)}</div>
      <div style="display:flex;gap:6px;">
        <span class="tag ${token.platform === 'pump' ? 'tag-pump' : 'tag-raydium'}">${token.platform === 'pump' ? 'PUMP' : 'RAY'}</span>
      </div>
    </div>
    <div class="token-info">
      <div class="info-row"><span class="info-label">⏱️ Age</span><span class="info-value" id="age-${token.mint}">${escapeHtml(ageDisplay)}</span></div>
      <div class="info-row"><span class="info-label">💰 Liquidity</span><span class="info-value">$${formatNumber(token.liquidity)}</span></div>
      <div class="info-row"><span class="info-label">👥 Holders</span><span class="info-value" id="holders-${token.mint}">${escapeHtml(holdersDisplay)}</span></div>
      <div class="info-row"><span class="info-label">📈 24h Vol</span><span class="info-value">$${formatNumber(token.volume24h)}</span></div>
      <div class="info-row"><span class="info-label">💵 Price</span><span class="info-value">$${token.price ? token.price.toFixed(8) : '?'}</span></div>
    </div>
    <div class="token-ca" data-address="${escapeHtml(token.mint)}">🔑 ${token.mint.slice(0, 8)}...${token.mint.slice(-6)}</div>
    <div class="token-actions">
      <button class="action-btn" data-chart="${token.mint}">📊 CHART</button>
      <button class="action-btn load-holders-btn" data-load-holders="${token.mint}" ${holdersBtnDisabled ? 'disabled' : ''}>👥 ${token.holdersStatus === 'loading' ? 'LOADING...' : 'LOAD HOLDERS'}</button>
    </div>
  `;
  
  return card;
}

function updateTokenCardUI(token) {
  const card = document.querySelector(`.token-card[data-mint="${token.mint}"]`);
  if (!card) return;
  
  const ageSpan = card.querySelector(`#age-${token.mint}`);
  if (ageSpan) {
    const ageMinutes = (token.ageTimestamp && token.ageStatus === 'loaded') 
      ? Math.round((Date.now() - token.ageTimestamp) / 60000) 
      : null;
    ageSpan.textContent = token.ageStatus === 'loaded' ? formatAge(ageMinutes) : 
                          token.ageStatus === 'loading' ? 'loading...' : 
                          token.ageStatus === 'error' ? '❌ error' : '?';
  }
  
  const holdersSpan = card.querySelector(`#holders-${token.mint}`);
  if (holdersSpan && token.holders) {
    holdersSpan.textContent = token.holdersIsEstimate ? `~${formatNumber(token.holders)}` : formatNumber(token.holders);
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
    updateTokenCardUI(token);
  } catch (e) {
    if (isMounted) {
      token.holdersStatus = 'error';
      updateTokenCardUI(token);
      showToast(`❌ Error loading holders for ${token.symbol}`, 'error');
    }
  }
}

function applyFiltersAndRender() {
  let filtered = [...allTokens];
  
  if (currentFilters.time !== 'all') {
    const maxMin = currentFilters.time === '5m' ? 5 : currentFilters.time === '30m' ? 30 : 60;
    filtered = filtered.filter(t => {
      if (!t.ageTimestamp) return true;
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
  
  // Diff approach: only update if token list changed significantly
  const existingCards = new Map();
  Array.from(grid.children).forEach(card => {
    const mint = card.getAttribute('data-mint');
    if (mint) existingCards.set(mint, card);
  });
  
  const fragment = document.createDocumentFragment();
  const newMints = new Set(filteredTokens.map(t => t.mint));
  
  filteredTokens.forEach(token => {
    let card = existingCards.get(token.mint);
    if (card) {
      // Update existing card
      updateTokenCardUI(token);
      existingCards.delete(token.mint);
      fragment.appendChild(card);
    } else {
      // Create new card
      fragment.appendChild(createTokenCard(token));
    }
  });
  
  // Remove cards that are no longer in filtered list
  existingCards.forEach(card => card.remove());
  
  grid.innerHTML = '';
  grid.appendChild(fragment);
}

// ================== EVENT HANDLERS ==================
function setupEventDelegation() {
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
  return () => document.removeEventListener('click', handler);
}

function initFilters() {
  const timeSelect = getElement('timeFilter');
  const liqSelect = getElement('liqFilter');
  const platformSelect = getElement('platformFilter');
  const sortSelect = getElement('sortFilter');
  const holdersBtn = getElement('holdersFilterBtn');
  
  const update = () => {
    currentFilters = {
      time: timeSelect?.value || 'all',
      liq: liqSelect?.value || 'all',
      platform: platformSelect?.value || 'all',
      sort: sortSelect?.value || 'newest'
    };
    applyFiltersAndRender();
  };
  
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
}

function initTheme() {
  const toggle = getElement('themeToggle');
  if (!toggle) return;
  const saved = localStorage.getItem('freshTheme');
  if (saved === 'day') document.body.classList.add('day-mode');
  
  const themeHandler = () => {
    document.body.classList.toggle('day-mode');
    const isDay = document.body.classList.contains('day-mode');
    localStorage.setItem('freshTheme', isDay ? 'day' : 'night');
    toggle.textContent = isDay ? '☀️' : '🌙';
  };
  
  toggle.addEventListener('click', themeHandler);
  return () => toggle.removeEventListener('click', themeHandler);
}

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

async function init() {
  if (initialized) {
    console.warn('Init already called, skipping');
    return;
  }
  initialized = true;
  
  console.log(`🚀 Fresh Pumps v${APP_VERSION} ready`);
  isMounted = true;
  
  // Load API keys from backend first
  await loadApiKeys();
  
  const removeThemeListener = initTheme();
  initFilters();
  const removeClickListener = setupEventDelegation();
  
  getElement('refreshBtn')?.addEventListener('click', () => {
    if (!isRefreshing) {
      countdown = CONFIG.REFRESH_COUNTDOWN_SEC;
      refreshTokens();
    }
  });
  
  getElement('backBtn')?.addEventListener('click', () => window.history.back());
  
  const grid = getElement('tokenGrid');
  if (grid) grid.innerHTML = '<div class="loader">LOADING FRESH TOKENS...</div>';
  
  await refreshTokens();
  startCountdown();
  
  pollInterval = setInterval(() => {
    if (!isRefreshing && isMounted && document.visibilityState !== 'hidden') {
      refreshTokens().catch(e => console.warn('Poll refresh failed:', e));
    }
  }, CONFIG.POLL_INTERVAL_MS);
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    isMounted = false;
    if (countdownInterval) clearInterval(countdownInterval);
    if (pollInterval) clearInterval(pollInterval);
    clearAllTimeouts();
    if (goPlusTimeoutId) clearTimeout(goPlusTimeoutId);
    if (heliusTimeoutId) clearTimeout(heliusTimeoutId);
    removeThemeListener();
    removeClickListener();
  });
}

init();
