import GlassCard from '../ui/GlassCard'

function formatDistanceKm(km) {
  if (!Number.isFinite(km)) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

export default function RouteInfoCard({ smartMeta, selectedRoute, isRouting }) {
  const closureHits = selectedRoute?.conflicts?.length ?? 0

  return (
    <GlassCard className="card card--glass">
      <div className="card__headRow">
        <div className="card__headRowLeft">
          <span className="card__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 12h7l2-7 2 14 2-7h5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <div className="card__kicker">ROUTE INFORMATION</div>
            <div className="card__title">Trip preview</div>
          </div>
        </div>
      </div>

      <div className="infoGrid">
        <div className="infoCell">
          <div className="infoCell__label">Distance</div>
          <div className="infoCell__value">
            {isRouting ? <span className="skeletonBox" /> : smartMeta ? formatDistanceKm(smartMeta.distanceKm) : '—'}
          </div>
        </div>
        <div className="infoCell">
          <div className="infoCell__label">ETA</div>
          <div className="infoCell__value">
            {isRouting ? <span className="skeletonBox" /> : smartMeta ? smartMeta.etaText : '—'}
          </div>
        </div>
        <div className="infoCell">
          <div className="infoCell__label">Closure hits</div>
          <div className="infoCell__value">
            {isRouting ? <span className="skeletonBox" /> : closureHits === 0 ? <span className="goodText">0</span> : <span className="warnText">{closureHits}</span>}
          </div>
        </div>
      </div>

      {selectedRoute && selectedRoute.conflicts.length > 0 && !isRouting && (
        <div className="conflictChips">
          {selectedRoute.conflicts.slice(0, 3).map((c) => (
            <span key={c.id || c.road} className="chip chip--danger">
              {c.road}
            </span>
          ))}
          {selectedRoute.conflicts.length > 3 && <span className="chip chip--neutral">+{selectedRoute.conflicts.length - 3} more</span>}
        </div>
      )}
    </GlassCard>
  )
}

