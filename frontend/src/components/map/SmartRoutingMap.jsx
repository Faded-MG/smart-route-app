import { useEffect, useMemo, useRef, useState } from 'react'
import { L } from '../../leafletSetup'
import { isClosureActive } from '../../mapUtils'
import { OPEN_ROADS } from '../../roadNetwork'

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function formatTimeCompact(d) {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function closureTooltipModel(closure) {
  const now = new Date()
  const active = isClosureActive(closure, now)
  const start = closure.startTime ? new Date(closure.startTime) : null
  const end = closure.endTime ? new Date(closure.endTime) : null
  const delayMin =
    typeof closure.delayImpactMinutes === 'number'
      ? closure.delayImpactMinutes
      : typeof closure.delayMinutes === 'number'
        ? closure.delayMinutes
        : 12

  const activeWindow =
    active.status === 'always'
      ? 'Active: ongoing'
      : start && end
        ? `Active: ${formatTimeCompact(start)} → ${formatTimeCompact(end)}`
        : start
          ? `Active since: ${formatTimeCompact(start)}`
          : end
            ? `Active until: ${formatTimeCompact(end)}`
            : 'Active: ongoing'

  const reopen =
    end && Number.isFinite(end.getTime())
      ? `Reopens: ${formatTimeCompact(end)}`
      : 'Reopens: —'

  return {
    title: closure.road || closure.location_name || 'Closed road',
    reason: closure.reason || 'Closure reason not provided',
    activeWindow,
    reopen,
    delayMin,
  }
}

/**
 * Visual map layer:
 * - open roads: green
 * - active closures: red (hover tooltip)
 * - selected route: blue (animated draw)
 */
export default function SmartRoutingMap({
  startPoint,
  endPoint,
  onPickPoint,
  roadClosures,
  routes,
  selectedRouteId,
  isRouting,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const openRoadsLayerRef = useRef(null)
  const closuresLayerRef = useRef(null)
  const routesLayerRef = useRef(null)

  const onPickPointRef = useRef(onPickPoint)
  useEffect(() => {
    onPickPointRef.current = onPickPoint
  }, [onPickPoint])

  const tooltipRafRef = useRef(0)
  const [tooltip, setTooltip] = useState(null) // { x, y, closure }

  const activeClosures = useMemo(() => {
    const now = new Date()
    if (!Array.isArray(roadClosures)) return []
    return roadClosures.filter((c) => isClosureActive(c, now).active)
  }, [roadClosures])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Base map
    const map = L.map(containerRef.current, {
      zoomControl: true,
      // Animated route drawing relies on SVG path access (_path + getTotalLength).
      preferCanvas: false,
    }).setView([9.03, 38.74], 13)

    mapRef.current = map

    // Light "Google Maps-like" base tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(map)

    // Stacking order
    map.createPane('openRoads')
    map.getPane('openRoads').style.zIndex = 200
    map.createPane('closures')
    map.getPane('closures').style.zIndex = 300
    map.createPane('routes')
    map.getPane('routes').style.zIndex = 400

    // Open roads
    const openLayer = L.layerGroup([], { pane: 'openRoads' }).addTo(map)
    openRoadsLayerRef.current = openLayer
    OPEN_ROADS.forEach((r) => {
      L.polyline(r.coords, {
        color: '#22c55e',
        weight: 4,
        opacity: 0.55,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: '0',
      }).addTo(openLayer)
    })

    // Closures & routes layers
    closuresLayerRef.current = L.layerGroup([], { pane: 'closures' }).addTo(map)
    routesLayerRef.current = L.layerGroup([], { pane: 'routes' }).addTo(map)

    const handleClick = (e) => {
      const { lat, lng } = e.latlng || {}
      if (typeof lat !== 'number' || typeof lng !== 'number') return
      onPickPointRef.current?.({ lat, lng })
    }

    map.on('click', handleClick)

    return () => {
      map.off('click', handleClick)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startMarkerRef = useRef(null)
  const endMarkerRef = useRef(null)

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (startMarkerRef.current) map.removeLayer(startMarkerRef.current)
    if (endMarkerRef.current) map.removeLayer(endMarkerRef.current)

    if (startPoint && typeof startPoint[0] === 'number') {
      const [lat, lng] = startPoint
      startMarkerRef.current = L.marker([lat, lng], {
        title: 'Start',
        icon: L.divIcon({
          className: 'smart-route-marker smart-route-marker--start',
          html: `<div class="smart-route-marker__dot"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      }).addTo(map)
    }

    if (endPoint && typeof endPoint[0] === 'number') {
      const [lat, lng] = endPoint
      endMarkerRef.current = L.marker([lat, lng], {
        title: 'Destination',
        icon: L.divIcon({
          className: 'smart-route-marker smart-route-marker--end',
          html: `<div class="smart-route-marker__dot"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      }).addTo(map)
    }
  }, [startPoint, endPoint])

  // Draw closures (active only)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !closuresLayerRef.current) return

    closuresLayerRef.current.clearLayers()

    activeClosures.forEach((c) => {
      const tooltipModel = closureTooltipModel(c)
      const common = {
        pane: 'closures',
      }

      if (c.center && typeof c.center.lat === 'number' && typeof c.center.lng === 'number') {
        const circle = L.circle([c.center.lat, c.center.lng], {
          ...common,
          radius: c.radiusMeters || 180,
          color: '#ef4444',
          weight: 3,
          opacity: 0.95,
          fillColor: '#ef4444',
          fillOpacity: 0.25,
        }).addTo(closuresLayerRef.current)

        const onEnter = (e) => {
          const pt = map.latLngToContainerPoint(e.latlng)
          setTooltip({
            x: pt.x,
            y: pt.y,
            closure: tooltipModel,
          })
        }

        const onMove = (e) => {
          if (tooltipRafRef.current) cancelAnimationFrame(tooltipRafRef.current)
          tooltipRafRef.current = requestAnimationFrame(() => {
            const pt = map.latLngToContainerPoint(e.latlng)
            setTooltip((prev) => (prev ? { ...prev, x: pt.x, y: pt.y } : prev))
          })
        }

        circle.on('mouseover', onEnter)
        circle.on('mousemove', onMove)
        circle.on('mouseout', () => setTooltip(null))
      } else {
        const coords = c.polylineLatLngs || c.coordinates || []
        if (!Array.isArray(coords) || coords.length < 2) return

        const poly = L.polyline(coords, {
          ...common,
          color: '#ef4444',
          weight: 4,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(closuresLayerRef.current)

        const onEnter = (e) => {
          const pt = map.latLngToContainerPoint(e.latlng)
          setTooltip({
            x: pt.x,
            y: pt.y,
            closure: tooltipModel,
          })
        }

        const onMove = (e) => {
          if (tooltipRafRef.current) cancelAnimationFrame(tooltipRafRef.current)
          tooltipRafRef.current = requestAnimationFrame(() => {
            const pt = map.latLngToContainerPoint(e.latlng)
            setTooltip((prev) => (prev ? { ...prev, x: pt.x, y: pt.y } : prev))
          })
        }

        poly.on('mouseover', onEnter)
        poly.on('mousemove', onMove)
        poly.on('mouseout', () => setTooltip(null))
      }
    })
  }, [activeClosures])

  // Draw route layers
  const lastSelectedRouteIdRef = useRef(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !routesLayerRef.current) return

    // Remove all route polylines but keep markers (which live in separate layer via addTo(map)).
    // We rely on the fact that markers are separate L.Marker instances.
    routesLayerRef.current.clearLayers()

    if (!Array.isArray(routes) || routes.length === 0) return

    const selected = routes.find((r) => r.id === selectedRouteId) || routes[0]
    const selectedChanged = lastSelectedRouteIdRef.current !== selected?.id
    lastSelectedRouteIdRef.current = selected?.id

    routes.forEach((r) => {
      const isSelected = r.id === selected?.id
      if (!isSelected) {
        if (!r.latLngs || r.latLngs.length < 2) return
        L.polyline(r.latLngs, {
          color: 'rgba(59,130,246,0.28)',
          weight: 4,
          opacity: 1,
          dashArray: '8 8',
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(routesLayerRef.current)
        return
      }

      if (!r.latLngs || r.latLngs.length < 2) return

      const poly = L.polyline(r.latLngs, {
        color: '#1e6bff',
        weight: 7,
        opacity: 0.98,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routesLayerRef.current)

      if (isRouting) return

      if (selectedChanged) {
        // Animated route drawing using SVG stroke-dashoffset.
        requestAnimationFrame(() => {
          const path = poly._path
          if (!path || !path.getTotalLength) return
          const length = path.getTotalLength()
          path.style.strokeDasharray = `${length} ${length}`
          path.style.strokeDashoffset = `${length}`
          path.getBoundingClientRect()
          path.style.transition = 'stroke-dashoffset 1350ms cubic-bezier(.22,.61,.36,1)'
          path.style.strokeDashoffset = '0'
        })
      }

      // Fit bounds for selected route for “Google Maps” feel.
      try {
        map.fitBounds(poly.getBounds(), { padding: [56, 56], animate: true })
      } catch {
        // ignore
      }
    })
  }, [routes, selectedRouteId, isRouting])

  const tooltipStyle = useMemo(() => {
    if (!tooltip) return null
    // Clamp tooltip to avoid off-screen on small viewports.
    const mapEl = containerRef.current
    const rect = mapEl?.getBoundingClientRect()
    const w = rect?.width ?? 0
    const h = rect?.height ?? 0
    const x = clamp(tooltip.x, 20, w - 20)
    const y = clamp(tooltip.y, 20, h - 20)
    return { left: `${x}px`, top: `${y}px` }
  }, [tooltip])

  return (
    <div className="smart-map-root">
      <div ref={containerRef} className="smart-map-canvas" />
      <div
        className={`smart-map-tooltip ${tooltip?.closure ? 'isVisible' : ''}`}
        style={tooltipStyle || { left: '0px', top: '0px' }}
        aria-hidden={!tooltip?.closure}
      >
        {tooltip?.closure ? (
          <>
            <div className="smart-map-tooltip__title">{tooltip.closure.title}</div>
            <div className="smart-map-tooltip__reason">{tooltip.closure.reason}</div>
            <div className="smart-map-tooltip__meta">{tooltip.closure.activeWindow}</div>
            <div className="smart-map-tooltip__meta">{tooltip.closure.reopen}</div>
            <div className="smart-map-tooltip__delay">
              Est. delay: <strong>+{tooltip.closure.delayMin} min</strong>
            </div>
          </>
        ) : null}
      </div>

      {isRouting && (
        <div className="smart-map-loading">
          <div className="smart-map-loading__spinner" />
          <div className="smart-map-loading__text">Analyzing closures & traffic…</div>
        </div>
      )}
    </div>
  )
}

