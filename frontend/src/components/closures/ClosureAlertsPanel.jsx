import GlassCard from '../ui/GlassCard'

function formatCompact(d) {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ClosureAlertsPanel({ statusText, activeClosures, nextReopen, isRouting }) {
  return (
    <GlassCard className="card card--glass">
      <div className="card__headRow">
        <div className="card__headRowLeft">
          <span className="card__icon card__icon--danger" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 9v4m0 4h.01M10.3 3.3 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <div className="card__kicker">ROAD CLOSURE ALERTS</div>
            <div className="card__title">Live visibility</div>
          </div>
        </div>
      </div>

      <div className="closureStatus">
        {isRouting ? <span className="skeletonBox" /> : statusText}
      </div>

      <div className="divider divider--thin" />

      <div className="closureList">
        {(activeClosures || []).slice(0, 6).map((c) => {
          const start = c.startTime ? formatCompact(c.startTime) : null
          const end = c.endTime ? formatCompact(c.endTime) : null
          const delayMin =
            typeof c.delayImpactMinutes === 'number'
              ? c.delayImpactMinutes
              : typeof c.delayMinutes === 'number'
                ? c.delayMinutes
                : 12
          return (
            <div key={c.id || c.road} className="closureRow">
              <div className="closureRow__left">
                <div className="closureRow__road">{c.road}</div>
                <div className="closureRow__reason">{c.reason}</div>
                <div className="closureRow__time">
                  {start && end ? `${start} → ${end}` : end ? `Until ${end}` : 'Active now'}
                </div>
              </div>
              <div className="closureRow__right">
                <span className="badge badge--danger">Closed</span>
                <div className="closureRow__delay">+{delayMin} min</div>
              </div>
            </div>
          )
        })}

        {(activeClosures || []).length === 0 && (
          <div className="emptyState">
            No active closures detected. Hover the map to explore.
          </div>
        )}
      </div>

      {nextReopen && (
        <div className="closureNext">
          Next reopening: <strong>{formatCompact(nextReopen)}</strong>
        </div>
      )}
    </GlassCard>
  )
}

