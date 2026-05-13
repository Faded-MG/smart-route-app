import GlassCard from '../ui/GlassCard'

function SparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l1.2 4.3L18 8l-4.8 1.7L12 14l-1.2-4.3L6 8l4.8-1.7L12 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M19 14l.7 2.5L22 17l-2.3.5L19 20l-.7-2.5L16 17l2.3-.5L19 14Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ConfidenceRing({ value }) {
  const pct = Math.round(value * 100)
  const radius = 18
  const c = 2 * Math.PI * radius
  const dash = (pct / 100) * c
  return (
    <svg className="confRing" width="44" height="44" viewBox="0 0 44 44" aria-label={`Confidence ${pct}%`}>
      <circle cx="22" cy="22" r={radius} stroke="rgba(255,255,255,0.12)" strokeWidth="6" fill="none" />
      <circle
        cx="22"
        cy="22"
        r={radius}
        stroke="#1e6bff"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="25" textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.92)" fontFamily="inherit">
        {pct}%
      </text>
    </svg>
  )
}

export default function BestSmartRouteCard({ smartMeta, isRouting }) {
  return (
    <GlassCard className="card card--glow card--best">
      <div className="card__head">
        <div className="card__titleRow">
          <span className="card__icon" aria-hidden="true">
            <SparkIcon />
          </span>
          <div>
            <div className="card__kicker">AI SMART ROUTING</div>
            <div className="card__title">Best Smart Route</div>
          </div>
        </div>
        {smartMeta && <ConfidenceRing value={smartMeta.confidence} />}
      </div>

      <div className="card__grid">
        <div className="stat">
          <div className="stat__label">Estimated time</div>
          <div className="stat__value">{smartMeta ? smartMeta.etaText : '—'}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Delay saved</div>
          <div className="stat__value">
            {smartMeta ? `+${Math.round(smartMeta.delaySavedMinutes)} min` : '—'}
          </div>
        </div>
      </div>

      <div className="card__reason" aria-live="polite">
        {isRouting ? (
          <div className="skeletonLine" />
        ) : smartMeta ? (
          smartMeta.reason
        ) : (
          'Choose a start + destination to unlock the AI recommendation.'
        )}
      </div>

      {smartMeta && (
        <div className="card__chips">
          <span className={`chip chip--blue`}>Avoids closures</span>
          <span className={`chip chip--neutral`}>{smartMeta.activeClosuresCount} active closure(s)</span>
        </div>
      )}
    </GlassCard>
  )
}

