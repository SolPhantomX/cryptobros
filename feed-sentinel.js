<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark light">
  <title>CRYPTOBROS - Profile</title>
  <!-- Fixed CSP with data: for images -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: https: data: ; connect-src 'self'; base-uri 'self'; form-action 'self'">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    :root {
      --bg-color: #000;
      --text-color: #ffcc00;
      --secondary-text: #aaa;
      --border-color: #555;
      --menu-bg: #000;
      --input-bg: rgba(0,0,0,0.4);
      --btn-bg: #4267B2;
      --btn-text: white;
      --toast-bg: #00ff9d;
      --toast-text: #000;
      --toast-error-bg: #ff4d4d;
      --toast-error-text: white;
      --toast-warning-bg: #ffd700;
      --toast-warning-text: #000;
    }
    
    body.light-mode {
      --bg-color: #f5f7fa;
      --text-color: #1a1a2e;
      --secondary-text: #666;
      --border-color: #ccc;
      --menu-bg: #fff;
      --input-bg: #fff;
      --btn-bg: #4267B2;
      --btn-text: white;
      --toast-bg: #00cc7a;
      --toast-text: #fff;
      --toast-error-bg: #ff4d4d;
      --toast-error-text: white;
      --toast-warning-bg: #ffaa00;
      --toast-warning-text: #000;
    }
    
    body {
      font-family: Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      transition: background-color 0.3s ease, color 0.3s ease, background-image 0.5s ease-in-out;
      margin: 0;
      padding: 0;
    }
    
    .top-section { 
      position: relative; 
      height: 300px; 
      margin-top: 40px;
    }
    
    .header {
      width: 100%; 
      height: 100%; 
      background: #333 center/cover no-repeat;
      border: 2px dashed var(--border-color); 
      border-radius: 8px; 
      cursor: pointer;
      transition: border 0.3s ease;
    }
    
    .header.loaded { border: none; }
    
    .avatar {
      width: 150px; 
      height: 150px; 
      border-radius: 50%;
      border: 4px solid white; 
      background: #444 center/cover no-repeat;
      position: absolute; 
      bottom: -75px; 
      left: 50%;
      transform: translateX(-50%); 
      cursor: pointer;
      transition: border 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    
    .main-layout {
      max-width: 1200px; 
      margin: 100px auto 0;
      display: flex; 
      gap: 20px; 
      padding: 0 20px;
    }
    
    .theme-switch {
      position: absolute; 
      top: 60px; 
      left: 16px;
      width: 40px; 
      height: 40px; 
      background: #333;
      border: 1px solid var(--border-color); 
      border-radius: 50%;
      display: flex; 
      align-items: center; 
      justify-content: center;
      cursor: pointer; 
      z-index: 100; 
      font-size: 1.4rem;
      transition: all 0.3s ease;
      color: var(--text-color);
    }
    
    .edit-btn {
      position: absolute; 
      top: 60px; 
      right: 16px;
      width: 40px; 
      height: 40px; 
      background: #333;
      border: 1px solid var(--border-color); 
      border-radius: 50%;
      display: flex; 
      align-items: center; 
      justify-content: center;
      cursor: pointer; 
      z-index: 100; 
      font-size: 1.4rem;
      color: var(--text-color);
      transition: all 0.3s ease;
      animation: rotate 8s linear infinite;
      animation-play-state: paused;
    }
    
    .edit-btn:hover {
      animation-play-state: running;
      border-color: #ffcc00;
      box-shadow: 0 0 15px rgba(255, 204, 0, 0.5);
      color: #ffcc00;
    }
    
    @keyframes rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    .edit-menu {
      position: absolute; 
      top: 110px; 
      right: 16px;
      background: var(--menu-bg); 
      border: 1px solid #ffcc00;
      border-radius: 6px; 
      padding: 10px; 
      display: none;
      z-index: 100; 
      min-width: 180px; 
      max-width: 250px;
      max-height: 400px; 
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    
    .edit-menu button {
      background: #222; 
      color: #ffcc00; 
      border: 1px solid #555;
      border-radius: 4px; 
      padding: 6px 10px; 
      margin: 3px 0;
      cursor: pointer; 
      font-size: 12px; 
      display: inline-block;
      width: 100%; 
      text-align: left;
      transition: background 0.2s ease;
    }
    
    body.light-mode .edit-menu button {
      background: #f0f0f0;
      color: #1a1a2e;
      border-color: #ccc;
    }
    
    .edit-menu button:hover { 
      background: #333; 
      border-color: #ffcc00;
    }
    
    body.light-mode .edit-menu button:hover { 
      background: #e0e0e0; 
    }
    
    .sidebar { 
      width: 200px; 
    }
    
    .nav-item {
      padding: 12px 0; 
      color: var(--text-color); 
      font-weight: bold;
      font-size: 1.1rem; 
      text-decoration: none; 
      display: block;
      transition: opacity 0.2s ease;
    }
    
    .nav-item:hover { 
      opacity: 0.8; 
      text-shadow: 0 0 8px var(--text-color);
    }
    
    .main { 
      flex: 1; 
    }
    
    .name { 
      font-size: 2rem; 
      font-weight: bold; 
      margin-bottom: 8px; 
    }
    
    .rank { 
      margin-bottom: 24px; 
      font-weight: bold; 
      color: #ffd700; 
    }
    
    .field-label { 
      color: var(--secondary-text); 
      margin: 12px 0 6px; 
      font-weight: bold; 
    }
    
    .field-value {
      color: var(--text-color);
      margin-bottom: 15px;
    }
    
    input, textarea {
      width: 100%; 
      padding: 12px; 
      margin: 6px 0 16px;
      background: var(--input-bg); 
      color: var(--text-color); 
      border: 1px solid var(--border-color);
      border-radius: 6px; 
      font-size: 1rem;
      transition: border 0.2s ease;
    }
    
    input:focus, textarea:focus {
      outline: none;
      border-color: #00ff9d;
      box-shadow: 0 0 0 2px rgba(0, 255, 157, 0.2);
    }
    
    .btn {
      background: var(--btn-bg); 
      color: var(--btn-text); 
      border: none;
      padding: 12px 24px; 
      border-radius: 6px; 
      cursor: pointer;
      font-weight: bold; 
      margin-top: 12px;
      transition: opacity 0.2s ease;
    }
    
    .btn:hover:not(:disabled) { 
      opacity: 0.9; 
    }
    
    .btn:disabled { 
      opacity: 0.5; 
      cursor: not-allowed; 
    }
    
    .wallet-badge {
      position: absolute; 
      bottom: -80px; 
      left: 50%; 
      transform: translateX(-50%);
      display: flex; 
      align-items: center; 
      gap: 10px; 
      background: rgba(0,0,0,0.9);
      border: 1px solid var(--border-color); 
      border-radius: 24px; 
      padding: 8px 16px;
      cursor: pointer; 
      z-index: 100; 
      white-space: nowrap;
      transition: all 0.3s ease;
    }
    
    body.light-mode .wallet-badge {
      background: rgba(255,255,255,0.9);
    }
    
    .wallet-badge:hover {
      border-color: #00ff9d;
      transform: translateX(-50%) scale(1.05);
      box-shadow: 0 0 15px rgba(0, 255, 157, 0.5);
    }
    
    .badge-indicator { 
      width: 10px; 
      height: 10px; 
      border-radius: 50%; 
      background: #666; 
      transition: background 0.3s ease;
      animation: pulse 2s infinite;
    }
    
    .badge-indicator.connected { 
      background: #00ff9d; 
    }
    
    .badge-indicator.locked { 
      background: #ffd700; 
    }
    
    .badge-text { 
      color: var(--text-color); 
      font-size: 0.9rem; 
      font-weight: 600;
    }
    
    .badge-text.locked { color: #ffd700; }
    
    .badge-note {
      font-size: 10px;
      color: #ff9999;
      margin-left: 5px;
      font-style: italic;
    }
    
    #header-upload, #avatar-upload, #bg-upload { 
      display: none; 
    }
    
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 24px;
      border-radius: 8px;
      z-index: 9999;
      font-weight: bold;
      animation: slideIn 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    
    .toast.success { background: var(--toast-bg); color: var(--toast-text); }
    .toast.error { background: var(--toast-error-bg); color: var(--toast-error-text); }
    .toast.warning { background: var(--toast-warning-bg); color: var(--toast-warning-text); }
    
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    
    @media (prefers-reduced-motion: reduce) {
      .name, .rank, .nav-item, .field-value,
      .badge-indicator, .edit-btn {
        animation: none !important;
        transition: none !important;
      }
      .edit-btn:hover { transform: none !important; }
    }
    
    .invite-gen-btn {
      position: fixed; right: 0; top: 50%; transform: translateY(-50%);
      width: 60px; height: 140px; background: linear-gradient(180deg, #6644ff, #4488ff);
      border: none; border-radius: 16px 0 0 16px; color: white;
      font-weight: 800; font-size: 14px; cursor: pointer; z-index: 200; display: none;
      writing-mode: vertical-rl; text-orientation: mixed; transition: all 0.3s ease;
    }
    
    .invite-gen-btn.visible { display: flex; align-items: center; justify-content: center; }
    .invite-gen-btn:hover { width: 70px; background: linear-gradient(180deg, #7755ff, #5599ff); }
    
    .invite-modal-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.92); align-items: center; justify-content: center; z-index: 300;
    }
    .invite-modal-overlay.active { display: flex; }
    
    .invite-modal {
      background: var(--menu-bg); border: 2px solid #ffcc00; border-radius: 16px;
      padding: 24px; max-width: 380px; width: 90%; text-align: center; position: relative;
    }
    
    .invite-close-btn {
      position: absolute; top: 12px; right: 16px; background: none;
      border: none; color: #ffcc00; font-size: 28px; cursor: pointer; transition: color 0.2s ease;
    }
    .invite-close-btn:hover { color: #ff4d4d; }
    
    .invite-tier-select { display: flex; flex-direction: column; gap: 12px; margin: 20px 0; }
    
    .invite-tier-option {
      display: flex; align-items: center; gap: 12px; padding: 12px;
      background: #222; border: 2px solid #555; border-radius: 10px; cursor: pointer; transition: all 0.2s ease;
    }
    body.light-mode .invite-tier-option { background: #f0f0f0; }
    .invite-tier-option.selected {
      border-color: #00ff9d; background: rgba(0, 255, 157, 0.1); transform: scale(1.02);
    }
    .invite-tier-option.selected input + span { font-weight: bold; color: #00ff9d; }
    .invite-tier-option input { width: auto; margin: 0; cursor: pointer; }
    
    .invite-generate-btn {
      width: 100%; padding: 14px; background: #4267B2; color: white;
      border: none; border-radius: 10px; cursor: pointer; font-weight: bold; transition: opacity 0.2s ease;
    }
    .invite-generate-btn:hover { opacity: 0.9; }
    
    .invite-result { margin-top: 20px; padding: 16px; border: 2px dashed #00ff9d; border-radius: 12px; display: none; }
    .invite-result.active { display: block; }
    
    .invite-code { font-family: monospace; font-size: 1.8rem; font-weight: bold; color: #00ff9d; margin: 12px 0; word-break: break-all; }
    
    .invite-copy-btn {
      background: transparent; border: 1px solid #00ff9d; color: #00ff9d;
      padding: 8px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: all 0.2s ease;
    }
    .invite-copy-btn:hover { background: rgba(0, 255, 157, 0.1); transform: scale(1.05); }
    
    @media (max-width: 768px) {
      .main-layout { flex-direction: column; }
      .sidebar { width: 100%; display: flex; flex-wrap: wrap; gap: 10px; }
      .nav-item { padding: 8px 12px; }
      .invite-gen-btn {
        writing-mode: horizontal-tb; width: auto; height: 50px; padding: 0 20px;
        border-radius: 30px 0 0 30px; top: auto; bottom: 20px;
      }
    }
    
    :focus-visible { outline: 3px solid #00ff9d; outline-offset: 2px; }
    
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }
  </style>
</head>
<body>
  <div class="top-section">
    <div class="header" id="header" role="button" aria-label="Change header image" tabindex="0"></div>
    <div class="avatar" id="avatar" role="button" aria-label="Change avatar image" tabindex="0"></div>
    
    <div class="wallet-badge" id="walletBadge" role="button" aria-label="Connect wallet" tabindex="0">
      <div class="badge-indicator" id="badgeIndicator"></div>
      <div class="badge-text" id="badgeText">Connect Wallet</div>
    </div>
    
    <div class="theme-switch" id="themeSwitch" role="button" aria-label="Toggle theme" tabindex="0" aria-pressed="false">🌙</div>
    <div class="edit-btn" id="editBtn" role="button" aria-label="Edit profile" tabindex="0">⚙️</div>
    <div class="edit-menu" id="editMenu" role="menu"></div>
  </div>
  
  <div class="main-layout">
    <div class="sidebar" role="navigation">
      <a href="#" class="nav-item">📰 News Feed</a>
      <a href="#" class="nav-item">💬 Messages</a>
      <a href="#" class="nav-item">👥 My Groups</a>
      <a href="#" class="nav-item">⚖️ Tribunal</a>
      <a href="#" class="nav-item">👫 My Friends</a>
      <a href="#" class="nav-item">❓ Help Desk</a>
      <a href="#" class="nav-item">📰 CryptoNews</a>
    </div>
    <div class="main" id="profileContent">
      <div class="name" id="displayName">@Cryptobros</div>
      <div class="rank" id="displayRank">FREE TIER</div>
      
      <div class="field-label">Username</div>
      <input type="text" id="inputName" maxlength="20" value="@Cryptobros" aria-label="Username">
      
      <div class="field-label">Bio</div>
      <textarea id="inputBio" rows="3" maxlength="200" aria-label="Bio"></textarea>
      
      <div class="field-label">Location</div>
      <input type="text" id="inputLocation" maxlength="50" aria-label="Location">
      
      <div class="field-label">Twitter</div>
      <input type="text" id="inputTwitter" maxlength="30" aria-label="Twitter handle">
      
      <div class="field-label">Website</div>
      <input type="text" id="inputWebsite" maxlength="100" aria-label="Website URL">
      
      <button class="btn" id="saveProfileBtn" aria-label="Save profile changes">💾 Save Changes</button>
    </div>
  </div>

  <input type="file" id="header-upload" accept="image/*" aria-hidden="true">
  <input type="file" id="avatar-upload" accept="image/*" aria-hidden="true">
  <input type="file" id="bg-upload" accept="image/*" aria-hidden="true">

  <button class="invite-gen-btn" id="inviteGenBtn" aria-label="Generate invite code">🎫<br>INVITE</button>

  <div class="invite-modal-overlay" id="inviteModal" role="dialog" aria-modal="true" aria-label="Generate invite code">
    <div class="invite-modal">
      <button class="invite-close-btn" id="inviteCloseBtn" aria-label="Close modal">×</button>
      <h3>🎫 Generate Invite</h3>
      <div class="invite-tier-select">
        <label class="invite-tier-option">
          <input type="radio" name="inviteTier" value="MASTER" checked> <span>Master</span>
        </label>
        <label class="invite-tier-option">
          <input type="radio" name="inviteTier" value="PRO"> <span>Pro</span>
        </label>
        <label class="invite-tier-option">
          <input type="radio" name="inviteTier" value="PREMIUM"> <span>Premium</span>
        </label>
      </div>
      <button class="invite-generate-btn" id="inviteGenerateBtn">Generate Code</button>
      <div class="invite-result" id="inviteResult">
        <div class="invite-code" id="inviteCodeDisplay"></div>
        <button class="invite-copy-btn" id="inviteCopyBtn">📋 Copy Code</button>
      </div>
    </div>
  </div>

  <div class="sr-only" aria-live="polite" id="announcer"></div>

  <script>
    (function() {
      'use strict';

      // Check localStorage availability
      function isLocalStorageAvailable() {
        try {
          const test = '__test__';
          localStorage.setItem(test, test);
          localStorage.removeItem(test);
          return true;
        } catch (e) {
          return false;
        }
      }

      const storageAvailable = isLocalStorageAvailable();
      if (!storageAvailable) {
        console.warn('localStorage not available - profile changes will not persist');
      }

      // Get elements safely
      const header = document.getElementById('header');
      const avatar = document.getElementById('avatar');
      const themeSwitch = document.getElementById('themeSwitch');
      const editBtn = document.getElementById('editBtn');
      const editMenu = document.getElementById('editMenu');
      const uploadHeader = document.getElementById('header-upload');
      const uploadAvatar = document.getElementById('avatar-upload');
      const uploadBg = document.getElementById('bg-upload');
      const walletBadge = document.getElementById('walletBadge');
      const badgeIndicator = document.getElementById('badgeIndicator');
      const badgeText = document.getElementById('badgeText');
      const displayName = document.getElementById('displayName');
      const displayRank = document.getElementById('displayRank');
      const inputName = document.getElementById('inputName');
      const inputBio = document.getElementById('inputBio');
      const inputLocation = document.getElementById('inputLocation');
      const inputTwitter = document.getElementById('inputTwitter');
      const inputWebsite = document.getElementById('inputWebsite');
      const saveBtn = document.getElementById('saveProfileBtn');
      
      const inviteGenBtn = document.getElementById('inviteGenBtn');
      const inviteModal = document.getElementById('inviteModal');
      const inviteCloseBtn = document.getElementById('inviteCloseBtn');
      const inviteGenerateBtn = document.getElementById('inviteGenerateBtn');
      const inviteResult = document.getElementById('inviteResult');
      const inviteCodeDisplay = document.getElementById('inviteCodeDisplay');
      const inviteCopyBtn = document.getElementById('inviteCopyBtn');
      const tierRadios = document.querySelectorAll('input[name="inviteTier"]');
      const announcer = document.getElementById('announcer');

      if (!header || !avatar || !themeSwitch) {
        console.error('Critical elements missing');
        return;
      }

      const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
      const STORAGE_KEY = 'cryptobros_profile';
      const THEME_KEY = 'cryptobros_theme';

      let profile = {
        name: '@Cryptobros', 
        bio: '', 
        location: '', 
        twitter: '', 
        website: '',
        avatar: '', 
        header: '', 
        bg: '', 
        tier: 'FREE', 
        wallet: null
      };

      // Twitter validation
      function validateTwitter(twitter, showWarnings = true) {
        if (!twitter) return true;
        const twitterRegex = /^@?[A-Za-z0-9_]{1,15}$/;
        if (!twitterRegex.test(twitter)) {
          if (showWarnings) showNotification('Invalid Twitter handle (max 15 chars, letters, numbers, underscore)', 'warning');
          return false;
        }
        return true;
      }

      // Input validation
      function validateInputs(showWarnings = true) {
        // Validate website
        const website = inputWebsite.value.trim();
        if (website) {
          try {
            const url = new URL(website);
            if (!url.protocol.match(/^https?:$/)) {
              if (showWarnings) showNotification('Website must start with http:// or https://', 'warning');
              return false;
            }
          } catch {
            if (showWarnings) showNotification('Please enter a valid URL (e.g., https://example.com)', 'warning');
            return false;
          }
        }
        
        // Validate Twitter
        const twitter = inputTwitter.value.trim();
        if (twitter && !validateTwitter(twitter, showWarnings)) {
          return false;
        }
        
        // Validate location length
        if (inputLocation.value.length > 50) {
          if (showWarnings) showNotification('Location too long (max 50 chars)', 'warning');
          return false;
        }
        
        return true;
      }

      // Reset profile to defaults
      function resetProfileToDefaults() {
        profile = { 
          name: '@Cryptobros', 
          bio: '', 
          location: '', 
          twitter: '', 
          website: '', 
          avatar: '', 
          header: '', 
          bg: '', 
          tier: 'FREE', 
          wallet: profile?.wallet || null 
        };
      }

      // Show notification
      function showNotification(message, type = 'success') {
        document.querySelectorAll('.toast').forEach(t => t.remove());
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.setAttribute('role', 'alert');
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
          toast.style.animation = 'slideOut 0.3s ease';
          setTimeout(() => toast.remove(), 300);
        }, 3000);
        
        if (announcer) announcer.textContent = message;
      }

      // Load profile from localStorage
      function loadProfile() {
        if (!storageAvailable) {
          resetProfileToDefaults();
          updateUI();
          return;
        }
        
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const data = JSON.parse(saved);
            profile.name = data?.name || '@Cryptobros';
            profile.bio = data?.bio || '';
            profile.location = data?.location || '';
            profile.twitter = data?.twitter || '';
            profile.website = data?.website || '';
            profile.avatar = data?.avatar || '';
            profile.header = data?.header || '';
            profile.bg = data?.bg || '';
            profile.tier = data?.tier || 'FREE';
          } else {
            resetProfileToDefaults();
          }
        } catch (e) { 
          console.warn('Failed to load profile, using defaults');
          resetProfileToDefaults();
        }
        
        updateUI();
      }

      // Check if profile has changed
      function hasProfileChanged() {
        return profile.name !== inputName.value.trim() ||
               profile.bio !== inputBio.value.trim() ||
               profile.location !== inputLocation.value.trim() ||
               profile.twitter !== inputTwitter.value.trim() ||
               profile.website !== inputWebsite.value.trim();
      }

      // Update UI from profile
      function updateUI() {
        inputName.value = profile.name;
        inputBio.value = profile.bio;
        inputLocation.value = profile.location;
        inputTwitter.value = profile.twitter;
        inputWebsite.value = profile.website;
        displayName.textContent = profile.name;
        displayRank.textContent = profile.tier + ' TIER';
        
        if (profile.header) { 
          header.style.backgroundImage = `url("${profile.header}")`;
          header.classList.add('loaded');
        } else {
          header.style.backgroundImage = '';
          header.classList.remove('loaded');
        }
        
        if (profile.avatar) {
          avatar.style.backgroundImage = `url("${profile.avatar}")`;
        } else {
          avatar.style.backgroundImage = '';
        }
        
        if (profile.bg) {
          document.body.style.backgroundImage = `url("${profile.bg}")`;
        } else {
          document.body.style.backgroundImage = '';
        }
        
        updateWalletBadge();
      }

      // Save profile to localStorage
      function saveProfile(showToast = true) {
        if (!storageAvailable) {
          if (showToast) showNotification('Storage not available', 'error');
          return;
        }
        
        if (!validateInputs(showToast)) return;
        
        try {
          profile.name = inputName.value.trim() || '@Cryptobros';
          profile.bio = inputBio.value.trim();
          profile.location = inputLocation.value.trim();
          profile.twitter = inputTwitter.value.trim();
          profile.website = inputWebsite.value.trim();
          
          displayName.textContent = profile.name;
          displayRank.textContent = profile.tier + ' TIER';
          
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            name: profile.name, 
            bio: profile.bio, 
            location: profile.location,
            twitter: profile.twitter, 
            website: profile.website,
            avatar: profile.avatar, 
            header: profile.header, 
            bg: profile.bg, 
            tier: profile.tier
          }));
          
          if (showToast) showNotification('Profile saved!', 'success');
        } catch (e) {
          if (e.name === 'QuotaExceededError') {
            showNotification('Storage full – removing images to save profile', 'error');
            profile.avatar = ''; 
            profile.header = ''; 
            profile.bg = '';
            header.style.backgroundImage = ''; 
            avatar.style.backgroundImage = '';
            document.body.style.backgroundImage = '';
            header.classList.remove('loaded');
            
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify({
                name: profile.name, 
                bio: profile.bio, 
                location: profile.location,
                twitter: profile.twitter, 
                website: profile.website, 
                tier: profile.tier
              }));
              showNotification('Profile saved without images', 'warning');
            } catch (retryError) {
              showNotification('Still failed – try clearing browser data', 'error');
            }
          } else { 
            showNotification('Failed to save profile', 'error'); 
          }
        }
      }

      // Load theme
      function loadTheme() {
        if (!storageAvailable) {
          document.body.classList.remove('light-mode');
          themeSwitch.textContent = '🌙';
          themeSwitch.setAttribute('aria-pressed', 'false');
          return;
        }
        
        try {
          const theme = localStorage.getItem(THEME_KEY);
          if (theme === 'light') {
            document.body.classList.add('light-mode');
            themeSwitch.textContent = '☀️';
            themeSwitch.setAttribute('aria-pressed', 'true');
          } else {
            document.body.classList.remove('light-mode');
            themeSwitch.textContent = '🌙';
            themeSwitch.setAttribute('aria-pressed', 'false');
          }
        } catch (e) { 
          console.warn('Failed to load theme');
          document.body.classList.remove('light-mode');
          themeSwitch.textContent = '🌙';
          themeSwitch.setAttribute('aria-pressed', 'false');
        }
      }

      // Toggle theme
      function toggleTheme() {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        themeSwitch.textContent = isLight ? '☀️' : '🌙';
        themeSwitch.setAttribute('aria-pressed', isLight ? 'true' : 'false');
        
        if (storageAvailable) {
          try { 
            localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark'); 
          } catch (e) { 
            console.warn('Failed to save theme'); 
          }
        }
      }

      // Update wallet badge
      function updateWalletBadge() {
        badgeText.innerHTML = ''; 
        
        if (profile.wallet) {
          badgeIndicator.className = 'badge-indicator connected';
          const short = profile.wallet.length > 10 ? 
            profile.wallet.slice(0, 6) + '...' + profile.wallet.slice(-4) : 
            profile.wallet;
          badgeText.appendChild(document.createTextNode(short));
        } else {
          badgeIndicator.className = 'badge-indicator locked';
          badgeText.appendChild(document.createTextNode('Connect Wallet'));
        }
      }

      // Handle wallet click
      function handleWalletClick() {
        if (!profile.wallet) {
          // Simulate wallet connection
          profile.wallet = '0x' + Array.from({length: 40}, () => 
            Math.floor(Math.random() * 16).toString(16)).join('');
          updateWalletBadge(); 
          saveProfile(false);
          showNotification('Wallet connected!', 'success');
        } else {
          profile.wallet = null; 
          updateWalletBadge(); 
          saveProfile(false);
          showNotification('Wallet disconnected', 'warning');
        }
      }

      // Unified cleanup function for image upload
      function cleanupImageResources(img, objectUrl, timeoutId) {
        clearTimeout(timeoutId);
        URL.revokeObjectURL(objectUrl);
        if (img) {
          img.onload = null;
          img.onerror = null;
        }
      }

      // Handle image upload
      function handleImageUpload(type, file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) { 
          showNotification('Please select an image file', 'error'); 
          return; 
        }
        if (file.size > MAX_FILE_SIZE) { 
          showNotification('File too large (max 2MB)', 'error'); 
          return; 
        }
        
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.src = objectUrl;
        
        let timeoutId = setTimeout(() => {
          cleanupImageResources(img, objectUrl, timeoutId);
          showNotification('Image load timeout', 'error');
        }, 10000);
        
        img.onload = () => {
          cleanupImageResources(img, objectUrl, timeoutId);
          
          if ((type === 'avatar' || type === 'header') && (img.width > 2000 || img.height > 2000)) {
            showNotification('Image too large – may cause layout issues', 'warning');
          }
          if (type === 'bg' && (img.width > 4000 || img.height > 4000)) {
            showNotification('Background too large – may cause performance issues', 'warning');
          }
          
          const reader = new FileReader();
          
          reader.onload = (e) => {
            const dataUrl = e.target.result;
            
            if (dataUrl.length > 5 * 1024 * 1024) {
              showNotification('Image data too large to process', 'error');
              return;
            }
            
            if (type === 'bg') {
              const bgImg = new Image();
              bgImg.onload = () => {
                profile.bg = dataUrl;
                document.body.style.backgroundImage = `url("${dataUrl}")`;
                saveProfile(false);
                showNotification('Background updated!', 'success');
              };
              bgImg.onerror = () => { 
                showNotification('Invalid image file', 'error'); 
              };
              bgImg.src = dataUrl;
            } else {
              profile[type] = dataUrl;
              if (type === 'header') { 
                header.style.backgroundImage = `url("${dataUrl}")`; 
                header.classList.add('loaded'); 
              }
              if (type === 'avatar') {
                avatar.style.backgroundImage = `url("${dataUrl}")`;
              }
              saveProfile(false);
              showNotification(type.charAt(0).toUpperCase() + type.slice(1) + ' updated!', 'success');
            }
          };
          
          reader.onerror = () => { 
            cleanupImageResources(img, objectUrl, timeoutId);
            showNotification('Failed to read file', 'error'); 
          };
          
          reader.readAsDataURL(file);
        };
        
        img.onerror = () => { 
          cleanupImageResources(img, objectUrl, timeoutId);
          showNotification('Invalid image file', 'error'); 
        };
      }

      // Handle file change
      function handleFileChange(type, input) {
        const file = input.files[0];
        if (!file) return;
        handleImageUpload(type, file);
        input.value = '';
      }

      // Handle header/avatar click based on device
      function handleHeaderClick(e) {
        e.preventDefault();
        if (e.currentTarget === header) {
          uploadHeader.click();
        } else if (e.currentTarget === avatar) {
          uploadAvatar.click();
        }
      }

      // Setup invite system
      function setupInviteSystem() {
        if (!inviteModal) return;

        inviteGenBtn.classList.add('visible');
        
        const checkedRadio = document.querySelector('input[name="inviteTier"]:checked');
        if (checkedRadio) {
          checkedRadio.closest('.invite-tier-option')?.classList.add('selected');
        }
        
        let selectedTier = 'MASTER';
        
        tierRadios.forEach(radio => {
          radio.addEventListener('change', () => {
            document.querySelectorAll('.invite-tier-option').forEach(opt => {
              opt.classList.remove('selected');
            });
            if (radio.checked) {
              radio.closest('.invite-tier-option')?.classList.add('selected');
              selectedTier = radio.value;
            }
          });
        });

        inviteGenBtn.addEventListener('click', () => {
          if (!inviteModal) return;
          inviteCodeDisplay.textContent = '';
          inviteResult.classList.remove('active');
          inviteModal.classList.add('active');
          document.body.style.overflow = 'hidden';
          
          const firstFocusable = inviteModal.querySelector('input, button, [href], [tabindex]:not([tabindex="-1"])');
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            inviteCloseBtn.focus();
          }
        });
        
        function closeInviteModal() {
          if (!inviteModal) return;
          inviteModal.classList.remove('active');
          inviteResult.classList.remove('active');
          document.body.style.overflow = '';
          inviteGenBtn.focus();
        }
        
        inviteCloseBtn.addEventListener('click', closeInviteModal);
        
        inviteModal.addEventListener('click', (e) => {
          if (e.target === inviteModal) {
            closeInviteModal();
          }
        });
        
        // Focus trap for modal
        inviteModal.addEventListener('keydown', (e) => {
          if (e.key !== 'Tab') return;
          
          const focusable = inviteModal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          
          if (!focusable.length) return;
          
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          
          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        });
        
        inviteGenerateBtn.addEventListener('click', () => {
          if (!inviteModal) return;
          try {
            const prefixes = { MASTER: 'MAS', PRO: 'PRO', PREMIUM: 'PRE' };
            const prefix = prefixes[selectedTier] || 'MAS';
            const randomNum = Math.floor(10000 + Math.random() * 90000);
            const code = prefix + '-' + randomNum;
            inviteCodeDisplay.textContent = code;
            inviteResult.classList.add('active');
            showNotification('Invite code generated!', 'success');
          } catch (error) {
            showNotification('Failed to generate code', 'error');
            console.error('Generation error:', error);
          }
        });
        
        inviteCopyBtn.addEventListener('click', async () => {
          if (!inviteModal) return;
          const code = inviteCodeDisplay.textContent;
          if (!code) { 
            showNotification('No code to copy', 'error'); 
            return; 
          }
          
          try {
            await navigator.clipboard.writeText(code);
            showNotification('Copied to clipboard!', 'success');
          } catch (err) {
            // Fallback for older browsers
            try {
              const textarea = document.createElement('textarea');
              textarea.value = code; 
              document.body.appendChild(textarea);
              textarea.select(); 
              const success = document.execCommand('copy');
              document.body.removeChild(textarea);
              
              if (success) {
                showNotification('Copied to clipboard!', 'success');
              } else {
                showNotification('Failed to copy', 'error');
              }
            } catch (fallbackErr) {
              showNotification('Failed to copy', 'error');
            }
          }
        });
      }

      // Setup edit menu
      function setupEditMenu() {
        editMenu.innerHTML = `
          <button id="changeHeaderBtn">📷 Change Header</button>
          <button id="changeAvatarBtn">👤 Change Avatar</button>
          <button id="changeBgBtn">🎨 Change Background</button>
          <button id="resetProfileBtn">🔄 Reset Profile</button>
        `;
        
        editBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const isVisible = editMenu.style.display === 'block' || 
                           window.getComputedStyle(editMenu).display === 'block';
          editMenu.style.display = isVisible ? 'none' : 'block';
        });

        editMenu.addEventListener('click', (e) => e.stopPropagation());

        document.getElementById('changeHeaderBtn')?.addEventListener('click', () => { 
          uploadHeader.click(); 
          editMenu.style.display = 'none'; 
        });
        
        document.getElementById('changeAvatarBtn')?.addEventListener('click', () => { 
          uploadAvatar.click(); 
          editMenu.style.display = 'none'; 
        });
        
        document.getElementById('changeBgBtn')?.addEventListener('click', () => { 
          uploadBg.click(); 
          editMenu.style.display = 'none'; 
        });
        
        document.getElementById('resetProfileBtn')?.addEventListener('click', () => {
          if (confirm('Reset all profile data? This cannot be undone.')) {
            const wallet = profile.wallet;
            profile = { 
              name: '@Cryptobros', 
              bio: '', 
              location: '', 
              twitter: '', 
              website: '', 
              avatar: '', 
              header: '', 
              bg: '', 
              tier: 'FREE', 
              wallet: wallet 
            };
            
            updateUI();
            saveProfile(false);
            showNotification('Profile reset successfully', 'warning');
          }
          editMenu.style.display = 'none';
        });
        
        document.addEventListener('click', (e) => { 
          if (!editMenu.contains(e.target) && e.target !== editBtn) { 
            editMenu.style.display = 'none'; 
          } 
        });
      }

      // Debounced auto-save
      let autoSaveTimeout;
      function debounceAutoSave() {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(() => {
          if (document.body.contains(inputName) && hasProfileChanged()) {
            saveProfile(false);
          }
        }, 2000);
      }

      // Handle save button click with debounce
      let isSaving = false;
      async function handleSaveClick() {
        if (isSaving || saveBtn.disabled) return;
        
        isSaving = true;
        saveBtn.disabled = true;
        
        try {
          await Promise.resolve(saveProfile(true));
        } finally {
          saveBtn.disabled = false;
          isSaving = false;
        }
      }

      // Initialize
      function init() {
        loadTheme(); 
        loadProfile(); 
        setupEditMenu(); 
        setupInviteSystem();
        
        themeSwitch.addEventListener('click', toggleTheme);
        walletBadge.addEventListener('click', handleWalletClick);
        saveBtn.addEventListener('click', handleSaveClick);
        
        // Handle click events based on device
        const isTouchDevice = 'ontouchstart' in window;
        
        if (isTouchDevice) {
          header.addEventListener('touchstart', handleHeaderClick, { passive: false });
          avatar.addEventListener('touchstart', handleHeaderClick, { passive: false });
        } else {
          header.addEventListener('click', handleHeaderClick);
          avatar.addEventListener('click', handleHeaderClick);
        }
        
        uploadHeader.addEventListener('change', () => handleFileChange('header', uploadHeader));
        uploadAvatar.addEventListener('change', () => handleFileChange('avatar', uploadAvatar));
        uploadBg.addEventListener('change', () => handleFileChange('bg', uploadBg));
        
        // Keyboard navigation
        const elements = [header, avatar, walletBadge, themeSwitch, editBtn];
        const actions = [
          () => uploadHeader.click(), 
          () => uploadAvatar.click(), 
          handleWalletClick, 
          toggleTheme, 
          () => editBtn.click()
        ];
        
        elements.forEach((el, i) => {
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (actions[i]) actions[i]();
            }
          });
        });
        
        // Auto-save on input
        inputName.addEventListener('input', debounceAutoSave);
        inputBio.addEventListener('input', debounceAutoSave);
        inputLocation.addEventListener('input', debounceAutoSave);
        inputTwitter.addEventListener('input', debounceAutoSave);
        inputWebsite.addEventListener('input', debounceAutoSave);

        // Close modal with Escape
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && inviteModal && inviteModal.classList.contains('active')) {
            inviteModal.classList.remove('active');
            inviteResult.classList.remove('active');
            document.body.style.overflow = '';
            inviteGenBtn.focus();
          }
        });
      }

      if (document.readyState === 'loading') { 
        document.addEventListener('DOMContentLoaded', init); 
      } else { 
        init(); 
      }
    })();
  </script>
</body>
</html>
