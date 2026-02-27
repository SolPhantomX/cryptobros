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

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOMContentLoaded fired');
    
    initTheme();
    initMockUsers();
    initTrends();
    loadPosts();
    applyFeedBg();
    renderPinnedPosts();
    applyCustomColors();
    
    // FIX: Явная инициализация кнопки с отладкой
    const btn = document.getElementById('feedBgBtn');
    console.log('Gear button found:', btn);
    
    if (btn) {
        btn.addEventListener('click', () => {
            console.log('Gear button clicked!');
            if (typeof window.openFeedBgModal === 'function') {
                window.openFeedBgModal();
            } else {
                console.error('openFeedBgModal is not defined!');
                showToast('Error: Modal function not loaded', 'error');
            }
        });
        console.log('Gear button listener attached');
    } else {
        console.error('Gear button NOT found in DOM!');
    }
    
    const upload = document.getElementById('feedBgUpload');
    if (upload) {
        upload.addEventListener('change', e => {
            console.log('File upload triggered');
            handleBgUpload(e.target.files[0]);
        });
    }
    
    const modal = document.getElementById('feedBgModal');
    if (modal) {
        modal.addEventListener('click', e => { 
            if (e.target === modal) {
                console.log('Modal backdrop clicked');
                closeFeedBgModal();
            }
        });
        modal.addEventListener('keydown', e => { 
            if (e.key === 'Escape') closeFeedBgModal(); 
        });
        console.log('Modal listeners attached');
    }
    
    document.addEventListener('keydown', e => { 
        if (e.key === 'Escape') closeFeedBgModal(); 
    });
    
    console.log('✅ Feed initialization complete');
});
