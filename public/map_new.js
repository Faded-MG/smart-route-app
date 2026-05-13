const map = L.map('map').setView([9.03, 38.74], 13);
const statusText = document.getElementById('status');
const timeEstimateText = document.getElementById('timeEstimate');
const resetButton = document.getElementById('resetBtn');
const useLocationButton = document.getElementById('useLocationBtn');
const startInput = document.getElementById('startInput');
const destinationInput = document.getElementById('destinationInput');
const startSuggestions = document.getElementById('startSuggestions');
const destinationSuggestions = document.getElementById('destinationSuggestions');
const routeAdvice = document.getElementById('routeAdvice');
const closureList = document.getElementById('closureList');
const closureLoadState = document.getElementById('closureLoadState');

if (window.location.protocol === 'file:') {
  alert('Open this app through http://localhost (not file://) to load OpenStreetMap tiles.');
}

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  referrerPolicy: 'strict-origin-when-cross-origin'
}).addTo(map);

const closureOverlays = L.layerGroup().addTo(map);
let startPoint = null;
let endPoint = null;
let startMarker = null;
let endMarker = null;
let routeLine = null;
let routeSummary = null;
let isRouting = false;
const estimatedFuelLitersPer100Km = 8;
let roadClosures = [];
const POLYLINE_BUFFER_M = 35;
const EARTH_R_M = 6371000;
const ROUTE_COLOR_CLEAR = '#2a6a30';
const ROUTE_COLOR_WARN = '#c25c00';
const OSRM_DRIVING =
  'https://router.project-osrm.org/route/v1/driving';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPoint(point) {
  return `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`;
}

function formatMinutes(totalMinutes) {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineMeters(p1, p2) {
  const dLat = toRad(p2[0] - p1[0]);
  const dLng = toRad(p2[1] - p1[1]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(p1[0])) * Math.cos(toRad(p2[0])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_R_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentMeters(p, a, b) {
  const ax = a[0];
  const ay = a[1];
  const bx = b[0];
  const by = b[1];
  const px = p[0];
  const py = p[1];
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 < 1e-12 ? 0 : (apx * abx + apy * apy) / ab2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  return haversineMeters(p, [qx, qy]);
}

function sampleRouteLatLngs(latLngs) {
  const out = [];
  const step = Math.max(1, Math.floor(latLngs.length / 150));
  for (let i = 0; i < latLngs.length; i += step) {
    out.push(latLngs[i]);
  }
  if (out[out.length - 1] !== latLngs[latLngs.length - 1]) {
    out.push(latLngs[latLngs.length - 1]);
  }
  return out;
}

function hasGeometryForCheck(c) {
  return (
    (c.center && typeof c.center.lat === 'number' && typeof c.center.lng === 'number') ||
    (c.polylineLatLngs && c.polylineLatLngs.length >= 2)
  );
}

function routeIntersectsClosure(latLngs, c) {
  if (!hasGeometryForCheck(c)) return false;
  const samples = sampleRouteLatLngs(latLngs);

  if (c.center) {
    const r = c.radiusMeters;
    for (let i = 0; i < samples.length; i++) {
      if (haversineMeters(samples[i], [c.center.lat, c.center.lng]) <= r) {
        return true;
      }
    }
    return false;
  }

  const pl = c.polylineLatLngs;
  for (let i = 0; i < samples.length; i++) {
    for (let j = 0; j < pl.length - 1; j++) {
      if (pointToSegmentMeters(samples[i], pl[j], pl[j + 1]) <= POLYLINE_BUFFER_M) {
        return true;
      }
    }
  }
  return false;
}

function countRouteConflicts(latLngs, closures) {
  const hits = [];
  for (let i = 0; i < closures.length; i++) {
    const c = closures[i];
    if (!hasGeometryForCheck(c)) continue;
    if (routeIntersectsClosure(latLngs, c)) {
      hits.push(c);
    }
  }
  return hits;
}

function pickBestRoute(routes) {
  if (routes.length === 0) {
    return { route: null, index: -1, conflictHits: [] };
  }
  
  const activeClosures = window.activeClosures || [];
  if (activeClosures.length === 0) {
    return { route: routes[0], index: 0, conflictHits: [] };
  }

  const scored = routes.map(function (r, i) {
    const latLngs = r.geometry.coordinates.map(function (coord) {
      return [coord[1], coord[0]];
    });
    const conflictHits = countRouteConflicts(latLngs, activeClosures);
    return {
      route: r,
      index: i,
      conflictCount: conflictHits.length,
      conflictHits,
      duration: r.duration
    };
  });

  scored.sort(function (a, b) {
    if (a.conflictCount !== b.conflictCount) {
      return a.conflictCount - b.conflictCount;
    }
    return a.duration - b.duration;
  });

  const bestRoute = scored[0];
  
  // Add warning notifications for unavoidable closures
  if (bestRoute.conflictHits.length > 0) {
    const unavoidableClosures = bestRoute.conflictHits.map(hit => hit.closure);
    const warningMessage = unavoidableClosures.map(closure => 
      `Note: Your route passes through a ${closure.reason} closure at ${closure.location_name}.`
    ).join(' ');
    
    setRouteAdvice(
      `<strong>⚠️ Route Alert:</strong> ${warningMessage}`,
      false
    );
  }

  return {
    route: bestRoute.route,
    index: bestRoute.index,
    conflictHits: bestRoute.conflictHits
  };
}

function setRouteAdvice(html, isOk) {
  routeAdvice.hidden = false;
  routeAdvice.classList.toggle('advice-ok', Boolean(isOk));
  routeAdvice.innerHTML = html;
}

function clearRouteAdvice() {
  routeAdvice.hidden = true;
  routeAdvice.textContent = '';
  routeAdvice.classList.remove('advice-ok');
}

function updateTimeEstimate() {
  if (!startPoint || !endPoint) {
    timeEstimateText.textContent = 'Estimated time will appear after selecting destination.';
    clearRouteAdvice();
    return;
  }

  if (isRouting) {
    timeEstimateText.textContent = 'Calculating route and ETA...';
    return;
  }

  if (!routeSummary) {
    timeEstimateText.textContent =
      'Could not fetch road route right now. Try reset and select points again.';
    return;
  }

  const distanceKm = routeSummary.distanceMeters / 1000;
  const durationMin = routeSummary.durationSeconds / 60;
  const estimatedFuelLiters = (distanceKm * estimatedFuelLitersPer100Km) / 100;
  timeEstimateText.textContent =
    `Road distance: ${distanceKm.toFixed(2)} km | Drive ETA: ${formatMinutes(durationMin)} | Estimated fuel: ${estimatedFuelLiters.toFixed(2)} L`;
}

function updateStatus() {
  if (!startPoint) {
    statusText.textContent = 'Search for start and destination, or tap the map to set points.';
    return;
  }

  if (!endPoint) {
    statusText.textContent = `Start: ${formatPoint(startPoint)}. Click again to set destination.`;
    updateTimeEstimate();
    return;
  }

  statusText.textContent = `Start: ${formatPoint(startPoint)} | Destination: ${formatPoint(endPoint)}`;
  updateTimeEstimate();
}

function clearSuggestions(listElement) {
  listElement.innerHTML = '';
}

function setStartPoint(lat, lng, label) {
  startPoint = [lat, lng];
  if (startMarker) {
    map.removeLayer(startMarker);
  }
  startMarker = L.marker([lat, lng])
    .addTo(map)
    .bindPopup('Start Point')
    .openPopup();
  if (label) {
    startInput.value = label;
  }
}

function setEndPoint(lat, lng, label) {
  endPoint = [lat, lng];
  if (endMarker) {
    map.removeLayer(endMarker);
  }
  endMarker = L.marker([lat, lng])
    .addTo(map)
    .bindPopup('Destination')
    .openPopup();
  if (label) {
    destinationInput.value = label;
  }
}

function parsePolylineLatLngs(raw) {
  if (!raw) return null;
  let arr = null;
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (raw.type === 'LineString' && Array.isArray(raw.coordinates)) {
    arr = raw.coordinates;
  }
  if (!arr || arr.length < 2) return null;
  return arr.map(function (pair) {
    const a = Number(pair[0]);
    const b = Number(pair[1]);
    if (Math.abs(a) > 20 && Math.abs(b) < 20) {
      return [b, a];
    }
    return [a, b];
  });
}

function normalizeOne(raw) {
  const road = String(raw.road || raw.name || 'Unnamed road');
  const reason = String(
    raw.reason || raw.why || raw.description || raw.detail || 'Reason not provided'
  );
  let center = null;
  if (raw.center) {
    center = {
      lat: Number(raw.center.lat),
      lng: Number(raw.center.lon != null ? raw.center.lon : raw.center.lng)
    };
  } else if (raw.lat != null && (raw.lng != null || raw.lon != null)) {
    center = {
      lat: Number(raw.lat),
      lng: Number(raw.lng != null ? raw.lng : raw.lon)
    };
  }
  const radiusMeters = Math.max(10, Number(raw.radiusMeters ?? raw.radius ?? 100));
  const polylineLatLngs = parsePolylineLatLngs(
    raw.polyline || raw.line || (raw.geometry && raw.geometry)
  );
  return {
    road,
    reason,
    center: center && !Number.isNaN(center.lat) && !Number.isNaN(center.lng) ? center : null,
    radiusMeters: Number.isFinite(radiusMeters) ? radiusMeters : 100,
    polylineLatLngs: polylineLatLngs && polylineLatLngs.length >= 2 ? polylineLatLngs : null
  };
}

function normalizeClosuresPayload(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.closures)) return data.closures;
  if (data && Array.isArray(data.roads)) return data.roads;
  return [];
}

function renderClosureList(closures) {
  closureList.innerHTML = '';
  for (let i = 0; i < closures.length; i++) {
    const c = closures[i];
    const li = document.createElement('li');
    const title = document.createElement('span');
  }
}

async function loadRoadClosures() {
  closureLoadState.textContent = 'Loading road closures from server…';
  try {
    const res = await fetch('/roads', { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const rawList = normalizeClosuresPayload(data);
    roadClosures = rawList.map(normalizeOne);
    
    // Filter active closures for routing logic
    const now = new Date();
    const activeClosures = roadClosures.filter(closure => {
      const isActive = closure.status === 'active';
      const isCurrentlyActive = closure.start_time && new Date(closure.start_time) <= now && 
        (!closure.end_time || new Date(closure.end_time) > now);
      return isActive || isCurrentlyActive;
    });
    
    // Store active closures globally for route avoidance
    window.activeClosures = activeClosures;
    
    if (roadClosures.length === 0) {
      closureLoadState.textContent = 'No closures reported. Your bot can add entries to roads.json.';
    } else {
      closureLoadState.textContent = `${roadClosures.length} closure(s) (${activeClosures.length} active) — routes avoid these when a better path exists.`;
    }
    renderClosureList(roadClosures);
    drawClosureOverlays(roadClosures);
    if (startPoint && endPoint) {
      drawRouteLine();
    }
  } catch (e) {
    roadClosures = [];
    window.activeClosures = [];
    closureLoadState.textContent =
      'Could not load /roads. Run npm start in smart-route-app and ensure road-closure-bot/data/roads.json exists.';
    closureList.innerHTML = '';
    console.error(e);
  }
}

async function fetchPlaces(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  return response.json();
}

function renderSuggestions(type, places) {
  const listElement = type === 'start' ? startSuggestions : destinationSuggestions;
  clearSuggestions(listElement);
  places.forEach(function (place) {
    const item = document.createElement('li');
    item.className = 'suggestion-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = place.display_name;
    button.addEventListener('click', function () {
      const lat = Number(place.lat);
      const lon = Number(place.lon);
      if (type === 'start') {
        setStartPoint(lat, lon, place.display_name);
      } else {
        setEndPoint(lat, lon, place.display_name);
      }
      clearSuggestions(listElement);
      updateStatus();
      drawRouteLine();
      map.setView([lat, lon], 14);
    });
    item.appendChild(button);
    listElement.appendChild(item);
  });
}

function debounceSearch(type, inputElement, waitMs) {
  let timer = null;
  inputElement.addEventListener('input', function () {
    const query = inputElement.value.trim();
    const listElement = type === 'start' ? startSuggestions : destinationSuggestions;
    clearTimeout(timer);
    if (query.length < 3) {
      clearSuggestions(listElement);
      return;
    }
    timer = setTimeout(async function () {
      try {
        const places = await fetchPlaces(query);
        renderSuggestions(type, places);
      } catch (error) {
        console.error(error);
      }
    }, waitMs);
  });
}

async function drawRouteLine() {
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }

  if (!startPoint || !endPoint) {
    return;
  }

  isRouting = true;
  routeSummary = null;
  clearRouteAdvice();
  updateTimeEstimate();

  const startLngLat = `${startPoint[1]},${startPoint[0]}`;
  const endLngLat = `${endPoint[1]},${endPoint[0]}`;
  const routeUrl = `${OSRM_DRIVING}/${startLngLat};${endLngLat}?overview=full&geometries=geojson&steps=false&alternatives=2`;

  try {
    const response = await fetch(routeUrl);
    if (!response.ok) {
      throw new Error(`Routing failed: ${response.status}`);
    }
    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
      throw new Error('No route returned');
    }

    const { route: best, conflictHits } = pickBestRoute(data.routes);
    if (!best) {
      throw new Error('No route to display');
    }

    const latLngs = best.geometry.coordinates.map(function (coord) {
      return [coord[1], coord[0]];
    });
    const hadConflict = conflictHits.length > 0;
    const lineColor = hadConflict ? ROUTE_COLOR_WARN : ROUTE_COLOR_CLEAR;
    const weight = hadConflict ? 5 : 4;

    routeLine = L.polyline(latLngs, { color: lineColor, weight, opacity: 0.92 }).addTo(map);

    routeSummary = {
      distanceMeters: best.distance,
      durationSeconds: best.duration
    };
    map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });

    if (roadClosures.length === 0) {
      setRouteAdvice(
        '<strong>Fastest path shown.</strong> Add closure entries to <code>roads.json</code> to compare detours automatically.',
        true
      );
    } else if (hadConflict) {
      const names = conflictHits
        .map(function (c) {
          return `<em>${escapeHtml(c.road)}</em> (${escapeHtml(c.reason)})`;
        })
        .join('; ');
      setRouteAdvice(
        `<strong>Heads up:</strong> this path may still go through a reported closure: ${names}. ` +
          'Tighten the zone in <code>roads.json</code> (smaller radius or a line along the closed segment) to improve detours.',
        false
      );
    } else if (data.routes.length > 1) {
      setRouteAdvice(
        '<strong>Detour applied.</strong> We compared several driving options and kept the one that best avoids the closure zones on file.',
        true
      );
    } else {
      setRouteAdvice(
        '<strong>Route clear of mapped closures.</strong> Only one road option was returned for this trip; it does not cross the zones your list describes.',
        true
      );
    }
  } catch (error) {
    console.error(error);
    routeSummary = null;
    setRouteAdvice(
      'Could not compute driving directions. Check your connection and try again.',
      false
    );
  } finally {
    isRouting = false;
    updateTimeEstimate();
  }
}

map.on('click', function (e) {
  const { lat, lng } = e.latlng;
  if (!startPoint) {
    setStartPoint(lat, lng, `Pinned: ${formatPoint([lat, lng])}`);
    updateStatus();
    drawRouteLine();
    return;
  }
  if (!endPoint) {
    setEndPoint(lat, lng, `Pinned: ${formatPoint([lat, lng])}`);
    updateStatus();
    drawRouteLine();
    return;
  }
  setStartPoint(lat, lng, `Pinned: ${formatPoint([lat, lng])}`);
  endPoint = null;
  if (endMarker) {
    map.removeLayer(endMarker);
    endMarker = null;
  }
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
  routeSummary = null;
  destinationInput.value = '';
  clearRouteAdvice();
  updateStatus();
  updateTimeEstimate();
});

function useCurrentLocation() {
  if (!navigator.geolocation) {
    statusText.textContent = 'Geolocation is not supported in this browser.';
    return;
  }
  statusText.textContent = 'Fetching your current location...';
  navigator.geolocation.getCurrentPosition(
    function (position) {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setStartPoint(lat, lng, 'Current location');
      map.setView([lat, lng], 14);
      updateStatus();
      drawRouteLine();
    },
    function () {
      statusText.textContent = 'Location access was denied. You can still type the start point.';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function resetRoute() {
  if (startMarker) {
    map.removeLayer(startMarker);
  }
  if (endMarker) {
    map.removeLayer(endMarker);
  }
  if (routeLine) {
    map.removeLayer(routeLine);
  }
  startPoint = null;
  endPoint = null;
  startMarker = null;
  endMarker = null;
  routeLine = null;
  routeSummary = null;
  isRouting = false;
  startInput.value = '';
  destinationInput.value = '';
  clearSuggestions(startSuggestions);
  clearSuggestions(destinationSuggestions);
  clearRouteAdvice();
  updateStatus();
  updateTimeEstimate();
}

resetButton.addEventListener('click', resetRoute);
useLocationButton.addEventListener('click', useCurrentLocation);
debounceSearch('start', startInput, 300);
debounceSearch('destination', destinationInput, 300);
document.addEventListener('click', function (event) {
  if (!event.target.closest('.input-group')) {
    clearSuggestions(startSuggestions);
    clearSuggestions(destinationSuggestions);
  }
});
updateStatus();
updateTimeEstimate();
loadRoadClosures();
