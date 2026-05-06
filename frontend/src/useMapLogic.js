import { useState, useEffect, useRef, useCallback } from 'react';
import {
  escapeHtml,
  formatPoint,
  formatMinutes,
  pickBestRoute,
  normalizeOne,
  normalizeClosuresPayload,
  fetchRoute,
  isClosureActive,
  filterActiveClosures,
  formatClosureTime,
  ROUTE_COLOR_CLEAR,
  ROUTE_COLOR_WARN,
} from './mapUtils';

export function useMapLogic(map) {
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [routeSummary, setRouteSummary] = useState(null);
  const [isRouting, setIsRouting] = useState(false);
  const [roadClosures, setRoadClosures] = useState([]);
  const [status, setStatus] = useState('Click on the map to set a start point.');
  const [timeEstimate, setTimeEstimate] = useState('Estimated time will appear after selecting destination.');
  const [routeAdvice, setRouteAdvice] = useState({ html: '', isOk: true, hidden: true });
  const [closureLoadState, setClosureLoadState] = useState('');
  const estimatedFuelLitersPer100Km = 8;

  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  const closureOverlaysRef = useRef(null);

  useEffect(() => {
    if (map && !closureOverlaysRef.current) {
      closureOverlaysRef.current = window.L.layerGroup().addTo(map);
    }
  }, [map]);

  const clearRouteAdvice = useCallback(() => {
    setRouteAdvice({ html: '', isOk: true, hidden: true });
  }, []);

  const setRouteAdviceHtml = useCallback((html, isOk) => {
    setRouteAdvice({ html, isOk, hidden: false });
  }, []);

  const updateTimeEstimate = useCallback(() => {
    if (!startPoint || !endPoint) {
      setTimeEstimate('Estimated time will appear after selecting destination.');
      clearRouteAdvice();
      return;
    }

    if (isRouting) {
      setTimeEstimate('Calculating route and ETA...');
      return;
    }

    if (!routeSummary) {
      setTimeEstimate('Could not fetch road route right now. Try reset and select points again.');
      return;
    }

    const distanceKm = routeSummary.distanceMeters / 1000;
    const durationMin = routeSummary.durationSeconds / 60;
    const estimatedFuelLiters = (distanceKm * estimatedFuelLitersPer100Km) / 100;
    setTimeEstimate(
      `Road distance: ${distanceKm.toFixed(2)} km | Drive ETA: ${formatMinutes(durationMin)} | Estimated fuel: ${estimatedFuelLiters.toFixed(2)} L`
    );
  }, [startPoint, endPoint, isRouting, routeSummary, clearRouteAdvice]);

  const updateStatus = useCallback(() => {
    if (!startPoint) {
      setStatus('Search for start and destination, or tap the map to set points.');
      return;
    }

    if (!endPoint) {
      setStatus(`Start: ${formatPoint(startPoint)}. Click again to set destination.`);
      updateTimeEstimate();
      return;
    }

    setStatus(`Start: ${formatPoint(startPoint)} | Destination: ${formatPoint(endPoint)}`);
    updateTimeEstimate();
  }, [startPoint, endPoint, updateTimeEstimate]);

  const setStartPointInternal = useCallback((lat, lng) => {
    setStartPoint([lat, lng]);
    if (startMarkerRef.current) {
      map.removeLayer(startMarkerRef.current);
    }
    startMarkerRef.current = window.L.marker([lat, lng])
      .addTo(map)
      .bindPopup('Start Point')
      .openPopup();
  }, [map]);

  const setEndPointInternal = useCallback((lat, lng) => {
    setEndPoint([lat, lng]);
    if (endMarkerRef.current) {
      map.removeLayer(endMarkerRef.current);
    }
    endMarkerRef.current = window.L.marker([lat, lng])
      .addTo(map)
      .bindPopup('Destination')
      .openPopup();
  }, [map]);

  const drawRouteLine = useCallback(async () => {
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    if (!startPoint || !endPoint) {
      return;
    }

    setIsRouting(true);
    setRouteSummary(null);
    clearRouteAdvice();
    updateTimeEstimate();

    try {
      const data = await fetchRoute(startPoint, endPoint);
      // Only use currently active closures for routing decisions
      const now = new Date();
      const activeClosures = filterActiveClosures(roadClosures, now);
      const { route: best, conflictHits } = pickBestRoute(data.routes, activeClosures);
      
      if (!best) {
        throw new Error('No route to display');
      }

      const latLngs = best.geometry.coordinates.map(function (coord) {
        return [coord[1], coord[0]];
      });
      const hadConflict = conflictHits.length > 0;
      const lineColor = hadConflict ? ROUTE_COLOR_WARN : ROUTE_COLOR_CLEAR;
      const weight = hadConflict ? 5 : 4;

      routeLineRef.current = window.L.polyline(latLngs, { color: lineColor, weight, opacity: 0.92 }).addTo(map);

      setRouteSummary({
        distanceMeters: best.distance,
        durationSeconds: best.duration
      });
      map.fitBounds(routeLineRef.current.getBounds(), { padding: [30, 30] });

      if (activeClosures.length === 0) {
        setRouteAdviceHtml(
          '<strong>Fastest path shown.</strong> Add closure entries to <code>roads.json</code> to compare detours automatically.',
          true
        );
      } else if (hadConflict) {
        const names = conflictHits
          .map(function (c) {
            return `<em>${escapeHtml(c.road)}</em> (${escapeHtml(c.reason)})`;
          })
          .join('; ');
        setRouteAdviceHtml(
          `<strong>Heads up:</strong> this path may still go through an active closure: ${names}. ` +
            'Tighten the zone in <code>roads.json</code> (smaller radius or a line along the closed segment) to improve detours.',
          false
        );
      } else if (data.routes.length > 1) {
        setRouteAdviceHtml(
          '<strong>Detour applied.</strong> We compared several driving options and kept the one that best avoids active closure zones.',
          true
        );
      } else {
        setRouteAdviceHtml(
          '<strong>Route clear of active closures.</strong> Only one road option was returned for this trip; it does not cross currently active zones.',
          true
        );
      }
    } catch (error) {
      console.error(error);
      setRouteSummary(null);
      setRouteAdviceHtml(
        'Could not compute driving directions. Check your connection and try again.',
        false
      );
    } finally {
      setIsRouting(false);
      updateTimeEstimate();
    }
  }, [startPoint, endPoint, roadClosures, map, clearRouteAdvice, updateTimeEstimate, setRouteAdviceHtml]);

  const loadRoadClosures = useCallback(async () => {
    setClosureLoadState('Loading road closures from server…');
    try {
      const res = await fetch('/roads', { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const rawList = normalizeClosuresPayload(data);
      const closures = rawList.map(normalizeOne);
      setRoadClosures(closures);
      
      const now = new Date();
      const activeCount = closures.filter(c => isClosureActive(c, now).active).length;
      
      if (closures.length === 0) {
        setClosureLoadState('No closures reported. Your bot can add entries to roads.json.');
      } else {
        setClosureLoadState(`${activeCount}/${closures.length} closure(s) currently active — routes avoid active ones.`);
      }
      
      if (map && closureOverlaysRef.current) {
        closureOverlaysRef.current.clearLayers();
        for (let i = 0; i < closures.length; i++) {
          const c = closures[i];
          const { active } = isClosureActive(c, now);
          
          // Different styling for active vs scheduled closures
          const strokeColor = active ? '#dc2626' : '#9ca3af';
          const fillColor = active ? '#ef4444' : '#d1d5db';
          const fillOpacity = active ? 0.3 : 0.15;
          const weight = active ? 3 : 2;
          const opacity = active ? 1 : 0.6;
          
          const timeInfo = formatClosureTime(c);
          const statusLabel = active ? 'ACTIVE' : 'SCHEDULED';
          
          if (c.center) {
            const circle = window.L.circle([c.center.lat, c.center.lng], {
              radius: c.radiusMeters,
              color: strokeColor,
              weight,
              fillColor,
              fillOpacity
            });
            circle.bindPopup(
              `<strong>${escapeHtml(c.road)}</strong><br>` +
              `<span style="color: ${active ? '#dc2626' : '#6b7280'}; font-weight: bold;">${statusLabel}</span><br>` +
              `${escapeHtml(c.reason)}<br>` +
              `<small>${escapeHtml(timeInfo)}</small>`
            );
            circle.addTo(closureOverlaysRef.current);
            circle.bringToFront();
          } else if ((c.polylineLatLngs && c.polylineLatLngs.length >= 2) || (c.coordinates && c.coordinates.length >= 2)) {
            const polylineCoords = c.coordinates || c.polylineLatLngs;
            const polyline = window.L.polyline(polylineCoords, {
              color: strokeColor,
              weight: active ? 5 : 3,
              opacity
            });
            polyline.bindPopup(
              `<strong>${escapeHtml(c.road)}</strong><br>` +
              `<span style="color: ${active ? '#dc2626' : '#6b7280'}; font-weight: bold;">${statusLabel}</span><br>` +
              `${escapeHtml(c.reason)}<br>` +
              `<small>${escapeHtml(timeInfo)}</small>`
            );
            polyline.addTo(closureOverlaysRef.current);
            polyline.bringToFront();
          }
        }
      }
    } catch (e) {
      // Add time-based sample closures for demonstration
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const sampleClosures = [
        {
          id: 'sample-1',
          location_name: 'Bole Road (ACTIVE)',
          reason: 'Construction work',
          coordinates: [[9.02, 38.75], [9.021, 38.751]],
          status: 'active',
          start_time: yesterday.toISOString(),
          end_time: tomorrow.toISOString()
        },
        {
          id: 'sample-2',
          location_name: 'Congo Street (SCHEDULED)',
          reason: 'Road maintenance',
          coordinates: [
            [9.03, 38.73],
            [9.04, 38.74],
            [9.035, 38.75]
          ],
          status: 'scheduled',
          start_time: tomorrow.toISOString(),
          end_time: new Date(tomorrow.getTime() + 48 * 60 * 60 * 1000).toISOString()
        }
      ];
      setRoadClosures(sampleClosures);
      
      const activeCount = sampleClosures.filter(c => isClosureActive(c, now).active).length;
      setClosureLoadState(`Showing sample closures (${activeCount}/${sampleClosures.length} active). Start backend server for real data.`);
      
      if (map && closureOverlaysRef.current) {
        closureOverlaysRef.current.clearLayers();
        for (let i = 0; i < sampleClosures.length; i++) {
          const c = sampleClosures[i];
          const { active } = isClosureActive(c, now);
          
          const strokeColor = active ? '#dc2626' : '#9ca3af';
          const fillColor = active ? '#ef4444' : '#d1d5db';
          const fillOpacity = active ? 0.3 : 0.15;
          const weight = active ? 3 : 2;
          const opacity = active ? 1 : 0.6;
          
          const timeInfo = formatClosureTime(c);
          const statusLabel = active ? 'ACTIVE' : 'SCHEDULED';
          
          if (c.center) {
            const circle = window.L.circle([c.center.lat, c.center.lng], {
              radius: c.radiusMeters,
              color: strokeColor,
              weight,
              fillColor,
              fillOpacity
            });
            circle.bindPopup(
              `<strong>${escapeHtml(c.road)}</strong><br>` +
              `<span style="color: ${active ? '#dc2626' : '#6b7280'}; font-weight: bold;">${statusLabel}</span><br>` +
              `${escapeHtml(c.reason)}<br>` +
              `<small>${escapeHtml(timeInfo)}</small>`
            );
            circle.addTo(closureOverlaysRef.current);
            circle.bringToFront();
          } else if ((c.polylineLatLngs && c.polylineLatLngs.length >= 2) || (c.coordinates && c.coordinates.length >= 2)) {
            const polylineCoords = c.coordinates || c.polylineLatLngs;
            const polyline = window.L.polyline(polylineCoords, {
              color: strokeColor,
              weight: active ? 5 : 3,
              opacity
            });
            polyline.bindPopup(
              `<strong>${escapeHtml(c.road)}</strong><br>` +
              `<span style="color: ${active ? '#dc2626' : '#6b7280'}; font-weight: bold;">${statusLabel}</span><br>` +
              `${escapeHtml(c.reason)}<br>` +
              `<small>${escapeHtml(timeInfo)}</small>`
            );
            polyline.addTo(closureOverlaysRef.current);
            polyline.bringToFront();
          }
        }
      }
      console.error(e);
    }
  }, [map]);

  const handleMapClick = useCallback((e) => {
    const { lat, lng } = e.latlng;
    if (!startPoint) {
      setStartPointInternal(lat, lng, `Pinned: ${formatPoint([lat, lng])}`);
      updateStatus();
      drawRouteLine();
      return;
    }
    if (!endPoint) {
      setEndPointInternal(lat, lng, `Pinned: ${formatPoint([lat, lng])}`);
      updateStatus();
      drawRouteLine();
      return;
    }
    setStartPointInternal(lat, lng, `Pinned: ${formatPoint([lat, lng])}`);
    setEndPoint(null);
    if (endMarkerRef.current) {
      map.removeLayer(endMarkerRef.current);
      endMarkerRef.current = null;
    }
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }
    setRouteSummary(null);
    clearRouteAdvice();
    updateStatus();
    updateTimeEstimate();
  }, [startPoint, endPoint, map, setStartPointInternal, setEndPointInternal, updateStatus, drawRouteLine, clearRouteAdvice, updateTimeEstimate]);

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('Geolocation is not supported in this browser.');
      return;
    }
    setStatus('Fetching your current location...');
    navigator.geolocation.getCurrentPosition(
      function (position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setStartPointInternal(lat, lng, 'Current location');
        map.setView([lat, lng], 14);
        updateStatus();
        drawRouteLine();
      },
      function () {
        setStatus('Location access was denied. You can still type the start point.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [map, setStartPointInternal, updateStatus, drawRouteLine]);

  const resetRoute = useCallback(() => {
    if (startMarkerRef.current) {
      map.removeLayer(startMarkerRef.current);
    }
    if (endMarkerRef.current) {
      map.removeLayer(endMarkerRef.current);
    }
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
    }
    setStartPoint(null);
    setEndPoint(null);
    startMarkerRef.current = null;
    endMarkerRef.current = null;
    routeLineRef.current = null;
    setRouteSummary(null);
    setIsRouting(false);
    clearRouteAdvice();
    updateStatus();
    updateTimeEstimate();
  }, [map, clearRouteAdvice, updateStatus, updateTimeEstimate]);

  /* eslint-disable */
  useEffect(() => {
    if (map) {
      loadRoadClosures();
    }
  }, [map]);
  /* eslint-enable */

  // Live update mechanism: poll for closures every 30 seconds
  useEffect(() => {
    if (!map) return;
    
    const POLL_INTERVAL = 30000; // 30 seconds
    const intervalId = setInterval(() => {
      loadRoadClosures();
    }, POLL_INTERVAL);
    
    return () => clearInterval(intervalId);
  }, [map, loadRoadClosures]);

  return {
    startPoint,
    endPoint,
    status,
    timeEstimate,
    routeAdvice,
    closureLoadState,
    roadClosures,
    isRouting,
    handleMapClick,
    useCurrentLocation,
    resetRoute,
    setStartPoint: setStartPointInternal,
    setEndPoint: setEndPointInternal,
    drawRouteLine,
    isClosureActive,
    formatClosureTime,
  };
}
