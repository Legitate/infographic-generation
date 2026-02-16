// background.js (Serverless)

const NOTEBOOKLM_BASE = "https://notebooklm.google.com";
let currentYouTubeUrl = null;

// --- INIT & LISTENERS ---

chrome.runtime.onInstalled.addListener(async () => {
    chrome.action.disable();

    // 1. Clean Stale States (Reset any "RUNNING" states to "FAILED" so UI unlocks)
    const result = await chrome.storage.local.get(['infographicStates']);
    const states = result.infographicStates || {};
    let hasChanges = false;

    for (const [videoId, state] of Object.entries(states)) {
        if (state.status === 'RUNNING' || state.status === 'AUTH_PENDING') {
            console.log(`Resetting stale state for video ${videoId}`);
            states[videoId] = { ...state, status: 'FAILED', error: 'Extension reloaded' };
            hasChanges = true;
        }
    }

    if (hasChanges) {
        await chrome.storage.local.set({ infographicStates: states });
    }

    // 1.5 Clean Expired States (> 48 hours)
    await cleanExpiredStates();

    // 2. Clear Global Sticky ID if it was RUNNING
    // Actually, let's just leave the sticky ID, but since we reset the state object above, 
    // the UI will see 'FAILED' instead of 'RUNNING' and unlock.

    // 3. Re-inject Content Script & Enable Action
    const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
    for (const tab of tabs) {
        try {
            chrome.action.enable(tab.id);
            // Re-inject content script to revive UI on existing tabs
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
        } catch (e) {
            console.log(`Could not inject into tab ${tab.id}:`, e);
        }
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'YOUTUBE_ACTIVE') {
        const tabId = sender.tab.id;
        currentYouTubeUrl = message.url;
        chrome.action.enable(tabId);
        sendResponse({ status: 'enabled' });

    } else if (message.type === 'GENERATE_INFOGRAPHIC') {
        runGenerationFlow(message.url, message.title)
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    } else if (message.type === 'DOWNLOAD_IMAGE') {
        chrome.downloads.download({
            url: message.url,
            filename: message.filename
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId: downloadId });
            }
        });
        return true; // Keep channel open for async response
    } else if (message.type === 'GENERATE_QUEUE_INFOGRAPHIC') {
        runQueueGenerationFlow(message.queue)
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

// --- CORE FLOW ---

async function runGenerationFlow(url, title) {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    await updateState(videoId, { status: 'RUNNING', operation_id: Date.now(), title: title });
    await chrome.storage.local.set({ lastActiveVideoId: videoId }); // Ensure global lock for single video
    broadcastStatus(url, "RUNNING");

    // Daily Limit Check moved to execution phase (if opId is missing)

    // Sanitize URL (NotebookLM dislikes playlists/mixes)
    // const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
        // 1. Get Params & Auth
        const client = new NotebookLMClient();
        await client.init(); // Auto-auth using cookies

        // 2. Create Notebook
        const notebookName = title || "Infographic Gen";
        console.log(`Creating Notebook: ${notebookName}`);
        const notebookId = await client.createNotebook(notebookName);
        console.log("Notebook ID:", notebookId);

        // 3. Add Source
        console.log("Adding Source...");
        const sourceData = await client.addSource(notebookId, url);
        const sourceId = sourceData.source_id;
        console.log("Source ID:", sourceId);

        // Wait a bit for ingestion
        await new Promise(r => setTimeout(r, 5000));

        // 4. Run Infographic Tool
        console.log("Running Infographic Tool...");
        const opId = await client.runInfographicTool(notebookId, sourceId);
        console.log("Operation ID:", opId);

        if (!opId) {
            await updateState(videoId, { status: 'LIMIT_EXCEEDED', error: "Your daily limit is over try after 24 hrs" });
            broadcastStatus(url, "LIMIT_EXCEEDED");
            return { success: false, error: "Daily limit exceeded" };
        }

        // 5. Poll for Result
        console.log("Polling for result...");
        const imageUrl = await client.waitForInfographic(notebookId, opId);
        console.log("Success! Image found. Converting to Base64...");
        const base64Image = await urlToBase64(imageUrl);

        await updateState(videoId, { status: 'COMPLETED', image_url: base64Image });
        broadcastStatus(url, "COMPLETED", { image_url: base64Image });

        return { success: true, imageUrl: base64Image };

    } catch (e) {
        console.error("Generation Failed:", e);
        const rawError = e.message || "Unknown error";
        const friendlyError = getUserFriendlyError(rawError);

        // Handle Auth Error specifically
        if (friendlyError.type === 'AUTH') {
            await updateState(videoId, { status: 'AUTH_REQUIRED', error: friendlyError.message });
            broadcastStatus(url, "AUTH_EXPIRED");
        } else if (friendlyError.type === 'LIMIT') {
            await updateState(videoId, { status: 'LIMIT_EXCEEDED', error: friendlyError.message });
            broadcastStatus(url, "LIMIT_EXCEEDED", { error: friendlyError.message });
        } else {
            await updateState(videoId, { status: 'FAILED', error: friendlyError.message });
            broadcastStatus(url, "FAILED", { error: friendlyError.message });
        }
        throw e;
    }


}

function getUserFriendlyError(rawError) {
    const errorLower = rawError.toLowerCase();

    if (errorLower.includes("401") || errorLower.includes("authentication failed") || errorLower.includes("log in")) {
        return { type: 'AUTH', message: "Session expired. Please log in to NotebookLM again." };
    }
    if (errorLower.includes("failed to fetch") || errorLower.includes("network")) {
        return { type: 'NETWORK', message: "Connection failed. Please check your internet." };
    }
    if (errorLower.includes("daily limit") || errorLower.includes("limit exceeded")) {
        return { type: 'LIMIT', message: "Daily generation limit reached. Please try again tomorrow." };
    }
    if (errorLower.includes("failed to add source")) {
        return { type: 'SOURCE', message: "Could not add this video. It might be private, too long, or age-restricted." };
    }
    if (errorLower.includes("timed out") || errorLower.includes("timeout")) {
        return { type: 'TIMEOUT', message: "Generation took too long. Servers might be busy. Please try again." };
    }

    // Default fallback
    return { type: 'UNKNOWN', message: rawError }; // Keep original if specific match not found, or maybe generic?
    // Let's keep rawError for now so we don't hide useful debug info if it's something valid.
}


async function runQueueGenerationFlow(queue) {
    if (!queue || queue.length === 0) return;

    // Broadcast global RUNNING state
    broadcastStatus(null, "RUNNING");

    // SET GLOBAL QUEUE LOCK
    await chrome.storage.local.set({ isQueueRunning: true });

    const total = queue.length;
    // We'll use the first video to "lock" the UI initially if needed, 
    // but the loop will update it.

    try {
        const client = new NotebookLMClient();
        await client.init();

        for (let i = 0; i < total; i++) {
            const item = queue[i];
            const currentCount = i + 1;
            const safeTitle = item.title || "Untitled Video";
            const progressMsg = `Processing ${currentCount}/${total}: ${safeTitle.substring(0, 20)}...`;

            console.log(`[Queue] Starting item ${currentCount}/${total}: ${safeTitle}`);

            // 1. LOCK UI & SET MESSAGE
            await chrome.storage.local.set({
                lastActiveVideoId: item.videoId,
                queueStatusText: progressMsg
            });

            // 2. Update individual state to RUNNING
            await updateState(item.videoId, {
                status: 'RUNNING',
                operation_id: Date.now(),
                title: safeTitle
            });

            // UPDATE QUEUE OBJECT WITH RUNNING STATUS
            {
                const qResult = await chrome.storage.local.get(['infographicQueue']);
                const currentQueue = qResult.infographicQueue || [];
                const qItemIndex = currentQueue.findIndex(q => q.videoId === item.videoId);
                if (qItemIndex !== -1) {
                    currentQueue[qItemIndex].status = 'RUNNING';
                    await chrome.storage.local.set({ infographicQueue: currentQueue });
                }
            }

            // Broadcast progress
            const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
            for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'INFOGRAPHIC_UPDATE',
                    status: 'RUNNING',
                    queueProgress: `Processing ${currentCount} of ${total}`
                }).catch(() => { });
            }

            try {
                // -- GENERATION STEPS --
                const notebookName = `Infographic: ${safeTitle}`;
                console.log(`[Queue] Creating Notebook: ${notebookName}`);
                const notebookId = await client.createNotebook(notebookName);

                console.log(`[Queue] Adding Source: ${item.url}`);
                const sourceData = await client.addSource(notebookId, item.url);
                const sourceId = sourceData.source_id;

                // Wait for ingestion
                await new Promise(r => setTimeout(r, 5000));

                console.log(`[Queue] Running Tool...`);
                const opId = await client.runInfographicTool(notebookId, sourceId);

                if (!opId) {
                    // Check if this was actually a limit issue that didn't throw yet
                    // If opId is null, it's virtually always a limit or quota issue
                    throw new Error("Daily limit exceeded");
                }

                console.log(`[Queue] Polling...`);
                const imageUrl = await client.waitForInfographic(notebookId, opId);
                console.log(`[Queue] Success for ${safeTitle}. Converting...`);
                const base64Image = await urlToBase64(imageUrl);

                // Success State!
                await updateState(item.videoId, {
                    status: 'COMPLETED',
                    image_url: base64Image,
                    title: safeTitle
                });

                // UPDATE QUEUE OBJECT WITH RESULT
                {
                    const qResult = await chrome.storage.local.get(['infographicQueue']);
                    const currentQueue = qResult.infographicQueue || [];
                    const qItemIndex = currentQueue.findIndex(q => q.videoId === item.videoId);
                    if (qItemIndex !== -1) {
                        currentQueue[qItemIndex].imageUrl = base64Image;
                        currentQueue[qItemIndex].status = 'COMPLETED';
                        await chrome.storage.local.set({ infographicQueue: currentQueue });
                    }
                }

                broadcastStatus(item.url, "COMPLETED", { image_url: base64Image });

            } catch (itemError) {
                console.error(`[Queue] Failed item ${safeTitle}:`, itemError);

                // --- ERROR HANDLING AND LOOP CONTROL ---
                const friendly = getUserFriendlyError(itemError.message);
                let failReason = friendly.message;

                // SAVE ERROR STATE TO QUEUE
                {
                    const qResult = await chrome.storage.local.get(['infographicQueue']);
                    const currentQueue = qResult.infographicQueue || [];
                    const qItemIndex = currentQueue.findIndex(q => q.videoId === item.videoId);
                    if (qItemIndex !== -1) {
                        currentQueue[qItemIndex].status = 'FAILED';
                        currentQueue[qItemIndex].error = failReason;
                        await chrome.storage.local.set({ infographicQueue: currentQueue });
                    }
                }

                if (friendly.type === 'AUTH') {
                    // CRITICAL: Stop Queue
                    console.log("[Queue] Auth Error - STOPPING QUEUE");
                    await updateState(item.videoId, { status: 'AUTH_REQUIRED', error: friendly.message });
                    broadcastStatus(item.url, "AUTH_EXPIRED");
                    break; // STOP LOOP
                }
                else if (friendly.type === 'LIMIT') {
                    // CRITICAL: Stop Queue
                    console.log("[Queue] Limit Exceeded - STOPPING QUEUE");
                    await updateState(item.videoId, { status: 'LIMIT_EXCEEDED', error: friendly.message });
                    broadcastStatus(item.url, "LIMIT_EXCEEDED", { error: friendly.message });
                    break; // STOP LOOP
                }
                else {
                    // Non-Critical (Network, Timeout, Bad Video): Fail this one, Continue to next
                    console.log("[Queue] Non-critical error - Continuing queue");
                    await updateState(item.videoId, { status: 'FAILED', error: friendly.message });
                    broadcastStatus(item.url, "FAILED", { error: friendly.message });
                }
            }

            // Small delay between items to be nice to the server
            if (i < total - 1) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        // UNLOCK GLOBAL QUEUE
        await chrome.storage.local.set({ isQueueRunning: false });

        return { success: true };

    } catch (e) {
        // Top-level init/fatal errors
        console.error("Queue Batch Flow Fatal Error:", e);
        await chrome.storage.local.set({ isQueueRunning: false });
        // We might not know which video failed if init failed, so broadcast global fail
        broadcastStatus(null, "FAILED", { error: e.message });
        throw e;
    }
}


// --- CLIENT IMPLEMENTATION ---

class NotebookLMClient {
    constructor() {
        this.f_sid = null;
        this.bl = null;
        this.at_token = null; // We might not need this if cookies work magically, but usually SN requires f.req w/ tokens
        this.req_id = Math.floor(Math.random() * 900000) + 100000;
    }

    async init() {
        console.log("Initializing NotebookLM Client...");
        // Fetch homepage to scrape params
        let response;
        try {
            response = await fetch(`${NOTEBOOKLM_BASE}/`);
        } catch (e) {
            console.error("Init Fetch Error:", e);
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                throw new Error("Authentication failed. Please log in to NotebookLM.");
            }
            throw e;
        }

        console.log(`NotebookLM Homepage Fetch Status: ${response.status}`);

        // Check for redirect to login page
        if (response.url.includes("accounts.google.com") || response.url.includes("ServiceLogin")) {
            throw new Error("Authentication failed. Please log in to NotebookLM.");
        }

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) throw new Error("Authentication failed. Please log in to NotebookLM.");
            throw new Error("Failed to reach NotebookLM: " + response.status);
        }

        const text = await response.text();
        console.log(`Fetched Homepage Content Length: ${text.length}`);

        // Scrape FdrFJe (f.sid)
        // Try multiple regex patterns just in case
        let matchSid = text.match(/"FdrFJe":"([-0-9]+)"/);
        if (!matchSid) {
            // Fallback: try looking for WIZ_global_data structure loosely
            console.log("Regex 1 failed, trying fallback...");
            matchSid = text.match(/FdrFJe\\":\\"([-0-9]+)\\"/); // Escaped JSON scenario
        }

        this.f_sid = matchSid ? matchSid[1] : null;
        console.log(`Found f.sid: ${this.f_sid ? "YES" : "NO"} (${this.f_sid})`);

        // Scrape bl
        const matchBl = text.match(/"(boq_[^"]+)"/);
        this.bl = matchBl ? matchBl[1] : "boq_labs-tailwind-frontend_20260101.17_p0";
        console.log(`Found bl: ${this.bl}`);

        // Scrape SNlM0e (at_token) - sometimes needed
        const matchAt = text.match(/"SNlM0e":"([^"]+)"/);
        this.at_token = matchAt ? matchAt[1] : null;

        if (!this.f_sid) {
            console.error("CRITICAL: Could not find f.sid in homepage content. Auth will fail.");
            throw new Error("Authentication failed. Please log in to NotebookLM.");
        }
    }

    getReqId() {
        this.req_id += 1000;
        return this.req_id.toString();
    }

    async executeRpc(rpcId, payload) {
        if (!this.f_sid) await this.init();

        const url = `${NOTEBOOKLM_BASE}/_/LabsTailwindUi/data/batchexecute`;
        const f_req = JSON.stringify([[[rpcId, JSON.stringify(payload), null, "generic"]]]);

        const params = new URLSearchParams({
            "rpcids": rpcId,
            "f.sid": this.f_sid,
            "bl": this.bl,
            "hl": "en-GB",
            "_reqid": this.getReqId(),
            "rt": "c"
        });

        const formData = new URLSearchParams();
        formData.append("f.req", f_req);
        if (this.at_token) formData.append("at", this.at_token);
        console.log(`Executing RPC ${rpcId} (AT Token present: ${this.at_token ? 'YES' : 'NO'})`);

        const response = await fetch(`${url}?${params.toString()}`, {
            method: "POST",
            body: formData,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            }
        });

        if (response.status === 401 || response.status === 403) {
            throw new Error("Authentication failed (401)");
        }

        const text = await response.text();
        const parsed = this.parseEnvelope(text, rpcId);

        // Debug Log only for addSource failure investigation
        if (rpcId === 'izAoDd') {
            console.log(`RPC izAoDd Response Preview: ${JSON.stringify(parsed).substring(0, 500)}`);
        }

        return parsed;
    }

    parseEnvelope(text, rpcId) {
        // ... (existing parseEnvelope)
        if (text.startsWith(")]}'")) text = text.substring(4);

        const lines = text.split('\n');
        let results = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                if (trimmed.startsWith('[')) {
                    const obj = JSON.parse(trimmed);
                    if (Array.isArray(obj)) results.push(obj);
                }
            } catch (e) { }
        }

        const validObjects = results.flat();

        for (const chunk of validObjects) {
            if (Array.isArray(chunk) && chunk.length > 2 && chunk[1] === rpcId) {
                const inner = chunk[2];
                if (inner) {
                    try {
                        return JSON.parse(inner);
                    } catch (e) {
                        return inner;
                    }
                }
            }
        }
        return [];
    }

    // ... existing findUuid ...
    findUuid(obj) {
        // ... existing findUuid ...
        if (typeof obj === 'string') {
            if (obj.length === 36 && (obj.match(/-/g) || []).length === 4) return obj;
            if (obj.startsWith('[') || obj.startsWith('{')) {
                try { return this.findUuid(JSON.parse(obj)); } catch (e) { }
            }
        }
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const res = this.findUuid(item);
                if (res) return res;
            }
        }
        if (typeof obj === 'object' && obj !== null) {
            for (const val of Object.values(obj)) {
                const res = this.findUuid(val);
                if (res) return res;
            }
        }
        return null;
    }

    async createNotebook(title) {
        // ... existing
        // RPC: CCqFvf
        const payload = [title, null, null, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
        const resp = await this.executeRpc("CCqFvf", payload);

        let notebookId = null;
        if (Array.isArray(resp) && resp.length > 2) notebookId = resp[2];
        if (!notebookId) notebookId = this.findUuid(resp);

        if (!notebookId) throw new Error("Failed to create notebook");
        return notebookId;
    }

    async addSource(notebookId, url) {
        // RPC: izAoDd
        const sourcePayload = [null, null, null, null, null, null, null, [url], null, null, 1];
        const payload = [[sourcePayload], notebookId, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];

        const resp = await this.executeRpc("izAoDd", payload);

        // Extract Source ID
        let sourceId = this.findUuid(resp);

        if (!sourceId) {
            // Poll for async source (YouTube)
            // Simplified: Wait 5s and check notebook sources
            await new Promise(r => setTimeout(r, 4000));
            const sources = await this.getSources(notebookId);
            if (sources.length > 0) sourceId = sources[0];
        }

        if (!sourceId) throw new Error("Failed to add source");

        return { source_id: sourceId };
    }

    async getSources(notebookId) {
        // RPC: gArtLc
        const payload = [[2], notebookId, null];
        const resp = await this.executeRpc("gArtLc", payload);

        const ids = [];
        const recurse = (obj) => {
            if (typeof obj === 'string' && obj.length === 36 && (obj.match(/-/g) || []).length === 4) ids.push(obj);
            else if (Array.isArray(obj)) obj.forEach(recurse);
        };
        recurse(resp);
        return ids;
    }

    async runInfographicTool(notebookId, sourceId) {
        // RPC: R7cb6c
        // 7 = Infographic
        // Payload struct: [2], nbId, [ ... ]
        // Using simplified sturdy payload from python client
        const sourceParam = [[[sourceId]]];
        const toolPayload = [null, null, 7, sourceParam, null, null, null, null, null, null, null, null, null, null, [[null, null, null, 1, 2]]];
        const payload = [[2], notebookId, toolPayload];

        const resp = await this.executeRpc("R7cb6c", payload);

        if (Array.isArray(resp) && resp.length > 0 && Array.isArray(resp[0])) {
            return resp[0][0]; // Operation ID
        }
        return null; // Might be silent success or failure
    }

    async waitForInfographic(notebookId, opId) {
        console.log(`Waiting for infographic (Op ID: ${opId})...`);
        for (let i = 0; i < 90; i++) { // 90 * 2 = 180 seconds (3 mins)
            await new Promise(r => setTimeout(r, 2000));

            // Check artifacts via gArtLc
            const payload = [[2], notebookId, null];
            const resp = await this.executeRpc("gArtLc", payload);

            // Debug Log every 5th attempt
            if (i % 5 === 0) console.log(`Polling attempt ${i + 1}/90...`);

            let foundUrl = null;

            const scanForInfographic = (arr) => {
                if (!Array.isArray(arr)) return;
                // Heuristic: Type 7 check
                if (arr.length > 2 && arr[2] === 7) {
                    try {
                        const content = arr[14];
                        const items = content[2];
                        const url = items[0][1][0];
                        if (url && url.startsWith("http")) foundUrl = url;
                    } catch (e) { }
                }
                arr.forEach(scanForInfographic);
            };

            scanForInfographic(resp);

            if (foundUrl) {
                console.log("Infographic found:", foundUrl);
                return foundUrl;
            }
        }
        throw new Error("Timed out waiting for infographic (3 mins exceeded)");
    }
}


// --- UTILS ---

function extractVideoId(url) {
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    } catch (e) { }
    return null;
}

async function broadcastStatus(url, status, payload = {}) {
    try {
        const videoId = extractVideoId(url);
        const allTabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
        for (const tab of allTabs) {
            chrome.tabs.sendMessage(tab.id, {
                type: status === "AUTH_EXPIRED" ? "AUTH_EXPIRED" : "INFOGRAPHIC_UPDATE",
                videoId: videoId,
                status: status,
                ...payload
            }).catch(() => { });
        }
    } catch (e) { }
}

async function updateState(videoId, newState) {
    if (!videoId) return;
    const result = await chrome.storage.local.get(['infographicStates']);
    const states = result.infographicStates || {};

    // If completing, add timestamp
    if (newState.status === 'COMPLETED') {
        newState.completedAt = Date.now();
    }

    // Merge existing state with new state to preserve fields like title
    states[videoId] = { ...(states[videoId] || {}), ...newState };
    await chrome.storage.local.set({ infographicStates: states });
}

async function cleanExpiredStates() {
    console.log("Cleaning expired infographics...");
    const result = await chrome.storage.local.get(['infographicStates']);
    const states = result.infographicStates || {};
    let hasChanges = false;
    const EXPIRATION_MS = 48 * 60 * 60 * 1000; // 48 Hours

    for (const [videoId, state] of Object.entries(states)) {
        // Check for completedAt timestamp
        if (state.completedAt && (Date.now() - state.completedAt > EXPIRATION_MS)) {
            console.log(`Removing expired infographic: ${videoId} (Age: ${((Date.now() - state.completedAt) / 3600000).toFixed(1)} hrs)`);
            delete states[videoId];
            hasChanges = true;
        }
        // Fallback for older items without timestamp? 
        // Logic: specific request was to store FOR 48 hours. 
        // Existing items without timestamp will be kept until next update adds one or we decide to purge them.
        // For now, only purge explicit timestamps.
    }

    if (hasChanges) {
        await chrome.storage.local.set({ infographicStates: states });
    }
}


// --- IMAGE HELPER ---
async function urlToBase64(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Failed to convert image to base64:", e);
        return url; // Fallback to original URL if fetch fails
    }
}
