window.isPosting = false;
window.isCommenting = {};

function createPost() {
    if (window.isPosting) return;
    const btn = document.getElementById('btnPost');
    const content = document.getElementById('postInput').value.trim();
    if (!content) { showToast('Please enter some text first', 'error'); return; }
    if (content.length > 2000) { showToast('Post too long (max 2000 characters)', 'error'); return; }
    window.isPosting = true;
    btn.disabled = true;
    btn.textContent = 'Posting...';
    const wallet = localStorage.getItem('walletAddress') || 'guest';
    const isNewUser = !localStorage.getItem('hasPostedBefore');
    const risk = window.sentinel.vote(content, wallet, isNewUser);
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
        if (risk.action === 'PUBLISH') { window.sentinel.awardAUS(1); showToast('Post published! +1 mock AUS 🪙'); }
        SentinelSwarm.cleanupStorage();
        loadPosts();
        renderPinnedPosts();
        resetPostButton();
    } else {
        showToast('Failed to save post - storage may be full', 'error');
        btn.disabled = false;
        btn.textContent = '📝 Post';
        window.isPosting = false;
    }
}

function resetPostButton() {
    window.isPosting = false;
    const btn = document.getElementById('btnPost');
    btn.disabled = false;
    btn.textContent = '📝 Post';
}

function deletePost(id) {
    if (confirm('Delete this post?')) {
        let posts = safeGetItem('feedPosts', []);
        posts = posts.filter(p => p.id !== id);
        if (safeSetItem('feedPosts', posts)) {
            SentinelSwarm.cleanupStorage();
            loadPosts();
            renderPinnedPosts();
            showToast('Post deleted');
        }
    }
}

function loadPosts() {
    const container = document.getElementById('feedPosts');
    if (!container) { console.warn('feedPosts not found'); return; }
    const posts = safeGetItem('feedPosts', []);
    let html = '';
    if (!posts.length) {
        html = '<div style="text-align:center;padding:3rem;color:var(--text-secondary)"><h3 style="margin-bottom:1rem">No posts yet</h3><p>Be the first degen to share alpha!</p><p style="margin-top:1rem;font-size:0.85rem;opacity:0.7">Mock mode</p></div>';
    } else {
        html = posts.map(post => {
            const date = new Date(post.timestamp);
            const commentsHTML = post.comments?.length
                ? `<div class="comment-list">${post.comments.map(c => `<div class="comment-item">${escapeHtml(c)}</div>`).join('')}</div>`
                : '';
            const contentDisplay = post.content ? escapeHtml(post.content).replace(/\n/g,'<br>') : '<em>No content</em>';
            const usernameRaw = post.username || 'Guest';
            const usernameClean = usernameRaw.replace(/^[@\s]+/, '') || 'Guest';
            const firstChar = usernameClean.charAt(0).toUpperCase() || 'G';
            return `<article class="post" data-id="${post.id}">
                <button class="btn-delete" onclick="deletePost(${post.id})">🗑️</button>
                <div class="post-header">
                    <div class="post-avatar avatar-base">${firstChar}</div>
                    <div><div class="post-user">${escapeHtml(post.username)}</div><div class="post-time">${date.toLocaleString()}</div></div>
                </div>
                <div class="post-content">${contentDisplay}</div>
                <div class="comment-section" id="comments-${post.id}">
                    <textarea class="comment-input" placeholder="Write a comment..." id="comment-input-${post.id}" maxlength="500"></textarea>
                    <button class="comment-save-btn" id="commentBtn-${post.id}" onclick="saveComment(${post.id})">Post Comment</button>
                    ${commentsHTML}
                </div>
                <div class="post-actions">
                    <div class="action-btn ${post.likedByMe ? 'liked' : ''}" onclick="toggleLike(${post.id}, this)">
                        <span class="aus-like-icon ${post.likes > 0 ? 'filled glow-active' : 'outline'}">
                            <svg viewBox="0 0 100 110" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                                <!-- Три лепестка -->
                                <circle cx="25" cy="45" r="22" class="petal"/>
                                <circle cx="75" cy="45" r="22" class="petal"/>
                                <circle cx="50" cy="25" r="20" class="petal"/>
                                <!-- Центральный круг -->
                                <circle cx="50" cy="85" r="16" class="center"/>
                            </svg>
                        </span>
                        <span class="count">${post.likes || 0}</span>
                    </div>
                    <div class="action-btn" onclick="toggleComments(${post.id})">
                        <span style="font-size:1.2rem">💬</span><span class="count">${post.comments?.length||0}</span>
                    </div>
                    <div class="action-btn ${post.repostedByMe?'reposted':''}" onclick="toggleRepost(${post.id},this)">
                        <span style="font-size:1.2rem">🔁</span><span>${post.reposts||0}</span>
                    </div>
                </div>
            </article>`;
        }).join('');
    }
    container.innerHTML = html;
}

function saveComment(postId) {
    if (window.isCommenting[postId]) return;
    const btn = document.getElementById(`commentBtn-${postId}`);
    const input = document.getElementById(`comment-input-${postId}`);
    const comment = input.value.trim();
    if (!comment || comment.length > 500) { showToast(comment ? 'Max 500 chars' : 'Enter comment', 'error'); return; }
    window.isCommenting[postId] = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    const posts = safeGetItem('feedPosts', []);
    const idx = posts.findIndex(p => p.id === postId);
    if (idx !== -1) {
        if (!posts[idx].comments) posts[idx].comments = [];
        if (posts[idx].comments.length >= window.MAX_COMMENTS_PER_POST) {
            showToast(`Max ${window.MAX_COMMENTS_PER_POST} comments per post`, 'error');
            resetCommentButton(postId);
            return;
        }
        const totalCommentSize = posts[idx].comments.reduce((sum, c) => sum + c.length, 0) + comment.length;
        if (totalCommentSize > window.MAX_COMMENT_CHARS_PER_POST) {
            showToast('Comments too large for this post', 'error');
            resetCommentButton(postId);
            return;
        }
        posts[idx].comments.unshift(comment);
        if (safeSetItem('feedPosts', posts)) {
            loadPosts();
            renderPinnedPosts();
            showToast('Comment saved!');
            resetCommentButton(postId);
        } else {
            showToast('Failed to save comment', 'error');
            resetCommentButton(postId);
        }
    } else {
        resetCommentButton(postId);
    }
}

function resetCommentButton(postId) {
    window.isCommenting[postId] = false;
    const btn = document.getElementById(`commentBtn-${postId}`);
    if (btn) { btn.disabled = false; btn.textContent = 'Post Comment'; }
}

function toggleComments(postId) {
    const cs = document.getElementById(`comments-${postId}`);
    if (!cs) return;
    document.querySelectorAll('.comment-section').forEach(el => {
        if (el.id !== `comments-${postId}`) el.classList.remove('visible');
    });
    cs.classList.toggle('visible');
}

function toggleLike(id, btn) {
    const posts = safeGetItem('feedPosts', []);
    const post = posts.find(p => p.id === id);
    if (!post) return;

    const wasLiked = post.likedByMe;

    if (wasLiked) {
        post.likes = Math.max(0, post.likes - 1);
        post.likedByMe = false;
        btn.classList.remove('liked');
    } else {
        post.likes++;
        post.likedByMe = true;
        btn.classList.add('liked');
    }

    btn.querySelector('.count').textContent = post.likes;

    const icon = btn.querySelector('.aus-like-icon');
    if (icon) {
        if (post.likes > 0) {
            icon.classList.add('filled');
            if (!wasLiked && post.likes === 1) {
                icon.classList.add('glow-active');
            }
        } else {
            icon.classList.remove('filled', 'glow-active');
        }
    }

    safeSetItem('feedPosts', posts);
    loadPosts();
}

function toggleRepost(id, btn) {
    const posts = safeGetItem('feedPosts', []);
    const post = posts.find(p => p.id === id);
    if (!post) return;
    post.repostedByMe = !post.repostedByMe;
    post.reposts = (post.reposts||0) + (post.repostedByMe ? 1 : -1);
    btn.classList.toggle('reposted', post.repostedByMe);
    btn.querySelector('span:last-child').textContent = post.reposts;
    safeSetItem('feedPosts', posts);
    showToast(post.repostedByMe ? 'Reposted!' : 'Repost removed');
}

function initMockUsers() {
    if (!localStorage.getItem('users')) {
        safeSetItem('users', [
            {id:'u1',username:'@cryptobros',bio:'Founder',wallet:'C4jGvk7MwKPPpKXVDCzkToVF5NKLq84a5hT9C4NHD4q6'},
            {id:'u2',username:'@AuraSpace',bio:'AI Tribunal',wallet:'7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'}
        ]);
    }
}
