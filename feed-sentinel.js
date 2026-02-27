class SentinelSwarm {
    constructor() {
        this.patterns = {
            scam: [/rug\s*pull/i, /send\s+sol/i, /double\s+crypto/i, /private\s+key/i, /seed\s+phrase/i, /guaranteed\s+profit/i],
            urgency: [/\b(now|urgent|fast|limited|last\s+chance|act\s+fast)\b/i],
            urls: /(https?:\/\/[^\s]+)/g
        };
        this.blacklist = JSON.parse(localStorage.getItem('walletBlacklist')) || [];
        this.walletPatterns = JSON.parse(localStorage.getItem('walletPatterns')) || ['scam','0000','dead','fake'];
        this.wisdomScore = parseFloat(localStorage.getItem('wisdomScore')) || 0;
        this.lastWisdomUpdate = parseInt(localStorage.getItem('lastWisdomUpdate')) || Date.now();
        this.juryCount = parseInt(localStorage.getItem('juryCount')) || 0;
        this.userAUS = parseInt(localStorage.getItem('mockAUS')) || 0;
        this.checkWisdomDecay();
    }

    checkWisdomDecay() {
        const days = (Date.now() - this.lastWisdomUpdate) / (1000*60*60*24);
        if (days >= 7 && this.wisdomScore > 0) {
            this.wisdomScore = Math.max(0, this.wisdomScore - 1);
            this.lastWisdomUpdate = Date.now();
            localStorage.setItem('wisdomScore', this.wisdomScore.toString());
            localStorage.setItem('lastWisdomUpdate', this.lastWisdomUpdate.toString());
        }
    }

    analyzePatterns(content) {
        let risk = 0; const factors = [];
        if (this.patterns.scam.some(p => p.test(content))) { risk += 0.4; factors.push('Scam pattern detected'); }
        const urg = (content.match(this.patterns.urgency[0])||[]).length;
        const caps = (content.match(/[A-Z]/g)||[]).length / Math.max(1, content.length);
        const excl = (content.match(/!/g)||[]).length;
        if (urg > 0 || caps > 0.3 || excl > 3) { risk += 0.25; factors.push('FOMO/urgency signals'); }
        const urls = content.match(this.patterns.urls) || [];
        if (urls.length > 2) { risk += 0.2; factors.push('Multiple external links'); }
        return { risk: Math.min(1, risk), factors };
    }

    analyzeWallet(wallet) {
        if (!wallet || wallet === 'guest') return { risk: 0.1, factors: ['Guest user'] };
        if (this.blacklist.includes(wallet)) return { risk: 0.9, factors: ['Wallet in blacklist'] };
        const wl = wallet.toLowerCase();
        if (this.walletPatterns.some(p => wl.includes(p))) return { risk: 0.3, factors: ['Suspicious pattern'] };
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) return { risk: 1.0, factors: ['Invalid wallet format'] };
        return { risk: 0.1, factors: ['Wallet OK'] };
    }

    isValidWallet(w) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w); }

    vote(content, wallet, isNewUser) {
        const pv = this.analyzePatterns(content), wv = this.analyzeWallet(wallet);
        if (wv.risk === 1.0) return { score: 1.0, action: 'BLOCK', factors: wv.factors, agentVotes: { pattern: 0, wallet: 1 }, thresholds: { block: 0.55, review: 0.3 }, weights: { pattern: 0.6, wallet: 0.3 } };
        let pw = 0.6, ww = 0.3;
        if (this.juryCount > 0 && this.juryCount % 10 === 0) {
            const m = (Math.random()-0.5)*0.1;
            pw = Math.max(0.4, Math.min(0.8, pw+m));
            ww = Math.max(0.1, Math.min(0.5, ww-m*0.5));
        }
        const wr = pv.risk*pw + wv.risk*ww + (isNewUser ? 0.1 : 0);
        const bt = Math.max(0.55, 0.7 - this.wisdomScore*0.015);
        const rt = Math.max(0.3, 0.45 - this.wisdomScore*0.01);
        let act = 'PUBLISH';
        if (wr >= bt) act = 'BLOCK'; else if (wr >= rt) act = 'REVIEW';
        return {
            score: parseFloat(wr.toFixed(2)), action: act,
            factors: [...pv.factors, ...wv.factors],
            agentVotes: { pattern: parseFloat(pv.risk.toFixed(2)), wallet: parseFloat(wv.risk.toFixed(2)) },
            thresholds: { block: parseFloat(bt.toFixed(2)), review: parseFloat(rt.toFixed(2)) },
            weights: { pattern: parseFloat(pw.toFixed(2)), wallet: parseFloat(ww.toFixed(2)) }
        };
    }

    awardAUS(amt=1) { this.userAUS += amt; localStorage.setItem('mockAUS', this.userAUS.toString()); return this.userAUS; }
    getWisdomScore() { return this.wisdomScore; }
    getJuryCount() { return this.juryCount; }

    static cleanupStorage() {
        try {
            const posts = JSON.parse(localStorage.getItem('feedPosts')) || [];
            const pc = parseInt(localStorage.getItem('postCountSinceCleanup')) || 0;
            if (pc >= 50 || posts.length > 200) {
                const td = Date.now() - 30*24*60*60*1000;
                const cl = posts.filter(p => p.timestamp > td).slice(0, 200);
                if (cl.length !== posts.length) localStorage.setItem('feedPosts', JSON.stringify(cl));
                localStorage.setItem('postCountSinceCleanup', '0');
            } else localStorage.setItem('postCountSinceCleanup', String(pc+1));
        } catch(e) { console.error('Cleanup failed:', e); }
    }
}

window.sentinel = new SentinelSwarm();
