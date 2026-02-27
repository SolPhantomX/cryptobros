let isPosting = false;

function createPost() {
    if (isPosting) return;
    const btn = document.getElementById('btnPost');
    const content = document.getElementById('postInput').value.trim();
    if (!content) { showToast('Please enter some text first', 'error'); return; }
    if (content.length > 2000) { showToast('Post too long (max 2000 characters)', 'error'); return; }
    isPosting = true;
    btn.disabled = true;
    btn.textContent = 'Posting...';
    const wallet = localStorage.getItem('walletAddress') || 'guest';
    const isNewUser = !localStorage.getItem('hasPostedBefore');
    const risk = sentinel.vote(content, wallet, isNewUser);
    if (risk.action === 'BLOCK') {
        showSwarmModal(risk, content, wallet);
        resetPostButton();
        return;
    }
    if (risk.action === 'REVIEW') showToast('Post published with review flag ⚠️', 'warning');
    const posts = safeGetItem('feedPosts', []);
    posts.unshift({
        id: Date.now(), content, timestamp: Date.now(), likes: 0, username: '@cryptobros',
        comments: [], moderation: risk, likedByMe: false, repostedByMe: false, reposts: 0,
        pinnedByAuction: false, pinned: false, auctionBurn: 0, pinnedAt: null
    });
    if (safeSetItem('feedPosts', posts)) {
        document.getElementById('postInput').value = '';
        document.getElementById('charCount').textContent = '0 / 2000';
        localStorage.setItem('hasPostedBefore', 'true');
        if (risk.action === 'PUBLISH') { sentinel.awardAUS(1); showToast('Post published! +1 mock AUS 🪙'); }
        SentinelSwarm.cleanupStorage();
        loadPosts();
        renderPinnedPosts();
        resetPostButton();
    } else {
        showToast('Failed to save post - storage may be full', 'error');
        btn.disabled = false;
        btn.textContent = '📝 Post';
        isPosting = false;
    }
}

function resetPostButton() {
    isPosting = false;
    const btn = document.getElementById('btnPost');
    btn.disabled = false;
    btn.textContent = '📝 Post';
}

const postInput = document.getElementById('postInput');
const charCount = document.getElementById('charCount');
if (postInput && charCount) {
    postInput.addEventListener('input', () => {
        const len = postInput.value.length;
        charCount.textContent = `${len} / 2000`;
        if (len >= 2000) {
            charCount.style.color = 'var(--error)';
            postInput.disabled = true;
            showToast('Max length reached!', 'warning');
        } else if (len > 1800) {
            charCount.style.color = 'var(--error)';
            postInput.disabled = false;
        } else if (len > 1500) {
            charCount.style.color = 'var(--warning)';
            postInput.disabled = false;
        } else {
            charCount.style.color = 'var(--text-secondary)';
            postInput.disabled = false;
        }
    });
}

let trendsInterval = null;

function initTrends() {
    const td = {
        trend1: {value:2100,prev:2100},
        trend2: {value:1800,prev:1800},
        trend3: {value:942,prev:942}
    };
    trendsInterval = setInterval(() => {
        Object.keys(td).forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const delta = Math.floor(Math.random()*21)-10;
            td[id].prev = td[id].value;
            td[id].value = Math.max(0, td[id].value + delta);
            const diff = td[id].value - td[id].prev;
            let ind = '↑ +0', cls = 'trend-up';
            if (diff > 0) { ind = '↑ +' + diff; cls = 'trend-up'; }
            else if (diff < 0) { ind = '↓ ' + diff; cls = 'trend-down'; }
            const fmt = td[id].value >= 1000 ? (td[id].value/1000).toFixed(1) + 'k' : td[id].value;
            el.innerHTML = `${fmt} <span class="trend-indicator ${cls}">${ind}</span>`;
        });
    }, 30000);
}

window.addEventListener('beforeunload', () => {
    if (trendsInterval) {
        clearInterval(trendsInterval);
        trendsInterval = null;
    }
});

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMockUsers();
    initTrends();
    loadPosts();
    applyFeedBg();
    renderPinnedPosts();
    applyCustomColors();
    
    const btn = document.getElementById('feedBgBtn');
    const upload = document.getElementById('feedBgUpload');
    if (btn) btn.addEventListener('click', openFeedBgModal);
    if (upload) upload.addEventListener('change', e => handleBgUpload(e.target.files[0]));
    
    const modal = document.getElementById('feedBgModal');
    if (modal) {
        modal.addEventListener('click', e => { if (e.target === modal) closeFeedBgModal(); });
        modal.addEventListener('keydown', e => { if (e.key === 'Escape') closeFeedBgModal(); });
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFeedBgModal(); });
});

console.log('🚀 CryptoBros Feed initialized');
