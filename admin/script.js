const firebaseConfig = {
    apiKey: "AIzaSyAEu01AD_j1VWJaW-y3e2srmtSLBtmrqqs",
    authDomain: "linguabinary.firebaseapp.com",
    projectId: "linguabinary",
    storageBucket: "linguabinary.firebasestorage.app",
    messagingSenderId: "189897041902",
    appId: "1:189897041902:web:bbddff352e4442be1a10ff"
  };

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-analytics.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-storage.js";

firebase.initializeApp(firebaseConfig);
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
//const storage = getStorage(app);
const storage = firebase.storage();

// API base helper: defaults to the new backend; override by setting `window.SERVER_BASE` before scripts load
const API_BASE = (window.SERVER_BASE || 'https://radio-wildflower-backend.onrender.com').replace(/\/$/, '');
function buildUrl(path) {
  if (!path) return path;
  if (!path.startsWith('/')) path = '/' + path;
  return API_BASE ? API_BASE + path : path;
}

function getData(fileName, userCode, func = () => {}) {
  const storageRef = storage.ref(`/Users/${userCode}`);
  storageRef
    .child(fileName)
    .getDownloadURL()
    .then((url) => {
      fetch(url)
        .then((response) => response.text())
        .then((data) => {
          func(data);
          return data;
        });
    })
    .catch((error) => {
      func(undefined);
      return undefined;
    });
}

function setData(fileName, data, func = () => {}) {
  const storageRef = storage.ref(`/Tracks/`);
  storageRef
    .child(fileName)
    .put(data)
    .then((snapshot) => {
      func(snapshot);
      console.log("Uploaded a raw string!");
    });
}

document.body.onload = () => {
  populateRadioStationList();
  setInterval(populateRadioStationList, 3000);
};

// Keep per-station UI/editing state so periodic refreshes don't clobber in-progress edits
const stationState = {}; // stationName -> { currentList: string[], selected?: string }

function populateRadioStationList() {
  fetch(buildUrl('/getAllTrackInformation'))
    .then((response) => response.json())
    .then((trackObjects) => {
      const stationListContainer = document.getElementById("radioStationList");

      for (const stationName in trackObjects) {
        if (!trackObjects.hasOwnProperty(stationName)) continue;
        const trackObject = trackObjects[stationName];
        // If a station card already exists, update only the dynamic pieces so editing state isn't lost
        const existing = stationListContainer.querySelector(`[data-station="${stationName}"]`);
        if (existing) {
          updateStationDiv(existing, trackObject);
        } else {
          const stationDiv = createStationDiv(stationName, trackObject);
          stationListContainer.appendChild(stationDiv);
        }
      }
      // Remove any station cards that are no longer present on server
      const existingCards = Array.from(stationListContainer.querySelectorAll('[data-station]'));
      existingCards.forEach(card => {
        const name = card.dataset.station;
        if (!trackObjects[name]) card.remove();
      });
    })
    .catch((error) => {
      console.error("Error fetching or parsing track information:", error);
    });
}

// Update dynamic fields on an existing station card without touching editing controls
function updateStationDiv(stationDiv, trackObject) {
  try {
    stationDiv.dataset.station = stationDiv.dataset.station || '';
    const progressPercent = Math.round((trackObject.track.position / trackObject.track.duration) * 100);
    const segmentProgress = Math.round((trackObject.currentSegment.position / trackObject.currentSegment.duration) * 100);

    const titleEl = stationDiv.querySelector('.track-title');
    const authorEl = stationDiv.querySelector('.track-author');
    if (titleEl) titleEl.textContent = trackObject.track.title || titleEl.textContent;
    if (authorEl) authorEl.textContent = trackObject.track.author || authorEl.textContent;

    const fill = stationDiv.querySelector('.progress-fill');
    if (fill) fill.style.width = `${progressPercent}%`;
    const ptext = stationDiv.querySelector('.progress-text');
    if (ptext) ptext.textContent = `${progressPercent}% complete`;
    const seg = stationDiv.querySelector('.segment-info');
    if (seg) seg.textContent = `Segment ${trackObject.track.numCurrentSegment} of ${trackObject.track.numSegments} (${segmentProgress}% complete)`;

    // Update next-three display based on preserved stationState (do not overwrite currentList)
    const name = stationDiv.dataset.station;
    if (name) {
      if (!stationState[name]) {
        // Initialize state with server list if no local edits exist
        const extracted = (function extractTrackList(obj) {
          if (!obj) return [];
          const candidates = [obj.trackList, obj.tracklist, obj.queue, obj.playlist, obj.tracks, obj.trackArray, obj.trackNames];
          for (const c of candidates) {
            if (!c) continue;
            if (Array.isArray(c)) return c.map(i => typeof i === 'string' ? i : (i && i.title) ? i.title : (i && i.track && i.track.title) ? i.track.title : String(i));
            if (typeof c === 'object') return Object.values(c).map(i => i && i.title ? i.title : (i && i.track && i.track.title ? i.track.title : String(i)));
            if (typeof c === 'string') return [c];
          }
          if (obj.track && obj.track.title) return [obj.track.title];
          return [];
        })(trackObject);
        stationState[name] = { currentList: extracted };
      }

      const state = stationState[name];
      // Update remaining count element (next items are badges inside the list)
      const remEl = stationDiv.querySelector('.tracklist-remaining');
      if (remEl && !(stationState[name] && stationState[name].isDragging)) {
        const remaining = Math.max(0, (state.currentList || []).length - 3);
        remEl.innerHTML = remaining > 0 ? `<em>and ${remaining} more</em>` : '';
      }
    }
  } catch (e) {
    console.error('Error updating station div', e);
  }
}

function createStationDiv(stationName, trackObject) {
  console.log(trackObject);
  const stationDiv = document.createElement("div");
  stationDiv.classList.add("trackInfo");
  stationDiv.dataset.station = stationName;

  const progressPercent = Math.round((trackObject.track.position / trackObject.track.duration) * 100);
  const segmentProgress = Math.round((trackObject.currentSegment.position / trackObject.currentSegment.duration) * 100);

  stationDiv.innerHTML = `
    <div class="station-header">
      <span class="material-symbols-rounded">radio</span>
      <span class="station-name">${stationName}</span>
    </div>
    <div class="track-details">
      <div class="track-info-row">
        <span class="track-title">${trackObject.track.title}</span>
        <span class="track-author">${trackObject.track.author}</span>
      </div>
      <div class="progress-info">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <div class="progress-text">${progressPercent}% complete</div>
      </div>
      <div class="segment-info">
        Segment ${trackObject.track.numCurrentSegment} of ${trackObject.track.numSegments} 
        (${segmentProgress}% complete)
      </div>
    </div>
  `;

  // Create tracklist container and editing UI
  const trackListContainer = document.createElement('div');
  trackListContainer.className = 'station-tracklist-container';

  // Defensive extraction of a station track list from several possible shapes
  const extractTrackList = (obj) => {
    if (!obj) return [];
    const candidates = [
      obj.trackList,
      obj.tracklist,
      obj.queue,
      obj.playlist,
      obj.tracks,
      obj.trackArray,
      obj.trackNames,
    ];

    for (const c of candidates) {
      if (!c) continue;
      if (Array.isArray(c)) return c.map(item => {
        if (typeof item === 'string') return item;
        if (item && item.title) return item.title;
        if (item && item.track && item.track.title) return item.track.title;
        return String(item);
      });
      if (typeof c === 'object') {
        // object might be map of id->track
        return Object.values(c).map(item => item && item.title ? item.title : (item && item.track && item.track.title ? item.track.title : String(item)));
      }
      if (typeof c === 'string') return [c];
    }

    // Fallback to the current track if available
    if (obj.track && obj.track.title) return [obj.track.title];
    return [];
  };

  // Initialize or reuse preserved station list state
  if (!stationState[stationName]) {
    stationState[stationName] = { currentList: extractTrackList(trackObject), selected: '' };
  }
  // use stationState[stationName].currentList dynamically so updates persist across refreshes
  // (do not create a separate local copy that could become stale)

  // Tracklist title + list
  const listTitle = document.createElement('div');
  listTitle.className = 'tracklist-title';
  listTitle.textContent = 'Station Tracklist';

  const ul = document.createElement('ul');
  ul.className = 'station-tracklist';
  ul.id = `tracklist-${stationName}`;

  const renderList = (arr) => {
    ul.innerHTML = '';
    arr.forEach((t, idx) => {
      const li = document.createElement('li');
      li.className = 'tracklist-item';
      li.dataset.index = idx;
      const badge = idx < 3 ? `<span class="next-badge">Next</span>` : '';
      li.setAttribute('draggable', 'true');
      li.innerHTML = `
        ${badge}
        <span class="track-name">${t}</span>
        <button class="delete-track" data-index="${idx}" title="Delete track">🗑️</button>
      `;
      if (idx < 3) li.classList.add('next-item');
      ul.appendChild(li);
    });
    // update remaining count element
    const parent = ul.parentElement;
    if (parent) {
      const remEl = parent.querySelector('.tracklist-remaining');
      if (remEl) {
        const remaining = Math.max(0, (arr || []).length - 3);
        remEl.innerHTML = remaining > 0 ? `<em>and ${remaining} more</em>` : '';
      }
    }
  };

  renderList(stationState[stationName].currentList || []);

  // Add controls: select available server tracks and add button
  const controls = document.createElement('div');
  controls.className = 'tracklist-controls';

  const select = document.createElement('select');
  select.className = 'add-track-select';
  select.id = `add-select-${stationName}`;
  const addBtn = document.createElement('button');
  addBtn.className = 'add-track-button';
  addBtn.textContent = 'Add Track';

  controls.appendChild(select);
  controls.appendChild(addBtn);

  trackListContainer.appendChild(listTitle);
  trackListContainer.appendChild(ul);
  trackListContainer.appendChild(controls);

  // Remaining count element (next-3 are shown inline in list as badges)
  const remainingEl = document.createElement('div');
  remainingEl.className = 'tracklist-remaining';
  const stateList = (stationState[stationName] && stationState[stationName].currentList) || [];
  const remaining = Math.max(0, (stateList || []).length - 3);
  remainingEl.innerHTML = remaining > 0 ? `<em>and ${remaining} more</em>` : '';
  trackListContainer.appendChild(remainingEl);

  stationDiv.appendChild(trackListContainer);

  // Populate the select with tracks from server (cached)
  fetchServerTrackNames().then((names) => {
    // clear and add default
    select.innerHTML = '';
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- select track --';
    select.appendChild(emptyOption);
    names.forEach(n => {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      select.appendChild(o);
    });
    // restore previous selection if present
    const prev = stationState[stationName] && stationState[stationName].selected;
    if (prev) select.value = prev;
  }).catch(err => {
    // leave select empty and show placeholder option
    select.innerHTML = '';
    const o = document.createElement('option');
    o.value = '';
    o.textContent = 'Could not load server tracks';
    select.appendChild(o);
  });

  // Handlers: delete track
  ul.addEventListener('click', async (ev) => {
    const del = ev.target.closest('.delete-track');
    if (!del) return;
    const idx = Number(del.dataset.index);
    if (Number.isNaN(idx)) return;
  const updated = (stationState[stationName].currentList || []).slice();
  const removed = updated.splice(idx, 1);
    // update UI immediately
    renderList(updated);
    // send update to server
    try {
        const resp = await updateTrackListOnServer(stationName, updated);
        if (resp && resp.success) {
          showSuccess(`Removed track: ${removed[0]}`);
          showToast(resp.data && resp.data.message ? resp.data.message : 'Radio track list updated', 3000, 'success');
        // update our local copy
        stationState[stationName].currentList = updated.slice();
        // update currentList local reference
        // (note: currentList is a const reference to stationState[..].currentList earlier; updating the object above keeps consistency)
        // Refresh entire station list from server so periodic updates won't overwrite state
        populateRadioStationList();
      } else {
        showError('Failed to update server track list.');
        showToast('Failed to update server track list', 3000, 'error');
        // revert UI
        renderList(stationState[stationName].currentList || []);
      }
    } catch (err) {
      showError('Error updating server track list.');
      showToast('Error updating server track list', 3000, 'error');
      renderList(stationState[stationName].currentList || []);
    }
  });

  // Drag & drop reordering
  let dragOverIndex = null;
  ul.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const idx = Number(li.dataset.index);
    if (Number.isNaN(idx)) return;
    // mark dragging state to avoid overwrites from refresh
    stationState[stationName].isDragging = true;
    stationState[stationName].draggingIndex = idx;
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch (err) {}
    e.dataTransfer.effectAllowed = 'move';
    li.classList.add('dragging');
  });

  ul.addEventListener('dragover', (e) => {
    e.preventDefault();
    const over = e.target.closest('li');
    if (!over) return;
    const overIdx = Number(over.dataset.index);
    if (Number.isNaN(overIdx)) return;
    if (dragOverIndex !== overIdx) {
      // highlight
      ul.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
      over.classList.add('drag-over');
      dragOverIndex = overIdx;
    }
    e.dataTransfer.dropEffect = 'move';
  });

  ul.addEventListener('drop', async (e) => {
    e.preventDefault();
    const src = Number(e.dataTransfer.getData('text/plain'));
    const overLi = e.target.closest('li');
    const dest = overLi ? Number(overLi.dataset.index) : null;
    // clear highlights
    ul.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
    ul.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging'));
    dragOverIndex = null;
    // release dragging flag after handling
    try { stationState[stationName].isDragging = false; } catch (e) {}
    if (Number.isNaN(src)) return;
    const current = (stationState[stationName] && stationState[stationName].currentList) || [];
    const length = current.length;
    const toIndex = (dest === null || Number.isNaN(dest)) ? length - 1 : dest;
    if (src === toIndex) return;
    const updated = current.slice();
    const [moved] = updated.splice(src, 1);
    updated.splice(toIndex, 0, moved);
    // optimistic UI
    renderList(updated);
    // persist
    try {
      const resp = await updateTrackListOnServer(stationName, updated);
      if (resp && resp.success) {
        stationState[stationName].currentList = updated.slice();
        showSuccess('Track order updated');
        showToast(resp.data && resp.data.message ? resp.data.message : 'Track order updated', 3000, 'success');
      } else {
        showError('Failed to update track order');
        showToast('Failed to update track order', 3000, 'error');
        renderList(stationState[stationName].currentList || []);
      }
    } catch (err) {
      showError('Error updating track order');
      showToast('Error updating track order', 3000, 'error');
      renderList(stationState[stationName].currentList || []);
    }
  });

  ul.addEventListener('dragend', (e) => {
    ul.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
    ul.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging'));
    stationState[stationName].isDragging = false;
    stationState[stationName].draggingIndex = undefined;
  });

  // Handler: add track from select
  addBtn.addEventListener('click', async () => {
    const chosen = select.value;
    if (!chosen) {
      showError('Please select a track to add.');
      return;
    }
    // prevent duplicates in list
    const existsList = (stationState[stationName] && stationState[stationName].currentList) || [];
    if (existsList.includes(chosen)) {
      showError('Track already in the station list.');
      return;
    }
    const updated = (stationState[stationName].currentList || []).concat([chosen]);
    renderList(updated);
    try {
        const resp = await updateTrackListOnServer(stationName, updated);
        if (resp && resp.success) {
          showSuccess(`Added track: ${chosen}`);
          showToast(resp.data && resp.data.message ? resp.data.message : 'Radio track list updated', 3000, 'success');
          stationState[stationName].currentList = updated.slice();
          // refresh so server-authoritative shapes are rendered
          populateRadioStationList();
        } else {
          showError('Failed to update server track list.');
          showToast('Failed to update server track list', 3000, 'error');
          renderList(stationState[stationName].currentList || []);
        }
    } catch (err) {
        showError('Error updating server track list.');
        showToast('Error updating server track list', 3000, 'error');
        renderList(stationState[stationName].currentList || []);
    }
  });

  return stationDiv;
}

// Cache for server track names
let _serverTrackNamesCache = null;
async function fetchServerTrackNames() {
  if (_serverTrackNamesCache) return _serverTrackNamesCache;
  const resp = await fetch(buildUrl('/getAllTracks'));
  if (!resp.ok) throw new Error(`Failed to load tracks: ${resp.status}`);
  const data = await resp.json();
  // normalize to array of strings
  let names = [];
  if (Array.isArray(data)) {
    names = data.map(t => typeof t === 'string' ? t : (t.title || (t.track && t.track.title) || ''))
      .filter(Boolean);
  } else if (data && typeof data === 'object') {
    names = Object.values(data).map(t => typeof t === 'string' ? t : (t.title || (t.track && t.track.title) || '')).filter(Boolean);
  }
  _serverTrackNamesCache = names;
  return names;
}

// Send updated track list for station to server
async function updateTrackListOnServer(stationName, trackList) {
  // Ensure we always send an array for trackList and include authPassword
  const body = { stationName, trackList: Array.isArray(trackList) ? trackList : [trackList], authPassword: 'password' };
  const resp = await fetch(buildUrl('/admin/editTrackList'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Return status and attempt to parse JSON body when available
  if (!resp.ok) {
    let text = '';
    try { text = await resp.text(); } catch (e) {}
    return { success: false, status: resp.status, body: text };
  }
  try {
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.indexOf('application/json') !== -1) {
      const data = await resp.json();
      return { success: true, data };
    }
    const txt = await resp.text();
    return { success: true, data: { message: txt } };
  } catch (e) {
    return { success: true };
  }
}

function populateCurrentTrack(stationName) {
  fetch(buildUrl('/getAllTrackInformation'))
    .then((response) => response.json())
    .then((trackObjects) => {
      const trackObject = trackObjects[stationName];
      if (trackObject) {
        document.getElementsByClassName("radioStatus")[0].textContent = `${
          Math.round(trackObject.track.position / trackObject.track.duration) *
          100
        }% though ${trackObject.track.title} by ${
          trackObject.track.author
        } | Currently ${trackObject.currentSegment.position}s (${
          Math.round(
            trackObject.currentSegment.position /
              trackObject.currentSegment.duration
          ) * 100
        }%) into segment ${trackObject.track.numCurrentSegment} (of ${
          trackObject.track.numSegments
        })`;
      } else {
        console.error("Station not found in track objects.");
      }
    })
    .catch((error) => {
      console.error("Error fetching or parsing track information:", error);
    });
}

function tuneIn(stationName) {
  populateCurrentTrack(stationName);
  // Add any other tune-in logic here (e.g., audio playback)
}

// Validation functions
function validateInput(input) {
  return input.value.trim() !== '';
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.value.trim());
}

function validateFile(fileInput) {
  if (!fileInput.files || fileInput.files.length === 0) {
    return false;
  }
  const file = fileInput.files[0];
  return file.type === 'audio/mpeg' || file.type === 'audio/mp3';
}

function showError(message) {
  // Remove existing error messages
  const existingError = document.querySelector('.error-message');
  if (existingError) {
    existingError.remove();
  }
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.style.cssText = `
    background: #ffebee;
    color: #c62828;
    padding: 10px;
    border-radius: 5px;
    margin: 10px 0;
    border: 1px solid #ffcdd2;
  `;
  errorDiv.textContent = message;
  
  const form = document.getElementById('addNewTrackForm');
  form.insertBefore(errorDiv, form.firstChild);
}

function showSuccess(message) {
  const successDiv = document.createElement('div');
  successDiv.className = 'success-message';
  successDiv.style.cssText = `
    background: #e8f5e8;
    color: #2e7d32;
    padding: 10px;
    border-radius: 5px;
    margin: 10px 0;
    border: 1px solid #c8e6c9;
  `;
  successDiv.textContent = message;
  
  const form = document.getElementById('addNewTrackForm');
  form.insertBefore(successDiv, form.firstChild);
}

// Small toast helper that fades out. type: 'success'|'error'|'info'
function showToast(message, duration = 3000, type = 'info') {
  const existing = document.getElementById('admin-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'admin-toast';
  toast.textContent = message;
  const bg = type === 'success' ? 'rgba(46,125,50,0.95)' : type === 'error' ? 'rgba(198,40,40,0.95)' : 'rgba(0,0,0,0.85)';
  toast.style.cssText = `
    position: fixed;
    right: 20px;
    bottom: 20px;
    background: ${bg};
    color: white;
    padding: 10px 14px;
    border-radius: 6px;
    z-index: 9999;
    box-shadow: 0 6px 18px rgba(0,0,0,0.3);
    opacity: 0;
    transition: opacity 200ms ease;
  `;
  document.body.appendChild(toast);
  // trigger fade in
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// Basic input cleaning: normalize, collapse multiple whitespace to single space, trim ends
function cleanString(input) {
  if (input === undefined || input === null) return '';
  try {
    // Normalize unicode and collapse all whitespace sequences to a single space
    return input
      .toString()
      .normalize()
      .replace(/\s+/g, ' ')
      .trim();
  } catch (e) {
    return input.toString().replace(/\s+/g, ' ').trim();
  }
}

// Check server for duplicate tracks by title+author (case-insensitive)
async function isDuplicateTrack(title, author) {
  try {
    const resp = await fetch(buildUrl('/getAllTracks'));
    if (!resp.ok) {
      return { error: true, message: `Server returned ${resp.status}` };
    }
    const data = await resp.json();

    // Normalize data to an array of track-like objects
    let tracks = [];
    if (Array.isArray(data)) tracks = data;
    else if (data && typeof data === 'object') tracks = Object.values(data);

    const norm = (s) => (s || '').toString().toLowerCase().trim();
    const tNorm = norm(title);
    const aNorm = norm(author);

    for (const tr of tracks) {
      // Support different shapes: { title, author } or { track: { title, author } }
      const trTitle = norm(tr.title || (tr.track && tr.track.title) || tr.name || '');
      const trAuthor = norm(tr.author || (tr.track && tr.track.author) || tr.artist || '');
      if (trTitle === tNorm && trAuthor === aNorm) {
        return { duplicate: true, track: tr };
      }
    }

    return { duplicate: false };
  } catch (err) {
    return { error: true, message: err && err.message ? err.message : String(err) };
  }
}

document.getElementById("submit").onclick = async (e) => {
  e.preventDefault();
  
  // Remove existing messages
  const existingMessages = document.querySelectorAll('.error-message, .success-message');
  existingMessages.forEach(msg => msg.remove());
  
  // Get form elements
  const titleInput = document.getElementById("trackTitleInput");
  const authorInput = document.getElementById("trackAuthorInput");
  const fileInput = document.getElementById("trackFileInput");
  
  // Validate inputs
  if (!validateInput(titleInput)) {
    showError("Please enter a track title.");
    return;
  }
  
  if (!validateInput(authorInput)) {
    showError("Please enter an artist/author name.");
    return;
  }
  
  if (!validateFile(fileInput)) {
    showError("Please select a valid MP3 file.");
    return;
  }
  
  // Clean inputs (trim ends and collapse internal whitespace)
  const title = cleanString(titleInput.value);
  const author = cleanString(authorInput.value);

  // Check for duplicates on server
  try {
    // Optionally disable submit while checking
    const submitBtn = document.getElementById('submit');
    if (submitBtn) submitBtn.disabled = true;

    const dupResult = await isDuplicateTrack(title, author);
    if (dupResult.error) {
      if (submitBtn) submitBtn.disabled = false;
      showError(`Could not verify existing tracks: ${dupResult.message}`);
      return;
    }
    if (dupResult.duplicate) {
      if (submitBtn) submitBtn.disabled = false;
      showError(`Track already exists on server: "${title}" by "${author}".`);
      return;
    }
  } catch (err) {
    const submitBtn = document.getElementById('submit');
    if (submitBtn) submitBtn.disabled = false;
    showError('Error checking for duplicates. Please try again.');
    return;
  }
  
  setData(
    "FreshlyUploadedMP3File",
    fileInput.files[0],
    (data) => {
      if (!data) return;

      data.ref
        .getDownloadURL()
        .then((downloadURL) => {
          document.getElementById("trackDurationExtractor").src = downloadURL;
          document
            .getElementById("trackDurationExtractor")
            .play()
            .then(() => {
              var dataToSendToServer = {
                downloadURL: downloadURL,
                title: title,
                author: author,
                duration: Math.trunc(
                  document.getElementById("trackDurationExtractor").duration
                ),
                authPassword: "password",
              };
              document.getElementById("trackDurationExtractor").pause();

              fetch(buildUrl('/addTrack'), {
                method: "POST",
                body: JSON.stringify(dataToSendToServer),
                headers: {
                  "Content-type": "application/json; charset=UTF-8",
                },
              })
                .then((response) => response.json())
                .then((responseData) => {
                  console.log("Server Response:", responseData);
                  showSuccess("Track added successfully!");
                  // Clear form
                  titleInput.value = '';
                  authorInput.value = '';
                  fileInput.value = '';
                  const submitBtn = document.getElementById('submit');
                  if (submitBtn) submitBtn.disabled = false;
                })
                .catch((error) => {
                  console.error("Error sending data to server:", error);
                  showError("Failed to add track. Please try again.");
                  const submitBtn = document.getElementById('submit');
                  if (submitBtn) submitBtn.disabled = false;
                });
            })
            .catch((error) => {
              console.error("Error playing or getting duration:", error);
              showError("Error processing audio file. Please check the file format.");
            });
        })
        .catch((error) => {
          console.error("Error getting download URL:", error);
          showError("Error uploading file. Please try again.");
        });
    }
  );
};
