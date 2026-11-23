import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { EmptyState, ErrorBox, Spinner } from '../components/ui.jsx';
import { PassCard } from '../components/PassCard.jsx';
import { formatRange } from '../lib/format.js';

// Registration in steps, modelled on how Unstop takes sign-ups: your details, your team (team
// events only), the organiser's questions, then a review with consent. The server checks the same
// rules again and is the source of truth; the checks here only give quicker feedback.

const PHONE = /^\+?[0-9 ()-]{6,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isHttp = (value) => /^https?:\/\/\S+$/i.test(value);
const isNumber = (value) => /^-?\d+(\.\d+)?$/.test(value);

function FieldError({ message }) {
  return message ? <p className="field-error" role="alert">{message}</p> : null;
}

export function RegisterPage() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const detail = useQuery({
    queryKey: ['event', eventId, true],
    queryFn: () => api(`/api/events/${eventId}`),
    retry: (count, err) => err.status !== 404 && count < 2,
  });
  const [result, setResult] = useState(null);

  if (detail.isLoading) return <Spinner label="Loading registration…" />;
  if (detail.error?.status === 404) {
    return (
      <EmptyState title="This event is not available" action={<Link to="/discover" className="btn btn-ghost">Browse events</Link>}>
        It may have been removed, or it is still a draft.
      </EmptyState>
    );
  }
  if (detail.error) return <EmptyState title="Could not load registration">{detail.error.message}</EmptyState>;

  const { event, viewer } = detail.data;
  const reg = viewer?.registration;

  if (result) return <RegistrationDone event={event} result={result} />;

  if (event.registration.type === 'external') {
    return (
      <Notice title="This event registers on the organiser’s site" event={event}>
        Knot cannot register you for it. Use the organiser’s link on the event page.
      </Notice>
    );
  }
  if (reg && (reg.status === 'confirmed' || reg.status === 'waitlisted')) {
    return <AlreadyRegistered event={event} registration={reg} />;
  }
  const closed = event.status !== 'published' || new Date(event.startAt) <= new Date();
  const deadlinePassed = event.registrationDeadline && new Date(event.registrationDeadline) < new Date();
  const full = event.registration.capacity !== null && event.registration.seatsLeft === 0;
  if (closed || deadlinePassed) {
    return (
      <Notice title="Registration is closed" event={event}>
        {deadlinePassed ? 'The registration deadline has passed.' : 'This event is no longer open for registration.'}
      </Notice>
    );
  }
  if (full && !event.registration.waitlistEnabled) {
    return (
      <Notice title="This event is full" event={event}>
        There are no seats left and the organiser has not enabled a waitlist.
      </Notice>
    );
  }
  return <RegistrationWizard event={event} user={user} waitlist={full} onDone={setResult} />;
}

function Notice({ title, event, children }) {
  return (
    <article className="narrow stack-lg">
      <header className="page-head">
        <div>
          <p className="eyebrow">Registration</p>
          <h1>{title}</h1>
          <p className="muted">{event.title}</p>
        </div>
      </header>
      <section className="card stack">
        <p>{children}</p>
        <div className="btn-row">
          <Link className="btn btn-ghost" to={`/events/${event.id}`}>Back to event</Link>
        </div>
      </section>
    </article>
  );
}

function AlreadyRegistered({ event, registration }) {
  const confirmed = registration.status === 'confirmed';
  return (
    <article className="narrow stack-lg">
      <header className="page-head">
        <div>
          <p className="eyebrow">{confirmed ? 'Registered' : 'Waitlisted'}</p>
          <h1>{confirmed ? 'You are already registered' : 'You are already on the waitlist'}</h1>
          <p className="muted">{event.title}</p>
        </div>
      </header>
      {confirmed && (
        <section className="card">
          <PassCard registration={registration} title={event.title} />
        </section>
      )}
      <div className="btn-row">
        <Link className="btn btn-primary" to="/plan">Open my plan</Link>
        <Link className="btn btn-ghost" to={`/events/${event.id}`}>Back to event</Link>
      </div>
    </article>
  );
}

function RegistrationDone({ event, result }) {
  const { registration, position } = result;
  const confirmed = registration.status === 'confirmed';
  return (
    <article className="narrow stack-lg">
      <header className="page-head">
        <div>
          <p className="eyebrow">{confirmed ? 'Registered' : 'Waitlisted'}</p>
          <h1>{confirmed ? 'You are registered' : `You are #${position} on the waitlist`}</h1>
          <p className="muted">
            {event.title} · {formatRange(event.startAt, event.endAt)}
          </p>
        </div>
      </header>
      {confirmed ? (
        <section className="card stack">
          <PassCard registration={registration} title={event.title} />
          <p className="small muted">Keep this pass for check-in. The organiser can scan it or type the code.</p>
        </section>
      ) : (
        <section className="card">
          <p>We will notify you if a seat opens. You can leave the waitlist from the event page.</p>
        </section>
      )}
      <div className="btn-row">
        <Link className="btn btn-primary" to="/plan">Open my plan</Link>
        <Link className="btn btn-ghost" to={`/events/${event.id}`}>Back to event</Link>
      </div>
    </article>
  );
}

function RegistrationWizard({ event, user, waitlist, onDone }) {
  const queryClient = useQueryClient();
  const form = event.registration.form ?? { teamMin: 0, teamMax: 0, questions: [], declaration: '' };
  const isTeam = form.teamMax > 0;
  // The team count includes the registrant, so the rest of the team is one fewer.
  const minOthers = Math.max(2, form.teamMin) - 1;
  const maxOthers = form.teamMax - 1;

  const steps = [
    { id: 'profile', title: 'Your details' },
    ...(isTeam ? [{ id: 'team', title: 'Your team' }] : []),
    ...(form.questions.length ? [{ id: 'questions', title: 'Questions' }] : []),
    { id: 'review', title: 'Review and consent' },
  ];

  const [index, setIndex] = useState(0);
  const [profile, setProfile] = useState({ name: user?.name ?? '', phone: '', organisation: '' });
  const [team, setTeam] = useState({
    name: '',
    members: Array.from({ length: minOthers }, () => ({ name: '', email: '' })),
  });
  const [answers, setAnswers] = useState({});
  const [consent, setConsent] = useState({ terms: false, dataSharing: false });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);

  const submit = useMutation({
    mutationFn: (body) => api(`/api/events/${event.id}/register`, { method: 'POST', body }),
    onSuccess: (data) => {
      setServerError(null);
      onDone({ registration: data.registration, position: data.position });
      ['event', 'plan', 'notifications', 'events'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: setServerError,
  });

  const checkStep = (id) => {
    const found = {};
    if (id === 'profile') {
      if (profile.name.trim().length < 2) found.profile = 'Enter your full name.';
      if (profile.phone.trim() && !PHONE.test(profile.phone.trim())) found.phone = 'Enter a valid phone number.';
    }
    if (id === 'team') {
      if (team.name.trim().length < 2) found.teamName = 'Enter a team name.';
      team.members.forEach((m, i) => {
        if (m.name.trim().length < 2) found[`member${i}`] = 'Enter this member’s name.';
        else if (m.email.trim() && !EMAIL.test(m.email.trim())) found[`member${i}`] = 'Enter a valid email address, or leave it blank.';
      });
    }
    if (id === 'questions') {
      for (const q of form.questions) {
        const value = (answers[q.key] ?? '').trim();
        if (!value) {
          if (q.required) found[q.key] = 'This question is required.';
        } else if (q.type === 'choice' && !q.options.includes(value)) {
          found[q.key] = 'Pick one of the options.';
        } else if (q.type === 'url' && !isHttp(value)) {
          found[q.key] = 'Enter a link that starts with http:// or https://';
        } else if (q.type === 'number' && !isNumber(value)) {
          found[q.key] = 'Enter a number.';
        }
      }
    }
    if (id === 'review' && !consent.terms) found.terms = 'Accept the terms to register.';
    return found;
  };

  const current = steps[index];
  const last = index === steps.length - 1;

  const next = (e) => {
    e?.preventDefault();
    const found = checkStep(current.id);
    setErrors(found);
    if (Object.keys(found).length) return;
    setServerError(null);
    if (!last) {
      setIndex(index + 1);
      return;
    }
    submit.mutate({
      profile: {
        name: profile.name.trim(),
        phone: profile.phone.trim(),
        organisation: profile.organisation.trim(),
      },
      team: isTeam
        ? {
            name: team.name.trim(),
            members: team.members.map((m) => ({ name: m.name.trim(), email: m.email.trim() })),
          }
        : null,
      answers: form.questions.map((q) => ({ key: q.key, value: (answers[q.key] ?? '').trim() })),
      consent: { terms: consent.terms, dataSharing: consent.dataSharing },
    });
  };

  const back = () => {
    setErrors({});
    setServerError(null);
    setIndex(Math.max(0, index - 1));
  };

  const setMember = (i, patch) =>
    setTeam((t) => ({ ...t, members: t.members.map((m, k) => (k === i ? { ...m, ...patch } : m)) }));

  return (
    <article className="register-wizard narrow stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to={`/events/${event.id}`}>{event.title}</Link> <span aria-hidden="true">/</span> <span>Register</span>
      </nav>
      <header className="page-head">
        <div>
          <p className="eyebrow">{waitlist ? 'Join the waitlist' : 'Register'}</p>
          <h1>{event.title}</h1>
          <p className="muted">
            {formatRange(event.startAt, event.endAt)}
            {isTeam && ` · Teams of ${form.teamMin === form.teamMax ? form.teamMax : `${form.teamMin} to ${form.teamMax}`} including you`}
          </p>
        </div>
      </header>

      <ol className="steps" aria-label="Registration steps">
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={i === index ? 'step step-current' : i < index ? 'step step-done' : 'step'}
            aria-current={i === index ? 'step' : undefined}
          >
            <span className="step-num">{i < index ? '✓' : i + 1}</span>
            {step.title}
          </li>
        ))}
      </ol>

      <form className="card stack register-step" onSubmit={next} noValidate>
        {current.id === 'profile' && (
          <>
            <h2>Your details</h2>
            <p className="muted small">Shown only to the organiser of this event.</p>
            <label className="field">
              <span>Full name *</span>
              <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} maxLength={80} autoComplete="name" />
              <FieldError message={errors.profile} />
            </label>
            <label className="field">
              <span>Phone (optional)</span>
              <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} maxLength={20} placeholder="+91 98450 12345" autoComplete="tel" />
              <FieldError message={errors.phone} />
            </label>
            <label className="field">
              <span>College or company (optional)</span>
              <input value={profile.organisation} onChange={(e) => setProfile({ ...profile, organisation: e.target.value })} maxLength={120} />
            </label>
          </>
        )}

        {current.id === 'team' && (
          <>
            <h2>Your team</h2>
            <p className="muted small">
              {form.teamMin === form.teamMax
                ? `This event needs teams of exactly ${form.teamMax}, including you.`
                : `This event needs teams of ${form.teamMin} to ${form.teamMax}, including you.`}
            </p>
            <label className="field">
              <span>Team name *</span>
              <input value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} maxLength={80} />
              <FieldError message={errors.teamName} />
            </label>
            <fieldset className="field">
              <legend>Other team members</legend>
              {team.members.map((m, i) => (
                <div className="row member-row" key={i}>
                  <label className="field">
                    <span>Member {i + 2} name *</span>
                    <input value={m.name} onChange={(e) => setMember(i, { name: e.target.value })} maxLength={80} />
                  </label>
                  <label className="field">
                    <span>Email (optional)</span>
                    <input type="email" value={m.email} onChange={(e) => setMember(i, { email: e.target.value })} maxLength={120} />
                  </label>
                  {team.members.length > minOthers && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setTeam((t) => ({ ...t, members: t.members.filter((_, k) => k !== i) }))}
                    >
                      Remove
                    </button>
                  )}
                  <FieldError message={errors[`member${i}`]} />
                </div>
              ))}
            </fieldset>
            {team.members.length < maxOthers && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setTeam((t) => ({ ...t, members: [...t.members, { name: '', email: '' }] }))}
              >
                + Add a member
              </button>
            )}
          </>
        )}

        {current.id === 'questions' && (
          <>
            <h2>Questions from the organiser</h2>
            {form.questions.map((q) => (
              <div className="field" key={q.key}>
                <span className="field-label">
                  {q.label}
                  {q.required ? ' *' : ''}
                </span>
                {q.type === 'choice' ? (
                  <div className="chip-row" role="radiogroup" aria-label={q.label}>
                    {q.options.map((option) => (
                      <button
                        type="button"
                        key={option}
                        role="radio"
                        aria-checked={answers[q.key] === option}
                        className={`chip ${answers[q.key] === option ? 'chip-on' : ''}`}
                        onClick={() => setAnswers({ ...answers, [q.key]: option })}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : q.type === 'long' ? (
                  <textarea rows={4} maxLength={2000} value={answers[q.key] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
                ) : (
                  <input
                    type={q.type === 'url' ? 'url' : 'text'}
                    inputMode={q.type === 'number' ? 'decimal' : undefined}
                    placeholder={q.type === 'url' ? 'https://' : undefined}
                    maxLength={2000}
                    value={answers[q.key] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                  />
                )}
                <FieldError message={errors[q.key]} />
              </div>
            ))}
          </>
        )}

        {current.id === 'review' && (
          <>
            <h2>Review and consent</h2>
            <dl className="facts">
              <div>
                <dt>Name</dt>
                <dd>{profile.name}</dd>
              </div>
              {profile.phone && (
                <div>
                  <dt>Phone</dt>
                  <dd>{profile.phone}</dd>
                </div>
              )}
              {profile.organisation && (
                <div>
                  <dt>College or company</dt>
                  <dd>{profile.organisation}</dd>
                </div>
              )}
              {isTeam && (
                <div>
                  <dt>Team</dt>
                  <dd>
                    {team.name}
                    <div className="muted small">{[profile.name, ...team.members.map((m) => m.name)].join(', ')}</div>
                  </dd>
                </div>
              )}
              {form.questions.map((q) => (
                <div key={q.key}>
                  <dt>{q.label}</dt>
                  <dd>{answers[q.key]?.trim() || <span className="muted">—</span>}</dd>
                </div>
              ))}
            </dl>

            {form.declaration && <blockquote className="declaration">{form.declaration}</blockquote>}
            <label className="check">
              <input type="checkbox" checked={consent.terms} onChange={(e) => setConsent({ ...consent, terms: e.target.checked })} />
              <span>I accept Knot’s terms and the organiser’s declaration above. *</span>
            </label>
            <FieldError message={errors.terms} />
            <label className="check">
              <input type="checkbox" checked={consent.dataSharing} onChange={(e) => setConsent({ ...consent, dataSharing: e.target.checked })} />
              <span>Share my name, contact details and answers with the organiser.</span>
            </label>
            {waitlist && <p className="warn-line">This event is full. You will join the waitlist and be notified if a seat opens.</p>}
          </>
        )}

        <ErrorBox error={serverError} />
        <div className="btn-row">
          {index > 0 && (
            <button type="button" className="btn btn-ghost" onClick={back} disabled={submit.isPending}>
              Back
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={submit.isPending}>
            {last ? (submit.isPending ? 'Submitting…' : waitlist ? 'Join the waitlist' : 'Submit registration') : 'Continue'}
          </button>
        </div>
      </form>
    </article>
  );
}
