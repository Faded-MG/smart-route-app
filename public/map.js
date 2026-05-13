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

function haversineMeters(coord1, coord2) {
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_R_M * c;
}

function pointToSegmentMeters(pt, segStart, segEnd) {
  const [px, py] = pt;
  const [ax, ay] = segStart;
  const [bx, by] = segEnd;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = [ax + t * dx, ay + t * dy];
  const dist = Math.sqrt((px - proj[0]) ** 2 + (py - proj[1]) ** 2);
  return dist;
}

function countRouteConflicts(latLngs, closures) {
  const hits = [];
  if (!closures || closures.length === 0) return hits;
  for (let i = 0; i < latLngs.length; i++) {
    const pt = latLngs[i];
    for (let j = 0; j < closures.length; j++) {
      const c = closures[j];
      if (c.center) {
        const dist = haversineMeters(pt, [c.center.lat, c.center.lng]);
        if (dist <= c.radiusMeters) {
          hits.push({ closure: c, point: pt, distance: dist });
          continue;
        }
      }
      if (c.polylineLatLngs && c.polylineLatLngs.length >= 2) {
        for (let k = 0; k < c.polylineLatLngs.length - 1; k++) {
          const dist = pointToSegmentMeters(pt, c.polylineLatLngs[k], c.polylineLatLngs[k + 1]);
          if (dist <= POLYLINE_BUFFER_M) {
            hits.push({ closure: c, point: pt, distance: dist });
            continue;
          }
        }
      }
    }
  }
  return hits;
}

async function fetchPlaces(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Place search failed: ${response.status}`);
  const data = await response.json();
  return data.map(function (p) {
    return {
      display_name: p.display_name,
      lat: Number(p.lat),
      lon: Number(p.lon)
    };
  });
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

function clearSuggestions(listElement) {
  listElement.innerHTML = '';
}

function setStartPoint(lat, lng, name) {
  startPoint = [lat, lng];
  if (startMarker) {
    map.removeLayer(startMarker);
  }
  startMarker = L.marker([lat, lng]).addTo(map);
  if (name) {
    startMarker.bindPopup(`Start: ${escapeHtml(name)}`).openPopup();
  }
  startInput.value = name || formatPoint([lat, lng]);
  clearSuggestions(startSuggestions);
}

function setEndPoint(lat, lng, name) {
  endPoint = [lat, lng];
  if (endMarker) {
    map.removeLayer(endMarker);
  }
  endMarker = L.marker([lat, lng]).addTo(map);
  if (name) {
    endMarker.bindPopup(`Destination: ${escapeHtml(name)}`).openPopup();
  }
  destinationInput.value = name || formatPoint([lat, lng]);
  clearSuggestions(destinationSuggestions);
}

function updateStatus() {
  if (!startPoint && !endPoint) {
    statusText.textContent = 'Click on the map to set a start point.';
  } else if (startPoint && !endPoint) {
    statusText.textContent = 'Click on the map to set the destination point.';
  } else {
    statusText.textContent = `Route: ${escapeHtml(startInput.value)} → ${escapeHtml(destinationInput.value)}`;
  }
}

function updateTimeEstimate() {
  if (!routeSummary) {
    timeEstimateText.textContent = 'Estimated time will appear after selecting destination.';
    return;
  }
  const minutes = Math.round(routeSummary.durationSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  let text = '';
  if (hours > 0) {
    text = `${hours}h ${remainingMinutes}min`;
  } else {
    text = `${minutes}min`;
  }
  const km = (routeSummary.distanceMeters / 1000).toFixed(1);
  const fuel = (km * estimatedFuelLitersPer100Km / 100).toFixed(1);
  timeEstimateText.textContent = `${text} (${km}km, ~${fuel}L fuel)`;
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

function normalizeClosuresPayload(data) {
  if (data && Array.isArray(data.roads)) return data.roads;
  return [];
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

  // Time-based closure support
  const startTime = raw.startTime || raw.start || raw.from || null;
  const endTime = raw.endTime || raw.end || raw.to || raw.until || null;

  return {
    road,
    reason,
    center: center && !Number.isNaN(center.lat) && !Number.isNaN(center.lng) ? center : null,
    radiusMeters: Number.isFinite(radiusMeters) ? radiusMeters : 100,
    polylineLatLngs: polylineLatLngs && polylineLatLngs.length >= 2 ? polylineLatLngs : null,
    startTime,
    endTime
  };
}

function parsePolylineLatLngs(polyline) {
  if (!polyline) return null;
  try {
    if (typeof polyline === 'string') {
      return polyline.split(';').map(coord => {
        const parts = coord.split(',');
        return [Number(parts[1]), Number(parts[0])];
      });
    }
    if (Array.isArray(polyline)) {
      return polyline.map(coord => {
        if (Array.isArray(coord) && coord.length >= 2) {
          return [Number(coord[1]), Number(coord[0])];
        }
        return null;
      }).filter(Boolean);
    }
  } catch (e) {
    console.warn('Failed to parse polyline:', e);
    return null;
  }
}

function renderClosureList(closures) {
  closureList.innerHTML = '';
  closures.forEach(function (c) {
    const item = document.createElement('li');
    const road = document.createElement('span');
    road.className = 'closure-road';
    road.textContent = c.road;
    item.appendChild(road);
    if (c.why) {
      const why = document.createElement('span');
      why.className = 'closure-why';
      why.textContent = ` (${escapeHtml(c.why)})`;
      item.appendChild(why);
    }
    if (c.startTime) {
      const badge = document.createElement('span');
      badge.className = 'closure-badge';
      badge.textContent = isClosureActive(c) ? 'ACTIVE' : 'SCHEDULED';
      item.appendChild(badge);
    }
    closureList.appendChild(item);
  });
}

function isClosureActive(c) {
  const now = new Date();
  if (c.startTime && new Date(c.startTime) <= now) {
    if (!c.endTime) return true;
    return new Date(c.endTime) > now;
  }
  return false;
}

function drawClosureOverlays(closures) {
  closureOverlays.clearLayers();
  closures.forEach(function (c) {
    const active = isClosureActive(c);
    const strokeColor = active ? '#dc2626' : '#6b7280';
    const weight = active ? 4 : 2;
    const fillColor = active ? 'rgba(220, 38, 38, 0.2)' : 'rgba(107, 114, 128, 0.1)';
    const fillOpacity = active ? 0.3 : 0.1;
    if (c.center && !Number.isNaN(c.center.lat) && !Number.isNaN(c.center.lng)) {
      const circle = L.circle([c.center.lat, c.center.lng], {
        radius: c.radiusMeters,
        color: strokeColor,
        weight,
        fillColor,
        fillOpacity
      });
      circle.bindPopup(
        `<strong>${escapeHtml(c.road)}</strong><br>` +
        `<span style="color: ${active ? '#dc2626' : '#6b7280'}; font-weight: bold;">${statusLabel}</span><br>` +
        `${escapeHtml(c.why)}<br>` +
        `<small>${timeInfo}</small>`
      );
      circle.addTo(closureOverlays);
    }
    if (c.polylineLatLngs && c.polylineLatLngs.length >= 2) {
      const polyline = L.polyline(c.polylineLatLngs, {
        color: strokeColor,
        weight,
        opacity
      });
      polyline.bindPopup(
        `<strong>${escapeHtml(c.road)}</strong><br>` +
        `<span style="color: ${active ? '#dc2626' : '#6b7280'}; font-weight: bold;">${statusLabel}</span><br>` +
        `${escapeHtml(c.why)}<br>` +
        `<small>${timeInfo}</small>`
      );
      polyline.addTo(closureOverlays);
    }
  });
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
          return `<em>${escapeHtml(c.road)}</em> (${escapeHtml(c.why)})`;
        })
        .join('; ');
      setRouteAdvice(
        `<strong>Heads up:</strong> this path may still go through a reported closure: ${names}. ` +
        'Tighten the zone in <code>roads.json</code> (smaller radius or a line along the closed segment) to improve detours.',
        false
      );
    } else {
      setRouteAdvice(
        '<strong>Detour applied.</strong> We compared several driving options and kept the one that best avoids closure zones on file.',
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
      statusText.textContent = 'Location access was denied. You can still type start point.';
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
