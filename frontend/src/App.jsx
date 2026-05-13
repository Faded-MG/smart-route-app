import { useEffect, useMemo, useState } from 'react'
import { fetchPlaces } from './mapUtils'
import { useRoadClosures } from './hooks/useRoadClosures'
import { useSmartRouting } from './hooks/useSmartRouting'
import SmartRoutingMap from './components/map/SmartRoutingMap'
import RouteControlPanel from './components/route/RouteControlPanel'
import BestSmartRouteCard from './components/recommendation/BestSmartRouteCard'
import AlternativeRoutesList from './components/recommendation/AlternativeRoutesList'
import AIInsightsCard from './components/recommendation/AIInsightsCard'
import RouteInfoCard from './components/recommendation/RouteInfoCard'
import ClosureAlertsPanel from './components/closures/ClosureAlertsPanel'

import './styles/smartRouting.css'

function pinnedLabel(lat, lng) {
  return `Pinned: ${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

export default function App() {
  const [startQuery, setStartQuery] = useState('')
  const [destinationQuery, setDestinationQuery] = useState('')
  const [startSuggestions, setStartSuggestions] = useState([])
  const [destinationSuggestions, setDestinationSuggestions] = useState([])

  const [startPoint, setStartPoint] = useState(null) // [lat, lng]
  const [endPoint, setEndPoint] = useState(null) // [lat, lng]

  const { closures, activeClosures, statusText, nextReopen } = useRoadClosures()
  const { isRouting, error, alternatives, selectedRouteId, selectedRoute, smartMeta, computeSmartRoute, selectRoute, clear } =
    useSmartRouting()

  const statusHint = useMemo(() => {
    if (!startPoint) return 'Tap the map or search a start point'
    if (!endPoint) return 'Now drop the destination (tap map or search)'
    return 'Ready — press Search smart route'
  }, [startPoint, endPoint])

  // Autocomplete
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (startQuery.trim().length < 3) {
        setStartSuggestions([])
        return
      }
      try {
        const places = await fetchPlaces(startQuery)
        setStartSuggestions(places)
      } catch {
        setStartSuggestions([])
      }
    }, 280)
    return () => clearTimeout(timer)
  }, [startQuery])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (destinationQuery.trim().length < 3) {
        setDestinationSuggestions([])
        return
      }
      try {
        const places = await fetchPlaces(destinationQuery)
        setDestinationSuggestions(places)
      } catch {
        setDestinationSuggestions([])
      }
    }, 280)
    return () => clearTimeout(timer)
  }, [destinationQuery])

  const handlePickPoint = ({ lat, lng }) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') return

    // If both are set, start a new trip.
    if (startPoint && endPoint) {
      setEndPoint(null)
      clear()
      setStartPoint([lat, lng])
      setStartQuery(pinnedLabel(lat, lng))
      setDestinationQuery('')
      setDestinationSuggestions([])
      return
    }

    if (!startPoint) {
      setStartPoint([lat, lng])
      setStartQuery(pinnedLabel(lat, lng))
      setStartSuggestions([])
      clear()
      return
    }

    if (!endPoint) {
      setEndPoint([lat, lng])
      setDestinationQuery(pinnedLabel(lat, lng))
      setDestinationSuggestions([])
      clear()
    }
  }

  const canSearch = Boolean(startPoint && endPoint)

  const handleSelectStart = (place) => {
    const lat = Number(place?.lat)
    const lon = Number(place?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    setStartPoint([lat, lon])
    setStartQuery(place.display_name || 'Start')
    setStartSuggestions([])
    clear()
  }

  const handleSelectDestination = (place) => {
    const lat = Number(place?.lat)
    const lon = Number(place?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    setEndPoint([lat, lon])
    setDestinationQuery(place.display_name || 'Destination')
    setDestinationSuggestions([])
    clear()
  }

  const handleReset = () => {
    setStartPoint(null)
    setEndPoint(null)
    setStartQuery('')
    setDestinationQuery('')
    setStartSuggestions([])
    setDestinationSuggestions([])
    clear()
  }

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setStartPoint([lat, lng])
        setStartQuery('Current location')
        setStartSuggestions([])
        clear()
      },
      () => {
        // Keep it silent but UX-safe; the app still works without geolocation.
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleSearch = () => {
    if (!startPoint || !endPoint) return
    computeSmartRoute({ startPoint, endPoint, closures })
  }

  return (
    <div className="smartApp">
      <header className="smartTopBar">
        <div className="smartTopBar__left">
          <div className="smartLogo" aria-hidden="true">
            <span className="smartLogo__dot" />
          </div>
          <div>
            <div className="smartTopBar__title">SmartRoute AI</div>
            <div className="smartTopBar__sub">Traffic intelligence for every detour</div>
          </div>
        </div>

        <div className="smartTopBar__right">
          <div className={`liveChip ${activeClosures.length ? 'liveChip--danger' : ''}`}>
            <span className="liveChip__pulse" aria-hidden="true" />
            {activeClosures.length ? `${activeClosures.length} active closures` : 'No active closures'}
          </div>
        </div>
      </header>

      <div className="smartLayout">
        <aside className="smartSidebar">
          <div className="smartSidebar__scroll">
            <RouteControlPanel
              startQuery={startQuery}
              destinationQuery={destinationQuery}
              onStartQueryChange={setStartQuery}
              onDestinationQueryChange={setDestinationQuery}
              startSuggestions={startSuggestions}
              destinationSuggestions={destinationSuggestions}
              onSelectStart={handleSelectStart}
              onSelectDestination={handleSelectDestination}
              onCurrentLocation={handleCurrentLocation}
              onReset={handleReset}
              onSearch={handleSearch}
              canSearch={canSearch}
              isRouting={isRouting}
              statusHint={statusHint}
              startPoint={startPoint}
              endPoint={endPoint}
            />

            <div className="smartStack">
              <BestSmartRouteCard smartMeta={smartMeta} isRouting={isRouting} />
              <AlternativeRoutesList
                alternatives={alternatives}
                selectedRouteId={selectedRouteId}
                onSelect={(id) => selectRoute(id)}
              />
              <AIInsightsCard closures={activeClosures} smartMeta={smartMeta} isRouting={isRouting} />
              <ClosureAlertsPanel statusText={statusText} activeClosures={activeClosures} nextReopen={nextReopen} isRouting={isRouting} />
              <RouteInfoCard smartMeta={smartMeta} selectedRoute={selectedRoute} isRouting={isRouting} />

              {error && <div className="smartError">{error}</div>}
            </div>
          </div>
        </aside>

        <main className="smartMain">
          <SmartRoutingMap
            startPoint={startPoint}
            endPoint={endPoint}
            onPickPoint={handlePickPoint}
            roadClosures={closures}
            routes={alternatives}
            selectedRouteId={selectedRouteId}
            isRouting={isRouting}
          />
        </main>
      </div>
    </div>
  )
}