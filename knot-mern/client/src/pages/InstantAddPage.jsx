import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { formFromDraft, reviewNotes } from '../lib/instant.js';
import { formatDateTime } from '../lib/format.js';
import { ErrorBox, Spinner } from '../components/ui.jsx';

const SAMPLE = `Bengaluru AI Builders Night
Date: 5 Dec 2026, 6:30 PM
Venue: Startup Hub Koramangala
Registration: https://example.org/register/ai-night
Price: Free
Open to: students and developers
Hosted by: Community Circle`;

const LABELS = {
  title: 'Title',
  eventType: 'Event type',
  organizer: 'Organiser',
  startAt: 'Starts',
  endAt: 'Ends',
  registrationDeadline: 'Registration deadline',
  mode: 'Mode',
  venueName: 'Venue',
  city: 'City',
  registrationUrl: 'Registration link',
  price: 'Price',
  eligibility: 'Eligibility',
  age: 'Age rule',
  skills: 'Skills',
  teamSize: 'Team size',
};

function display(key, field) {
  const value = field?.value;
  if (value === null || value === undefined || value === '') return 'Not found';
  if (key === 'startAt' || key === 'endAt' || key === 'registrationDeadline') return formatDateTime(value);
  if (key === 'price') return value.kind === 'free' ? 'Free' : value.kind === 'paid' ? `₹${value.amountInr ?? '?'}` : 'Not stated';
  if (key === 'age') return value.minAge != null ? `${value.minAge}${value.maxAge ? `–${value.maxAge}` : '+'}` : 'Not stated';
  if (key === 'skills') return value.length ? value.join(', ') : 'Not found';
  if (key === 'teamSize') return value.min != null ? `${value.min}${value.max && value.max !== value.min ? `–${value.max}` : ''}` : 'Not found';
  return String(value);
}

/** Paste event text, check it, and continue into the normal event form with the values prefilled. */
export function InstantAddPage() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [localityId, setLocalityId] = useState('koramangala');
  const [link, setLink] = useState('');
  const [browse, setBrowse] = useState('');
  const [result, setResult] = useState(null);
  const localities = useQuery({ queryKey: ['localities'], queryFn: () => api('/api/localities'), staleTime: Infinity });
  const sources = useQuery({ queryKey: ['import-sources'], queryFn: () => api('/api/organizer/import/sources'), staleTime: Infinity });
  const listings = useQuery({
    queryKey: ['import-discover', browse],
    queryFn: () => api(`/api/organizer/import/discover?source=${encodeURIComponent(browse)}`),
    enabled: Boolean(browse),
    retry: false, // a portal that is down should show its message once, not retry three times
  });

  const parse = useMutation({
    mutationFn: () => api('/api/organizer/instant/parse', { method: 'POST', body: { text, localityId } }),
    onSuccess: (data) => setResult(data),
  });

  const importLink = useMutation({
    mutationFn: (url) => api('/api/organizer/import/link', { method: 'POST', body: { url, localityId } }),
    onSuccess: (data) => setResult(data),
  });

  const form = result?.form;
  const warnings = result?.warnings ?? [];
  const usingLink = (url) => {
    setLink(url);
    importLink.mutate(url);
  };

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <p className="eyebrow">Instant Add</p>
          <h1>Paste event details</h1>
          <p className="muted">
            Knot reads dates, venue, price, eligibility and links from the text, and shows how confident each value is. Nothing is
            published from here. You review everything in the event form first.
          </p>
        </div>
      </header>

      <section className="card stack" aria-labelledby="import-link-heading">
        <h2 id="import-link-heading">Import from link</h2>
        <p className="small muted">
          Paste the link to an event page. Knot reads its structured event data (Unstop and Devfolio listings are read from their public approved
          feeds). It checks that the link is public and does not sign in anywhere. Nothing is published from here.
        </p>
        <div className="row">
          <label className="field">
            <span>Event link (https)</span>
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://unstop.com/hackathons/..." aria-label="Event link" />
          </label>
          <button type="button" className="btn btn-primary" onClick={() => usingLink(link.trim())} disabled={importLink.isPending || link.trim().length < 8}>
            {importLink.isPending ? 'Importing…' : 'Import from link'}
          </button>
        </div>
        <ErrorBox error={importLink.error} />
        {sources.data?.items?.length > 0 && (
          <div className="stack">
            <span className="small muted">Browse approved listings:</span>
            <div className="btn-row">
              {sources.data.items.map((source) => (
                <button key={source.id} type="button" className={`btn ${browse === source.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { importLink.reset(); setBrowse(browse === source.id ? '' : source.id); }}>
                  {source.label}
                </button>
              ))}
            </div>
            {browse && listings.isPending && <Spinner />}
            <ErrorBox error={listings.error} />
            {listings.data?.items?.length > 0 && (
              <ul className="small stack">
                {listings.data.items.map((item) => (
                  <li key={item.url} className="row">
                    <span>
                      <strong>{item.title}</strong> · {item.startAt ? formatDateTime(item.startAt) : 'Date not stated'} · {item.source.platform}
                    </span>
                    <button type="button" className="btn btn-ghost" onClick={() => usingLink(item.url)}>
                      Review this event
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {browse && listings.data && listings.data.items.length === 0 && <p className="small muted">No upcoming listings were returned.</p>}
          </div>
        )}
      </section>

      <section className="card stack">
        <label className="field">
          <span>Event text</span>
          <textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} aria-label="Event text" />
        </label>
        <div className="row">
          <label className="field">
            <span>Locality (used to check for duplicates)</span>
            <select value={localityId} onChange={(e) => setLocalityId(e.target.value)}>
              {(localities.data?.items ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => parse.mutate()} disabled={parse.isPending || text.trim().length < 10}>
            {parse.isPending ? 'Reading…' : 'Read event details'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setText(SAMPLE)}>
            Use an example
          </button>
        </div>
        <ErrorBox error={parse.error} />
      </section>

      {(parse.isPending || importLink.isPending) && <Spinner />}

      {result && form && (
        <section className="two-col">
          <div className="card stack">
            <h2>What Knot found</h2>
            {result.source && (
              <p className="small muted">
                Source: {result.source.label} ({result.source.method === 'api' ? 'approved listing' : 'event page'}). Review every value before saving.
              </p>
            )}
            <table className="table">
              <tbody>
                {Object.entries(LABELS).map(([key, label]) => {
                  const field = result.fields[key];
                  return (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      <td>{display(key, field)}</td>
                      <td>
                        <span className={`badge ${field?.confidence === 'high' ? 'badge-good' : field?.confidence === 'medium' ? 'badge-warn' : 'badge-muted'}`}>
                          {field?.confidence ?? 'missing'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="stack">
            {(result.missingRequired ?? []).length > 0 && (
              <div className="alert alert-warn">
                <strong>Missing before you can save:</strong> {result.missingRequired.join(', ')}. Add {result.missingRequired.length > 1 ? 'them' : 'it'} in the form.
              </div>
            )}
            {warnings.length > 0 && (
              <div className="card stack">
                <h2>Check these</h2>
                <ul className="small">
                  {warnings.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.duplicates.length > 0 && (
              <div className="alert alert-warn">
                <strong>Possible duplicates</strong>
                <ul>
                  {result.duplicates.map((d) => (
                    <li key={d.id}>
                      <Link to={`/organizer/events/${d.id}`}>{d.title}</Link> ({formatDateTime(d.startAt)})
                    </li>
                  ))}
                </ul>
                <p className="small">Check these before publishing a second copy.</p>
              </div>
            )}
            <div className="card stack">
              <h2>Before you save</h2>
              <ul className="small">
                {reviewNotes(form, result.fields).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => navigate('/organizer/events/new', { state: { prefill: formFromDraft(form) } })}
              >
                Continue to the event form
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
