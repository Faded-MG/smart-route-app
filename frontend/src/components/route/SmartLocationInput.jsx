import { useEffect, useMemo, useRef, useState } from 'react'

function PinIcon({ color = 'currentColor' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 11.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z"
        stroke={color}
        strokeWidth="2"
      />
    </svg>
  )
}

export default function SmartLocationInput({
  label,
  value,
  onValueChange,
  query,
  onQueryChange,
  suggestions,
  placeholder,
  onSelectSuggestion,
  icon = 'pin',
}) {
  const rootRef = useRef(null)
  const [isFocused, setIsFocused] = useState(false)

  const showSuggestions = isFocused && Array.isArray(suggestions) && suggestions.length > 0

  useEffect(() => {
    const onDocDown = (e) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target)) {
        setIsFocused(false)
      }
    }

    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  const Icon = useMemo(() => {
    if (icon === 'pin') return PinIcon
    return PinIcon
  }, [icon])

  return (
    <div className="locInput" ref={rootRef}>
      <div className="locInput__labelRow">
        <label className="locInput__label">{label}</label>
      </div>

      <div className={`locInput__field ${isFocused ? 'isFocused' : ''}`}>
        <span className="locInput__icon" aria-hidden="true">
          <Icon color="rgba(255,255,255,0.9)" />
        </span>
        <input
          className="locInput__input"
          value={query}
          placeholder={placeholder}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {showSuggestions && (
        <ul className="locInput__suggestions" role="listbox" aria-label={`${label} suggestions`}>
          {suggestions.map((place) => (
            <li key={place.place_id} className="locInput__suggestion">
              <button
                type="button"
                className="locInput__suggestionBtn"
                onClick={() => onSelectSuggestion(place)}
              >
                {place.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {value && (
        <div className="locInput__pill" role="status" aria-live="polite">
          Selected: <span className="locInput__pillText">{value}</span>
        </div>
      )}
    </div>
  )
}

