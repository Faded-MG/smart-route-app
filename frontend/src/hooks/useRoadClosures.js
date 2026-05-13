import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { filterActiveClosures, isClosureActive, normalizeClosuresPayload, normalizeOne } from '../mapUtils'

export function useRoadClosures() {
  const [closures, setClosures] = useState([])
  const [statusText, setStatusText] = useState('Loading road intelligence…')
  const lastUpdatedRef = useRef(null)

  const fetchClosures = useCallback(async () => {
    setStatusText('Syncing live road closure intelligence…')

    try {
      const res = await fetch('/roads', { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      const rawList = normalizeClosuresPayload(data)
      const list = rawList.map(normalizeOne)
      setClosures(list)
      lastUpdatedRef.current = new Date()
    } catch {
      // Demo fallback so the UI remains hackathon-demo ready without a backend.
      const now = new Date()
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const sample = [
        {
          id: 'sample-1',
          location_name: 'Bole Road (ACTIVE)',
          road: 'Bole Road',
          reason: 'Construction work and lane closures',
          coordinates: [
            [9.02, 38.75],
            [9.021, 38.751],
          ],
          delayImpactMinutes: 18,
          start_time: yesterday.toISOString(),
          end_time: tomorrow.toISOString(),
          status: 'active',
        },
        {
          id: 'sample-2',
          location_name: 'Congo Street (SCHEDULED)',
          road: 'Congo Street',
          reason: 'Road maintenance',
          coordinates: [
            [9.03, 38.73],
            [9.04, 38.74],
            [9.035, 38.75],
          ],
          delayImpactMinutes: 10,
          start_time: tomorrow.toISOString(),
          end_time: new Date(tomorrow.getTime() + 48 * 60 * 60 * 1000).toISOString(),
          status: 'scheduled',
        },
        {
          id: 'sample-3',
          location_name: 'Meskel Square Loop (ACTIVE)',
          road: 'Meskel Square Loop',
          reason: 'Event traffic management',
          center: { lat: 9.0222, lng: 38.7487 },
          radiusMeters: 220,
          delayImpactMinutes: 24,
          start_time: yesterday.toISOString(),
          end_time: new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString(),
          status: 'active',
        },
      ]

      setClosures(sample.map(normalizeOne))
      lastUpdatedRef.current = new Date()
    }
  }, [])

  useEffect(() => {
    fetchClosures()
    const id = setInterval(fetchClosures, 30000)
    return () => clearInterval(id)
  }, [fetchClosures])

  const activeClosures = useMemo(() => {
    const now = new Date()
    return filterActiveClosures(closures, now)
  }, [closures])

  useEffect(() => {
    const activeCount = activeClosures.length
    const total = closures.length
    if (total === 0) {
      setStatusText('No closure data yet. Map + AI will still demo with sample intel.')
      return
    }
    setStatusText(
      `${activeCount}/${total} closure(s) active — route engine avoids the closed segments.`
    )
  }, [activeClosures, closures])

  const getNextReopenEstimate = useCallback(() => {
    const now = new Date()
    const scheduled = closures
      .filter((c) => !isClosureActive(c, now).active)
      .map((c) => (c.endTime ? new Date(c.endTime).getTime() : null))
      .filter((t) => t && t > now.getTime())

    if (scheduled.length === 0) return null
    scheduled.sort((a, b) => a - b)
    return new Date(scheduled[0])
  }, [closures])

  const nextReopen = getNextReopenEstimate()

  return {
    closures,
    activeClosures,
    statusText,
    nextReopen,
    lastUpdated: lastUpdatedRef.current,
    refresh: fetchClosures,
  }
}

