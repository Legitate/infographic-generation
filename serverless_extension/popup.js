// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const statusMessage = document.getElementById('status-message');
    const generateBtn = document.getElementById('generate-btn');
    const loadingDiv = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');
    const resultContainer = document.getElementById('result-container');
    const infographicImage = document.getElementById('infographic-image');
    const downloadLink = document.getElementById('download-link');

    // 1. Get current URL from the active tab
    // Since this popup is only enabled on valid YouTube pages, we verify merely for the URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab) {
            const url = currentTab.url;
            const title = currentTab.title;
            statusMessage.textContent = 'Ready to generate.';
            generateBtn.classList.remove('hidden');
            generateBtn.onclick = () => startGeneration(url, title);

            // Restore state if available
            chrome.storage.local.get(['infographicState'], (result) => {
                if (result.infographicState) {
                    restoreState(result.infographicState);
                }
            });
        } else {
            statusMessage.textContent = 'Error: No active tab found.';
        }
    });

    // Listen for state changes (e.g., completion while popup is open)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.infographicState) {
            restoreState(changes.infographicState.newValue);
        }
    });

    let lastStatus = null;

    function restoreState(state) {
        if (!state) return;

        // Check for transition from RUNNING to COMPLETED
        const isFreshCompletion = (lastStatus === 'RUNNING' && state.status === 'COMPLETED');
        lastStatus = state.status;

        if (state.status === 'RUNNING') {
            generateBtn.disabled = true;
            generateBtn.classList.add('hidden');
            loadingDiv.classList.remove('hidden');
            errorMessage.classList.add('hidden');
            infographicImage.style.display = 'none';
            downloadLink.classList.add('hidden');
            statusMessage.textContent = 'Processing...';
        } else if (state.status === 'COMPLETED') {
            const showResult = () => {
                loadingDiv.classList.add('hidden');
                statusMessage.textContent = 'Done';
                infographicImage.src = state.image_url;
                infographicImage.style.display = 'block';

                downloadLink.href = state.image_url;

                const newLink = downloadLink.cloneNode(true);
                downloadLink.parentNode.replaceChild(newLink, downloadLink);
                const finalLink = document.getElementById('download-link');

                finalLink.classList.remove('hidden');
                finalLink.textContent = "Download Image";

                finalLink.onclick = (e) => {
                    e.preventDefault();
                    let filename = "infographic.png";
                    if (state.title) {
                        const safeTitle = state.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        filename = `${safeTitle}.png`;
                    }
                    chrome.downloads.download({
                        url: state.image_url,
                        filename: filename
                    });
                };

                generateBtn.textContent = 'Generate Again';
                generateBtn.disabled = false;
                generateBtn.classList.remove('hidden');
            };

            if (isFreshCompletion) {
                loadingDiv.classList.add('hidden');
                statusMessage.textContent = 'Please wait...';
                infographicImage.style.display = 'none';
                generateBtn.classList.add('hidden'); // Ensure button is hidden during wait
                setTimeout(showResult, 4000);
            } else {
                showResult();
            }

        } else if (state.status === 'FAILED') {
            loadingDiv.classList.add('hidden');
            showError(state.error || 'Unknown error.');
            generateBtn.disabled = false;
            generateBtn.classList.remove('hidden');
        }
    }

    function startGeneration(url, title) {
        // UI Updates
        generateBtn.disabled = true;
        generateBtn.classList.add('hidden'); // Hide button while processing
        loadingDiv.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        infographicImage.style.display = 'none';
        downloadLink.classList.add('hidden');
        statusMessage.textContent = 'Processing...';

        // Mark as RUNNING for the transition logic
        lastStatus = 'RUNNING';

        // Send message to background to trigger backend API
        chrome.runtime.sendMessage({ type: 'GENERATE_INFOGRAPHIC', url: url, title: title }, (response) => {
            // Handle response

            if (chrome.runtime.lastError) {
                loadingDiv.classList.add('hidden');
                showError('Extension Error: ' + chrome.runtime.lastError.message);
                generateBtn.disabled = false;
                generateBtn.classList.remove('hidden');
                return;
            }

            if (response && response.success) {
                // Manually trigger the delayed "Please wait" flow since we know we just finished
                loadingDiv.classList.add('hidden');
                statusMessage.textContent = 'Please wait...';

                setTimeout(() => {
                    statusMessage.textContent = 'Done';
                    infographicImage.src = response.imageUrl;
                    infographicImage.style.display = 'block';

                    // Update Download Link logic
                    const newLink = downloadLink.cloneNode(true);
                    downloadLink.parentNode.replaceChild(newLink, downloadLink);
                    const finalLink = document.getElementById('download-link');

                    finalLink.href = response.imageUrl;
                    finalLink.classList.remove('hidden');
                    finalLink.textContent = "Download Image";

                    finalLink.onclick = (e) => {
                        e.preventDefault();
                        let filename = "infographic.png";
                        if (title) {
                            const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                            filename = `${safeTitle}.png`;
                        }
                        chrome.downloads.download({
                            url: response.imageUrl,
                            filename: filename
                        });
                    };

                    // Keep button hidden or show "Generate Again"?
                    generateBtn.textContent = 'Generate Again';
                    generateBtn.disabled = false;
                    generateBtn.classList.remove('hidden');
                }, 4000); // 4 second delay

            } else {
                loadingDiv.classList.add('hidden');
                showError(response.error || 'Unknown error occurred.');
                generateBtn.disabled = false;
                generateBtn.classList.remove('hidden');
            }
        });
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
        statusMessage.textContent = 'Error occurred.';
    }
});
