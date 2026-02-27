// Глобальная переменная для интервала трендов
window.trendsInterval = null;

function initTrends() {
    const trendData = {
        trend1: { value: 2100, prev: 2100, name: '#WIF Pump' },
        trend2: { value: 1800, prev: 1800, name: '#SOL Buy' },
        trend3: { value: 942, prev: 942, name: '#TribunalVote' }
    };

    window.trendsInterval = setInterval(() => {
        Object.keys(trendData).forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            const delta = Math.floor(Math.random() * 21) - 10;
            trendData[id].prev = trendData[id].value;
            trendData[id].value = Math.max(0, trendData[id].value + delta);

            const diff = trendData[id].value - trendData[id].prev;
            let indicator = '↑ +0';
            let className = 'trend-up';

            if (diff > 0) {
                indicator = '↑ +' + diff;
                className = 'trend-up';
            } else if (diff < 0) {
                indicator = '↓ ' + diff;
                className = 'trend-down';
            }

            const formatted = trendData[id].value >= 1000
                ? (trendData[id].value / 1000).toFixed(1) + 'k'
                : trendData[id].value;

            el.innerHTML = `${formatted} <span class="trend-indicator ${className}">${indicator}</span>`;
        });
    }, 30000);
}

window.cleanupTrends = function() {
    if (window.trendsInterval) {
        clearInterval(window.trendsInterval);
        window.trendsInterval = null;
    }
};

window.addEventListener('beforeunload', () => {
    cleanupTrends();
});
