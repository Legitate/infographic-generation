// content.js

const UI_CONTAINER_ID = 'altrosyn-infographic-panel';

// Self-Cleanup: Remove existing UI if script is re-injected (fixes "Extension context invalidated")
const existingUI = document.getElementById(UI_CONTAINER_ID);
if (existingUI) existingUI.remove();

const existingGallery = document.getElementById('altrosyn-gallery-overlay');
if (existingGallery) existingGallery.remove();

const existingTooltip = document.getElementById('altrosyn-queue-tooltip');
if (existingTooltip) existingTooltip.remove();

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

// --- SAFE CHROME WRAPPER ---
const SafeChromeWrapper = {
    isContextInvalid: () => !chrome.runtime?.id,

    storage: {
        local: {
            get: (keys, callback) => {
                if (!chrome.runtime?.id) return;
                try {
                    chrome.storage.local.get(keys, (result) => {
                        if (chrome.runtime.lastError) {
                            console.warn("Storage Get Error:", chrome.runtime.lastError);
                            return;
                        }
                        if (callback) callback(result);
                    });
                } catch (e) { console.warn("Context invalid during storage.get"); }
            },
            set: (items, callback) => {
                if (!chrome.runtime?.id) return;
                try {
                    chrome.storage.local.set(items, () => {
                        if (chrome.runtime.lastError) {
                            console.warn("Storage Set Error:", chrome.runtime.lastError);
                            return;
                        }
                        if (callback) callback();
                    });
                } catch (e) { console.warn("Context invalid during storage.set"); }
            }
        }
    },

    runtime: {
        sendMessage: (message, callback) => {
            if (!chrome.runtime?.id) return;
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    // Check for lastError to avoid "unchecked runtime.lastError" warnings
                    const err = chrome.runtime.lastError;
                    if (callback) callback(response);
                });
            } catch (e) { console.warn("Context invalid during sendMessage"); }
        }
    }
};

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
        SafeChromeWrapper.runtime.sendMessage({ type: 'YOUTUBE_ACTIVE', url: url });
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

function dismissError() {
    const currentVideoId = extractVideoId(window.location.href);
    if (!currentVideoId) return;

    SafeChromeWrapper.storage.local.get(['infographicStates'], (result) => {
        const states = result.infographicStates || {};
        const state = states[currentVideoId];

        if (state && (state.status === 'FAILED' || state.status === 'LIMIT_EXCEEDED')) {
            delete states[currentVideoId];
            SafeChromeWrapper.storage.local.set({ infographicStates: states }, () => {
                updateUI('IDLE');
            });
        }
    });
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

        #altrosyn-queue-tooltip {
            position: fixed;
            z-index: 2147483650;
            background-color: #333;
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            max-width: 300px;
            width: auto;
            visibility: hidden;
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: none;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            line-height: 1.4;
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
                SafeChromeWrapper.storage.local.set({ minimized: false });
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
                <button class="altrosyn-min-btn" id="${UI_CONTAINER_ID}-gallery-btn" title="Open Gallery">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                </button>
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

        // Global Queue Tooltip
        let queueTooltip = document.getElementById('altrosyn-queue-tooltip');
        if (!queueTooltip) {
            queueTooltip = document.createElement('div');
            queueTooltip.id = 'altrosyn-queue-tooltip';
            document.body.appendChild(queueTooltip);
        }

        // Gallery Button Handler
        const galleryBtn = header.querySelector(`#${UI_CONTAINER_ID}-gallery-btn`);
        if (galleryBtn) {
            galleryBtn.onclick = (e) => {
                e.stopPropagation();
                dismissError();
                openGallery();
            };
        }

        // Theme Toggle Handler
        const themeToggle = header.querySelector(`#${UI_CONTAINER_ID}-theme-toggle`);
        if (themeToggle) {
            themeToggle.onclick = (e) => {
                e.stopPropagation();
                container.classList.toggle('dark-mode');
                const isDark = container.classList.contains('dark-mode');
                SafeChromeWrapper.storage.local.set({ theme: isDark ? 'dark' : 'light' });
            };
        }

        // Minimize Handler
        const minBtn = header.querySelector('button[title="Minimize"]');
        if (minBtn) {
            minBtn.onclick = (e) => {
                e.stopPropagation();
                container.classList.add('minimized');
                SafeChromeWrapper.storage.local.set({ minimized: true });
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
        addToQueueBtn.className = 'altrosyn-btn';
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
        genQueueBtn.textContent = 'Generate Separately';
        genQueueBtn.style.fontSize = '12px';
        genQueueBtn.onclick = startQueueGeneration;

        const genBatchBtn = document.createElement('button');
        genBatchBtn.id = UI_CONTAINER_ID + '-queue-batch-btn';
        genBatchBtn.className = 'altrosyn-btn';
        genBatchBtn.textContent = 'Generate Combined';
        genBatchBtn.style.fontSize = '12px';
        genBatchBtn.title = "Process all videos into a SINGLE Notebook";
        genBatchBtn.onclick = startQueueBatchGeneration;

        const clearQueueBtn = document.createElement('button');
        clearQueueBtn.className = 'altrosyn-btn altrosyn-btn-secondary';
        clearQueueBtn.textContent = 'Clear';
        clearQueueBtn.style.fontSize = '12px';
        clearQueueBtn.style.width = 'auto';
        clearQueueBtn.onclick = clearQueue;

        queueControls.appendChild(genQueueBtn);
        queueControls.appendChild(genBatchBtn);
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
                    <div id="altrosyn-gallery-empty-msg" style="display:none; flex-direction:column; align-items:center; opacity:0.6;">
                         <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                         <span style="margin-top:12px; font-weight:500;">Gallery is empty</span>
                    </div>
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
        SafeChromeWrapper.storage.local.get(['minimized', 'theme'], (result) => {
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
    SafeChromeWrapper.storage.local.get(['isQueueRunning', 'queueStatusText'], (qResult) => {
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

        SafeChromeWrapper.runtime.sendMessage({
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
    // We need to get states, lastActive, and potentially the image for the current/active video
    // Since we don't know which video IS active yet, we might need to do two-step or just get everything if not too big?
    // Let's do two-step for optimization: Get states first, find target ID, then get image if needed.

    SafeChromeWrapper.storage.local.get(['infographicStates', 'lastActiveVideoId'], (result) => {
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
                // Self-Heal logic...
                if (lastId !== currentId) {
                    const lastGlobalState = states[lastId];
                    const isGlobalRunning = lastGlobalState && lastGlobalState.status === 'RUNNING';

                    if (!isGlobalRunning) {
                        console.log(`Updating global focus to ${currentId} (Previous: ${lastId} was not running)`);
                        SafeChromeWrapper.storage.local.set({ lastActiveVideoId: currentId });
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
            const STALE_TIMEOUT = 5 * 60 * 1000; // 5 mins
            if (state.status === 'RUNNING' && state.operation_id && (Date.now() - state.operation_id > STALE_TIMEOUT)) {
                // ... (existing stale logic)
                const cleanedState = { ...state, status: 'FAILED', error: 'Operation timed out (stale)' };
                states[targetId] = cleanedState;
                SafeChromeWrapper.storage.local.set({ infographicStates: states });
                updateUI('FAILED', null, 'Operation timed out (stale)');
                return;
            }

            if (state.status === 'AUTH_PENDING') return;

            // CHECK FOR IMAGE
            if (state.hasImage && !state.image_url) {
                // Fetch the image key
                SafeChromeWrapper.storage.local.get([`img_${targetId}`], (imgResult) => {
                    const imgData = imgResult[`img_${targetId}`];
                    updateUI(state.status, imgData, state.error, state.title);
                });
            } else {
                updateUI(state.status, state.image_url, state.error, state.title);
            }

            updateQueueUI(state.status);
        } else {
            // No sticky state, fall back to current context
            if (currentId) {
                updateUI('IDLE');
            } else {
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
    dismissError();
    const url = window.location.href;
    const title = document.title.replace(' - YouTube', '');
    updateUI('RUNNING');
    const videoId = extractVideoId(url);
    if (videoId) SafeChromeWrapper.storage.local.set({ lastActiveVideoId: videoId });
    SafeChromeWrapper.runtime.sendMessage({ type: 'GENERATE_INFOGRAPHIC', url: url, title: title });
}

// --- QUEUE LOGIC ---

function updateQueueUI(currentStatus = 'IDLE') {
    SafeChromeWrapper.storage.local.get(['infographicQueue', 'isQueueRunning'], (result) => {
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
                if (genBtn) {
                    genBtn.disabled = true;
                    genBtn.style.opacity = '0.5';
                    genBtn.style.cursor = 'not-allowed';
                }
                const genBatchBtn = document.getElementById(UI_CONTAINER_ID + '-queue-batch-btn');
                if (genBatchBtn) {
                    genBatchBtn.disabled = true;
                    genBatchBtn.style.opacity = '0.5';
                    genBatchBtn.style.cursor = 'not-allowed';
                }
            } else {
                // Generate Button Logic
                const genBatchBtn = document.getElementById(UI_CONTAINER_ID + '-queue-batch-btn');

                if (genBtn) {
                    if (isRunning) {
                        genBtn.disabled = true;
                        genBtn.textContent = 'Processing...';
                        genBtn.style.opacity = '0.5';
                        genBtn.style.cursor = 'not-allowed';
                        if (genBatchBtn) {
                            genBatchBtn.disabled = true;
                            genBatchBtn.textContent = 'Processing...';
                            genBatchBtn.style.opacity = '0.5';
                            genBatchBtn.style.cursor = 'not-allowed';
                        }
                    } else {
                        genBtn.disabled = false;
                        genBtn.textContent = 'Generate Separately';
                        genBtn.style.opacity = '1';
                        genBtn.style.cursor = 'pointer';
                        if (genBatchBtn) {
                            genBatchBtn.disabled = false;
                            genBatchBtn.textContent = 'Generate Combined';
                            genBatchBtn.style.opacity = '1';
                            genBatchBtn.style.cursor = 'pointer';
                        }
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

                        // Tooltip Events
                        errIcon.onmouseenter = (e) => {
                            const tooltip = document.getElementById('altrosyn-queue-tooltip');
                            if (tooltip) {
                                tooltip.textContent = item.error || "Generation failed";
                                const rect = e.target.getBoundingClientRect();
                                tooltip.style.visibility = 'hidden'; // Hide to calculate size
                                tooltip.style.display = 'block';

                                const tipHeight = tooltip.offsetHeight;
                                const tipWidth = tooltip.offsetWidth;

                                let top = rect.top - tipHeight - 10;
                                let left = rect.left + (rect.width / 2) - (tipWidth / 2);

                                // Boundary checks
                                if (top < 0) top = rect.bottom + 10;
                                if (left < 0) left = 10;
                                if (left + tipWidth > window.innerWidth) left = window.innerWidth - tipWidth - 10;

                                tooltip.style.top = `${top}px`;
                                tooltip.style.left = `${left}px`;
                                tooltip.style.visibility = 'visible';
                                tooltip.style.opacity = '1';
                            }
                        };
                        errIcon.onmouseleave = () => {
                            const tooltip = document.getElementById('altrosyn-queue-tooltip');
                            if (tooltip) {
                                tooltip.style.visibility = 'hidden';
                                tooltip.style.opacity = '0';
                            }
                        };

                        errorContainer.appendChild(errIcon);
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
                            SafeChromeWrapper.runtime.sendMessage({
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
    dismissError();
    const url = window.location.href;
    const videoId = extractVideoId(url);
    const title = document.title.replace(' - YouTube', '');

    if (!videoId) return;

    SafeChromeWrapper.storage.local.get(['infographicQueue'], (result) => {
        const queue = result.infographicQueue || [];
        if (!queue.some(item => item.videoId === videoId)) {
            queue.push({ videoId, url, title });
            SafeChromeWrapper.storage.local.set({ infographicQueue: queue }, () => {
                // If we are adding, we must be in a state where we CAN add, so likely IDLE or at least not RUNNING queue
                // But let's check current UI state/storage if we wanted to be 100% pure, but IDLE is safe default for "enable buttons"
                // Actually, best to just call it without args to default to IDLE which is "Interactive"
                updateQueueUI('IDLE');
            });
        }
    });
}

function removeFromQueue(index) {
    SafeChromeWrapper.storage.local.get(['infographicQueue'], (result) => {
        const queue = result.infographicQueue || [];
        queue.splice(index, 1);
        SafeChromeWrapper.storage.local.set({ infographicQueue: queue }, () => {
            updateQueueUI('IDLE');
        });
    });
}

function clearQueue() {
    SafeChromeWrapper.storage.local.set({
        infographicQueue: [],
        queueStatusText: null
    }, () => {
        updateQueueUI('IDLE');
        updateUI('IDLE'); // Clear any global error message

        // Also clear any persistent error on the current video if present
        dismissError();
    });
}

function toggleQueueList() {
    dismissError();
    const list = document.getElementById(UI_CONTAINER_ID + '-queue-list');
    if (list) list.classList.toggle('expanded');
}

function startQueueGeneration() {
    SafeChromeWrapper.storage.local.get(['infographicQueue'], (result) => {
        const queue = result.infographicQueue || [];
        if (queue.length === 0) return;

        updateUI('RUNNING'); // Triggers updateQueueUI('RUNNING') disabling buttons
        const statusEl = document.getElementById(UI_CONTAINER_ID + '-status');
        if (statusEl) statusEl.textContent = `Processing ${queue.length} videos...`;

        SafeChromeWrapper.runtime.sendMessage({ type: 'GENERATE_QUEUE_INFOGRAPHIC', queue: queue }, (response) => {
            if (chrome.runtime.lastError) {
                updateUI('FAILED', null, chrome.runtime.lastError.message);
                return;
            }
            if (response && !response.success) {
                updateUI('FAILED', null, response.error || 'Queue generation failed to start');
            }
        });
    });
}


function startQueueBatchGeneration() {
    SafeChromeWrapper.storage.local.get(['infographicQueue'], (result) => {
        const queue = result.infographicQueue || [];
        if (queue.length === 0) return;

        updateUI('RUNNING'); // Triggers updateQueueUI('RUNNING') disabling buttons
        const statusEl = document.getElementById(UI_CONTAINER_ID + '-status');
        if (statusEl) statusEl.textContent = `Batch Processing ${queue.length} videos...`;

        SafeChromeWrapper.runtime.sendMessage({ type: 'GENERATE_QUEUE_BATCH_SINGLE', queue: queue }, (response) => {
            if (chrome.runtime.lastError) {
                updateUI('FAILED', null, chrome.runtime.lastError.message);
                return;
            }
            if (response && !response.success) {
                updateUI('FAILED', null, response.error || 'Batch generation failed to start');
            }
        });
    });
}

function resetToInitialState() {
    const currentVideoId = extractVideoId(window.location.href);

    SafeChromeWrapper.storage.local.get(['infographicStates'], (result) => {
        const states = result.infographicStates || {};

        if (currentVideoId) {
            // Soft Reset: Preserve image_url and completedAt if they exist
            // so gallery can still show them.
            if (states[currentVideoId]) {
                const old = states[currentVideoId];
                states[currentVideoId] = {
                    ...old,
                    status: 'IDLE',
                    error: null,
                    // Keep image_url, title, completedAt
                };
            }
            // Update storage: 
            // 1. Save cleaned states
            // 2. Set lastActiveVideoId to current (which is now empty/IDLE) to focus here
            SafeChromeWrapper.storage.local.set({
                infographicStates: states,
                lastActiveVideoId: currentVideoId
            }, () => {
                restoreStateForCurrentVideo();
            });
        } else {
            // On Home Page or other non-video page
            // Just clear the global sticky lock so UI resets to IDLE (or "Invalid Context")
            SafeChromeWrapper.storage.local.set({
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
    dismissError();
    // Fetch EVERYTHING to map separate images back to states
    SafeChromeWrapper.storage.local.get(null, (result) => {
        const states = result.infographicStates || {};

        // Filter items (checking hasImage or image_url)
        const allItems = Object.entries(states)
            .map(([videoId, state]) => {
                // Resolve Image URL: either it's still in state (old) or in separate key
                let img = state.image_url;
                if (!img && state.hasImage) {
                    img = result[`img_${videoId}`];
                }
                return { ...state, image_url: img, videoId }; // Inject videoId for reference logic if needed
            });

        // Sort by time (newest first)
        // Filter out items that still don't have an image (failed load or genuinely missing)
        const validImages = allItems
            .filter(s => s.image_url)
            .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

        // Deduplicate by image_url
        const uniqueMap = new Map();
        for (const item of validImages) {
            if (!uniqueMap.has(item.image_url)) {
                uniqueMap.set(item.image_url, item);
            }
        }
        galleryImages = Array.from(uniqueMap.values());

        console.log("Opening Gallery. Images:", galleryImages.length); // DEBUG

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


function handleImageError(failedUrl) {
    console.log("Image failed to load (expired/broken), removing:", failedUrl);

    // 1. Remove from chrome.storage.local
    // 1. Remove from chrome.storage.local
    SafeChromeWrapper.storage.local.get(['infographicStates'], (result) => {
        const states = result.infographicStates || {};
        let modified = false;
        let keysToRemove = [];

        // Find key(s) with this URL and delete
        for (const [key, state] of Object.entries(states)) {
            // Check logic needs to account for split storage. 
            // In handleImageError context, we likely have the full resolved URL in array.
            // If the URL matches what we resolved, we kill the state AND the img key.

            // This is tricky because we don't have the key 'img_X' handy, we have the URL string.
            // BUT, if we loaded it via openGallery, we injected 'videoId' into the object in validImages! 
            // WAIT - 'galleryImages' are the objects from openGallery which I modified to include videoId!
            // Let's rely on that or search blindly. 
            // Actually, we can just search for the videoId in states.

            // We'll iterate states. If 'hasImage' is true, we can't compare URL easily without fetching.
            // But 'galleryImages' in memory has the mapped URL.

            // Simplification: We remove from memory first (step 2 below), then we can use that item to find ID?
            // Actually, let's just use the item from galleryImages if possible.
        }

        // Better approach: Find the item in 'galleryImages' first to get its Video ID (if I saved it there).
        // In openGallery, I added: return { ...state, image_url: img, videoId };
        // So yes, I have videoId.

        const item = galleryImages.find(img => img.image_url === failedUrl);
        if (item && item.videoId) {
            const vid = item.videoId;
            console.log(`Removing broken image state for ${vid}`);
            if (states[vid]) {
                delete states[vid];
                keysToRemove.push(`img_${vid}`);
                modified = true;
            }
        }

        if (modified) {
            SafeChromeWrapper.storage.local.set({ infographicStates: states });
            for (const k of keysToRemove) {
                SafeChromeWrapper.storage.local.remove(k);
            }
        }
    });

    // 2. Remove from runtime gallery array
    const index = galleryImages.findIndex(img => img.image_url === failedUrl);
    if (index !== -1) {
        galleryImages.splice(index, 1);

        // 3. Update UI
        if (galleryImages.length === 0) {
            // Keep open, show empty state
            updateGalleryContent();
        } else {
            // Adjust index if we removed the last item or an item before current
            // If we removed current (index === currentGalleryIndex), the next item shifts into this slot, 
            // so index stays same, UNLESS we were at the end.
            if (index < currentGalleryIndex) {
                currentGalleryIndex--;
            }
            if (currentGalleryIndex >= galleryImages.length) {
                currentGalleryIndex = galleryImages.length - 1;
            }

            // Show next available
            updateGalleryContent();
        }
    }
}

function prevGalleryImage(e) {
    if (e) e.stopPropagation();
    if (currentGalleryIndex > 0) {
        currentGalleryIndex--;
        updateGalleryContent();
    }
}

function nextGalleryImage(e) {
    if (e) e.stopPropagation();
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

    console.log(`[Download] Starting download for: ${item.title}`);
    try {
        SafeChromeWrapper.runtime.sendMessage({
            type: 'DOWNLOAD_IMAGE',
            url: item.image_url,
            filename: filename
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[Download] Runtime Error:", chrome.runtime.lastError);
            } else {
                console.log("[Download] Sent message success");
            }
        });
    } catch (e) {
        if (e.message.includes("Extension context invalidated")) {
            alert("The extension has been updated. Please refresh this page to continue.");
        } else {
            console.error("[Download] Unexpected error:", e);
        }
    }
}

function updateGalleryContent() {
    const imgEl = document.getElementById('altrosyn-gallery-img');
    const captionEl = document.getElementById('altrosyn-gallery-caption');
    const counterEl = document.getElementById('altrosyn-gallery-counter');
    const prevBtn = document.querySelector('.altrosyn-gallery-prev');
    const nextBtn = document.querySelector('.altrosyn-gallery-next');
    const downloadBtn = document.getElementById('altrosyn-gallery-download');
    const emptyMsg = document.getElementById('altrosyn-gallery-empty-msg');
    const wrapper = document.querySelector('.altrosyn-gallery-image-wrapper');

    if (galleryImages.length === 0) {
        // Empty State
        if (wrapper) wrapper.style.display = 'none';
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (downloadBtn) downloadBtn.style.display = 'none';
        if (counterEl) counterEl.style.display = 'none';
        if (captionEl) captionEl.style.display = 'none';

        if (emptyMsg) emptyMsg.style.display = 'flex';
        return;
    }

    // Has images - Reset UI visibility
    if (wrapper) wrapper.style.display = 'flex';
    if (prevBtn) prevBtn.style.display = 'flex';
    if (nextBtn) nextBtn.style.display = 'flex';
    if (downloadBtn) downloadBtn.style.display = 'block'; // or flex depending on CSS
    if (counterEl) counterEl.style.display = 'flex';
    if (captionEl) captionEl.style.display = 'block';
    if (emptyMsg) emptyMsg.style.display = 'none';

    const item = galleryImages[currentGalleryIndex];
    if (!item) return;

    console.log(`[Gallery Update] Index: ${currentGalleryIndex}, IDs found: Img=${!!imgEl}, Cap=${!!captionEl}`);
    console.log(`[Gallery Update] Setting Item: ${item.title}`);
    console.log(`[Gallery Update] Image URL Start: ${item.image_url ? item.image_url.substring(0, 50) : 'null'}`);

    // Reset previous error handlers to avoid stacking
    imgEl.onerror = null;

    // Force src update by clearing first (helps with large Base64 rendering issues)
    imgEl.style.opacity = '0.5';
    imgEl.removeAttribute('src'); // Clear src cleanly

    setTimeout(() => {
        // Handle expired/broken images ONLY for the real URL
        imgEl.onerror = () => {
            console.log("[Gallery] Image load error for:", item.title);
            handleImageError(item.image_url);
        };

        imgEl.onload = () => {
            imgEl.style.opacity = '1';
            console.log("[Gallery] Image loaded successfully");
        };

        imgEl.src = item.image_url;
        console.log(`[Gallery Update] Set new src for ${item.title}`);
    }, 10);

    captionEl.textContent = item.title || "Untitled Infographic";
    counterEl.textContent = `${currentGalleryIndex + 1} / ${galleryImages.length}`;

    prevBtn.disabled = currentGalleryIndex === 0;
    nextBtn.disabled = currentGalleryIndex === galleryImages.length - 1;
}
