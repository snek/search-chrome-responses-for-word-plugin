// background.js (Debugger Version)

// Debugger protocol version (use a stable version)
const DEBUGGER_VERSION = "1.3";

// Keep track of tabs currently being debugged
const debuggingTabs = new Set();
// Map to store request IDs to URLs temporarily
const requestUrlMap = new Map();
// Map to store request IDs to their resource types
const requestTypeMap = new Map();
// Map to store WebSocket request IDs to their URLs
const webSocketUrlMap = new Map();

// Default configuration (can be overridden by options page)
const defaultConfig = {
  searchWord: 'defaultWord',
  allowedDomains: ['example.com'], // Add some defaults
  analyzeFiles: false // Default is to NOT analyze static files
};

// --- Utility Functions ---

// Function to check if a URL's domain is in the allowed list
function isDomainAllowed(url, allowedDomains) {
  if (!url || !url.startsWith('http')) {
    return false; // Ignore non-http(s) URLs
  }
  try {
    const currentDomain = new URL(url).hostname;
    return allowedDomains.some(domain => currentDomain.endsWith(domain));
  } catch (e) {
    console.error('Error parsing URL:', url, e);
    return false;
  }
}

// --- Debugger Management ---

async function attachDebuggerIfNeeded(tabId, url) {
  try {
    const config = await chrome.storage.sync.get(defaultConfig);
    if (isDomainAllowed(url, config.allowedDomains)) {
      if (!debuggingTabs.has(tabId)) {
        console.log(`Attaching debugger to tab ${tabId} for URL: ${url}`);
        await chrome.debugger.attach({ tabId: tabId }, DEBUGGER_VERSION);
        debuggingTabs.add(tabId);
        console.log(`Debugger attached to tab ${tabId}. Enabling Network domain.`);
        // Enable the Network domain to receive network events
        await chrome.debugger.sendCommand({ tabId: tabId }, "Network.enable");
        console.log(`Network domain enabled for tab ${tabId}.`);
      } else {
        // console.log(`Debugger already attached to tab ${tabId}`);
      }
    } else {
      // If navigating to a non-allowed domain, detach
      await detachDebuggerIfNeeded(tabId);
    }
  } catch (e) {
    const errorMessage = e.message || '';
    // Clean up if attach failed partially, check before logging
    if (debuggingTabs.has(tabId)) {
      debuggingTabs.delete(tabId);
    }
    // Common errors that we can often ignore or warn about
    if (errorMessage.includes('Cannot attach') || 
        errorMessage.includes('target page') ||
        errorMessage.includes('Another debugger is already attached')) { 
       console.warn(`Could not attach debugger to tab ${tabId}: ${errorMessage}`);
    } else {
       // Log other unexpected errors
       console.error(`Error attaching/enabling debugger for tab ${tabId}:`, errorMessage);
    }
  }
}

async function detachDebuggerIfNeeded(tabId) {
  if (debuggingTabs.has(tabId)) {
    console.log(`Detaching debugger from tab ${tabId}`);
    try {
      await chrome.debugger.detach({ tabId: tabId });
      console.log(`Debugger detached from tab ${tabId}`);
    } catch (e) {
      console.error(`Error detaching debugger from tab ${tabId}:`, e.message);
      // Common error: Target not found. Might happen if tab closed before detach call.
       if (e.message.includes('target not found')) {
          console.warn(`Tab ${tabId} likely closed before debugger could detach.`);
       }
    } finally {
      // Always remove from our set, even if detach fails (e.g., tab closed)
      debuggingTabs.delete(tabId);
    }
  }
}

// --- Event Listeners ---

// Listener for tab updates (navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if the URL changed and the tab finished loading
  if (changeInfo.url && tab.status === 'complete') {
    console.log(`Tab ${tabId} updated. New URL: ${changeInfo.url}, Status: ${tab.status}`);
    attachDebuggerIfNeeded(tabId, changeInfo.url);
  } else if (changeInfo.status === 'loading' && tab.url && !debuggingTabs.has(tabId)) {
     // Sometimes the initial load might need an attach check too if the status goes straight to complete
     attachDebuggerIfNeeded(tabId, tab.url);
  }
});

// Listener for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`Tab ${tabId} removed.`);
  detachDebuggerIfNeeded(tabId);
});

// Listener for debugger events (like network responses)
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  // source.tabId tells us which tab the event came from
  if (!debuggingTabs.has(source.tabId)) return; // Ignore events from non-debugged tabs

  if (method === "Network.requestWillBeSent") {
    // Store the URL when the request starts
    requestUrlMap.set(params.requestId, params.request.url);
    // Store the resource type
    requestTypeMap.set(params.requestId, params.type); 
    // Optional: Log the request start
    // console.log(`Network.requestWillBeSent: ${params.requestId} - ${params.request.url}`);

  } else if (method === "Network.webSocketCreated") {
    // Store WebSocket URL when connection is created
    webSocketUrlMap.set(params.requestId, params.url);
    console.log(`[DEBUG] WebSocket created: ${params.requestId} - URL: ${params.url}`);

  } else if (method === "Network.webSocketFrameReceived") {
    const requestId = params.requestId;
    const wsUrl = webSocketUrlMap.get(requestId);
    const payload = params.response.payloadData;
    console.log(`[DEBUG] WebSocket frame received: ${requestId} - URL: ${wsUrl} - Payload Type: ${typeof payload}`);

    if (wsUrl && typeof payload === 'string') { // Only process if we have the URL and payload is string
      try {
        const config = await chrome.storage.sync.get(defaultConfig);
        // Check if the WebSocket's domain is allowed
        const domainAllowed = isDomainAllowed(wsUrl, config.allowedDomains);
        console.log(`[DEBUG] Checking WS domain: ${wsUrl} - Allowed: ${domainAllowed}`);
        if (domainAllowed) {
          // Search the WebSocket message payload
          const wordFound = payload.toLowerCase().includes(config.searchWord.toLowerCase());
          console.log(`[DEBUG] Searching WS payload for "${config.searchWord}": Found: ${wordFound}`);
          if (wordFound) {
            console.log(`*** FOUND "${config.searchWord}" in WebSocket message from: ${wsUrl} (Tab: ${source.tabId}) ***`);
            
            // Send notification for WebSocket message
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon128.png',
              title: 'Word Found (WebSocket)!',
              message: `Found "${config.searchWord}" in WebSocket message from: ${wsUrl}`
            });
          }
        }
      } catch (e) {
        console.error(`Error processing WebSocket frame for ${wsUrl} (Tab: ${source.tabId}):`, e);
      }
    } else if (wsUrl && typeof payload !== 'string') {
        // console.log(`Skipping non-string WebSocket frame from: ${wsUrl}`);
    }

  } else if (method === "Network.webSocketClosed") {
    // Clean up map when WebSocket closes
    const requestId = params.requestId;
    const wsUrl = webSocketUrlMap.get(requestId);
    console.log(`[DEBUG] WebSocket closed: ${requestId} - URL: ${wsUrl}`);
    webSocketUrlMap.delete(requestId);

  } else if (method === "Network.responseReceived") {
    // console.log(`Network.responseReceived for tab ${source.tabId}, requestId: ${params.requestId}, type: ${params.response.mimeType}`);
    // We could potentially filter here based on mimeType if needed

  } else if (method === "Network.loadingFinished") {
    const requestId = params.requestId;
    const requestUrl = requestUrlMap.get(requestId); // Get URL from map
    const resourceType = requestTypeMap.get(requestId); // Get type from map
    // console.log(`Network.loadingFinished for tab ${source.tabId}, requestId: ${requestId}, URL: ${requestUrl}`);

    // Clean up the map entries regardless of whether we process the body
    requestUrlMap.delete(requestId);
    requestTypeMap.delete(requestId);

    // --- Domain Check for the specific request URL --- 
    const config = await chrome.storage.sync.get(defaultConfig);
    if (!isDomainAllowed(requestUrl, config.allowedDomains)) {
        // console.log(`Skipping response body check for non-allowed URL: ${requestUrl}`);
        return; // Don't process requests from other domains
    }
    // --- End Added Domain Check ---

    // --- Resource Type Check --- 
    // Always check XHR and Fetch. Only check others if analyzeFiles is true.
    const isApiCall = resourceType === 'XHR' || resourceType === 'Fetch';
    if (!isApiCall && !config.analyzeFiles) {
        // console.log(`Skipping non-API call (${resourceType}) because analyzeFiles is false: ${requestUrl}`);
        return; // Skip if it's not XHR/Fetch and we're not analyzing files
    }
    // --- End Resource Type Check ---

    try {
      // Config already fetched above
      // const config = await chrome.storage.sync.get(defaultConfig);
      const response = await chrome.debugger.sendCommand(
        { tabId: source.tabId },
        "Network.getResponseBody",
        { requestId: requestId }
      );

      let body = response.body;
      if (response.base64Encoded) {
         // Attempt to decode base64. This assumes UTF-8, might need adjustments for other encodings.
         try {
            body = atob(response.body);
         } catch(e) {
            console.warn(`Failed to decode base64 response body for requestId ${requestId}:`, e);
            body = null; // Cannot process if decoding fails
         }
      }

      if (body && config.searchWord && typeof body === 'string') { // Ensure body is a string
        // Simple case-insensitive search
        if (body.toLowerCase().includes(config.searchWord.toLowerCase())) {
          // Include the URL in the log message
          console.log(`*** FOUND "${config.searchWord}" in response body for URL: ${requestUrl} (Tab: ${source.tabId}) ***`);

          // Optional: Send a notification including the URL
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon128.png',
            title: 'Word Found!',
            // Include URL in the notification message
            message: `Found "${config.searchWord}" in response from: ${requestUrl}`
          });
        } else {
            // console.log(`Word "${config.searchWord}" not found in response body (requestId: ${requestId})`);
        }
      } else if (body && typeof body !== 'string') {
         console.log(`Response body for URL ${requestUrl} is not a string, skipping search.`);
      } else if (!body) {
         // console.log(`No response body available or decoded for requestId ${requestId}`);
      }

    } catch (e) {
      // Handle errors fetching response body (e.g., "No data found for resource with given identifier")
      // This often happens for requests with no actual body content (redirects, images, etc.)
      const errorMessage = e.message || '';
      if (errorMessage.includes('No data found') || 
          errorMessage.includes('doesn\'t have content') ||
          errorMessage.includes('No resource with given identifier found')) { 
        // console.log(`No response body content found for requestId: ${requestId} (Tab: ${source.tabId}). This is often normal.`);
      } else if (errorMessage.includes('Target closed.')) {
          console.warn(`Debugger detached (target closed) while trying to get response body for request ${requestId} (Tab: ${source.tabId}).`);
          detachDebuggerIfNeeded(source.tabId); // Clean up our state
      } else {
        // Log other unexpected errors
        console.error(`Error getting response body for URL: ${requestUrl} (Tab: ${source.tabId}):`, errorMessage);
      }
    }
  }
});

// Listener for debugger detachment (e.g., user closes the warning bar)
chrome.debugger.onDetach.addListener((source, reason) => {
  console.warn(`Debugger detached from tab ${source.tabId}. Reason: ${reason}`);
  // Make sure we remove it from our tracking set
  debuggingTabs.delete(source.tabId);
});

// Optional: Initial setup on extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set(defaultConfig, () => {
      console.log('Default configuration saved.');
    });
  }
  // On update or install, check existing tabs and attach if needed
  chrome.tabs.query({}, (tabs) => {
     tabs.forEach(tab => {
        if (tab.url && tab.status === 'complete') { // Only attach to completed tabs with URLs
            attachDebuggerIfNeeded(tab.id, tab.url);
        }
     });
  });

});

// Log when the background script starts
console.log('Background script (debugger version) loaded.');

// Add dummy icon files if they don't exist to prevent errors on notification
// In a real extension, provide actual icons.
chrome.runtime.onStartup.addListener(async () => {
    // Check existing tabs on browser startup as well
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && tab.status === 'complete') {
                attachDebuggerIfNeeded(tab.id, tab.url);
            }
        });
    });
});

// Need to create dummy icon files or remove the iconUrl from notifications
// For now, let's add a placeholder check to avoid errors if icon doesn't exist.
// (Better: Create the icon files)
const iconPath = 'icon128.png';
// This check is illustrative; in reality, you'd ensure the file exists during development.
// chrome.runtime.getPackageDirectoryEntry( (root) => {
//   root.getFile(iconPath, {create: false},
//     () => console.log("Icon file exists."),
//     () => console.warn("Icon file 'icon128.png' not found. Notifications might fail or show default icon.")
//   );
// });
