function applyFeedBg() {
    let bg = localStorage.getItem('feedBg');
    if (!bg) bg = window.DEFAULT_FEED_BG;
    if (bg && bg !== 'none') {
        const isBase64 = bg.startsWith('data:image');
        document.body.style.backgroundImage = isBase64 ? bg : `url(${bg})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundRepeat = 'no-repeat';
    } else {
        document.body.style.backgroundImage = 'none';
    }
    applyCustomColors();
}

function setFeedBg(bg) {
    localStorage.setItem('feedBg', bg);
    applyFeedBg();
    closeFeedBgModal();
    showToast(`Background changed to ${bg}`, 'success');
}

function openFeedBgModal() {
    if (document.getElementById('feedBgModal').classList.contains('active')) return;
    renderBgPresets();
    document.getElementById('feedBgModal').classList.add('active');
}

function closeFeedBgModal() {
    document.getElementById('feedBgModal').classList.remove('active');
}

function renderBgPresets() {
    const grid = document.getElementById('bgPresetsGrid');
    if (!grid) return;
    const fallback = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect fill="#222" width="120" height="80"/><text fill="#fff" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10">No Image</text></svg>');
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;margin-bottom:1rem;color:var(--accent-gold)"><strong>Background Presets</strong></div>` +
        window.FEED_BG_PRESETS.map(bg => `<div class="bg-preset-item" onclick="setFeedBg('${bg}')"><img src="${bg}" alt="${bg}" onerror="this.src='data:image/svg+xml,${fallback}'"><p>${bg}</p></div>`).join('') +
        `<div style="grid-column:1/-1;text-align:center;margin:1rem 0;color:var(--accent-gold)"><strong>Card & Modal Colors</strong></div>` +
        `<div style="grid-column:1/-1;display:flex;justify-content:center;gap:0.5rem;flex-wrap:wrap"><span style="font-size:0.8rem;color:var(--text-secondary)">Cards:</span>` +
        `<button class="color-btn" style="background:#1e1e1e;width:30px;height:30px" onclick="setCardBg('#1e1e1e')" title="Dark"></button>` +
        `<button class="color-btn" style="background:#fff;width:30px;height:30px;border:1px solid #333" onclick="setCardBg('#fff')" title="Light"></button>` +
        `<button class="color-btn" style="background:#1a1a3f;width:30px;height:30px" onclick="setCardBg('#1a1a3f')" title="Purple"></button></div>` +
        `<div style="grid-column:1/-1;display:flex;justify-content:center;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem"><span style="font-size:0.8rem;color:var(--text-secondary)">Modals:</span>` +
        `<button class="color-btn" style="background:#0f0c29;border:2px solid #FFD700;width:30px;height:30px" onclick="setModalStyle('#0f0c29','#FFD700')" title="Gold Border"></button>` +
        `<button class="color-btn" style="background:#0f0c29;border:2px solid #00F0FF;width:30px;height:30px" onclick="setModalStyle('#0f0c29','#00F0FF')" title="Cyan Border"></button>` +
        `<button class="color-btn" style="background:#1e1e3f;border:2px solid #9D00FF;width:30px;height:30px" onclick="setModalStyle('#1e1e3f','#9D00FF')" title="Purple Border"></button></div>`;
}

function handleBgUpload(file) {
    if (!file) return;
    if (file.size > window.MAX_BG_SIZE) {
        showToast(`Image too large (max ${Math.floor(window.MAX_BG_SIZE/1024)}KB after encoding)`, 'error');
        return;
    }
    showToast('Loading background...', 'warning');
    const reader = new FileReader();
    reader.onload = (e) => {
        const result = e.target.result;
        if (result && result.length <= 700 * 1024) {
            if (safeSetItem('feedBg', result)) {
                applyFeedBg();
                closeFeedBgModal();
                showToast('Custom background set!', 'success');
            }
        } else {
            showToast('Background too large after encoding', 'error');
        }
    };
    reader.onerror = () => showToast('Failed to load image', 'error');
    reader.readAsDataURL(file);
}

function renderPinnedPosts() {
    const container = document.getElementById('pinnedPostsContainer');
    if (!container) return;
    const posts = safeGetItem('feedPosts', []);
    const pinned = posts.filter(p => p.pinnedByAuction && p.pinned);
    container.innerHTML = pinned.length === 0
        ? '<p style="text-align:center;color:var(--text-secondary)">No auction winners yet</p>'
        : pinned.map(post => {
            const date = post.pinnedAt ? new Date(post.pinnedAt) : new Date(post.timestamp);
            const usernameRaw = post.username || 'Guest';
            const usernameClean = usernameRaw.replace(/^[@\s]+/, '') || 'Guest';
            const username = escapeHtml(usernameClean);
            const firstChar = usernameClean.charAt(0).toUpperCase() || 'G';
            const auctionBurn = escapeHtml(post.auctionBurn || '0');
            const content = post.content ? escapeHtml(post.content).replace(/\n/g,'<br>') : '<em>No content</em>';
            return `<div class="pinned-post"><div class="pinned-header">Auction Winner — ${auctionBurn} AUS burned 🏆</div><div class="post-header"><div class="post-avatar avatar-base">${firstChar}</div><div><div class="post-user">${username}</div><div class="post-time">Pinned on ${date.toLocaleString()}</div></div></div><div class="post-content">${content}</div></div>`;
        }).join('');
}
