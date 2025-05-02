# Response Analyzer - Chrome Extension

## Overview

Response Analyzer is a Chrome extension designed to monitor network traffic (both standard HTTP/HTTPS requests and WebSocket messages) for specific websites and notify the user if a configured keyword appears in the response body or message payload.

It uses the `chrome.debugger` API to intercept network activity, allowing it to inspect the content of AJAX (XHR/Fetch) responses and WebSocket messages, which are often inaccessible to standard content scripts.

## Key Features

*   **Keyword Monitoring:** Searches the content of network responses and WebSocket messages for a user-defined keyword (case-insensitive).
*   **Domain Filtering:** Only analyzes traffic originating from a configurable list of allowed domains. This prevents inspection of third-party requests and enhances privacy.
*   **AJAX/Fetch Response Analysis:** Inspects the response body of XHR and Fetch requests.
*   **WebSocket Message Analysis:** Inspects incoming WebSocket message payloads (only string-based payloads are currently supported).
*   **Configurable File Analysis:** Optionally allows analysis of static file responses (like `.js`, `.css`, `.svg`) in addition to API calls. This is disabled by default.
*   **Desktop Notifications:** Provides immediate desktop notifications when the target keyword is found in an allowed response or message.
*   **Console Logging:** Logs detailed information to the extension's service worker console when the keyword is found, including the source URL.
*   **Options Page:** A simple interface to configure:
    *   The keyword to search for.
    *   The list of allowed domains (one per line).
    *   Whether to analyze static files.

## Configuration

1.  Install the extension (see Installation below).
2.  Right-click the extension icon in your Chrome toolbar and select "Options", or navigate to `chrome://extensions/`, find "Response Analyzer", click "Details", and then "Extension options".
3.  Enter the desired keyword in the "Search Word" field.
4.  Enter the domains you want to monitor in the "Allowed Domains" text area, one domain per line (e.g., `example.com`, `api.example.org`). The extension will match subdomains as well (e.g., `dev.example.com` will be allowed if `example.com` is listed).
5.  Check the "Analyze static files" box if you want to search within JS, CSS, SVG, etc., in addition to API responses (XHR/Fetch). Leave it unchecked (default) to only analyze API calls and WebSocket messages.
6.  Click "Save Settings".

## How It Works

The extension's background script attaches the Chrome Debugger to tabs navigating to the allowed domains. It listens for network events:

*   `Network.requestWillBeSent`: Captures the request URL and type.
*   `Network.loadingFinished`: Gets the response body for completed HTTP/S requests (if the type is XHR/Fetch, or if file analysis is enabled for other types).
*   `Network.webSocketCreated`: Captures the WebSocket connection URL.
*   `Network.webSocketFrameReceived`: Captures incoming WebSocket message payloads.

For allowed domains, it checks the relevant content (response body or WebSocket payload) for the configured keyword and triggers logs/notifications if found.

**Note:** The debugger detaches automatically when the tab is closed or navigates away from an allowed domain. If Chrome DevTools or another debugger extension is already attached to a tab, Response Analyzer will wait and attempt to attach later.

## Installation

1.  Clone or download this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable "Developer mode" using the toggle switch in the top-right corner.
4.  Click the "Load unpacked" button.
5.  Select the directory containing the extension's files (`manifest.json`, `background.js`, etc.).
6.  The extension should now be installed and active.
