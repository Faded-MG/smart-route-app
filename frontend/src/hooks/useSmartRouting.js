import { useCallback, useMemo, useState } from 'react'
import {
  countRouteConflicts,
  fetchRoute,
  formatMinutes,
  isClosureActive,
} from '../mapUtils'

function toLeafletLatLngs(coordinates) {
  if (!Array.isArray(coordinates)) return []
  // OSRM geojson: [lng, lat]
  return coordinates
    .map((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) return null
      const [lng, lat] = coord
      const la = Number(lat)
      const lo = Number(lng)
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
      return [la, lo]
    })
    .filter(Boolean)
}

function closureDelayMinutes(closure) {
  if (typeof closure.delayImpactMinutes === 'number') return closure.delayImpactMinutes
  if (typeof closure.delayMinutes === 'number') return closure.delayMinutes
  return 12
}

function makeReason({ baselineConflicts, bestConflicts, delaySavedMinutes }) {
  const avoided = baselineConflicts.map((c) => c.road).filter(Boolean)
  const stillHit = bestConflicts.map((c) => c.road).filter(Boolean)

  if (bestConflicts.length === 0 && avoided.length > 0 && delaySavedMinutes > 1) {
    const top = avoided.slice(0, 2).join(' and ')
    return `This route avoids ${top} congestion and saves about ${Math.round(delaySavedMinutes)} minutes.`
  }

  if (bestConflicts.length === 0) {
    return 'Best ETA option with zero active-closure exposure.'
  }

  if (stillHit.length > 0 && baselineConflicts.length > 0) {
    const reducedFrom = baselineConflicts.length
    const to = bestConflicts.length
    return `It reduces closure exposure from ${reducedFrom} to ${to} segments while keeping ETA competitive.`
  }

  return 'A smart blend of ETA and closure avoidance.'
}

function computeConfidence(bestScore, secondScore) {
  if (!Number.isFinite(bestScore) || !Number.isFinite(secondScore) || secondScore <= 0) return 0.72
  const gap = Math.max(0, secondScore - bestScore)
  const rel = gap / bestScore // 0..infinite
  const confidence = 0.62 + Math.min(0.32, rel * 0.18)
  return Math.max(0.45, Math.min(0.98, confidence))
}

export function useSmartRouting() {
  const [isRouting, setIsRouting] = useState(false)
  const [error, setError] = useState(null)

  const [alternatives, setAlternatives] = useState([]) // sorted by smart score
  const [selectedRouteId, setSelectedRouteId] = useState(null)

  const [smartMeta, setSmartMeta] = useState(null)

  const compute = useCallback(async ({ startPoint, endPoint, closures }) => {
    if (!startPoint || !endPoint) return

    setIsRouting(true)
    setError(null)
    setAlternatives([])
    setSelectedRouteId(null)
    setSmartMeta(null)

    try {
      const data = await fetchRoute(startPoint, endPoint)
      const routes = Array.isArray(data?.routes) ? data.routes : []
      if (routes.length === 0) throw new Error('No routes returned from OSRM.')

      const now = new Date()
      const activeClosures = Array.isArray(closures)
        ? closures.filter((c) => isClosureActive(c, now).active)
        : []

      const candidates = routes.map((r, idx) => {
        const latLngs = toLeafletLatLngs(r.geometry?.coordinates)
        const conflicts = countRouteConflicts(latLngs, activeClosures)

        const delayImpactMin = conflicts.reduce((sum, c) => sum + closureDelayMinutes(c), 0)

        // Smart score:
        // - base OSRM duration
        // - closure exposure penalty approximates “traffic intelligence” delay
        const closurePenaltySeconds = delayImpactMin * 60 * 0.85
        const scoreSeconds = r.duration + closurePenaltySeconds

        return {
          id: `alt-${idx}`,
          latLngs,
          distanceMeters: r.distance,
          durationSeconds: r.duration,
          rawDurationSeconds: r.duration,
          conflicts,
          delayImpactMin,
          scoreSeconds,
        }
      })

      // Baseline: fastest route without closure penalty.
      const baseline = [...candidates].sort((a, b) => a.durationSeconds - b.durationSeconds)[0]

      // Best: lowest smart score.
      const sorted = [...candidates].sort((a, b) => a.scoreSeconds - b.scoreSeconds)
      const best = sorted[0]
      const second = sorted[1]

      const delaySavedMinutes = (baseline.durationSeconds - best.durationSeconds) / 60
      const delaySavedClamped = Math.max(0, delaySavedMinutes)

      const confidence = computeConfidence(best.scoreSeconds, second?.scoreSeconds ?? best.scoreSeconds + 1)

      const reason = makeReason({
        baselineConflicts: baseline.conflicts,
        bestConflicts: best.conflicts,
        delaySavedMinutes: delaySavedClamped,
      })

      const bestDistanceKm = best.distanceMeters / 1000

      setAlternatives(sorted)
      setSelectedRouteId(best.id)
      setSmartMeta({
        bestRouteId: best.id,
        etaText: `${formatMinutes(best.durationSeconds / 60)}`,
        etaMinutes: best.durationSeconds / 60,
        distanceKm: bestDistanceKm,
        delaySavedMinutes: delaySavedClamped,
        confidence,
        reason,
        baselineEtaMinutes: baseline.durationSeconds / 60,
        activeClosuresCount: activeClosures.length,
      })
    } catch (e) {
      setError(e?.message || 'Could not compute smart routes.')
    } finally {
      setIsRouting(false)
    }
  }, [])

  const selectedRoute = useMemo(
    () => alternatives.find((r) => r.id === selectedRouteId) || null,
    [alternatives, selectedRouteId]
  )

  const selectRoute = useCallback((routeId) => {
    setSelectedRouteId(routeId)
  }, [])

  const clear = useCallback(() => {
    setIsRouting(false)
    setError(null)
    setAlternatives([])
    setSelectedRouteId(null)
    setSmartMeta(null)
  }, [])

  return {
    isRouting,
    error,
    alternatives,
    selectedRouteId,
    selectedRoute,
    smartMeta,
    computeSmartRoute: compute,
    selectRoute,
    clear,
  }
}

