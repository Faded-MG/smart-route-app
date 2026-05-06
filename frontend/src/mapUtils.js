export const POLYLINE_BUFFER_M = 35;
export const EARTH_R_M = 6371000;
export const ROUTE_COLOR_CLEAR = '#2a6a30';
export const ROUTE_COLOR_WARN = '#c25c00';
export const OSRM_DRIVING = 'https://router.project-osrm.org/route/v1/driving';

// Time-based closure helpers
export function isClosureActive(closure, now = new Date()) {
  const { startTime, endTime } = closure;

  // No time restrictions = always active
  if (!startTime && !endTime) {
    return { active: true, status: 'always' };
  }

  const start = startTime ? new Date(startTime) : null;
  const end = endTime ? new Date(endTime) : null;

  // Only startTime set = active from that time onward
  if (start && !end) {
    return { active: now >= start, status: now >= start ? 'active' : 'scheduled' };
  }

  // Only endTime set = active until that time
  if (!start && end) {
    return { active: now <= end, status: now <= end ? 'active' : 'expired' };
  }

  // Both set = active only between start and end
  const active = now >= start && now <= end;
  let status = 'scheduled';
  if (active) status = 'active';
  if (now > end) status = 'expired';

  return { active, status, start, end };
}

export function filterActiveClosures(closures, now = new Date()) {
  return closures.filter(c => isClosureActive(c, now).active);
}

export function formatClosureTime(closure) {
  const { startTime, endTime } = closure;
  if (!startTime && !endTime) return 'Always active';

  const format = (d) => {
    const date = new Date(d);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (startTime && endTime) {
    return `${format(startTime)} - ${format(endTime)}`;
  }
  if (startTime) {
    return `From ${format(startTime)}`;
  }
  return `Until ${format(endTime)}`;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatPoint(point) {
  return `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`;
}

export function formatMinutes(totalMinutes) {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

export function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(p1, p2) {
  const dLat = toRad(p2[0] - p1[0]);
  const dLng = toRad(p2[1] - p1[1]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(p1[0])) * Math.cos(toRad(p2[0])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_R_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function pointToSegmentMeters(p, a, b) {
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

export function sampleRouteLatLngs(latLngs) {
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

export function hasGeometryForCheck(c) {
  return (
    (c.center && typeof c.center.lat === 'number' && typeof c.center.lng === 'number') ||
    (c.polylineLatLngs && c.polylineLatLngs.length >= 2) ||
    (c.coordinates && Array.isArray(c.coordinates) && c.coordinates.length >= 2)
  );
}

export function routeIntersectsClosure(latLngs, c) {
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

  // Handle new coordinates structure or polylineLatLngs
  const pl = c.coordinates || c.polylineLatLngs;
  if (!pl || pl.length < 2) return false;
  
  for (let i = 0; i < samples.length; i++) {
    for (let j = 0; j < pl.length - 1; j++) {
      if (pointToSegmentMeters(samples[i], pl[j], pl[j + 1]) <= POLYLINE_BUFFER_M) {
        return true;
      }
    }
  }
  return false;
}

export function countRouteConflicts(latLngs, closures) {
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

export function pickBestRoute(routes, roadClosures) {
  if (routes.length === 0) {
    return { route: null, index: -1, conflictHits: [] };
  }
  if (roadClosures.length === 0) {
    return { route: routes[0], index: 0, conflictHits: [] };
  }

  const scored = routes.map(function (r, i) {
    const latLngs = r.geometry.coordinates.map(function (coord) {
      return [coord[1], coord[0]];
    });
    const conflictHits = countRouteConflicts(latLngs, roadClosures);
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

  return {
    route: scored[0].route,
    index: scored[0].index,
    conflictHits: scored[0].conflictHits
  };
}

export function parsePolylineLatLngs(raw) {
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

export function normalizeOne(raw) {
  // Handle new AI-generated structure
  if (raw.id && raw.location_name && raw.coordinates) {
    const road = String(raw.location_name || 'Unnamed road');
    const reason = String(raw.reason || 'Reason not provided');
    const polylineLatLngs = Array.isArray(raw.coordinates) && raw.coordinates.length >= 2 
      ? raw.coordinates.map(coord => [Number(coord[0]), Number(coord[1])])
      : null;
    
    // Time-based closure support
    const startTime = raw.start_time || raw.startTime || null;
    const endTime = raw.end_time || raw.endTime || null;
    
    return {
      id: raw.id,
      road,
      reason,
      center: null, // New structure uses coordinates instead of center
      radiusMeters: 200, // Default radius for display purposes
      polylineLatLngs,
      startTime,
      endTime,
      status: raw.status || 'active'
    };
  }
  
  // Handle legacy structure for backward compatibility
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

export function normalizeClosuresPayload(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.closures)) return data.closures;
  if (data && Array.isArray(data.roads)) return data.roads;
  return [];
}

export async function fetchPlaces(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchRoute(startPoint, endPoint) {
  const startLngLat = `${startPoint[1]},${startPoint[0]}`;
  const endLngLat = `${endPoint[1]},${endPoint[0]}`;
  const routeUrl = `${OSRM_DRIVING}/${startLngLat};${endLngLat}?overview=full&geometries=geojson&steps=false&alternatives=2`;
  
  const response = await fetch(routeUrl);
  if (!response.ok) {
    throw new Error(`Routing failed: ${response.status}`);
  }
  const data = await response.json();
  if (!data.routes || data.routes.length === 0) {
    throw new Error('No route returned');
  }
  return data;
}
