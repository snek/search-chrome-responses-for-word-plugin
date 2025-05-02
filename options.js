// Default configuration (should match background.js)
const defaultConfig = {
  searchWord: 'defaultWord',
  allowedDomains: ['example.com'],
  analyzeFiles: false // Add default for the new setting
};

// Function to save options to Chrome storage
function saveOptions() {
  const searchWord = document.getElementById('searchWord').value;
  const analyzeFiles = document.getElementById('analyzeFiles').checked; // Get checkbox state
  // Split textarea by lines, trim whitespace, filter empty lines
  const allowedDomains = document.getElementById('allowedDomains').value
                            .split('\n')
                            .map(domain => domain.trim())
                            .filter(domain => domain);

  chrome.storage.sync.set(
    {
      searchWord: searchWord,
      allowedDomains: allowedDomains,
      analyzeFiles: analyzeFiles // Save the checkbox state
    },
    () => {
      // Update status to let user know options were saved.
      const status = document.getElementById('status');
      status.textContent = 'Options saved.';
      console.log('Options saved:', { searchWord, allowedDomains, analyzeFiles });
      setTimeout(() => {
        status.textContent = '';
      }, 1500); // Clear status after 1.5 seconds
    }
  );
}

// Function to restore options from Chrome storage
function restoreOptions() {
  // Use default values if not found in storage
  chrome.storage.sync.get(defaultConfig, (items) => {
    document.getElementById('searchWord').value = items.searchWord;
    document.getElementById('analyzeFiles').checked = items.analyzeFiles; // Restore checkbox state
    // Join the array back into a string with newlines for the textarea
    document.getElementById('allowedDomains').value = items.allowedDomains.join('\n');
    console.log('Options restored:', items);
  });
}

// Add event listeners once the DOM is loaded
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

console.log('Options script loaded.');
