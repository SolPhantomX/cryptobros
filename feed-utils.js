function safeGetItem(key, fallback = null) {
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
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function showToast(msg, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const div = document.createElement('div');
    div.className = 'toast ' + type;
    div.textContent = msg;
    div.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:1rem 1.5rem;background:' + (type==='error'?'#ff4d4d':type==='warning'?'#ffd700':'#28a745') + ';color:#0a0a0f;border-radius:12px;z-index:10000;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.2);animation:toastIn 0.3s ease-out;';
    document.body.appendChild(div);
    
    setTimeout(() => {
        div.style.animation = 'toastOut 0.3s ease-in forwards';
        setTimeout(() => div.remove(), 300);
    }, 3500);
}

function showSwarmModal(analysis, content, wallet) {
    const existing = document.querySelector('.swarm-modal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.className = 'swarm-modal';
    modal.innerHTML = '<div class="swarm-content"><h3>Sentinel Swarm Verdict</h3><div class="verdict-badge risk-' + analysis.action.toLowerCase() + '">' + analysis.action + '</div><p><strong>Risk Score:</strong> ' + analysis.score + '/1.00</p><p><strong>Thresholds:</strong> Block >=' + analysis.thresholds.block + ' | Review >=' + analysis.thresholds.review + '</p><p><strong>Agent Weights:</strong> Pattern ' + analysis.weights.pattern + ' | Wallet ' + analysis.weights.wallet + '</p><p><strong>Factors:</strong></p><ul>' + analysis.factors.map(f => '<li>' + escapeHtml(f) + '</li>').join('') + '</ul><div class="agent-votes"><small>Agent Scores: Pattern ' + analysis.agentVotes.pattern + ' | Wallet ' + analysis.agentVotes.wallet + '</small></div><div class="governance-hint"><small>Wisdom Score: ' + window.sentinel.getWisdomScore() + ' | Jury Decisions: ' + window.sentinel.getJuryCount() + '</small></div><div class="modal-actions"><button class="btn-close" onclick="this.closest(\'.swarm-modal\').remove()">Close</button><button class="btn-appeal" onclick="submitAppeal(\'' + escapeHtml(content) + '\', ' + analysis.score + ', \'' + wallet + '\')">Appeal to Tribunal</button></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

function submitAppeal(content, riskScore, wallet) {
    console.log('Appeal submitted: risk=' + riskScore + ', wallet=' + wallet);
    const modal = document.querySelector('.swarm-modal');
    if (modal) {
        modal.querySelector('.swarm-content').innerHTML = '<h3>Appeal Submitted</h3><p>Your post will be reviewed by the community Jury.</p><p><small>Mock mode: No real AUS staked yet.</small></p><button onclick="this.closest(\'.swarm-modal\').remove()" style="margin-top:1rem;padding:0.8rem 1.5rem;background:var(--accent-gold);border:none;border-radius:8px;cursor:pointer;font-weight:600">Close</button>';
    }
}

function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
        document.body.classList.add('dark-theme');
        document.getElementById('themeToggle').textContent = 'D';
    } else {
        document.body.classList.remove('dark-theme');
        document.getElementById('themeToggle').textContent = 'L';
    }
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    document.body.classList.toggle('dark-theme', !isDark);
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    document.getElementById('themeToggle').textContent = isDark ? 'L' : 'D';
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
        ['feedTextColor','feedCardBg','feedModalBg','feedModalBorder','feedInputBg'].forEach(k => localStorage.removeItem(k));
        ['--custom-text-color','--custom-card-bg','--custom-modal-bg','--custom-modal-border','--custom-input-bg'].forEach(p => document.documentElement.style.setProperty(p, ''));
        closeFeedBgModal();
        showToast('All colors reset to default', 'success');
        applyCustomColors();
    }
}

// EXPORT FUNCTIONS TO WINDOW
window.initTheme = initTheme;
window.toggleTheme = toggleTheme;
window.applyCustomColors = applyCustomColors;
window.setTextColor = setTextColor;
window.setCardBg = setCardBg;
window.setModalStyle = setModalStyle;
window.resetCustomColors = resetCustomColors;
window.safeGetItem = safeGetItem;
window.safeSetItem = safeSetItem;
window.escapeHtml = escapeHtml;
window.showToast = showToast;
window.showSwarmModal = showSwarmModal;
window.submitAppeal = submitAppeal;
