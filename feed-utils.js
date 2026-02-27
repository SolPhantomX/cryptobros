function safeGetItem(key, fallback) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch(e) {
        console.error('localStorage error (' + key + '):', e);
        return fallback;
    }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch(e) {
        console.error('localStorage full (' + key + '):', e);
        showToast('Storage full! Delete some posts or reset background.', 'error');
        return false;
    }
}

function escapeHtml(text) {
    if (!text && text !== 0) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function showToast(msg, type) {
    if (!type) type = 'success';
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.className = 'toast ' + type;
    div.textContent = msg;
    div.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:1rem 1.5rem;background:' + (type==='error'?'#ff4d4d':type==='warning'?'#ffd700':'#28a745') + ';color:#0a0a0f;border-radius:12px;z-index:10000;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.2);animation:toastIn 0.3s ease-out;';
    document.body.appendChild(div);
    setTimeout(function() {
        div.style.animation = 'toastOut 0.3s ease-in forwards';
        setTimeout(function() { div.remove(); }, 300);
    }, 3500);
}

function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;
    if (saved === 'dark' || (!saved && prefersDark)) {
        document.body.classList.add('dark-theme');
        toggle.textContent = 'D';
    } else {
        document.body.classList.remove('dark-theme');
        toggle.textContent = 'L';
    }
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    document.body.classList.toggle('dark-theme', !isDark);
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.textContent = isDark ? 'L' : 'D';
}

function applyCustomColors() {
    const textColor = localStorage.getItem('feedTextColor');
    if (textColor) document.documentElement.style.setProperty('--custom-text-color', textColor);
    const cardBg = localStorage.getItem('feedCardBg');
    if (cardBg) document.documentElement.style.setProperty('--custom-card-bg', cardBg);
    const modalBg = localStorage.getItem('feedModalBg');
    if (modalBg) document.documentElement.style.setProperty('--custom-modal-bg', modalBg);
    const modalBorder = localStorage.getItem('feedModalBorder');
    if (modalBorder) document.documentElement.style.setProperty('--custom-modal-border', modalBorder);
    const inputBg = localStorage.getItem('feedInputBg');
    if (inputBg) document.documentElement.style.setProperty('--custom-input-bg', inputBg);
}

function setTextColor(color) {
    localStorage.setItem('feedTextColor', color);
    document.documentElement.style.setProperty('--custom-text-color', color);
    const isLight = ['#ffffff', '#ffd700', '#00f0ff'].includes(color.toLowerCase());
    if (isLight) {
        document.documentElement.style.setProperty('--custom-input-bg', 'rgba(0,0,0,0.3)');
        localStorage.setItem('feedInputBg', 'rgba(0,0,0,0.3)');
    }
    showToast('Text color changed', 'success');
}

function setCardBg(color) {
    localStorage.setItem('feedCardBg', color);
    document.documentElement.style.setProperty('--custom-card-bg', color);
    showToast('Card background changed', 'success');
}

function setModalStyle(bgColor, borderColor) {
    localStorage.setItem('feedModalBg', bgColor);
    localStorage.setItem('feedModalBorder', borderColor);
    document.documentElement.style.setProperty('--custom-modal-bg', bgColor);
    document.documentElement.style.setProperty('--custom-modal-border', borderColor);
    showToast('Modal style updated', 'success');
}

function resetCustomColors() {
    if (confirm('Reset all custom colors to default?')) {
        ['feedTextColor','feedCardBg','feedModalBg','feedModalBorder','feedInputBg'].forEach(function(k) { localStorage.removeItem(k); });
        ['--custom-text-color','--custom-card-bg','--custom-modal-bg','--custom-modal-border','--custom-input-bg'].forEach(function(p) { document.documentElement.style.setProperty(p, ''); });
        if (typeof closeFeedBgModal === 'function') closeFeedBgModal();
        showToast('All colors reset to default', 'success');
        applyCustomColors();
    }
}

// EXPORT FUNCTIONS TO WINDOW (CRITICAL FOR SPLIT FILES)
window.safeGetItem = safeGetItem;
window.safeSetItem = safeSetItem;
window.escapeHtml = escapeHtml;
window.showToast = showToast;
window.initTheme = initTheme;
window.toggleTheme = toggleTheme;
window.applyCustomColors = applyCustomColors;
window.setTextColor = setTextColor;
window.setCardBg = setCardBg;
window.setModalStyle = setModalStyle;
window.resetCustomColors = resetCustomColors;
