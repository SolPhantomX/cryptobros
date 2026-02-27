const postInput = document.getElementById('postInput');
const charCount = document.getElementById('charCount');

if (postInput && charCount) {
    postInput.addEventListener('input', function() {
        const len = postInput.value.length;
        charCount.textContent = len + ' / 2000';
        if (len >= 2000) {
            charCount.style.color = 'var(--error)';
            postInput.disabled = true;
            if (typeof showToast === 'function') showToast('Max length reached!', 'warning');
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

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded fired');

    if (typeof window.initTheme === 'function') window.initTheme();
    if (typeof window.initMockUsers === 'function') window.initMockUsers();
    if (typeof window.initTrends === 'function') window.initTrends();
    if (typeof window.loadPosts === 'function') window.loadPosts();
    if (typeof window.applyFeedBg === 'function') window.applyFeedBg();
    if (typeof window.renderPinnedPosts === 'function') window.renderPinnedPosts();
    if (typeof window.applyCustomColors === 'function') window.applyCustomColors();

    const btn = document.getElementById('feedBgBtn');
    if (btn) {
        btn.addEventListener('click', function() {
            if (typeof window.openFeedBgModal === 'function') {
                window.openFeedBgModal();
            } else {
                console.error('openFeedBgModal not found');
                if (typeof showToast === 'function') showToast('Error: Settings function not loaded', 'error');
            }
        });
        console.log('Gear button listener attached');
    }

    const upload = document.getElementById('feedBgUpload');
    if (upload) {
        upload.addEventListener('change', function(e) {
            if (typeof window.handleBgUpload === 'function') window.handleBgUpload(e.target.files[0]);
        });
    }

    const modal = document.getElementById('feedBgModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal && typeof window.closeFeedBgModal === 'function') window.closeFeedBgModal();
        });
        modal.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && typeof window.closeFeedBgModal === 'function') window.closeFeedBgModal();
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && typeof window.closeFeedBgModal === 'function') window.closeFeedBgModal();
    });

    console.log('Feed initialization complete');
});
