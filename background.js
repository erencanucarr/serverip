// Use Chrome Storage API instead of localStorage
let sips = {};
let mnems = {};

// Load data from storage
async function loadStorageData() {
  const result = await chrome.storage.local.get(['sips', 'mnems']);
  sips = result.sips || {};
  mnems = result.mnems || {};
}

// Initialize data
loadStorageData();

function parse_url(l_url) {
  if (!l_url) return '';
  try {
    // Extract hostname from URL
    const url = new URL(l_url);
    return url.hostname;
  } catch (e) {
    // Fallback to the old method if URL parsing fails
    return l_url.replace(/^(([^:/?#]+):)?(\/\/([^/?#]*)|\/\/\/)?([^?#]*)(\\?[^#]*)?(#.*)?/,'$3').replace('//', '');
  }
}

async function set_badge(ip, isProxied) {
  let bdg = '';
  let bdgColor = (sips && sips.color && sips.color.defaultColor ? sips.color.defaultColor : '#ff0000');
  
  if (!ip) {
    // No IP detected
    bdg = '?';
    bdgColor = '#808080'; // Gray for unknown
  } else if (isProxied) {
    // For proxied connections, show a special indicator
    //bdg = 'CDN';
    //bdgColor = '#808080'; // Gray color for CDN/proxied connections
  } else {
    bdg = ip.substr(ip.lastIndexOf('.') + 1);
    
    if (mnems[ip]) {
      bdg = mnems[ip].mnem;
      bdgColor = mnems[ip].color || bdgColor;
    }
  }
  
  try {
    await chrome.action.setBadgeText({text: bdg});
    await chrome.action.setBadgeBackgroundColor({color: bdgColor});
  } catch (e) {
    console.error("Error setting badge:", e);
  }
}

async function getUrlIpInfo(url) {
  if (!url) return { ip: null, isProxied: false };
  
  const hostname = parse_url(url);
  if (!hostname) return { ip: null, isProxied: false };
  
  const result = await chrome.storage.local.get([hostname, hostname + '_proxied']);
  return {
    ip: result[hostname],
    isProxied: result[hostname + '_proxied'] === true
  };
}

// Function to perform DNS lookup using a public DNS API
async function dnsLookup(hostname) {
  try {
    // Try using Google's DNS API
    const response = await fetch(`https://dns.google/resolve?name=${hostname}&type=A`);
    const data = await response.json();
    
    if (data.Answer && data.Answer.length > 0) {
      // Return the first A record
      for (const answer of data.Answer) {
        if (answer.type === 1) { // Type 1 is A record
          return answer.data; // This is the IP address
        }
      }
    }
    
    // Fallback to Cloudflare's DNS API if Google's doesn't return results
    const cfResponse = await fetch(`https://cloudflare-dns.com/dns-query?name=${hostname}&type=A`, {
      headers: {
        'Accept': 'application/dns-json'
      }
    });
    const cfData = await cfResponse.json();
    
    if (cfData.Answer && cfData.Answer.length > 0) {
      for (const answer of cfData.Answer) {
        if (answer.type === 1) {
          return answer.data;
        }
      }
    }
    
    return null;
  } catch (e) {
    console.error("DNS lookup error:", e);
    return null;
  }
}

async function tab_changed_now_update(tab_id) {
  try {
    const ctab = await chrome.tabs.get(tab_id);
    if (ctab && ctab.url && (ctab.url.length > 0)) {
      let ipInfo = await getUrlIpInfo(ctab.url);
      
      // If no IP is found, try DNS lookup
      if (!ipInfo.ip) {
        const hostname = parse_url(ctab.url);
        if (hostname) {
          const ip = await dnsLookup(hostname);
          if (ip) {
            // Store the IP we found
            const data = {};
            data[hostname] = ip;
            data[hostname + '_proxied'] = true; // Mark as proxied since we had to use DNS lookup
            await chrome.storage.local.set(data);
            
            ipInfo = { ip: ip, isProxied: true };
          }
        }
      }
      
      await set_badge(ipInfo.ip, ipInfo.isProxied);
    }
  } catch (e) {
    console.error("Error updating tab:", e);
  }
}

async function update_current_tab() {
  try {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs && tabs.length > 0) {
      await tab_changed_now_update(tabs[0].id);
    }
  } catch (e) {
    console.error("Error getting current tab:", e);
  }
}

// Function to manually inject content script
async function injectContentScript(tabId) {
  // Check if chrome.scripting is available
  if (!chrome.scripting) {
    console.error("chrome.scripting API is not available. Make sure you have the 'scripting' permission in your manifest.");
    
    // Alternative approach using executeScript on tabs (for older Chrome versions)
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.executeScript(tabId, { file: 'hover-box.js' }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }
  
  // Use chrome.scripting API if available
  try {
    return await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['hover-box.js']
    });
  } catch (e) {
    console.error("Script injection error:", e);
    throw e;
  }
}

// Function to detect if a site is behind Cloudflare or other CDN
function detectCDN(headers) {
  if (!headers || !Array.isArray(headers)) return false;
  
  const cdnHeaders = {
    'cf-ray': 'Cloudflare',
    'x-cdn': 'Generic CDN',
    'x-cdn-provider': 'Generic CDN',
    'x-cache': 'Possible CDN',
    'x-edge-location': 'AWS CloudFront',
    'x-amz-cf-id': 'AWS CloudFront',
    'x-fastly-request-id': 'Fastly',
    'x-served-by': 'Possible CDN',
    'x-cache-hits': 'Possible CDN',
    'x-powered-by': 'Possible CDN',
    'server': 'Possible CDN'
  };
  
  // Check for CDN-specific headers
  for (const header of headers) {
    if (!header || !header.name) continue;
    
    const headerName = header.name.toLowerCase();
    if (cdnHeaders[headerName]) {
      return true;
    }
    
    // Check for Cloudflare in server header
    if (headerName === 'server' && header.value && header.value.toLowerCase().includes('cloudflare')) {
      return true;
    }
  }
  
  return false;
}

// extension button clicked, make sure badge is correct and toggle ip address on page
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await tab_changed_now_update(tab.id);
    
    // Check if the tab is ready to receive messages
    chrome.tabs.sendMessage(tab.id, { ping: true }, async function(response) {
      if (chrome.runtime.lastError) {
        // Content script not ready yet, inject it
        try {
          await injectContentScript(tab.id);
          
          // Now we can send the message after a small delay
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { 'toggle': true })
              .catch(e => console.log("Error after injection:", e));
          }, 100);
        } catch (e) {
          console.error("Script injection failed:", e);
          
          // Try direct DNS lookup for the current tab
          const hostname = parse_url(tab.url);
          if (hostname) {
            const ip = await dnsLookup(hostname);
            if (ip) {
              // Store the IP we found
              const data = {};
              data[hostname] = ip;
              data[hostname + '_proxied'] = true;
              await chrome.storage.local.set(data);
              
              // Update badge
              await set_badge(ip, true);
              
              // Try injection again
              setTimeout(async () => {
                try {
                  await injectContentScript(tab.id);
                  setTimeout(() => {
                    chrome.tabs.sendMessage(tab.id, { 'toggle': true })
                      .catch(e => console.log("Error after second injection:", e));
                  }, 100);
                } catch (e2) {
                  console.error("Second script injection failed:", e2);
                }
              }, 500);
            }
          }
        }
      } else {
        // Content script is ready, send the toggle message
        chrome.tabs.sendMessage(tab.id, { 'toggle': true })
          .catch(e => console.log("Error sending toggle:", e));
      }
    });
  } catch (e) {
    console.error("Error in action click handler:", e);
  }
});

// response to the content script executed for the page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.hasOwnProperty('load') && request.load) {
    (async () => {
      try {
        if (!sender || !sender.tab || !sender.tab.url) {
          sendResponse({error: "No tab URL available"});
          return;
        }
        
        const myURL = parse_url(sender.tab.url);
        let ipInfo = await getUrlIpInfo(sender.tab.url);
        
        // If no IP is found, try DNS lookup
        if (!ipInfo.ip && myURL) {
          const ip = await dnsLookup(myURL);
          if (ip) {
            // Store the IP we found
            const data = {};
            data[myURL] = ip;
            data[myURL + '_proxied'] = true;
            await chrome.storage.local.set(data);
            
            ipInfo = { ip: ip, isProxied: true };
          }
        }
        
        const color = (mnems[ipInfo.ip] && mnems[ipInfo.ip].color) ? mnems[ipInfo.ip].color : 
                      (sips.color && sips.color.defaultColor ? sips.color.defaultColor : undefined);
        
        sendResponse({
          visible: sips.hb,
          still: !!sips.hbStill,
          color: color,
          myURL: myURL,
          myIP: ipInfo.ip,
          isProxied: ipInfo.isProxied
        });
      } catch (e) {
        console.error("Error processing load request:", e);
        sendResponse({error: e.message});
      }
    })();
    return true; // Indicates async response
  }
  
  // Handle content script ready notification
  if (request.contentScriptReady) {
    // You could update UI or perform other actions when content script is ready
    return false; // No async response needed
  }

  // Handle update requests from the options page
  if (request.updateSettings) {
    loadStorageData(); // Reload settings from storage
    return false;
  }
  
  // Handle manual IP lookup request
  if (request.lookupIP && request.hostname) {
    (async () => {
      try {
        const ip = await dnsLookup(request.hostname);
        sendResponse({ip: ip});
      } catch (e) {
        console.error("Error in manual lookup:", e);
        sendResponse({error: e.message});
      }
    })();
    return true;
  }
});

// listeners for the IP address changes
chrome.webRequest.onHeadersReceived.addListener(async (details) => {
  if (details.url) {
    try {
      const hostname = parse_url(details.url);
      if (!hostname) return;
      
      const isProxied = detectCDN(details.responseHeaders || []);
      
      // Store both the IP and whether it's proxied
      const data = {};
      
      if (details.ip) {
        data[hostname] = details.ip;
      } else {
        // If no IP is provided, try DNS lookup
        const ip = await dnsLookup(hostname);
        if (ip) {
          data[hostname] = ip;
        }
      }
      
      data[hostname + '_proxied'] = isProxied;
      
      if (Object.keys(data).length > 1) { // Make sure we have at least IP + proxied flag
        await chrome.storage.local.set(data);
        await update_current_tab();
      }
    } catch (e) {
      console.error("Storage error:", e);
    }
  }
}, {
  urls: ['<all_urls>'], 
  types: ['main_frame']
}, ['responseHeaders']);

chrome.tabs.onUpdated.addListener((tab_id, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    update_current_tab();
  }
});

chrome.tabs.onActivated.addListener((active_info) => {
  update_current_tab();
});

chrome.windows.onFocusChanged.addListener((window_id) => {
  if (window_id !== chrome.windows.WINDOW_ID_NONE) {
    update_current_tab();
  }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.sips) {
      sips = changes.sips.newValue || {};
    }
    if (changes.mnems) {
      mnems = changes.mnems.newValue || {};
    }
  }
});

// Initialize by updating the current tab
update_current_tab();