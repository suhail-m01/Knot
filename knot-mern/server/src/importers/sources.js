// Approved-source policy. Only sources marked enabled in approvedSources.json, with the "api" method,
// and with an adapter in this port, can be read. Disabled sources (Devpost, Luma, and others whose terms
// do not permit aggregation) are refused even if a link is pasted from them.
import approved from './approvedSources.json' with { type: 'json' };

/** Adapters this port implements. Each maps a source id to the host it serves. */
const PORTS = {
  devfolio: { label: 'Devfolio', hosts: ['devfolio.co'] },
  unstop: { label: 'Unstop', hosts: ['unstop.com'] },
};

export function listApprovedSources() {
  return approved
    .filter((source) => source.enabled && source.approvedMethods?.includes('api') && PORTS[source.id])
    .map((source) => ({
      id: source.id,
      label: PORTS[source.id].label,
      discoveryUrls: source.discoveryUrls,
      permissionEvidence: source.permissionEvidence,
      notes: source.notes,
    }));
}

export function approvedSource(id) {
  return listApprovedSources().find((source) => source.id === id) ?? null;
}

/** Returns the approved source a pasted link belongs to, or null. Disabled sources return null. */
export function sourceForHost(hostname) {
  const host = String(hostname ?? '').toLowerCase().replace(/^www\./, '');
  return listApprovedSources().find((source) => PORTS[source.id].hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}

/** Normalises a URL to host + path for comparison, so a listing link and a pasted link can match. */
export function comparableUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${path}`;
  } catch {
    return null;
  }
}
