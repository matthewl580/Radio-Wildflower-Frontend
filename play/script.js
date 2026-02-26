var audioElement = document.getElementById("audio");
var nextAudioElement = new Audio(); // Create a second audio element for preloading
// API base: defaults to the new backend; override by setting `window.SERVER_BASE` before scripts load.
const API_BASE = (window.SERVER_BASE || 'https://radio-wildflower-backend.onrender.com').replace(/\/$/, '');
function buildUrl(path) {
    if (!path) return path;
    if (!path.startsWith('/')) path = '/' + path;
    return API_BASE ? API_BASE + path : path;
}
// Interval used for server polling was removed since we only fetch when needed

let progressInterval; // Updates local progress bar/time
let preloadedNextSegmentSrc = {}; // Stores the SRC of the *next* segment once preloaded
let currentlyPlayingStation = null; // Track the name of the currently active station
let visualizerInterval; // Interval for visualizer animation
let isPlaying = false; // Track playing state
// Per-page station state (used by UI and for preloads)
let stationState = {};
let segmentCount = 0;

// Get UI elements
const playPauseBtn = document.getElementById("playPauseBtn");
const stopBtn = document.getElementById("stopBtn");
// prev/next controls removed per requirements
const visualizerBars = document.querySelectorAll(".visualizer-bar");
const artistPhoto = document.querySelector('.artist-photo');


// Audio event handlers
audioElement.onplay = function() {
    isPlaying = true;
    updatePlayPauseButton();
    startVisualizer();
    startProgressUpdater();
    // mark UI as playing
    const nowUI = document.getElementById('nowPlayingUI');
    if (nowUI) nowUI.classList.add('is-playing');
};

audioElement.onpause = function() {
    isPlaying = false;
    updatePlayPauseButton();
    stopVisualizer();
    stopProgressUpdater();
    // mark UI as paused
    const nowUI = document.getElementById('nowPlayingUI');
    if (nowUI) nowUI.classList.remove('is-playing');
};

audioElement.onended = function() {
    isPlaying = false;
    updatePlayPauseButton();
    stopVisualizer();
    // remove playing state
    const nowUI = document.getElementById('nowPlayingUI');
    if (nowUI) nowUI.classList.remove('is-playing');
    console.log("Segment ended for current audio element.");
    // increment segment counter
    segmentCount++;
    updateCounterDisplay();
    let currentStationName = document.getElementById("trackName").dataset.station;


    // Check if the next segment was already preloaded
    if (preloadedNextSegmentSrc[currentStationName]) {
        console.log(`Playing preloaded next segment for ${currentStationName}.`);
        audioElement.src = preloadedNextSegmentSrc[currentStationName];
        audioElement.currentTime = 0; // Always start preloaded segment from the beginning
        audioElement.play();
        preloadedNextSegmentSrc[currentStationName] = null; // Clear preloaded SRC as it's now playing


        // Immediately fetch new data to get the *next* next segment's info for preloading
        // and update UI with precise server position.
        fetchAndUpdateStationData(currentStationName);


    } else {
        console.warn(`No preloaded segment found for ${currentStationName}. Fetching new data on-demand.`);
        // If not preloaded (e.g., network issue, or initial state),
        // fetch the data immediately and play the new current segment.
        fetchAndUpdateStationData(currentStationName, true); // Pass true to force immediate play
    }
};

// Control button handlers
playPauseBtn.addEventListener('click', function() {
    if (currentlyPlayingStation) {
        if (isPlaying) {
            audioElement.pause();
        } else {
            audioElement.play();
        }
    }
});

// previous/next removed (server doesn't support switching)

// Show the now-playing UI with entrance when a station is selected
function showNowPlayingUI() {
    const nowUI = document.getElementById('nowPlayingUI');
    if (!nowUI) return;
    requestAnimationFrame(() => nowUI.classList.add('visible'));
}

// progress updater keeps the UI in sync with audioElement.currentTime
function startProgressUpdater() {
    stopProgressUpdater();
    progressInterval = setInterval(() => {
        document.getElementById("trackCurrentPosition").textContent = formatTime(audioElement.currentTime);
        // if duration known, adjust max occasionally
        if (!isNaN(audioElement.duration)) {
            const meter = document.getElementById("trackProgressMeter");
            meter.max = audioElement.duration;
            meter.value = audioElement.currentTime;
        }
    }, 250);
}
function stopProgressUpdater() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

stopBtn.addEventListener('click', function() {
    audioElement.pause();
    audioElement.currentTime = 0;
    currentlyPlayingStation = null;
    stopVisualizer();
    stopProgressUpdater();
    resetUI();
    const nowUI = document.getElementById('nowPlayingUI');
    if (nowUI) nowUI.classList.remove('visible');
});

// Visualizer functions
function startVisualizer() {
    stopVisualizer(); // Clear any existing interval
    visualizerInterval = setInterval(animateVisualizer, 150);
}

function stopVisualizer() {
    if (visualizerInterval) {
        clearInterval(visualizerInterval);
        visualizerInterval = null;
    }
    // Reset visualizer bars to default state
    visualizerBars.forEach(bar => {
        bar.style.height = '8px';
        bar.style.opacity = '0.6';
    });
}

function animateVisualizer() {
    visualizerBars.forEach((bar, index) => {
        const height = Math.random() * 12 + 4; // Random height between 4px and 16px
        const opacity = Math.random() * 0.4 + 0.6; // Random opacity between 0.6 and 1
        bar.style.height = height + 'px';
        bar.style.opacity = opacity;
    });
}

function updatePlayPauseButton() {
    const icon = playPauseBtn.querySelector('.material-symbols-rounded');
    if (isPlaying) {
        icon.textContent = 'pause';
    } else {
        icon.textContent = 'play_arrow';
    }
}

function resetUI() {
    document.getElementById("trackName").textContent = "Select a station to start listening";
    document.getElementById("trackAuthor").textContent = "";
    document.getElementById("trackCurrentPosition").textContent = "0:00";
    document.getElementById("trackDuration").textContent = "0:00";
    document.getElementById("trackProgressMeter").value = 0;
    playPauseBtn.disabled = true;
    stopBtn.disabled = true;
    updateCounterDisplay();
}


/**
 * Fetches updated track information for the specified station and updates the UI/preloading.
 * This function now calls getAllTrackInformation which fetches all data.
 * @param {string} stationName The name of the station to fetch data for.
 * @param {boolean} forcePlay If true, will immediately set the main audio element's SRC and play.
 */
function fetchAndUpdateStationData(stationName, forcePlay = false) {
    getAllTrackInformation((allTrackObjects) => { // This fetches ALL data from the server
        const trackObject = allTrackObjects[stationName];
        if (trackObject) {
            populateUI(trackObject, stationName);
            // If we're currently tuned to this station, ensure our audio follows the
            // server's reported current segment. If the server has advanced to a
            // different segment than the one currently loaded, switch to it and
            // sync playback state/position.
            try {
                const incomingSrc = trackObject.currentSegment && trackObject.currentSegment.SRC;
                const incomingPos = trackObject.currentSegment && trackObject.currentSegment.position;
                if (stationName === currentlyPlayingStation && incomingSrc) {
                    // Normalize incoming SRC to an absolute URL so comparisons are reliable.
                    let incomingHref;
                    try {
                        incomingHref = new URL(incomingSrc, location.href).href;
                    } catch (e) {
                        incomingHref = incomingSrc;
                    }

                    const srcDiffers = audioElement.src !== incomingHref;

                    // If we're currently playing, don't interrupt the current segment.
                    // Instead, set up the server-provided SRC as the next/preloaded segment
                    // so it will start when the current audio ends (and it will start at 0).
                    if (isPlaying && srcDiffers) {
                        console.log(`Server advanced segment for ${stationName} while playing; will switch after current finishes: ${incomingHref}`);
                        // Preload into the nextAudio element and mark it for onended to pick up.
                        try {
                            nextAudioElement.src = incomingHref;
                        } catch (e) {
                            console.warn('Could not set nextAudioElement.src for preload:', e);
                        }
                        preloadedNextSegmentSrc[stationName] = incomingHref;
                    } else if (srcDiffers) {
                        // Not currently playing: switch immediately but start the new segment from 0
                        console.log(`Server advanced segment for ${stationName}; switching immediately to server's segment: ${incomingHref}`);
                        const wasPlaying = isPlaying;
                        audioElement.src = incomingHref;
                        audioElement.currentTime = 0; // start server segment at 0 as requested
                        if (wasPlaying) {
                            audioElement.play().catch(err => console.warn('Could not auto-play after server switch:', err));
                        }
                        preloadedNextSegmentSrc[stationName] = null;
                    } else {
                        // If the src is the same, keep position roughly in sync with the server
                        const serverPos = typeof trackObject.currentSegment.position === 'number' ? trackObject.currentSegment.position : null;
                        if (serverPos !== null && Math.abs((audioElement.currentTime || 0) - serverPos) > 1.0) {
                            audioElement.currentTime = serverPos;
                        }
                    }
                }
            } catch (err) {
                console.error('Error syncing audio to server segment:', err);
            }
           
            // If forced to play immediately (e.g., segment ended and no preload)
            if (forcePlay) {
                console.log(`Forcing play of current segment: ${trackObject.currentSegment.SRC}`);
                audioElement.src = trackObject.currentSegment.SRC;
                audioElement.currentTime = trackObject.currentSegment.position;
                audioElement.play();
            }


            // Always try to preload the *next* segment based on the fresh data
            // The server's 'currentSegment.SRC' for this fetch is what we want to preload
            // for the *next* segment to be played by the client.
            preloadNextSegment(trackObject, stationName);


        } else {
            console.error(`Track object not found for station: ${stationName} after fetching updated data.`);
        }
    });
}




function tuneIn(substationName) {
    console.log(`Tuning into ${substationName}.`);
    currentlyPlayingStation = substationName; // Keep track of the active station
    segmentCount = 0; // reset counter
    updateCounterDisplay();

    // Stop previous visualizer (no polling interval used anymore)
    stopVisualizer(); // Stop any existing visualizer

    // Enable control buttons
    playPauseBtn.disabled = false;
    stopBtn.disabled = false;
    showNowPlayingUI();

    // Initial fetch to get current track info and start playback
    getAllTrackInformation((allTrackObjects) => {
        const trackObject = allTrackObjects[substationName];
        if (trackObject) {
            populateUI(trackObject, substationName);
            audioElement.src = trackObject.currentSegment.SRC;
            audioElement.currentTime = trackObject.currentSegment.position;
            audioElement.play();
            console.log(`Playing initial segment: ${trackObject.currentSegment.SRC} from position ${trackObject.currentSegment.position}`);

            // Preload the next segment based on this initial fetch
            preloadNextSegment(trackObject, substationName);

        } else {
            console.error(`Track object not found for station: ${substationName} on tune-in.`);
        }
    });

    // don't poll repeatedly; future updates will happen on-ended or manual actions
    // start local progress updater when audio begins
    // (audio.onplay will trigger it)

}


/**
 * Preloads the next audio segment for a given station using the SRC provided by the server.
 * This is called AFTER new data has been fetched from the server.
 * @param {object} trackObject The track object for the current station (from fresh server data).
 * @param {string} stationName The name of the current station.
 */
function preloadNextSegment(trackObject, stationName) {
    // The server's `currentSegment.SRC` from the *newly fetched data*
    // is what we want to preload for the *next* client-side segment.
    const nextSegmentSRCFromServer = trackObject.currentSegment.SRC;


    if (nextSegmentSRCFromServer &&
        nextSegmentSRCFromServer !== audioElement.src && // Not already playing on main element
        nextSegmentSRCFromServer !== nextAudioElement.src) { // Not already preloaded
       
        console.log(`Preloading ${stationName}'s NEXT segment (from server data): ${nextSegmentSRCFromServer}`);
        nextAudioElement.src = nextSegmentSRCFromServer;
        preloadedNextSegmentSrc[stationName] = nextSegmentSRCFromServer; // Store it for onended
    } else {
        // This might happen if the server hasn't advanced to the next segment yet,
        // or if the segment is already playing/preloaded.
        console.log(`Skipping preload for ${stationName}. Next segment already loaded/playing or no new SRC from server.`);
    }
}




// --- Your existing functions below ---


async function fetchDataFromServer(linkEnding, callback = () => { }) {
    fetch(buildUrl(linkEnding))
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then((data) => {
            console.log("Fetched data from server:", data);
            callback(data);
        })
        .catch((err) => {
            console.error("Error fetching data from server:", err);
            callback(null); // Indicate fetch failure
        });
}


// This function can now be called whenever, as clarified by the user.
async function getAllTrackInformation(func = () => { }) {
    fetchDataFromServer("/getAllTrackInformation", func);
}




function createStationUI(title, desc, logoLink, availableToPlay, stationName) {
    const container = document.createElement('div');
    container.className = 'substationContainer';

    const logoAndPlay = document.createElement('div');
    logoAndPlay.className = 'logoAndPlayContainer';

    const tuneBtn = document.createElement('div');
    tuneBtn.className = 'tuneInButton';
    if (availableToPlay) {
        const icon = document.createElement('span');
        icon.className = 'tuneInButtonIcon material-symbols-rounded';
        icon.textContent = 'play_arrow';
        tuneBtn.appendChild(icon);
        tuneBtn.addEventListener('click', () => tuneIn(stationName));
    } else {
        const icon = document.createElement('span');
        icon.className = 'tuneInButtonIcon material-symbols-rounded';
        icon.textContent = 'signal_disconnected';
        const txt = document.createElement('span');
        txt.className = 'tuneInButtonText grayedOut';
        txt.textContent = 'Unavailable';
        tuneBtn.appendChild(icon);
        tuneBtn.appendChild(txt);
    }

    const logoDiv = document.createElement('div');
    logoDiv.className = 'substationLogoContainer';
    const img = document.createElement('img');
    img.className = 'substationLogo';
    img.src = logoLink || 'https://cdn.glitch.global/f81e375a-f3b2-430f-9115-3f352b74f21b/WR%20Substation%20Icon.png?v=1716472186074';
    img.alt = title + ' logo';
    // Fallback: if external CDN fails (DNS/outage), replace with a small inline SVG placeholder
    img.onerror = function() {
        this.onerror = null;
        this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="%23eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="18" fill="%23666">No Image</text></svg>';
    };
    logoDiv.appendChild(img);

    logoAndPlay.appendChild(tuneBtn);
    logoAndPlay.appendChild(logoDiv);

    const titleEl = document.createElement('div');
    titleEl.className = 'substationTitle';
    titleEl.textContent = title;

    const descEl = document.createElement('div');
    descEl.className = 'substationDescription';
    descEl.textContent = desc;

    container.appendChild(logoAndPlay);
    container.appendChild(titleEl);
    container.appendChild(descEl);

    document.getElementById('substationList').appendChild(container);
}

// Load stations from server and populate the UI. Falls back to an empty list on error.
function loadStations() {
    const listEl = document.getElementById('substationList');
    if (listEl) {
        listEl.innerHTML = '<div class="placeholder-card">Loading stations...</div>';
    }
    getAllStations((stations) => {
        if (!listEl) return;
        listEl.innerHTML = '';
        if (!Array.isArray(stations)) {
            console.error('Stations endpoint did not return an array:', stations);
            listEl.innerHTML = '<div class="placeholder-card">Failed to load stations</div>';
            return;
        }
        if (stations.length === 0) {
            listEl.innerHTML = '<div class="placeholder-card">No stations available</div>';
        }
        stations.forEach(st => {
            // Use station properties; provide defaults where missing
            const name = st.name || 'Unknown Station';
            const desc = st.description || '';
            const logo = st.logo || ''; // if server provides logo
            const available = true;
            createStationUI(name, desc, logo, available, name);
            // store initial trackList in stationState for play page features
            stationState = stationState || {};
            stationState[name] = stationState[name] || {};
            stationState[name].currentList = Array.isArray(st.trackList) ? st.trackList.slice() : [];
        });
    });
}

// Helper to fetch /stations
function getAllStations(callback = () => {}) {
    fetchDataFromServer('/stations', (data) => {
        callback(data);
    });
}


function populateUI(trackObject, stationName) {
    // progress and basic metadata
    document.getElementById("trackProgressMeter").value = trackObject.track.position;
    document.getElementById("trackProgressMeter").max = trackObject.track.duration;
    document.getElementById("trackName").textContent = trackObject.track.title || 'Unknown Title';
    document.getElementById("trackAuthor").textContent = trackObject.track.author || '';
    document.getElementById("trackCurrentPosition").textContent = formatTime(trackObject.track.position);
    document.getElementById("trackDuration").textContent = formatTime(trackObject.track.duration);
    document.getElementById("trackName").dataset.station = stationName;

    // Update artwork if provided by server (fallback to default)
    try {
        const artSrc = trackObject.track.artwork || trackObject.currentSegment && trackObject.currentSegment.artwork || null;
        if (artSrc) {
            document.getElementById('trackArtwork').src = artSrc;
        }
    } catch (e) { /* ignore */ }

    // Update artist photo if provided
    try {
        const artistSrc = trackObject.track.artistPhoto || trackObject.artistPhoto || null;
        if (artistPhoto && artistSrc) {
            artistPhoto.src = artistSrc;
        }
    } catch (e) { /* ignore */ }

    // If station has a track list stored, try to keep an index of current track
    stationState[stationName] = stationState[stationName] || {};
    const list = stationState[stationName].currentList || [];
    if (list.length) {
        // attempt to find index by matching title or SRC
        let idx = list.findIndex(item => {
            if (!item) return false;
            const t = (item.title || item.track || item.name || '').toString();
            const s = (item.SRC || item.src || item.SRC || '').toString();
            return (t && trackObject.track.title && t === trackObject.track.title) || (s && audioElement.src && s === audioElement.src);
        });
        if (idx === -1) idx = 0; // fallback
        stationState[stationName].currentIndex = idx;
    }
}


// Helpers for prev/next navigation and playing an item from the station list

function updateCounterDisplay() {
    const el = document.getElementById('segmentCounter');
    if (el) {
        el.textContent = `Segments played: ${segmentCount}`;
    }
}

function formatTime(time = 0) {
    let sec = time;
    let min = 0;
    let hour = 0;


    min = Math.floor(sec / 60);
    sec = Math.floor(sec % 60);


    hour = Math.floor(min / 60);
    min = min % 60;


    const minStr = min < 10 ? "0" + min : min;
    const secStr = sec < 10 ? "0" + sec : sec;


    return (hour > 0 ? hour + ":" : "") + minStr + ":" + secStr;
}


// Initial setup for the UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize control buttons as disabled
    playPauseBtn.disabled = true;
    stopBtn.disabled = true;
    // Populate the station selection UI from server
    loadStations();
});



