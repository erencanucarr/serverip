var hov = document.createElement('div'), hovConfig = {still: true}, // Default to still (not moving)
	hbId = 'server_ip_sips_hover_box_id';

function add_hover_box() {
	var hs = hov.style;
	hs.position = 'fixed';
	hs.top = '10px';
	hs.right = '10px';
	hs.padding = '4px 6px';
	hs.border = '1px solid black';
	hs.backgroundColor = '#ff9b33';
	hs.borderRadius = '12px';
	hs.fontSize = '13px';
	hs.fontFamily = 'arial';
	hs.fontWeight = 'bold';
	hs.lineHeight = '14px';
	hs.color = '#fff';
	hs.zIndex = 2147483647; /* Maximum z-index to ensure visibility */
	hov.id = hbId;
	hov.dataset.sipState = 'right';

	// Only add the mouseover event listener if the box should move
	if (!hovConfig.still) {
		hov.addEventListener('mouseover', mover);
	}
}

function mover(e) {
	var el = this,
		sipRight = el.dataset.sipState === 'right';
	
	// Double-check the still setting before moving
	if (hovConfig.still) {
		return; // Don't move if still is true
	}
	
	e.preventDefault();
	el.style.left = sipRight ? '10px' : 'inherit';
	el.style.right = sipRight ? 'inherit' : '10px';
	el.dataset.sipState = sipRight ? 'left' : 'right';
}

function process_response(ipObj) {
	var el = document.getElementById(hbId);
	if (!ipObj) return;
	
	// Update the hovConfig with the new settings
	if (ipObj.hasOwnProperty('still')) {
		hovConfig.still = !!ipObj.still;
		
		// Remove existing event listener if we're switching to "still" mode
		if (hovConfig.still && el) {
			el.removeEventListener('mouseover', mover);
		} 
		// Add event listener if we're switching to "movable" mode
		else if (!hovConfig.still && el) {
			el.addEventListener('mouseover', mover);
		}
	}
	
	hovConfig = {...hovConfig, ...ipObj};
	
	// Display text based on whether it's proxied or not
	let displayText = '';
	let bgColor = ipObj.color || '#ff9b33';
	
	if (!ipObj.myIP) {
		displayText = 'IP Unknown';
		bgColor = '#808080'; // Gray for unknown
	} else {
		displayText = ipObj.myIP;
		if (ipObj.isProxied) {
			//displayText += ' (CDN)';
			// Use gray color for CDN/proxied connections if no specific color
			if (!ipObj.color) {
				bgColor = '#808080';
			}
		}
	}
	
	// Update the hover box
	hov.style.backgroundColor = bgColor;
	hov.innerText = displayText;
	
	// Show or hide the hover box
	if (ipObj.visible && (!el)) {
		document.body.appendChild(hov);
	} else if ((!ipObj.visible) && el) {
		document.body.removeChild(el);
	}
}

// Initialize the hover box
add_hover_box();

// Function to manually request IP lookup
function requestManualLookup() {
	const hostname = window.location.hostname;
	if (hostname) {
		chrome.runtime.sendMessage({lookupIP: true, hostname: hostname}, function(response) {
			if (response && response.ip) {
				// Update the hover box with the new IP
				process_response({
					...hovConfig,
					myIP: response.ip,
					isProxied: true
				});
			}
		});
	}
}

// Send message to background.js to load this tab with relevant information
chrome.runtime.sendMessage({'load': true}, function(response) {
    if (response) {
        process_response(response);
    } else {
        // If no response, try manual lookup
        requestManualLookup();
    }
});

// Receive message from the background.js
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    // Add a ping handler to check if content script is loaded
    if (request.ping) {
        sendResponse({pong: true});
        return true;
    }
    
    if (request.toggle) {
        hovConfig.visible = !hovConfig.visible;
        process_response(hovConfig);
    }
    
    // Handle settings update
    if (request.settings) {
        process_response(request.settings);
    }
    
    // Always return true if you're planning to respond asynchronously
    return true;
});

// Let the background script know that the content script is ready
chrome.runtime.sendMessage({contentScriptReady: true});

// Add a double-click event to the hover box to trigger manual lookup
hov.addEventListener('dblclick', function(e) {
    e.preventDefault();
    requestManualLookup();
});