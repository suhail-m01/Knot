import { useState } from 'react';
import { EVENT_TYPES, INTERESTS, MODES } from '../lib/constants.js';
import { isoFromIstInput, istInputFromIso } from '../lib/format.js';
import { MapPicker } from './EventMap.jsx';

const blankForm = {
  title: '',
  summary: '',
  description: '',
  eventType: 'meetup',
  mode: 'in_person',
  interests: [],
  startAt: '',
  endAt: '',
  registrationDeadline: '',
  localityId: 'koramangala',
  venueName: '',
  venueAddress: '',
  lat: null,
  lng: null,
  onlineUrl: '',
  regType: 'native',
  externalUrl: '',
  capacity: '',
  waitlistEnabled: true,
  teamMode: 'individual',
  teamMin: 2,
  teamMax: 4,
  questions: [],
  declaration: '',
  priceKind: 'free',
  priceAmount: '',
  minAge: 0,
  status: 'published',
};

/** Converts an existing event (API shape) into form state. */
export function formFromEvent(event) {
  return {
    ...blankForm,
    title: event.title,
    summary: event.summary,
    description: event.description,
    eventType: event.eventType,
    mode: event.mode,
    interests: event.interests,
    startAt: istInputFromIso(event.startAt),
    endAt: istInputFromIso(event.endAt),
    registrationDeadline: istInputFromIso(event.registrationDeadline),
    localityId: event.venue?.localityId ?? '',
    venueName: event.venue?.name ?? '',
    venueAddress: event.venue?.address ?? '',
    lat: event.venue?.lat ?? null,
    lng: event.venue?.lng ?? null,
    onlineUrl: event.onlineUrl ?? '',
    regType: event.registration.type,
    externalUrl: event.registration.externalUrl ?? '',
    capacity: event.registration.capacity ?? '',
    waitlistEnabled: event.registration.waitlistEnabled,
    teamMode: (event.registration.form?.teamMax ?? 0) > 0 ? 'team' : 'individual',
    teamMin: event.registration.form?.teamMin || 2,
    teamMax: event.registration.form?.teamMax || 4,
    questions: (event.registration.form?.questions ?? []).map((q) => ({
      key: q.key,
      label: q.label,
      type: q.type,
      required: q.required,
      optionsText: (q.options ?? []).join(', '),
    })),
    declaration: event.registration.form?.declaration ?? '',
    priceKind: event.price.kind,
    priceAmount: event.price.amountInr ?? '',
    minAge: event.minAge,
    status: event.status === 'draft' ? 'draft' : 'published',
  };
}

/** Converts form state into the API payload. Blank optional fields are sent as null. */
export const QUESTION_KINDS = [
  ['text', 'Short answer'],
  ['long', 'Paragraph'],
  ['choice', 'Choose one'],
  ['url', 'Link (https://)'],
  ['number', 'Number'],
];

const newQuestionKey = () => `q${Math.random().toString(36).slice(2, 8)}`;
export const blankQuestion = () => ({ key: newQuestionKey(), label: '', type: 'text', required: false, optionsText: '' });

/** Registration form fields sent with the event. Team size and questions apply to Knot registration only. */
function formDefinition(f) {
  if (f.regType !== 'native') return { teamMin: 0, teamMax: 0, questions: [], declaration: '' };
  const team = f.teamMode === 'team';
  return {
    teamMin: team ? Number(f.teamMin) || 2 : 0,
    teamMax: team ? Number(f.teamMax) || 2 : 0,
    questions: f.questions
      .filter((q) => q.label.trim())
      .map((q) => ({
        key: q.key,
        label: q.label.trim(),
        type: q.type,
        required: Boolean(q.required),
        options: q.type === 'choice' ? q.optionsText.split(',').map((o) => o.trim()).filter(Boolean) : [],
      })),
    declaration: f.declaration.trim(),
  };
}

export function payloadFromForm(f, localities) {
  const locality = localities.find((l) => l.id === f.localityId);
  const inPerson = f.mode !== 'online';
  const venue = inPerson
    ? {
        name: f.venueName.trim(),
        address: f.venueAddress.trim(),
        localityId: f.localityId || null,
        lat: f.lat ?? locality?.lat ?? null,
        lng: f.lng ?? locality?.lng ?? null,
      }
    : null;
  return {
    title: f.title.trim(),
    summary: f.summary.trim(),
    description: f.description.trim(),
    eventType: f.eventType,
    mode: f.mode,
    interests: f.interests,
    startAt: isoFromIstInput(f.startAt),
    endAt: isoFromIstInput(f.endAt),
    registrationDeadline: isoFromIstInput(f.registrationDeadline),
    venue,
    onlineUrl: f.onlineUrl.trim() || null,
    registration: {
      type: f.regType,
      externalUrl: f.regType === 'external' ? f.externalUrl.trim() || null : null,
      capacity: f.regType === 'native' && f.capacity !== '' ? Number(f.capacity) : null,
      waitlistEnabled: f.waitlistEnabled,
      ...formDefinition(f),
    },
    price: {
      kind: f.priceKind,
      amountInr: f.priceKind === 'paid' && f.priceAmount !== '' ? Number(f.priceAmount) : null,
    },
    minAge: Number(f.minAge) || 0,
    status: f.status,
  };
}

export function EventForm({ initial, localities, onSubmit, submitting, submitLabel }) {
  const [f, setF] = useState(() => (initial ? { ...blankForm, ...initial } : blankForm));
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
  const locality = localities.find((l) => l.id === f.localityId);
  const inPerson = f.mode !== 'online';

  const toggleInterest = (value) =>
    set({ interests: f.interests.includes(value) ? f.interests.filter((i) => i !== value) : [...f.interests, value].slice(0, 8) });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(payloadFromForm(f, localities));
  };

  return (
    <form className="form-grid" onSubmit={handleSubmit} noValidate={false}>
      <section className="card form-section">
        <h3>The basics</h3>
        <label className="field">
          <span>Title *</span>
          <input required minLength={3} maxLength={120} value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="field">
          <span>One-line summary</span>
          <input maxLength={300} value={f.summary} onChange={(e) => set({ summary: e.target.value })} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea rows={5} maxLength={5000} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <div className="row">
          <label className="field">
            <span>Type</span>
            <select value={f.eventType} onChange={(e) => set({ eventType: e.target.value })}>
              {EVENT_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Format</span>
            <select value={f.mode} onChange={(e) => set({ mode: e.target.value })}>
              {MODES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="field">
          <legend>Topics (up to 8)</legend>
          <div className="chip-row">
            {INTERESTS.map(([v, l]) => (
              <button
                type="button"
                key={v}
                className={`chip ${f.interests.includes(v) ? 'chip-on' : ''}`}
                aria-pressed={f.interests.includes(v)}
                onClick={() => toggleInterest(v)}
              >
                {l}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card form-section">
        <h3>When</h3>
        <div className="row">
          <label className="field">
            <span>Starts (IST) *</span>
            <input type="datetime-local" required value={f.startAt} onChange={(e) => set({ startAt: e.target.value })} />
          </label>
          <label className="field">
            <span>Ends (IST)</span>
            <input type="datetime-local" value={f.endAt} onChange={(e) => set({ endAt: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>Registration closes (IST, optional)</span>
          <input
            type="datetime-local"
            value={f.registrationDeadline}
            onChange={(e) => set({ registrationDeadline: e.target.value })}
          />
        </label>
      </section>

      <section className="card form-section">
        <h3>Where</h3>
        {inPerson && (
          <>
            <label className="field">
              <span>Locality *</span>
              <select
                value={f.localityId}
                onChange={(e) => {
                  const next = localities.find((l) => l.id === e.target.value);
                  set({ localityId: e.target.value, lat: null, lng: null, venueName: f.venueName || next?.name || '' });
                }}
              >
                <option value="">Choose a locality</option>
                {localities.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <label className="field">
                <span>Venue name</span>
                <input maxLength={120} value={f.venueName} onChange={(e) => set({ venueName: e.target.value })} />
              </label>
              <label className="field">
                <span>Address</span>
                <input maxLength={240} value={f.venueAddress} onChange={(e) => set({ venueAddress: e.target.value })} />
              </label>
            </div>
            <MapPicker
              value={f.lat != null ? { lat: f.lat, lng: f.lng } : null}
              fallback={locality ? { lat: locality.lat, lng: locality.lng } : undefined}
              onChange={({ lat, lng }) => set({ lat, lng })}
            />
            {f.lat != null && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ lat: null, lng: null })}>
                Clear pinned point
              </button>
            )}
          </>
        )}
        {f.mode !== 'in_person' && (
          <label className="field">
            <span>Join link {f.mode === 'online' ? '*' : ''}</span>
            <input
              type="url"
              placeholder="https://"
              value={f.onlineUrl}
              onChange={(e) => set({ onlineUrl: e.target.value })}
            />
          </label>
        )}
        {f.mode === 'online' && <p className="muted small">Online events are included in every nearby search.</p>}
      </section>

      <section className="card form-section">
        <h3>Registration and entry</h3>
        <div className="row">
          <label className="field">
            <span>How people join</span>
            <select value={f.regType} onChange={(e) => set({ regType: e.target.value })}>
              <option value="native">Register on Knot (seats and waitlist)</option>
              <option value="external">Organizer’s own site (handoff)</option>
            </select>
          </label>
          {f.regType === 'external' && (
            <label className="field">
              <span>Organizer registration link *</span>
              <input type="url" placeholder="https://" value={f.externalUrl} onChange={(e) => set({ externalUrl: e.target.value })} />
            </label>
          )}
        </div>
        {f.regType === 'native' && (
          <div className="row">
            <label className="field">
              <span>Capacity (blank = unlimited)</span>
              <input type="number" min={1} max={100000} value={f.capacity} onChange={(e) => set({ capacity: e.target.value })} />
            </label>
            <label className="check field-inline">
              <input type="checkbox" checked={f.waitlistEnabled} onChange={(e) => set({ waitlistEnabled: e.target.checked })} />
              Allow a waitlist when full
            </label>
          </div>
        )}
        <div className="row">
          <label className="field">
            <span>Entry</span>
            <select value={f.priceKind} onChange={(e) => set({ priceKind: e.target.value })}>
              <option value="free">Free</option>
              <option value="paid">Paid (amount shown, payment off-platform)</option>
              <option value="unknown">Not stated</option>
            </select>
          </label>
          {f.priceKind === 'paid' && (
            <label className="field">
              <span>Amount (₹)</span>
              <input type="number" min={0} value={f.priceAmount} onChange={(e) => set({ priceAmount: e.target.value })} />
            </label>
          )}
          <label className="field">
            <span>Minimum age (0 = all ages)</span>
            <input type="number" min={0} max={99} value={f.minAge} onChange={(e) => set({ minAge: e.target.value })} />
          </label>
        </div>
        {f.regType === 'native' && (
          <div className="registration-form">
            <h4>Registration form</h4>
            <p className="muted small">Participants go through these steps: their details, their team (if any), your questions, then the terms.</p>
            <div className="row">
              <label className="field">
                <span>Who registers</span>
                <select value={f.teamMode} onChange={(e) => set({ teamMode: e.target.value })}>
                  <option value="individual">Individuals</option>
                  <option value="team">Teams</option>
                </select>
              </label>
              {f.teamMode === 'team' && (
                <>
                  <label className="field">
                    <span>Smallest team (incl. registrant)</span>
                    <input type="number" min={2} max={20} value={f.teamMin} onChange={(e) => set({ teamMin: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Largest team (incl. registrant)</span>
                    <input type="number" min={2} max={20} value={f.teamMax} onChange={(e) => set({ teamMax: e.target.value })} />
                  </label>
                </>
              )}
            </div>

            <div className="question-list">
              {f.questions.map((q, index) => (
                <div className="question-row card" key={q.key}>
                  <div className="row">
                    <label className="field">
                      <span>Question {index + 1}</span>
                      <input
                        maxLength={200}
                        placeholder="e.g. College or company"
                        value={q.label}
                        onChange={(e) => set({ questions: f.questions.map((x, i) => (i === index ? { ...x, label: e.target.value } : x)) })}
                      />
                    </label>
                    <label className="field">
                      <span>Answer type</span>
                      <select
                        value={q.type}
                        onChange={(e) => set({ questions: f.questions.map((x, i) => (i === index ? { ...x, type: e.target.value } : x)) })}
                      >
                        {QUESTION_KINDS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {q.type === 'choice' && (
                    <label className="field">
                      <span>Options (separate with commas)</span>
                      <input
                        placeholder="AI, Web, Hardware"
                        value={q.optionsText}
                        onChange={(e) => set({ questions: f.questions.map((x, i) => (i === index ? { ...x, optionsText: e.target.value } : x)) })}
                      />
                    </label>
                  )}
                  <div className="btn-row">
                    <label className="check field-inline">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => set({ questions: f.questions.map((x, i) => (i === index ? { ...x, required: e.target.checked } : x)) })}
                      />
                      Required
                    </label>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ questions: f.questions.filter((_, i) => i !== index) })}>
                      Remove question
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {f.questions.length < 15 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ questions: [...f.questions, blankQuestion()] })}>
                + Add a question
              </button>
            )}

            <label className="field">
              <span>Declaration participants accept (optional)</span>
              <textarea
                rows={3}
                maxLength={1000}
                placeholder="e.g. I will follow the hackathon rules and the code of conduct."
                value={f.declaration}
                onChange={(e) => set({ declaration: e.target.value })}
              />
            </label>
          </div>
        )}
        <label className="field">
          <span>Visibility</span>
          <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="published">Published (listed now)</option>
            <option value="draft">Draft (only you can see it)</option>
          </select>
        </label>
      </section>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
