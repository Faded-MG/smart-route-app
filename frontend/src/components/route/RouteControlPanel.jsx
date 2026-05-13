import Button from '../ui/Button'
import GlassCard from '../ui/GlassCard'
import SmartLocationInput from './SmartLocationInput'

function CrosshairIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 11.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12a9 9 0 0 1-15.3 6.4M3 12a9 9 0 0 1 15.3-6.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M3 18v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 6v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M21 21l-4.2-4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function RouteControlPanel({
  startQuery,
  destinationQuery,
  onStartQueryChange,
  onDestinationQueryChange,
  startSuggestions,
  destinationSuggestions,
  onSelectStart,
  onSelectDestination,
  onCurrentLocation,
  onReset,
  onSearch,
  canSearch,
  isRouting,
  statusHint,
  startPoint,
  endPoint,
}) {
  return (
    <GlassCard className="card card--hero">
      <div className="heroTop">
        <div className="heroBrand">
          <div className="heroMark" aria-hidden="true">
            <CrosshairIcon />
          </div>
          <div>
            <div className="heroKicker">SMART ROUTE RECOMMENDATION</div>
            <div className="heroTitle">Choose your trip</div>
          </div>
        </div>
        <div className="heroHint">{statusHint}</div>
      </div>

      <div className="formGrid">
        <SmartLocationInput
          label="Start location"
          query={startQuery}
          value={startPoint ? `${startPoint[0].toFixed(4)}, ${startPoint[1].toFixed(4)}` : ''}
          onQueryChange={onStartQueryChange}
          suggestions={startSuggestions}
          placeholder="Search starting point"
          onSelectSuggestion={onSelectStart}
        />

        <SmartLocationInput
          label="Destination"
          query={destinationQuery}
          value={endPoint ? `${endPoint[0].toFixed(4)}, ${endPoint[1].toFixed(4)}` : ''}
          onQueryChange={onDestinationQueryChange}
          suggestions={destinationSuggestions}
          placeholder="Search destination"
          onSelectSuggestion={onSelectDestination}
        />
      </div>

      <div className="controlRow">
        <Button
          variant="ghost"
          size="md"
          onClick={onCurrentLocation}
          disabled={isRouting}
          className="controlBtn"
          type="button"
        >
          <span className="btnIcon" aria-hidden="true">
            <LocationIcon />
          </span>
          Current location
        </Button>
        <Button
          variant="ghost"
          size="md"
          onClick={onReset}
          disabled={isRouting}
          className="controlBtn"
          type="button"
        >
          <span className="btnIcon" aria-hidden="true">
            <RefreshIcon />
          </span>
          Reset
        </Button>

        <Button
          variant="primary"
          size="md"
          onClick={onSearch}
          disabled={!canSearch || isRouting}
          className="controlBtn controlBtn--search"
          type="button"
        >
          <span className="btnIcon" aria-hidden="true">
            <SearchIcon />
          </span>
          {isRouting ? 'Routing…' : 'Search smart route'}
        </Button>
      </div>
    </GlassCard>
  )
}

