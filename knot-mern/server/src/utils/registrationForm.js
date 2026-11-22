// Registration form rules: the organizer's form definition and a participant's submission.
// Modelled on the multi-step registration on Unstop: profile details, optional team, custom
// questions, then a review with consent. The server is the source of truth; the client repeats
// these checks only to give quicker feedback.
import { unprocessable } from './errors.js';

const isHttpUrl = (value) => /^https?:\/\/\S+$/i.test(value);
const isNumeric = (value) => /^-?\d+(\.\d+)?$/.test(value);

/** Errors in an organizer's form definition, as [{ path, message }]. Empty when valid. */
export function formDefinitionErrors(registration) {
  const errors = [];
  const teamMin = registration.teamMin ?? 0;
  const teamMax = registration.teamMax ?? 0;
  if (teamMax > 0) {
    if (registration.type === 'external') {
      errors.push({ path: 'registration.teamMax', message: 'Team registration needs Knot registration, not an external link.' });
    }
    if (teamMax < 2) errors.push({ path: 'registration.teamMax', message: 'A team needs at least 2 members.' });
    if (teamMin > teamMax) errors.push({ path: 'registration.teamMin', message: 'The smallest team cannot be larger than the largest.' });
  }
  const seen = new Set();
  (registration.questions ?? []).forEach((question, index) => {
    const path = `registration.questions.${index}`;
    if (seen.has(question.key)) errors.push({ path, message: 'Each question needs a unique key.' });
    seen.add(question.key);
    if (question.type === 'choice' && (question.options ?? []).length < 2) {
      errors.push({ path, message: `“${question.label}” is a choice question and needs at least two options.` });
    }
  });
  return errors;
}

/**
 * Checks a participant's submission against the event's form.
 * Returns the cleaned snapshot to store on the registration, or throws 422 with per-field details.
 */
export function checkSubmission(registration, input, now = new Date()) {
  const errors = [];
  const teamMax = registration.teamMax ?? 0;
  const teamMin = Math.max(2, registration.teamMin ?? 0);
  let team;

  if (teamMax > 0) {
    if (!input.team) {
      errors.push({ path: 'team.name', message: 'Add your team before continuing.' });
    } else {
      const size = input.team.members.length + 1; // the registrant counts as one member
      if (size < teamMin || size > teamMax) {
        const range = teamMin === teamMax ? `${teamMin}` : `${teamMin} to ${teamMax}`;
        errors.push({ path: 'team.members', message: `This event needs teams of ${range} members, including you.` });
      }
      team = {
        name: input.team.name,
        members: input.team.members.map((m) => ({ name: m.name, email: m.email ?? '' })),
      };
    }
  }

  const given = new Map((input.answers ?? []).map((a) => [a.key, a.value == null ? '' : String(a.value).trim()]));
  const answers = [];
  for (const question of registration.questions ?? []) {
    const value = given.get(question.key) ?? '';
    const path = `answers.${question.key}`;
    if (!value) {
      if (question.required) errors.push({ path, message: `${question.label} is required.` });
      continue;
    }
    if (question.type === 'choice' && !question.options.includes(value)) {
      errors.push({ path, message: 'Pick one of the listed options.' });
    } else if (question.type === 'url' && !isHttpUrl(value)) {
      errors.push({ path, message: 'Enter a link that starts with http:// or https://' });
    } else if (question.type === 'number' && !isNumeric(value)) {
      errors.push({ path, message: 'Enter a number.' });
    }
    answers.push({ key: question.key, label: question.label, value });
  }

  if (!input.consent?.terms) errors.push({ path: 'consent.terms', message: 'Accept the terms to register.' });

  if (errors.length) throw unprocessable('Please fix the highlighted fields.', errors);

  return {
    profile: {
      name: input.profile.name,
      phone: input.profile.phone ?? '',
      organisation: input.profile.organisation ?? '',
    },
    ...(team ? { team } : {}),
    answers,
    consent: { terms: true, dataSharing: Boolean(input.consent.dataSharing), acceptedAt: now },
  };
}
