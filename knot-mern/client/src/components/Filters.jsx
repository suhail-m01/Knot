import { EVENT_TYPES, INTERESTS, MODES, RADIUS_OPTIONS, SORT_OPTIONS } from '../lib/constants.js';

/** Controlled filter panel. Values come from the URL, so every search is shareable. */
export function Filters({ values, onChange, localities, onUseLocation, locating, onClear }) {
  const toggleList = (key, item) => {
    const current = values[key] ? values[key].split(',') : [];
    const next = current.includes(item) ? current.filter((x) => x !== item) : [...current, item];
    onChange({ [key]: next.join(',') });
  };
  const selected = (key) => (values[key] ? values[key].split(',') : []);

  return (
    <aside className="filters" aria-label="Filters">
      <div className="filters-head">
        <h2>Filters</h2>
        <button type="button" className="btn btn-link btn-sm" onClick={onClear}>
          Clear all
        </button>
      </div>

      <label className="field">
        <span>Search</span>
        <input
          type="search"
          value={values.q}
          placeholder="Title, topic, organizer…"
          onChange={(e) => onChange({ q: e.target.value })}
        />
      </label>

      <div className="field">
        <span>Near</span>
        <select value={values.locality} onChange={(e) => onChange({ locality: e.target.value })}>
          <option value="">Anywhere in Bengaluru</option>
          {localities.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <div className="row-tight">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onUseLocation} disabled={locating}>
            {locating ? 'Finding you…' : '📍 Use my location'}
          </button>
          <select
            aria-label="Radius"
            value={values.radiusKm}
            onChange={(e) => onChange({ radiusKm: e.target.value })}
            disabled={!values.lat}
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>
                within {r} km
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <span>Dates</span>
        <div className="row-tight">
          <input type="date" aria-label="From date" value={values.from} onChange={(e) => onChange({ from: e.target.value })} />
          <input type="date" aria-label="To date" value={values.to} onChange={(e) => onChange({ to: e.target.value })} />
        </div>
      </div>

      <fieldset className="field">
        <legend>Format</legend>
        {MODES.map(([v, label]) => (
          <label key={v} className="check">
            <input type="checkbox" checked={selected('mode').includes(v)} onChange={() => toggleList('mode', v)} />
            {label}
          </label>
        ))}
      </fieldset>

      <fieldset className="field">
        <legend>Type</legend>
        <div className="chip-row">
          {EVENT_TYPES.map(([v, label]) => (
            <button
              type="button"
              key={v}
              className={`chip ${selected('type').includes(v) ? 'chip-on' : ''}`}
              aria-pressed={selected('type').includes(v)}
              onClick={() => toggleList('type', v)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Interest</span>
        <select value={values.interest} onChange={(e) => onChange({ interest: e.target.value })}>
          <option value="">Any interest</option>
          {INTERESTS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>Entry</span>
        <div className="segmented" role="radiogroup" aria-label="Entry">
          {[
            ['', 'Any'],
            ['free', 'Free'],
            ['paid', 'Paid'],
          ].map(([v, label]) => (
            <button
              key={v || 'any'}
              type="button"
              role="radio"
              aria-checked={values.price === v}
              className={values.price === v ? 'seg seg-on' : 'seg'}
              onClick={() => onChange({ price: v })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Sort by</span>
        <select value={values.sort} onChange={(e) => onChange({ sort: e.target.value })}>
          {SORT_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}
