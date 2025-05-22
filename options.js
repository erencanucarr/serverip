/* Despite the mnemonic being more important to the user, the ip is more important to us since it's the index */
/* mnems structure:
 * mnems = {
 *    10.2.1.88 : {
 *      "mnem" : "dev",
 *      "color": "#00ff00"
 *    },
 *    127.0.0.1 : {
 *      "mnem" : "lcl",
 *      "color": "#0000ff"
 *    }
 * }
 * sips structure = {
 *    'configName0' : value,
 *    'configName1' : value,
 *    'configName2' : 'etc'
 * }
 */
(function (win, doc) {
	'use strict';
	var mnems = {}, i = 0, ipIndex, more_boxes, mb = 0, mnemBox, sortArr = [],
	  sips = {},
	  valid_ip = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
	  wrap = doc.getElementById('wrap'),
	  add_btn = doc.getElementById('add_mnem'),
	  defaultColor = doc.getElementById('default_color'),
	  defaultColorOut = doc.getElementById('default_color_out'),
	  hover_box = doc.getElementById('hb'),
	  hb_still = doc.getElementById('hb_still'),
	  del_ls_btn = doc.getElementById('del_ls');
  
	// Load data from Chrome storage
	chrome.storage.local.get(['mnems', 'sips'], function(result) {
	  mnems = result.mnems || {};
	  sips = result.sips || {};
	  initializeUI();
	});
  
	mnemBox = '<span class="mnem-box">';
	mnemBox += '<input placeholder="mnemonic" class="sip-input mnem-input" type="text" maxlength="3" data-prev_val="##mnem##" value="##mnem##" />';
	mnemBox+= '</span>';
	mnemBox+= '<span class="mnem-box">';
	mnemBox += '<input placeholder="ip address" class="sip-input ip-index-input" type="text" maxlength="15" data-prev_val="##ip##" value="##ip##" />';
	mnemBox+= '</span>';
	mnemBox+= '<span class="mnem-box last">';
	mnemBox += '<input placeholder="color" class="sip-input color-input" type="color" maxlength="20" data-prev_val="##color##" value="##color##" />';
	mnemBox+= '</span>';
	mnemBox+= '<button class="remove">&nbsp;&mdash;&nbsp;</button>';
	mnemBox+= '<span class="r-message"></span>';
  
	function update_obj(name, obj) {
	  try {
		chrome.storage.local.set({ [name]: obj });
	  } catch (e) { 
		console.error("Storage error:", e);
	  }
	}
  
	function update_mnems() {
	  update_obj('mnems', mnems);
	}
  
	function updateSips() {
	  update_obj('sips', sips);
	  // Notify background script that settings have been updated
	  chrome.runtime.sendMessage({ updateSettings: true });
	}
  
	// Function to update all tabs when settings change
	function updateAllTabs(settings) {
	  chrome.tabs.query({}, function(tabs) {
		for (let i = 0; i < tabs.length; i++) {
		  try {
			chrome.tabs.sendMessage(tabs[i].id, {
			  settings: settings
			}).catch(function(error) {
			  // Ignore errors for tabs that don't have the content script
			  console.log("Could not update tab " + tabs[i].id);
			});
		  } catch (e) {
			// Ignore errors for tabs that can't receive messages
			console.log("Error sending to tab " + tabs[i].id);
		  }
		}
	  });
	}
  
	function isValidSet(ip, mnem, color) {
	  return ((!!ip) && ip.match(valid_ip) && ((color && color.length && (color.length > 0)) || (mnem && mnem.length && (mnem.length > 0))));
	}
  
	function addMnem(ip, mnem, color) {
	  if (!mnems[ip]) {
		mnems[ip] = {};
	  }
	  mnems[ip].mnem = mnem;
	  mnems[ip].color = (!!color) ? color : '';
	  update_mnems();
	}
  
	function deleteMnem(ip) {
	  if (delete mnems[ip]) {
		update_mnems();
	  }
	}
  
	function show_message(box, message) {
	  box.getElementsByClassName('r-message')[0].innerText = message;
	}
  
	function clear_message(e) {
	  /*jshint validthis:true */
	  show_message(this.parentNode.parentNode, '');
	}
  
	function change_mnem() {
	  /*jshint validthis:true */
	  var my_gparent = this.parentNode.parentNode,
		my_ip_input = my_gparent.getElementsByClassName('ip-index-input')[0],
		my_mnem_input = my_gparent.getElementsByClassName('mnem-input')[0],
		myColorInput = my_gparent.getElementsByClassName('color-input')[0];
	  // only change the value if they have entered valid values
	  if (isValidSet(my_ip_input.value, my_mnem_input.value, myColorInput.value) && 
		  ((my_ip_input.value !== my_ip_input.dataset.prev_val) || 
		   (my_mnem_input.value !== my_mnem_input.dataset.prev_val) || 
		   (myColorInput.value !== myColorInput.dataset.prev_val))) {
		
		show_message(my_gparent, '');
		if (my_ip_input.dataset.prev_val) {
		  deleteMnem(my_ip_input.dataset.prev_val);
		}
		addMnem(my_ip_input.value, my_mnem_input.value, myColorInput.value);
		my_ip_input.dataset.prev_val = my_ip_input.value;
		my_mnem_input.dataset.prev_val = my_mnem_input.value;
		myColorInput.dataset.prev_val = myColorInput.value;
		show_message(my_gparent, 'saved (' + my_mnem_input.value + ' : ' + my_ip_input.value + ' : ' + myColorInput.value + ')');
	  }
	}
  
	function removeMnem() {
	  /*jshint validthis:true */
	  var my_parent = this.parentNode,
		ip_to_remove = my_parent.getElementsByClassName('ip-index-input')[0].value;
	  // if ip_to_remove exists then remove it from the storage
	  deleteMnem(ip_to_remove);
	  // remove from view (events first)
	  my_parent.parentNode.removeChild(my_parent);
	}
  
	function make_mnem_box(ip, mnem, color) {
	  var mnem_box_wrap = doc.createElement('span');
	  mnem_box_wrap.innerHTML = mnemBox.replace(/##ip##/gi, ip || '').replace(/##mnem##/gi, mnem || '').replace(/##color##/gi, color || '#ff0000');
	  mnem_box_wrap.className = 'single-wrap';
	  wrap.appendChild(mnem_box_wrap);
	  return mnem_box_wrap;
	}
  
	async function get_ip_number_in_storage() {
	  try {
		const allItems = await new Promise(resolve => {
		  chrome.storage.local.get(null, function(items) {
			resolve(items || {});
		  });
		});
		
		// Count keys that are not 'mnems' or 'sips'
		return Object.keys(allItems).filter(key => key !== 'mnems' && key !== 'sips').length;
	  } catch (e) {
		console.error("Error counting storage items:", e);
		return 0;
	  }
	}
  
	// sort the mnemonics by mnemonic
	function mnemSorter(a, b) {
	  if (a.m < b.m) {
		return -1;
	  } else if (a.m > b.m) {
		return 1;
	  } else {
		if (a.ip < b.ip) {
		  return 1;
		} else {
		  return -1;
		}
	  }
	}
  
	function initializeUI() {
	  // Clear existing boxes
	  wrap.innerHTML = '';
	  sortArr = [];
	  
	  for (ipIndex in mnems) {
		if (mnems.hasOwnProperty(ipIndex)) {
		  sortArr.push({'m': mnems[ipIndex].mnem, 'ip': ipIndex});
		}
	  }
	  sortArr.sort(mnemSorter);
	  
	  // add mnemonic editor boxes to the page
	  for (i = 0; i < sortArr.length; i += 1) {
		ipIndex = sortArr[i].ip;
		make_mnem_box(ipIndex, mnems[ipIndex].mnem, mnems[ipIndex].color);
	  }
	  
	  // add at least one and at most 4 empty boxes
	  more_boxes = (sortArr.length >= 4 ? 1 : 4 - sortArr.length);
	  for (mb = 0; mb < more_boxes; mb += 1) {
		make_mnem_box('', '', '');
	  }
  
	  // set up default color box
	  if (!sips.color) {
		sips.color = {};
	  }
	  if (!sips.color.defaultColor) {
		sips.color.defaultColor = '#ff9b33';
		updateSips();
	  }
	  defaultColor.value = sips.color.defaultColor;
	  defaultColorOut.innerHTML = sips.color.defaultColor;
  
	  // set up checkbox to save value of hover_box
	  hover_box.checked = !!(sips && sips.hb);
  
	  // set up checkbox to save value of hb_still, whether hb box moves on mouseover
	  if (sips && (undefined === sips.hbStill)) {
		sips.hbStill = true; // default to true
		updateSips();
	  }
	  hb_still.checked = (sips && sips.hbStill);
  
	  // Update delete button text
	  get_ip_number_in_storage().then(count => {
		del_ls_btn.textContent = 'Delete ' + count + ' items';
	  });
	}
  
	// listen for all events that occur within the wrap of mnemonic rows (click for remore, keyup for input boxes)
	function inputListener(e) {
	  if (e.target.classList.contains('sip-input')) {
		e.preventDefault();
		change_mnem.call(e.target);
	  }
	}
	
	wrap.addEventListener('click', function(e) {
	  if (e.target.classList.contains('remove')) {
		e.preventDefault();
		removeMnem.call(e.target);
	  }
	});
	
	wrap.addEventListener('keyup', inputListener);
	wrap.addEventListener('change', inputListener); // to handle the color changer
  
	// set up button to allow user to add more mnem & ip combo boxes
	add_btn.addEventListener('click', function(e) {
	  make_mnem_box('', '', '');
	});
  
	defaultColor.addEventListener('change', function(e) {
	  sips.color = sips.color || {};
	  sips.color.defaultColor = this.value;
	  defaultColorOut.innerHTML = this.value;
	  updateSips();
	});
  
	hover_box.addEventListener('click', function(e) {
	  sips.hb = !!this.checked;
	  updateSips();
	  
	  // Update all open tabs with the new setting
	  updateAllTabs({
		visible: sips.hb
	  });
	});
  
	hb_still.addEventListener('click', function(e) {
	  sips.hbStill = !!this.checked;
	  updateSips();
	  
	  // Update all open tabs with the new setting
	  updateAllTabs({
		still: sips.hbStill
	  });
	});
  
	// configure and listen to Delete button to clear storage
	del_ls_btn.addEventListener('click', async function(e) {
	  try {
		const allItems = await new Promise(resolve => {
		  chrome.storage.local.get(null, function(items) {
			resolve(items || {});
		  });
		});
		
		// Delete all keys except 'mnems' and 'sips'
		const keysToRemove = Object.keys(allItems).filter(key => key !== 'mnems' && key !== 'sips');
		
		if (keysToRemove.length > 0) {
		  chrome.storage.local.remove(keysToRemove, function() {
			if (chrome.runtime.lastError) {
			  console.error("Error removing items:", chrome.runtime.lastError);
			} else {
			  // Update button text
			  get_ip_number_in_storage().then(count => {
				del_ls_btn.textContent = 'Delete ' + count + ' items';
			  });
			}
		  });
		}
	  } catch (e) {
		console.error("Error in delete operation:", e);
	  }
	});
  }(window, document));