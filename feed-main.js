// feed-main.js
// Entry point for feed initialization

const postInput = document.getElementById('postInput');
const charCount = document.getElementById('charCount');

// Character count logic
if (postInput && charCount) {
    postInput.addEventListener('input', () => {
        const len = postInput.value.length;
        charCount.textContent = len + ' / 2000';
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

// DOM Loaded Event
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired');

    // Initialize Theme (from feed-utils.js)
    if (typeof initTheme === 'function') {
        initTheme();
    } else {
        console.error('initTheme not found. Check feed-utils.js');
    }

    // Initialize Mock Users (from feed-ui.js)
    if (typeof initMockUsers === 'function') {
        initMockUsers();
    }

    // Initialize Trends (from feed-trends.js)
    if (typeof initTrends === 'function') {
        initTrends();
    }

    // Load Posts (from feed-ui.js)
    if (typeof loadPosts === 'function') {
        loadPosts();
    }

    // Apply Background (from feed-background.js)
    if (typeof applyFeedBg === 'function') {
        applyFeedBg();
    }

    // Render Pinned Posts (from feed-background.js)
    if (typeof renderPinnedPosts === 'function') {
        renderPinnedPosts();
    }

    // Apply Custom Colors (from feed-utils.js)
    if (typeof applyCustomColors === 'function') {
        applyCustomColors();
    }

    // Gear Button Listener (Settings)
    const btn = document.getElementById('feedBgBtn');
    if (btn) {
        btn.addEventListener('click', () => {
            if (typeof openFeedBgModal === 'function') {
                openFeedBgModal();
            } else {
                console.error('openFeedBgModal not found. Check feed-background.js');
                showToast('Error: Settings function not loaded', 'error');
            }
        });
        console.log('Gear button listener attached');
    } else {
        console.error('Gear button not found in DOM');
    }

    // Background Upload Listener
    const upload = document.getElementById('feedBgUpload');
    if (upload) {
        upload.addEventListener('change', e => {
            if (typeof handleBgUpload === 'function') {
                handleBgUpload(e.target.files[0]);
            }
        });
    }

    // Modal Close Listeners
    const modal = document.getElementById('feedBgModal');
    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target === modal && typeof closeFeedBgModal === 'function') {
                closeFeedBgModal();
            }
        });
        modal.addEventListener('keydown', e => {
            if (e.key === 'Escape' && typeof closeFeedBgModal === 'function') {
                closeFeedBgModal();
            }
        });
    }

    // Global Escape Key Listener
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && typeof closeFeedBgModal === 'function') {
            closeFeedBgModal();
        }
    });

    console.log('Feed initialization complete');
});
