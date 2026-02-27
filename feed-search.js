(function() {
    'use strict';

    const input = document.getElementById('globalSearchInput');
    const results = document.getElementById('searchResultsBox');
    const clearBtn = document.getElementById('searchClearBtn');
    const container = document.getElementById('searchContainer');

    if (!input || !results || !container) return;

    let timeout = null;
    let hoverResults = false;

    const getUsers = () => safeGetItem('users', []);
    const getPosts = () => safeGetItem('feedPosts', []);
    const normalize = str => (str || '').toLowerCase().trim();

    const searchUsers = query => {
        return getUsers().filter(u =>
            normalize(u.username).includes(query) ||
            normalize(u.bio || '').includes(query)
        ).slice(0, 5);
    };

    const searchPosts = query => {
        return getPosts().filter(p =>
            normalize(p.content || '').includes(query) ||
            (query.startsWith('#') && normalize(p.content || '').includes(query))
        ).slice(0, 5);
    };

    const searchTokens = query => {
        const tokens = [
            { symbol: 'AUS', name: 'AURASPACE', chain: 'Solana', address: '' },
            { symbol: 'SOL', name: 'Solana', chain: 'Solana', address: '' },
            { symbol: 'WIF', name: 'dogwifhat', chain: 'Solana', address: '' }
        ];
        return tokens.filter(t =>
            normalize(t.symbol).includes(query) ||
            normalize(t.name).includes(query)
        ).slice(0, 5);
    };

    const searchHashtags = query => {
        if (!query.startsWith('#')) return [];
        const allHashtags = [...new Set(getPosts().flatMap(p =>
            (p.content || '').match(/#\w+/g) || []
        ))];
        return allHashtags
            .filter(h => normalize(h).includes(query))
            .slice(0, 5)
            .map(h => ({
                tag: h,
                count: getPosts().filter(p => (p.content || '').includes(h)).length
            }));
    };

    const createResult = (item, type) => {
        const el = document.createElement('div');
        el.className = 'search-result-item';

        const icons = { user: '👤', post: '📝', token: '💰', hashtag: '#' };
        let title, subtitle;

        switch(type) {
            case 'user':
                title = escapeHtml(item.username);
                subtitle = escapeHtml(item.bio || '');
                el.onclick = () => location.href = `profile.html?user=${item.id || ''}`;
                break;
            case 'post':
                title = escapeHtml(item.username);
                subtitle = escapeHtml((item.content || '').slice(0, 50) + (item.content?.length > 50 ? '...' : ''));
                break;
            case 'token':
                title = `$${escapeHtml(item.symbol)}`;
                subtitle = escapeHtml(item.name || '');
                el.onclick = () => window.open(`https://dexscreener.com/solana/${item.address || ''}`, '_blank');
                break;
            case 'hashtag':
                title = escapeHtml(item.tag);
                subtitle = `${item.count} posts`;
                el.onclick = () => {
                    input.value = item.tag;
                    performSearch(normalize(item.tag));
                };
                break;
        }

        el.innerHTML = `
            <span class="result-icon">${icons[type] || ''}</span>
            <div class="result-content">
                <div class="result-title">${title}</div>
                <div class="result-subtitle">${subtitle}</div>
            </div>
            <span class="result-type ${type}">${type}</span>
        `;
        return el;
    };

    const performSearch = async query => {
        if (!query || query.length < 2) {
            results.style.display = 'none';
            results.innerHTML = '';
            return;
        }

        results.innerHTML = '<div class="search-loading">Searching...</div>';
        results.style.display = 'block';

        const [users, posts, tokens, hashtags] = await Promise.all([
            searchUsers(query),
            searchPosts(query),
            searchTokens(query),
            searchHashtags(query)
        ]);

        results.innerHTML = '';

        const sections = [
            { data: hashtags, type: 'hashtag', title: 'Hashtags', color: '#9D00FF' },
            { data: users, type: 'user', title: 'Users', color: '#9D00FF' },
            { data: tokens, type: 'token', title: 'Tokens', color: '#FFD700' },
            { data: posts, type: 'post', title: 'Posts', color: '#00F0FF' }
        ];

        let hasResults = false;
        sections.forEach(sec => {
            if (sec.data?.length) {
                hasResults = true;
                const header = document.createElement('div');
                header.style.cssText = `padding:0.75rem 1rem;font-weight:600;color:${sec.color};border-bottom:1px solid var(--border-color);font-size:0.8rem;text-transform:uppercase;`;
                header.textContent = sec.title;
                results.appendChild(header);
                sec.data.forEach(item => results.appendChild(createResult(item, sec.type)));
            }
        });

        if (!hasResults) {
            results.innerHTML = '<div class="search-empty">No results found.</div>';
        }
    };

    input.addEventListener('input', e => {
        const query = e.target.value.trim();
        if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';
        clearTimeout(timeout);
        timeout = setTimeout(() => performSearch(query), 400);
    });

    results.addEventListener('mouseenter', () => hoverResults = true);
    results.addEventListener('mouseleave', () => hoverResults = false);

    input.addEventListener('focus', () => {
        if (input.value.trim()) performSearch(input.value);
    });

    input.addEventListener('blur', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            if (!hoverResults && !input.value.trim()) {
                results.style.display = 'none';
                results.innerHTML = '';
            }
        }, 500);
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            results.style.display = 'none';
            results.innerHTML = '';
            clearBtn.style.display = 'none';
            input.focus();
        });
    }

    document.addEventListener('click', e => {
        if (!e.target.closest('#searchContainer') && !e.target.closest('.search-result-item')) {
            results.style.display = 'none';
            results.innerHTML = '';
        }
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            results.style.display = 'none';
            results.innerHTML = '';
            input.blur();
        }
    });

    console.log('Search initialized');
})();
