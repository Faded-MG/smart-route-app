import GlassCard from '../ui/GlassCard'

function RouteMiniDot({ variant }) {
  const color =
    variant === 'primary' ? '#1e6bff' : variant === 'muted' ? 'rgba(255,255,255,0.28)' : '#93c5fd'
  return (
    <span
      className="routeMiniDot"
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: color,
        boxShadow: variant === 'primary' ? '0 0 0 6px rgba(30,107,255,0.18)' : 'none',
      }}
    />
  )
}

export default function AlternativeRoutesList({ alternatives, selectedRouteId, onSelect }) {
  if (!Array.isArray(alternatives) || alternatives.length === 0) return null

  const list = alternatives.slice(0, 3)
  return (
    <GlassCard className="card card--list">
      <div className="card__headRow">
        <div>
          <div className="card__kicker">SMART ALTERNATIVES</div>
          <div className="card__title">Top options</div>
        </div>
      </div>

      <div className="altList" role="list">
        {list.map((r, idx) => {
          const isSelected = r.id === selectedRouteId
          const minutes = Math.round(r.durationSeconds / 60)
          return (
            <button
              key={r.id}
              type="button"
              className={`altItem ${isSelected ? 'isSelected' : ''}`}
              onClick={() => onSelect?.(r.id)}
            >
              <div className="altItem__left">
                <RouteMiniDot variant={isSelected ? 'primary' : idx === 1 ? 'muted' : 'secondary'} />
                <div>
                  <div className="altItem__title">{isSelected ? 'Recommended preview' : `Alternative #${idx + 1}`}</div>
                  <div className="altItem__meta">
                    ETA ~{minutes} min • {r.conflicts.length} closure hit(s)
                  </div>
                </div>
              </div>

              <div className="altItem__right">
                <span className={`badge ${r.conflicts.length === 0 ? 'badge--good' : 'badge--warn'}`}>
                  {r.conflicts.length === 0 ? 'Clear' : 'Adjusted'}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </GlassCard>
  )
}

