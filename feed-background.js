const DEFAULT_FEED_BG = 'bg1.jpg';
const FEED_BG_PRESETS = ['bg1.jpg','bg2.jpg','bg3.jpg','bg4.jpg','bg5.png','bg6.jpg','bg7.jpg','bg8.jpg','bg9.jpg','bg10.jpg','bg11.jpg','bg12.jpg','bg13.jpg'];
const MAX_BG_SIZE = 525 * 1024;

function applyFeedBg() {
    let bg = localStorage.getItem('feedBg');
    if (!bg) bg = DEFAULT_FEED_BG;
    if (bg && bg !== 'none') {
        const isBase64 = bg.startsWith('data:image');
        document.body.style.backgroundImage = isBase64 ? bg : 'url(' + bg + ')';
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundRepeat = 'no-repeat';
    } else {
        document.body.style.backgroundImage = 'none';
    }
    if (typeof applyCustomColors === 'function') applyCustomColors();
}

function setFeedBg(bg) {
    localStorage.setItem('feedBg', bg);
    applyFeedBg();
    closeFeedBgModal();
    showToast('Background changed to ' + bg, 'success');
}

function openFeedBgModal() {
    const modal = document.getElementById('feedBgModal');
    if (!modal) { console.error('Modal element not found'); return; }
    if (modal.classList.contains('active')) return;
    if (typeof renderBgPresets === 'function') renderBgPresets();
    modal.classList.add('active');
    console.log('Modal opened');
}

function closeFeedBgModal() {
    const modal = document.getElementById('feedBgModal');
    if (modal) {
        modal.classList.remove('active');
        console.log('Modal closed');
    }
}

function renderBgPresets() {
    const grid = document.getElementById('bgPresetsGrid');
    if (!grid) return;
    const fallback = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect fill="#222" width="120" height="80"/><text fill="#fff" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10">No Image</text></svg>');
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;margin-bottom:1rem;color:var(--accent-gold)"><strong>Background Presets</strong></div>' +
        FEED_BG_PRESETS.map(function(bg) { return '<div class="bg-preset-item" onclick="setFeedBg(\'' + bg + '\')"><img src="' + bg + '" alt="' + bg + '" onerror="this.src=\'data:image/svg+xml,' + fallback + '\'"><p>' + bg + '</p></div>'; }).join('') +
        '<div style="grid-column:1/-1;text-align:center;margin:1rem 0;color:var(--accent-gold)"><strong>Card and Modal Colors</strong></div>' +
        '<div style="grid-column:1/-1;display:flex;justify-content:center;gap:0.5rem;flex-wrap:wrap"><span style="font-size:0.8rem;color:var(--text-secondary)">Cards:</span>' +
        '<button class="color-btn" style="background:#1e1e1e;width:30px;height:30px" onclick="setCardBg(\'#1e1e1e\')" title="Dark"></button>' +
        '<button class="color-btn" style="background:#fff;width:30px;height:30px;border:1px solid #333" onclick="setCardBg(\'#fff\')" title="Light"></button>' +
        '<button class="color-btn" style="background:#1a1a3f;width:30px;height:30px" onclick="setCardBg(\'#1a1a3f\')" title="Purple"></button></div>' +
        '<div style="grid-column:1/-1;display:flex;justify-content:center;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem"><span style="font-size:0.8rem;color:var(--text-secondary)">Modals:</span>' +
        '<button class="color-btn" style="background:#0f0c29;border:2px solid #FFD700;width:30px;height:30px" onclick="setModalStyle(\'#0f0c29\',\'#FFD700\')" title="Gold Border"></button>' +
        '<button class="color-btn" style="background:#0f0c29;border:2px solid #00F0FF;width:30px;height:30px" onclick="setModalStyle(\'#0f0c29\',\'#00F0FF\')" title="Cyan Border"></button>' +
        '<button class="color-btn" style="background:#1e1e3f;border:2px solid #9D00FF;width:30px;height:30px" onclick="setModalStyle(\'#1e1e3f\',\'#9D00FF\')" title="Purple Border"></button></div>';
}

function handleBgUpload(file) {
    if (!file) return;
    if (file.size > MAX_BG_SIZE) {
        showToast('Image too large (max ' + Math.floor(MAX_BG_SIZE/1024) + 'KB)', 'error');
        return;
    }
    showToast('Loading background...', 'warning');
    const reader = new FileReader();
    reader.onload = function(e) {
        const result = e.target.result;
        if (result && result.length <= 700 * 1024) {
            if (typeof safeSetItem === 'function' && safeSetItem('feedBg', result)) {
                applyFeedBg();
                closeFeedBgModal();
                showToast('Custom background set!', 'success');
            }
        } else {
            showToast('Background too large after encoding', 'error');
        }
    };
    reader.onerror = function() { showToast('Failed to load image', 'error'); };
    reader.readAsDataURL(file);
}

function renderPinnedPosts() {
    const container = document.getElementById('pinnedPostsContainer');
    if (!container) return;
    const posts = typeof safeGetItem === 'function' ? safeGetItem('feedPosts', []) : [];
    const pinned = posts.filter(function(p) { return p.pinnedByAuction && p.pinned; });
    container.innerHTML = pinned.length === 0
        ? '<p style="text-align:center;color:var(--text-secondary)">No auction winners yet</p>'
        : pinned.map(function(post) {
            const date = post.pinnedAt ? new Date(post.pinnedAt) : new Date(post.timestamp);
            const usernameRaw = post.username || 'Guest';
            const usernameClean = usernameRaw.replace(/^[@\s]+/, '') || 'Guest';
            const username = typeof escapeHtml === 'function' ? escapeHtml(usernameClean) : usernameClean;
            const firstChar = usernameClean.charAt(0).toUpperCase() || 'G';
            const auctionBurn = typeof escapeHtml === 'function' ? escapeHtml(post.auctionBurn || '0') : post.auctionBurn;
            const content = post.content ? (typeof escapeHtml === 'function' ? escapeHtml(post.content) : post.content).replace(/\n/g,'<br>') : '<em>No content</em>';
            return '<div class="pinned-post"><div class="pinned-header">Auction Winner - ' + auctionBurn + ' AUS burned</div><div class="post-header"><div class="post-avatar avatar-base">' + firstChar + '</div><div><div class="post-user">' + username + '</div><div class="post-time">Pinned on ' + date.toLocaleString() + '</div></div></div><div class="post-content">' + content + '</div></div>';
        }).join('');
}

// EXPORT FUNCTIONS TO WINDOW (CRITICAL FOR GEAR BUTTON)
window.applyFeedBg = applyFeedBg;
window.setFeedBg = setFeedBg;
window.openFeedBgModal = openFeedBgModal;
window.closeFeedBgModal = closeFeedBgModal;
window.renderBgPresets = renderBgPresets;
window.handleBgUpload = handleBgUpload;
window.renderPinnedPosts = renderPinnedPosts;
