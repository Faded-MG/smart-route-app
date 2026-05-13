import GlassCard from '../ui/GlassCard'

function InsightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2a7 7 0 0 0-7 7c0 4.5 3.5 7.5 7 13 3.5-5.5 7-8.5 7-13a7 7 0 0 0-7-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 11.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export default function AIInsightsCard({ closures, smartMeta, isRouting }) {
  const total = closures?.length ?? 0
  const active = closures?.filter((c) => {
    // Active detection is done in the map; we keep UI cheap here.
    return !!c.startTime || !!c.endTime || c.status === 'active' || c.status === 'always'
  }).length

  const activeLabel = smartMeta ? `${smartMeta.activeClosuresCount} closure(s)` : `${active} closure(s)`
  const delay = smartMeta ? Math.round(smartMeta.delaySavedMinutes) : null

  return (
    <GlassCard className="card card--glow">
      <div className="card__headRow">
        <div className="card__headRowLeft">
          <span className="card__icon" aria-hidden="true">
            <InsightIcon />
          </span>
          <div>
            <div className="card__kicker">AI INSIGHTS</div>
            <div className="card__title">Traffic intelligence</div>
          </div>
        </div>
      </div>

      <div className="insights">
        <div className="insight">
          <div className="insight__label">Live road closures</div>
          <div className="insight__value">
            {isRouting ? <span className="skeletonBox" /> : <strong>{activeLabel}</strong>}
          </div>
        </div>
        <div className="insight">
          <div className="insight__label">Estimated impact</div>
          <div className="insight__value">
            {isRouting ? (
              <span className="skeletonBox" />
            ) : smartMeta ? (
              delay > 0 ? (
                <span className="goodText">Saves ~{delay} min</span>
              ) : (
                <span className="neutralText">ETA remains competitive</span>
              )
            ) : (
              <span className="neutralText">—</span>
            )}
          </div>
        </div>
        <div className="insight">
          <div className="insight__label">Recommendation logic</div>
          <div className="insight__value insight__value--muted">
            Minimizes closure exposure first, then optimizes OSRM ETA.
          </div>
        </div>
      </div>

      <div className="divider" />
      <div className="aiFootnote">
        {isRouting ? 'Analyzing closures and routing alternatives…' : smartMeta ? smartMeta.reason : 'Run smart routing to see why the AI chose this route.'}
      </div>
    </GlassCard>
  )
}

