// content.js

const UI_CONTAINER_ID = 'altrosyn-infographic-panel';

// Self-Cleanup: Remove existing UI if script is re-injected (fixes "Extension context invalidated")
const existingUI = document.getElementById(UI_CONTAINER_ID);
if (existingUI) existingUI.remove();

// Helper to extract video ID
function extractVideoId(url) {
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtube.com')) {
            return u.searchParams.get('v');
        } else if (u.hostname.includes('youtu.be')) {
            return u.pathname.slice(1);
        }
    } catch (e) { }
    return null;
}

// run immediately
detectAndSendUrl();

// Also listen for URL changes (SPA navigation on YouTube often doesn't reload the page)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        detectAndSendUrl();
    }
}).observe(document, { subtree: true, childList: true });

function detectAndSendUrl() {
    const url = window.location.href;
    // Always check state to ensure Auth UI shows up if needed
    checkAuthState();

    if (isYouTubeVideo(url)) {
        console.log('YouTube video detected:', url);
        chrome.runtime.sendMessage({ type: 'YOUTUBE_ACTIVE', url: url });
    }
}

function isYouTubeVideo(url) {
    return (url.includes('youtube.com/watch') || url.includes('youtu.be/')) && extractVideoId(url) !== null;
}

function isHomeOrUnsupported(url) {
    return !isYouTubeVideo(url);
}

function checkAuthState() {
    // Auth is handled automatically. 
    // We just check if state reports AUTH_REQUIRED failure.
    restoreStateForCurrentVideo();
}

// --- UI INJECTION & LINK IMPLEMENTATION ---

// --- UI INJECTION & LINK IMPLEMENTATION ---

function injectStyles() {
    if (document.getElementById('altrosyn-styles')) return;
    const style = document.createElement('style');
    style.id = 'altrosyn-styles';
    style.textContent = `
        :root {
            --altrosyn-bg-color: rgba(255, 255, 255, 0.85);
            --altrosyn-bg-minimized: rgba(255, 255, 255, 0.9);
            --altrosyn-text-main: #1f2937;
            --altrosyn-text-secondary: #6b7280;
            --altrosyn-border-color: rgba(255, 255, 255, 0.8);
            --altrosyn-shadow-color: rgba(0, 0, 0, 0.12);
            --altrosyn-icon-color: #2563eb;
            --altrosyn-btn-sec-bg: rgba(255, 255, 255, 0.6);
            --altrosyn-btn-sec-text: #2563eb;
            --altrosyn-btn-sec-border: rgba(37, 99, 235, 0.2);
            --altrosyn-queue-header-color: #374151;
            --altrosyn-queue-item-bg: rgba(255, 255, 255, 0.6);
            --altrosyn-queue-item-text: #4b5563;
        }

        #${UI_CONTAINER_ID} {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 340px;
            background: var(--altrosyn-bg-color);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            box-shadow: 0 12px 40px var(--altrosyn-shadow-color), 0 1px 1px rgba(0,0,0,0.05);
            border-radius: 24px;
            padding: 24px;
            z-index: 2147483647;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            display: none;
            flex-direction: column;
            gap: 18px;
            border: 1px solid var(--altrosyn-border-color);
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            color: var(--altrosyn-text-main);
        }
        #${UI_CONTAINER_ID}.dark-mode {
            /* Variables now handled via class or override below if needed */
        }
        /* Dark Theme Overrides */
        body.altrosyn-dark-theme, #${UI_CONTAINER_ID}.dark-mode {
            --altrosyn-bg-color: rgba(20, 20, 20, 0.85);
            --altrosyn-bg-minimized: rgba(30, 30, 30, 0.9);
            --altrosyn-text-main: #f3f4f6;
            --altrosyn-text-secondary: #d1d5db;
            --altrosyn-border-color: rgba(255, 255, 255, 0.1);
            --altrosyn-shadow-color: rgba(0, 0, 0, 0.5);
            --altrosyn-icon-color: #60a5fa;
            --altrosyn-btn-sec-bg: rgba(255, 255, 255, 0.05);
            --altrosyn-btn-sec-text: #60a5fa;
            --altrosyn-btn-sec-border: rgba(255, 255, 255, 0.1);
            --altrosyn-queue-header-color: #e5e7eb;
            --altrosyn-queue-item-bg: rgba(255, 255, 255, 0.05);
            --altrosyn-queue-item-text: #d1d5db;
        }
        #${UI_CONTAINER_ID}.minimized {
            width: 56px;
            height: 56px;
            padding: 0;
            border-radius: 28px;
            cursor: pointer;
            overflow: hidden;
            background: var(--altrosyn-bg-minimized);
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            justify-content: center;
            align-items: center;
            border: 1px solid var(--altrosyn-border-color);
        }
        #${UI_CONTAINER_ID}.minimized:hover {
            transform: scale(1.08);
            box-shadow: 0 12px 32px rgba(37, 99, 235, 0.25);
        }
        #${UI_CONTAINER_ID} * {
            box-sizing: border-box;
        }
        /* Header */
        .altrosyn-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 4px;
        }
        .altrosyn-title {
            font-size: 17px;
            font-weight: 700;
            color: var(--altrosyn-text-main);
            display: flex;
            align-items: center;
            gap: 10px;
            letter-spacing: -0.01em;
        }
        .altrosyn-title svg {
            width: 22px;
            height: 22px;
            color: var(--altrosyn-icon-color);
            filter: drop-shadow(0 2px 4px rgba(37,99,235,0.2));
        }
        .altrosyn-min-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 6px;
            color: var(--altrosyn-text-secondary);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        .altrosyn-min-btn:hover {
            background: rgba(125,125,125,0.1);
            color: var(--altrosyn-text-main);
        }

        /* Help Tooltip */
        .altrosyn-help-container {
            position: relative;
            display: inline-block;
        }
        .altrosyn-help-icon {
            cursor: pointer;
            color: var(--altrosyn-text-secondary);
            width: 18px;
            height: 18px;
            transition: color 0.2s;
        }
        .altrosyn-help-icon:hover {
            color: var(--altrosyn-icon-color);
        }
        .altrosyn-tooltip {
            visibility: hidden;
            width: 220px;
            background-color: #333;
            color: #fff;
            text-align: left;
            border-radius: 6px;
            padding: 10px;
            position: absolute;
            z-index: 1;
            bottom: 125%; /* Position above */
            right: 0; 
            margin-right: -10px;
            opacity: 0;
            transition: opacity 0.3s;
            font-size: 12px;
            font-weight: 400;
            line-height: 1.4;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .altrosyn-tooltip::after {
            content: "";
            position: absolute;
            top: 100%;
            right: 14px;
            margin-left: -5px;
            border-width: 5px;
            border-style: solid;
            border-color: #333 transparent transparent transparent;
        }
        .altrosyn-help-container:hover .altrosyn-tooltip {
            visibility: visible;
            opacity: 1;
        }
        .altrosyn-tooltip ol {
            padding-left: 15px;
            margin: 5px 0 0 0;
        }
        
        /* Buttons */
        .altrosyn-btn {
            width: 100%;
            padding: 12px 18px;
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: white;
            border: none;
            border-radius: 16px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.3px;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
        }
        .altrosyn-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(37, 99, 235, 0.4);
            filter: brightness(1.05);
        }
        .altrosyn-btn:active {
            transform: scale(0.98);
        }
        .altrosyn-btn:disabled {
            background: #e5e7eb;
            color: #9ca3af;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
            opacity: 0.7;
            filter: blur(0.5px);
        }
        #${UI_CONTAINER_ID}.dark-mode .altrosyn-btn:disabled {
            background: #374151;
            color: #6b7280;
        }
        
        .altrosyn-btn-secondary {
            background: var(--btn-sec-bg);
            color: var(--btn-sec-text);
            border: 1px solid var(--btn-sec-border);
            box-shadow: 0 2px 8px rgba(0,0,0,0.03);
        }
        .altrosyn-btn-secondary:hover {
            background: var(--bg-minimized);
            border-color: rgba(37, 99, 235, 0.4);
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
        }

        /* Status & Content */
        .altrosyn-status {
            font-size: 14px;
            text-align: center;
            color: var(--altrosyn-text-secondary);
            margin: 2px 0;
            font-weight: 500;
        }
        .altrosyn-img-preview {
            width: 100%;
            height: auto;
            border-radius: 12px;
            border: 1px solid var(--altrosyn-border-color);
            cursor: pointer;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            display: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        .altrosyn-img-preview:hover {
            transform: scale(1.03) rotate(0.5deg);
            box-shadow: 0 12px 32px rgba(0,0,0,0.15);
        }
        .altrosyn-link {
            display: block;
            text-align: center;
            color: var(--altrosyn-icon-color);
            text-decoration: none;
            padding: 10px;
            font-size: 13px;
            font-weight: 600;
            border-radius: 12px;
            transition: background 0.2s;
        }
        .altrosyn-link:hover {
            background: rgba(37, 99, 235, 0.08);
        }

        /* Queue UI */
        .altrosyn-queue-container {
            border-top: 1px solid var(--altrosyn-border-color);
            padding-top: 16px;
            margin-top: 8px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .altrosyn-queue-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            font-weight: 600;
            color: var(--altrosyn-queue-header-color);
            cursor: pointer;
            user-select: none;
        }
        .altrosyn-queue-header:hover {
            color: var(--altrosyn-text-main);
        }
        .altrosyn-queue-count {
            background: #eff6ff;
            color: #2563eb;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 700;
        }
        #${UI_CONTAINER_ID}.dark-mode .altrosyn-queue-count {
            background: rgba(37, 99, 235, 0.2);
            color: #93c5fd;
        }
        
        .altrosyn-queue-list {
            display: none; /* Toggled */
            flex-direction: column;
            gap: 6px;
            max-height: 160px;
            overflow-y: auto;
            margin: 4px 0;
            padding-right: 4px;
        }
        /* Custom Scrollbar */
        .altrosyn-queue-list::-webkit-scrollbar {
            width: 4px;
        }
        .altrosyn-queue-list::-webkit-scrollbar-track {
            background: transparent;
        }
        .altrosyn-queue-list::-webkit-scrollbar-thumb {
            background: #d1d5db;
            border-radius: 4px;
        }
        
        .altrosyn-queue-list.expanded {
            display: flex;
        }
        .altrosyn-queue-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            padding: 8px 10px;
            background: var(--altrosyn-queue-item-bg);
            border: 1px solid var(--altrosyn-border-color);
            border-radius: 8px;
            color: var(--altrosyn-queue-item-text);
        }
        .altrosyn-queue-item span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
        }
        .altrosyn-queue-remove {
            color: #ef4444;
            cursor: pointer;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 4px;
            margin-left: 6px;
        }
        .altrosyn-queue-remove:hover {
            background: rgba(239, 68, 68, 0.1);
        }
        .altrosyn-queue-controls {
            display: flex;
            gap: 10px;
        }
        .minimized-icon {
            display: none;
            width: 28px;
            height: 28px;
            color: var(--altrosyn-icon-color);
            filter: drop-shadow(0 2px 4px rgba(37,99,235,0.25));
        }
        #${UI_CONTAINER_ID}.minimized .minimized-icon {
            display: block;
        }
        #${UI_CONTAINER_ID}.minimized > *:not(.minimized-icon) {
            display: none !important;
        }

        /* Queue Status Icons */
        .altrosyn-queue-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(37, 99, 235, 0.3);
            border-radius: 50%;
            border-top-color: var(--altrosyn-icon-color);
            animation: altrosyn-spin 1s ease-in-out infinite;
        }
        @keyframes altrosyn-spin {
            to { transform: rotate(360deg); }
        }

        .altrosyn-queue-error-container {
            position: relative;
            display: flex;
            align-items: center;
        }
        .altrosyn-queue-error {
            color: #ef4444;
            cursor: pointer;
            width: 16px;
            height: 16px;
        }
        .altrosyn-queue-error:hover + .altrosyn-tooltip {
            visibility: visible;
            opacity: 1;
        }

        /* --- GALLERY UI --- */
        #altrosyn-gallery-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(5px);
            z-index: 2147483648; /* Higher than panel */
            display: none;
            justify-content: center; /* Center horizontally if we wanted, but we want left side */
            align-items: center;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        #altrosyn-gallery-overlay.visible {
            opacity: 1;
        }

        #altrosyn-gallery-container {
            position: fixed;
            top: 24px;
            left: 24px;
            bottom: 24px;
            width: 80vw; /* Responsive width */
            max-width: 900px;
            background: var(--altrosyn-bg-color);
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transform: translateX(-50px);
            opacity: 0;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            border: 1px solid var(--altrosyn-border-color);
        }
        #altrosyn-gallery-overlay.visible #altrosyn-gallery-container {
            transform: translateX(0);
            opacity: 1;
        }

        .altrosyn-gallery-header {
            padding: 20px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--altrosyn-border-color);
        }
        .altrosyn-gallery-title {
            font-size: 18px;
            font-weight: 700;
            color: var(--altrosyn-text-main);
        }
        .altrosyn-gallery-close {
            background: transparent;
            border: none;
            cursor: pointer;
            color: var(--altrosyn-text-secondary);
            padding: 8px;
            border-radius: 50%;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .altrosyn-gallery-close:hover {
            background: rgba(0,0,0,0.05);
            color: var(--altrosyn-text-main);
        }

        .altrosyn-gallery-content {
            flex: 1;
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            background: rgba(0,0,0,0.02);
            padding: 24px;
            overflow: hidden;
        }
        
        .altrosyn-gallery-image-wrapper {
            position: relative;
            max-width: 100%;
            max-height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .altrosyn-gallery-img {
            max-width: 100%;
            max-height: calc(100vh - 200px);
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }

        .altrosyn-gallery-nav-btn {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.8);
            border: 1px solid rgba(0,0,0,0.1);
            border-radius: 50%;
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: #333;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            transition: all 0.2s;
            z-index: 10;
        }
        .altrosyn-gallery-nav-btn:hover {
            background: white;
            transform: translateY(-50%) scale(1.1);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }
        .altrosyn-gallery-nav-btn:disabled {
            opacity: 0.3;
            cursor: default;
            transform: translateY(-50%);
        }
        .altrosyn-gallery-prev { left: 24px; }
        .altrosyn-gallery-next { right: 24px; }
        #${UI_CONTAINER_ID}.dark-mode .altrosyn-gallery-nav-btn {
            background: rgba(40, 40, 40, 0.8);
            color: #fff;
            border-color: rgba(255,255,255,0.1);
        }
        #${UI_CONTAINER_ID}.dark-mode .altrosyn-gallery-nav-btn:hover {
            background: rgba(50, 50, 50, 1);
        }

        .altrosyn-gallery-footer {
            padding: 16px 24px;
            border-top: 1px solid var(--altrosyn-border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .altrosyn-gallery-caption {
            font-size: 14px;
            color: var(--altrosyn-text-secondary);
            font-weight: 500;
            max-width: 60%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .altrosyn-gallery-actions {
            display: flex;
            gap: 12px;
        }
    `;
    document.head.appendChild(style);
}

function getOrCreateUI() {
    injectStyles();
    let container = document.getElementById(UI_CONTAINER_ID);

    if (!container) {
        container = document.createElement('div');
        container.id = UI_CONTAINER_ID;
        document.body.appendChild(container);

        // --- Structure ---

        // Minimized Icon (Visible only when minimized)
        const minIcon = document.createElement('div');
        minIcon.className = 'minimized-icon';
        minIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12 2.1 11.9"></path><path d="M12 12V2.1"></path></svg>`; // Pie Chart-ish icon
        container.appendChild(minIcon);

        // Restore from minimized click
        container.onclick = (e) => {
            if (container.classList.contains('minimized')) {
                container.classList.remove('minimized');
                chrome.storage.local.set({ minimized: false });
                e.stopPropagation();
            }
        };

        // Header
        const header = document.createElement('div');
        header.className = 'altrosyn-header';
        header.innerHTML = `
            <div class="altrosyn-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                Notebook Gen
            </div>
        <div style="display:flex; gap:8px; align-items:center;">
                <!-- Theme Toggle -->
                <button class="altrosyn-min-btn" id="${UI_CONTAINER_ID}-theme-toggle" title="Toggle Theme">
                     <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                </button>
                <div class="altrosyn-help-container">
                     <svg xmlns="http://www.w3.org/2000/svg" class="altrosyn-help-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div class="altrosyn-tooltip">
                        <strong>How to use:</strong>
                        <ol>
                            <li>Open any YouTube video.</li>
                            <li>Click "Generate Infographic".</li>
                            <li>Wait for the magic (takes ~1 min).</li>
                        </ol>
                        <hr style="border:0; border-top:1px solid #555; margin:8px 0;">
                        <span style="opacity:0.8; font-size:11px;">Requires NotebookLM account.</span>
                    </div>
                </div>
                <button class="altrosyn-min-btn" title="Minimize">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
            </div>
        `;
        container.appendChild(header);

        // Theme Toggle Handler
        const themeToggle = header.querySelector(`#${UI_CONTAINER_ID}-theme-toggle`);
        if (themeToggle) {
            themeToggle.onclick = (e) => {
                e.stopPropagation();
                container.classList.toggle('dark-mode');
                const isDark = container.classList.contains('dark-mode');
                chrome.storage.local.set({ theme: isDark ? 'dark' : 'light' });
            };
        }

        // Minimize Handler
        const minBtn = header.querySelector('button[title="Minimize"]');
        if (minBtn) {
            minBtn.onclick = (e) => {
                e.stopPropagation();
                container.classList.add('minimized');
                chrome.storage.local.set({ minimized: true });
            };
        }


        // Status
        const statusEl = document.createElement('div');
        statusEl.id = UI_CONTAINER_ID + '-status';
        statusEl.className = 'altrosyn-status';
        container.appendChild(statusEl);

        // Auth Container
        const authContainer = document.createElement('div');
        authContainer.id = UI_CONTAINER_ID + '-auth-container';
        authContainer.style.display = 'none';
        authContainer.style.flexDirection = 'column';
        authContainer.style.gap = '12px';
        container.appendChild(authContainer);

        const loginMsg = document.createElement('div');
        loginMsg.id = UI_CONTAINER_ID + '-auth-msg';
        loginMsg.className = 'altrosyn-status';
        loginMsg.style.color = '#d93025';
        loginMsg.textContent = "Please log in to NotebookLM in a new tab.";
        authContainer.appendChild(loginMsg);

        const loginBtn = document.createElement('a');
        loginBtn.className = 'altrosyn-btn';
        loginBtn.textContent = 'Connect to NotebookLM';
        loginBtn.href = 'https://notebooklm.google.com';
        loginBtn.target = '_blank';
        authContainer.appendChild(loginBtn);

        // Main Interaction Container (Generate, Preview)
        const interactionContainer = document.createElement('div');
        interactionContainer.id = UI_CONTAINER_ID + '-interaction-container';
        interactionContainer.style.display = 'flex';
        interactionContainer.style.flexDirection = 'column';
        interactionContainer.style.gap = '12px';
        container.appendChild(interactionContainer);

        // Generate Button
        const generateBtn = document.createElement('button');
        generateBtn.id = UI_CONTAINER_ID + '-generate-btn';
        generateBtn.className = 'altrosyn-btn';
        generateBtn.textContent = 'Generate Infographic';
        generateBtn.onclick = startGeneration;
        interactionContainer.appendChild(generateBtn);

        // Add To Queue Button
        const addToQueueBtn = document.createElement('button');
        addToQueueBtn.id = UI_CONTAINER_ID + '-queue-add-btn';
        addToQueueBtn.className = 'altrosyn-btn altrosyn-btn-secondary';
        addToQueueBtn.textContent = 'Add to Queue';
        addToQueueBtn.onclick = handleAddToQueue;
        interactionContainer.appendChild(addToQueueBtn);

        // Queue Container
        const queueContainer = document.createElement('div');
        queueContainer.className = 'altrosyn-queue-container';
        queueContainer.id = UI_CONTAINER_ID + '-queue-section';
        queueContainer.style.display = 'none'; // Hidden if empty initially? 

        // Queue Header (Toggle)
        const queueHeader = document.createElement('div');
        queueHeader.className = 'altrosyn-queue-header';
        queueHeader.innerHTML = `<span>Queue</span><span id="${UI_CONTAINER_ID}-queue-count" class="altrosyn-queue-count">0</span>`;
        queueHeader.onclick = toggleQueueList;
        queueContainer.appendChild(queueHeader);

        // Queue List
        const queueList = document.createElement('div');
        queueList.id = UI_CONTAINER_ID + '-queue-list';
        queueList.className = 'altrosyn-queue-list';
        queueContainer.appendChild(queueList);

        // Queue Controls (Generate All, Clear)
        const queueControls = document.createElement('div');
        queueControls.className = 'altrosyn-queue-controls';

        const genQueueBtn = document.createElement('button');
        genQueueBtn.id = UI_CONTAINER_ID + '-queue-gen-btn';
        genQueueBtn.className = 'altrosyn-btn';
        genQueueBtn.textContent = 'Generate All';
        genQueueBtn.style.fontSize = '12px';
        genQueueBtn.onclick = startQueueGeneration;

        const clearQueueBtn = document.createElement('button');
        clearQueueBtn.className = 'altrosyn-btn altrosyn-btn-secondary';
        clearQueueBtn.textContent = 'Clear';
        clearQueueBtn.style.fontSize = '12px';
        clearQueueBtn.style.width = 'auto';
        clearQueueBtn.onclick = clearQueue;

        queueControls.appendChild(genQueueBtn);
        queueControls.appendChild(clearQueueBtn);
        queueContainer.appendChild(queueControls);

        interactionContainer.appendChild(queueContainer);

        const img = document.createElement('img');
        img.id = UI_CONTAINER_ID + '-img-preview';
        img.className = 'altrosyn-img-preview';
        interactionContainer.appendChild(img);

        // Link
        const link = document.createElement('a');
        link.id = UI_CONTAINER_ID + '-link';
        link.className = 'altrosyn-link';
        link.textContent = 'Open Full Size';
        link.target = '_blank';
        link.style.display = 'none';
        interactionContainer.appendChild(link);

        // --- Gallery UI Injection ---
        const galleryOverlay = document.createElement('div');
        galleryOverlay.id = 'altrosyn-gallery-overlay';
        galleryOverlay.innerHTML = `
            <div id="altrosyn-gallery-container">
                <div class="altrosyn-gallery-header">
                    <div class="altrosyn-gallery-title">Recent Infographics (48h)</div>
                    <button class="altrosyn-gallery-close" title="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="altrosyn-gallery-content">
                    <button class="altrosyn-gallery-nav-btn altrosyn-gallery-prev" title="Previous">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <div class="altrosyn-gallery-image-wrapper">
                        <img id="altrosyn-gallery-img" class="altrosyn-gallery-img" src="" alt="Infographic">
                    </div>
                    <button class="altrosyn-gallery-nav-btn altrosyn-gallery-next" title="Next">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>
                <div class="altrosyn-gallery-footer">
                    <div class="altrosyn-gallery-caption" id="altrosyn-gallery-caption">Title of the video</div>
                    <div class="altrosyn-gallery-actions">
                         <span id="altrosyn-gallery-counter" style="color:var(--text-secondary); font-size:13px; display:flex; align-items:center; margin-right:12px;">1 / 5</span>
                         <button class="altrosyn-btn" id="altrosyn-gallery-download" style="width:auto; padding: 8px 16px; font-size:13px;">
                            Download
                         </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(galleryOverlay);

        // Bind Gallery Events
        galleryOverlay.querySelector('.altrosyn-gallery-close').onclick = closeGallery;
        galleryOverlay.onclick = (e) => {
            if (e.target === galleryOverlay) closeGallery();
        };
        galleryOverlay.querySelector('.altrosyn-gallery-prev').onclick = prevGalleryImage;
        galleryOverlay.querySelector('.altrosyn-gallery-next').onclick = nextGalleryImage;
        galleryOverlay.querySelector('#altrosyn-gallery-download').onclick = downloadGalleryImage;

        // Keydown listener for gallery (only active when visible)
        document.addEventListener('keydown', (e) => {
            const overlay = document.getElementById('altrosyn-gallery-overlay');
            if (overlay && overlay.style.display === 'flex') {
                if (e.key === 'Escape') closeGallery();
                if (e.key === 'ArrowLeft') prevGalleryImage();
                if (e.key === 'ArrowRight') nextGalleryImage();
            }
        });
        // Restore minimized state & Theme
        chrome.storage.local.get(['minimized', 'theme'], (result) => {
            if (result.minimized) {
                container.classList.add('minimized');
            }
            if (result.theme === 'dark') {
                container.classList.add('dark-mode');
            }
        });
    }
    return container;
}

let pollInterval = null;
let lastContentStatus = null;
let isWaitingForReveal = false;

function updateUI(status, imageUrl = null, errorMessage = null, title = null) {
    const oldStatus = lastContentStatus;
    lastContentStatus = status;

    if (status !== 'COMPLETED') isWaitingForReveal = false;

    // --- Polling Safety Mechanism ---
    if (status === 'RUNNING') {
        if (!pollInterval) {
            console.log("Starting UI polling for state updates...");
            pollInterval = setInterval(() => {
                restoreStateForCurrentVideo();
            }, 5000); // Check every 5s
        }
    } else {
        if (pollInterval) {
            console.log("Stopping UI polling.");
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    const container = getOrCreateUI();
    const statusEl = document.getElementById(UI_CONTAINER_ID + '-status');
    const authContainer = document.getElementById(UI_CONTAINER_ID + '-auth-container');
    const interactionContainer = document.getElementById(UI_CONTAINER_ID + '-interaction-container');
    const generateBtn = document.getElementById(UI_CONTAINER_ID + '-generate-btn');
    const imgPreview = document.getElementById(UI_CONTAINER_ID + '-img-preview');
    const link = document.getElementById(UI_CONTAINER_ID + '-link');

    const authMsg = document.getElementById(UI_CONTAINER_ID + '-auth-msg');

    // Default container display
    container.style.display = 'flex';

    if (status === 'AUTH_REQUIRED') {
        statusEl.textContent = 'Login Required';
        authMsg.textContent = "Please log in to NotebookLM in a new tab.";
        authContainer.style.display = 'flex';
    } else if (status === 'LIMIT_EXCEEDED') {
        statusEl.textContent = 'Limit Reached';
        authMsg.textContent = errorMessage || "Your daily limit is over. Try again after 24 hrs.";
        authContainer.style.display = 'flex';

        // Custom "Go Home" button for this state
        const loginBtn = authContainer.querySelector('.altrosyn-btn');
        loginBtn.textContent = 'Go Home';
        loginBtn.href = "#";
        loginBtn.removeAttribute('target');
        loginBtn.onclick = (e) => {
            e.preventDefault();
            resetToInitialState();
        };
    } else {
        authContainer.style.display = 'none';
    }

    // Always show interactions (unless minimized/hidden globally)
    if (status === 'LIMIT_EXCEEDED') {
        interactionContainer.style.display = 'none';
    } else {
        interactionContainer.style.display = 'flex';
    }

    // Status Text
    if (status === 'RUNNING') {
        statusEl.textContent = 'Generating...';
        statusEl.style.color = '#5f6368';
    } else if (status === 'COMPLETED') {
        // Delay Logic
        if (oldStatus === 'RUNNING' && !isWaitingForReveal) {
            isWaitingForReveal = true;
            statusEl.textContent = 'Please wait...';
            statusEl.style.color = '#5f6368';

            // Hide preview if it was somehow visible (though it shouldn't be yet)
            imgPreview.style.display = 'none';
            link.style.display = 'none';

            // Ensure button is hidden
            generateBtn.style.display = 'none';

            setTimeout(() => {
                isWaitingForReveal = false;
                // Recursive call to show final state
                updateUI(status, imageUrl, errorMessage, title);
            }, 4000);
            return;
        }

        if (isWaitingForReveal) return; // Prevent updates during wait

        statusEl.textContent = 'Done';
        statusEl.style.color = '#137333';
        generateBtn.style.display = 'flex';
    } else if (status === 'FAILED') {
        statusEl.textContent = errorMessage || 'Failed';
        statusEl.style.color = '#d93025';
    } else if (status === 'INVALID_CONTEXT') {
        statusEl.textContent = errorMessage || 'Open Video';
        statusEl.style.color = '#5f6368';
    } else {
        statusEl.textContent = 'Ready';
        statusEl.style.color = '#5f6368';
    }

    // Button State
    const currentVideoId = extractVideoId(window.location.href);

    // Fetch queue state for main button lock AND detailed status text
    chrome.storage.local.get(['isQueueRunning', 'queueStatusText'], (qResult) => {
        const isQueueRunning = qResult.isQueueRunning || false;
        const queueStatusText = qResult.queueStatusText || 'Queue Processing...';

        // Update Status Text for Queue if running - GLOBAL OVERRIDE
        if (isQueueRunning) {
            statusEl.textContent = queueStatusText;
            // Also force color to neutral/processing color if we are in this state
            // unless we want to keep it "Done" green? No, queue is processing.
            statusEl.style.color = '#2563eb'; // Blue for queue processing
        }

        if (status === 'RUNNING' || isQueueRunning) {
            generateBtn.textContent = isQueueRunning ? 'Queue Processing...' : 'Creating Magic...';
            generateBtn.disabled = true;
        } else if (status === 'COMPLETED') {
            if (!currentVideoId) {
                // On Home Page, showing persistent result
                generateBtn.textContent = 'Open Video to Generate New';
                generateBtn.className = 'altrosyn-btn altrosyn-btn-secondary';
                generateBtn.disabled = true;
            } else {
                // On a Video Page
                generateBtn.textContent = 'Generate New';
                generateBtn.className = 'altrosyn-btn altrosyn-btn-secondary';
                generateBtn.disabled = false;
                generateBtn.onclick = resetToInitialState;
            }
        } else if (status === 'INVALID_CONTEXT') {
            generateBtn.textContent = 'Open a Video First';
            generateBtn.className = 'altrosyn-btn';
            generateBtn.disabled = true;
        } else if (status === 'AUTH_REQUIRED') {
            generateBtn.textContent = 'Retry Generation';
            generateBtn.className = 'altrosyn-btn';
            generateBtn.disabled = false;
            generateBtn.onclick = startGeneration;
        } else {
            // IDLE / PRE-GENERATION STATE
            generateBtn.textContent = 'Generate Infographic';
            generateBtn.className = 'altrosyn-btn';
            generateBtn.disabled = false;
            generateBtn.onclick = startGeneration;
        }
    });

    // Update Queue UI
    // Update Queue UI
    updateQueueUI(status);

    // Shared Download Logic
    const triggerDownload = (e) => {
        e.preventDefault();
        let filename = "infographic.png";
        if (title) {
            const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            filename = `${safeTitle}.png`;
        } else {
            // Try fallback to page title if not in state
            const pageTitle = document.title.replace(' - YouTube', '');
            const safeTitle = pageTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            filename = `${safeTitle}.png`;
        }

        chrome.runtime.sendMessage({
            type: 'DOWNLOAD_IMAGE',
            url: imageUrl,
            filename: filename
        });
    };

    if (status === 'COMPLETED' && imageUrl) {
        imgPreview.src = imageUrl;
        imgPreview.style.display = 'block';
        imgPreview.onclick = () => openGallery(imageUrl); // Pass current image to open gallery focused on it

        link.href = "#"; // Prevent default link behavior
        link.textContent = "View in Gallery";
        link.style.display = 'block';
        link.onclick = (e) => {
            e.preventDefault();
            openGallery(imageUrl);
        };
    } else {
        imgPreview.style.display = 'none';
        link.style.display = 'none';
    }
}

// Scoped State Restoration with Global Persistence
function restoreStateForCurrentVideo() {
    chrome.storage.local.get(['infographicStates', 'lastActiveVideoId'], (result) => {
        const states = result.infographicStates || {};
        const lastId = result.lastActiveVideoId;
        const currentId = extractVideoId(window.location.href);

        let targetId = null;

        // 1. Check Local Context First (User is ON a video page)
        if (currentId && states[currentId]) {
            const localState = states[currentId];
            // If this video has data, it takes precedence.
            if (['RUNNING', 'COMPLETED', 'FAILED', 'AUTH_PENDING', 'LIMIT_EXCEEDED'].includes(localState.status)) {
                targetId = currentId;
                // Self-Heal: If we are viewing a completed video, make it the global active one
                // so it persists if we go Home. But ONLY if we aren't interrupting a running job elsewhere.
                if (lastId !== currentId) {
                    const lastGlobalState = states[lastId];
                    const isGlobalRunning = lastGlobalState && lastGlobalState.status === 'RUNNING';

                    if (!isGlobalRunning) {
                        console.log(`Updating global focus to ${currentId} (Previous: ${lastId} was not running)`);
                        chrome.storage.local.set({ lastActiveVideoId: currentId });
                    } else {
                        console.log(`Keeping global focus on ${lastId} because it is RUNNING.`);
                    }
                }
            }
        }

        // 2. If no local state (or we are on Home), check Global Sticky
        if (!targetId && lastId && states[lastId]) {
            const globalState = states[lastId];
            if (['RUNNING', 'COMPLETED', 'FAILED', 'AUTH_PENDING', 'LIMIT_EXCEEDED'].includes(globalState.status)) {
                targetId = lastId;
            }
        }

        if (targetId) {
            // We have a sticky state
            const state = states[targetId];

            // 3. Stale State Cleanup (Safety Check)
            // If it's been RUNNING for > 5 minutes, it's likely dead.
            const STALE_TIMEOUT = 5 * 60 * 1000; // 5 mins
            if (state.status === 'RUNNING' && state.operation_id && (Date.now() - state.operation_id > STALE_TIMEOUT)) {
                console.warn(`Detected stale RUNNING state for ${targetId} (Age: ${Date.now() - state.operation_id}ms). Resetting.`);
                // Auto-fail it to unlock UI
                const cleanedState = { ...state, status: 'FAILED', error: 'Operation timed out (stale)' };
                // Update local storage effectively "healing" the state
                states[targetId] = cleanedState;
                chrome.storage.local.set({ infographicStates: states });

                // Show the failed state
                updateUI('FAILED', null, 'Operation timed out (stale)');
                return;
            }

            if (state.status === 'AUTH_PENDING') {
                // No auto-retry here for now - user needs to login elsewhere.
                // Ideally we could detect login success but that's complex for now.
                return;
            }

            updateUI(state.status, state.image_url, state.error, state.title);
        } else {
            // No sticky state, fall back to current context
            if (currentId) {
                // We are on a video, and no global job is active. IDLE.
                updateUI('IDLE');
            } else {
                // On Home, no global job.
                updateUI('INVALID_CONTEXT', null, "Open a video to generate");
            }
        }
    });
}

// Listen for status updates
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'INFOGRAPHIC_UPDATE') {
        // Always attempt to restore state. 
        // restoreStateForCurrentVideo determines if this update is relevant 
        // (matches current video OR matches global sticky video).
        restoreStateForCurrentVideo();
    } else if (message.type === 'AUTH_EXPIRED') {
        updateUI('AUTH_REQUIRED');
    } else if (message.type === 'LIMIT_EXCEEDED') {
        updateUI('LIMIT_EXCEEDED');
    }
});

function startGeneration() {
    const url = window.location.href;
    const title = document.title.replace(' - YouTube', '');
    updateUI('RUNNING');
    chrome.runtime.sendMessage({ type: 'GENERATE_INFOGRAPHIC', url: url, title: title });
}

// --- QUEUE LOGIC ---

function updateQueueUI(currentStatus = 'IDLE') {
    chrome.storage.local.get(['infographicQueue', 'isQueueRunning'], (result) => {
        const queue = result.infographicQueue || [];
        const isQueueRunning = result.isQueueRunning || false;

        const countEl = document.getElementById(UI_CONTAINER_ID + '-queue-count');
        const listEl = document.getElementById(UI_CONTAINER_ID + '-queue-list');
        const sectionEl = document.getElementById(UI_CONTAINER_ID + '-queue-section');
        const addBtn = document.getElementById(UI_CONTAINER_ID + '-queue-add-btn');
        const genBtn = document.getElementById(UI_CONTAINER_ID + '-queue-gen-btn');

        if (countEl) countEl.textContent = queue.length;

        // Show/Hide Queue Section based on content? 
        // Let's always show it if there's something, or maybe always show it to discover feature?
        // Decided: always show it to let user know it exists.
        if (sectionEl) sectionEl.style.display = 'flex';

        // Check if current video is in queue
        const currentId = extractVideoId(window.location.href);

        // Helper to disable buttons - GLOBAL LOCK if queue is running
        const isRunning = (currentStatus === 'RUNNING' || isQueueRunning);

        if (addBtn) {
            if (isRunning) {
                addBtn.disabled = true;
                addBtn.textContent = 'Queue Locked';
            } else if (!currentId) {
                addBtn.disabled = true;
                addBtn.textContent = 'Open Video to Add';
            } else if (queue.some(item => item.videoId === currentId)) {
                addBtn.disabled = true;
                addBtn.textContent = 'Added to Queue';
            } else {
                addBtn.disabled = false;
                addBtn.textContent = 'Add to Queue';
            }
        }

        // Render List
        if (listEl) {
            listEl.innerHTML = '';
            if (queue.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.textContent = 'Queue is empty';
                emptyMsg.style.fontSize = '12px';
                emptyMsg.style.color = '#9aa0a6';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.padding = '8px';
                listEl.appendChild(emptyMsg);
                if (genBtn) genBtn.disabled = true;
            } else {
                // Generate Button Logic
                if (genBtn) {
                    if (isRunning) {
                        genBtn.disabled = true;
                        genBtn.textContent = 'Processing...';
                    } else {
                        genBtn.disabled = false;
                        genBtn.textContent = 'Generate All';
                    }
                }

                queue.forEach((item, index) => {
                    const row = document.createElement('div');
                    row.className = 'altrosyn-queue-item';

                    // Title
                    const titleSpan = document.createElement('span');
                    titleSpan.textContent = item.title;
                    row.appendChild(titleSpan);

                    // Actions Container
                    const actionsDiv = document.createElement('div');
                    actionsDiv.style.display = 'flex';
                    actionsDiv.style.alignItems = 'center';
                    actionsDiv.style.gap = '10px';

                    // 1. RUNNING STATE (Spinner)
                    if (item.status === 'RUNNING') {
                        const spinner = document.createElement('div');
                        spinner.className = 'altrosyn-queue-spinner';
                        actionsDiv.appendChild(spinner);
                    }
                    // 2. FAILED STATE (Error Icon + Tooltip)
                    else if (item.status === 'FAILED') {
                        const errorContainer = document.createElement('div');
                        errorContainer.className = 'altrosyn-queue-error-container';

                        // Error Icon (Exclamation or Alert)
                        const errIcon = document.createElement('div');
                        errIcon.className = 'altrosyn-queue-error';
                        errIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
                        errorContainer.appendChild(errIcon);

                        // Tooltip
                        const tooltip = document.createElement('div');
                        tooltip.className = 'altrosyn-tooltip';
                        tooltip.style.bottom = '120%';
                        tooltip.style.right = '-10px';
                        tooltip.style.width = '180px';
                        tooltip.textContent = item.error || "Generation failed";
                        errorContainer.appendChild(tooltip);

                        actionsDiv.appendChild(errorContainer);
                    }
                    // 3. COMPLETED STATE (Download Link)
                    else if (item.imageUrl) {
                        const dlLink = document.createElement('a');
                        dlLink.href = item.imageUrl;
                        dlLink.download = "infographic.png";
                        dlLink.target = "_blank";
                        dlLink.title = "Download Infographic";
                        dlLink.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#10b981;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
                        dlLink.onclick = (e) => {
                            e.stopPropagation();
                            // Use extension downloader for better filename control if possible
                            chrome.runtime.sendMessage({
                                type: 'DOWNLOAD_IMAGE',
                                url: item.imageUrl,
                                filename: `${item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`
                            });
                        };
                        actionsDiv.appendChild(dlLink);
                    }

                    // Remove Button
                    const removeBtn = document.createElement('div');
                    removeBtn.className = 'altrosyn-queue-remove';
                    removeBtn.textContent = '×';
                    // Disable remove if this specific item is running
                    if (item.status === 'RUNNING') {
                        removeBtn.style.pointerEvents = 'none';
                        removeBtn.style.opacity = '0.3';
                    } else {
                        removeBtn.onclick = (e) => {
                            e.stopPropagation();
                            removeFromQueue(index);
                        };
                    }
                    actionsDiv.appendChild(removeBtn);

                    row.appendChild(actionsDiv);
                    listEl.appendChild(row);
                });
            }
        }
    });
}

function handleAddToQueue() {
    const url = window.location.href;
    const videoId = extractVideoId(url);
    const title = document.title.replace(' - YouTube', '');

    if (!videoId) return;

    chrome.storage.local.get(['infographicQueue'], (result) => {
        const queue = result.infographicQueue || [];
        if (!queue.some(item => item.videoId === videoId)) {
            queue.push({ videoId, url, title });
            chrome.storage.local.set({ infographicQueue: queue }, () => {
                // If we are adding, we must be in a state where we CAN add, so likely IDLE or at least not RUNNING queue
                // But let's check current UI state/storage if we wanted to be 100% pure, but IDLE is safe default for "enable buttons"
                // Actually, best to just call it without args to default to IDLE which is "Interactive"
                updateQueueUI('IDLE');
            });
        }
    });
}

function removeFromQueue(index) {
    chrome.storage.local.get(['infographicQueue'], (result) => {
        const queue = result.infographicQueue || [];
        queue.splice(index, 1);
        chrome.storage.local.set({ infographicQueue: queue }, () => {
            updateQueueUI('IDLE');
        });
    });
}

function clearQueue() {
    chrome.storage.local.set({ infographicQueue: [] }, () => {
        updateQueueUI('IDLE');
    });
}

function toggleQueueList() {
    const list = document.getElementById(UI_CONTAINER_ID + '-queue-list');
    if (list) list.classList.toggle('expanded');
}

function startQueueGeneration() {
    chrome.storage.local.get(['infographicQueue'], (result) => {
        const queue = result.infographicQueue || [];
        if (queue.length === 0) return;

        updateUI('RUNNING'); // Triggers updateQueueUI('RUNNING') disabling buttons
        const statusEl = document.getElementById(UI_CONTAINER_ID + '-status');
        if (statusEl) statusEl.textContent = `Processing ${queue.length} videos...`;

        chrome.runtime.sendMessage({ type: 'GENERATE_QUEUE_INFOGRAPHIC', queue: queue });
    });
}


function resetToInitialState() {
    const currentVideoId = extractVideoId(window.location.href);

    chrome.storage.local.get(['infographicStates'], (result) => {
        const states = result.infographicStates || {};

        if (currentVideoId) {
            // Remove existing state for this video
            if (states[currentVideoId]) {
                delete states[currentVideoId];
            }
            // Update storage: 
            // 1. Save cleaned states
            // 2. Set lastActiveVideoId to current (which is now empty/IDLE) to focus here
            chrome.storage.local.set({
                infographicStates: states,
                lastActiveVideoId: currentVideoId
            }, () => {
                restoreStateForCurrentVideo();
            });
        } else {
            // On Home Page or other non-video page
            // Just clear the global sticky lock so UI resets to IDLE (or "Invalid Context")
            chrome.storage.local.set({
                lastActiveVideoId: null
            }, () => {
                restoreStateForCurrentVideo();
            });
        }
    });
}

// --- GALLERY LOGIC ---

let galleryImages = [];
let currentGalleryIndex = 0;

function openGallery(preferredImageUrl = null) {
    chrome.storage.local.get(['infographicStates'], (result) => {
        const states = result.infographicStates || {};

        // Filter COMPLETED items and sort by time (newest first)
        // Note: existing items might not have completedAt, but we can treat them as older or newer depending on needs.
        // Let's sort by completedAt desc, treating undefined as oldest.
        galleryImages = Object.values(states)
            .filter(s => s.status === 'COMPLETED' && s.image_url)
            .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

        if (galleryImages.length === 0) return; // Nothing to show

        // Find index of preferred image
        if (preferredImageUrl) {
            const idx = galleryImages.findIndex(img => img.image_url === preferredImageUrl);
            currentGalleryIndex = idx !== -1 ? idx : 0;
        } else {
            currentGalleryIndex = 0;
        }

        updateGalleryContent();

        const overlay = document.getElementById('altrosyn-gallery-overlay');
        overlay.style.display = 'flex';
        // Trigger reflow
        overlay.offsetHeight;
        overlay.classList.add('visible');
    });
}

function closeGallery() {
    const overlay = document.getElementById('altrosyn-gallery-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 300);
}

function updateGalleryContent() {
    const item = galleryImages[currentGalleryIndex];
    if (!item) return;

    const imgEl = document.getElementById('altrosyn-gallery-img');
    const captionEl = document.getElementById('altrosyn-gallery-caption');
    const counterEl = document.getElementById('altrosyn-gallery-counter');
    const prevBtn = document.querySelector('.altrosyn-gallery-prev');
    const nextBtn = document.querySelector('.altrosyn-gallery-next');

    imgEl.src = item.image_url;
    captionEl.textContent = item.title || "Untitled Infographic";
    counterEl.textContent = `${currentGalleryIndex + 1} / ${galleryImages.length}`;

    prevBtn.disabled = currentGalleryIndex === 0;
    nextBtn.disabled = currentGalleryIndex === galleryImages.length - 1;
}

function prevGalleryImage() {
    if (currentGalleryIndex > 0) {
        currentGalleryIndex--;
        updateGalleryContent();
    }
}

function nextGalleryImage() {
    if (currentGalleryIndex < galleryImages.length - 1) {
        currentGalleryIndex++;
        updateGalleryContent();
    }
}

function downloadGalleryImage(e) {
    if (e) e.stopPropagation();
    const item = galleryImages[currentGalleryIndex];
    if (!item) return;

    const filename = (item.title ? item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "infographic") + ".png";

    chrome.runtime.sendMessage({
        type: 'DOWNLOAD_IMAGE',
        url: item.image_url,
        filename: filename
    });
}
