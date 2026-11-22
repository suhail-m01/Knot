# Port inventory: original Knot repo → knot-mern

Reference: the original repo at the repository root (`src/`, `supabase/`, `agents/`, `tests/`).
Status key: **Ported** = same route and behaviour, verified in the browser. **Partial** = some behaviour
present, gaps listed. **Missing** = not present in knot-mern. **Not verified** = present in code but no browser check yet.

Last updated: 2026-11-22. Re-check this file after each port batch.

## Routes (original `src/App.tsx`)

| Original route | Original page | knot-mern equivalent | Status |
|---|---|---|---|
| `/` | HomePage.tsx | client/src/pages/HomePage.jsx | Partial: no hackathon snapshot, no agent status panel, no near-me radius, no format chips |
| `/search` | SearchPage.tsx | DiscoverPage.jsx | Partial: no time/type/mode/interest/age/price/team/source/travel filters, no aggregate panel, no WhatsApp card |
| `/hackathons` | HackathonsPage (features/hackathons) | none | Missing |
| `/hackathons/interests` | MyHackathonInterestsPage | none | Missing |
| `/bot` | BotInfoPage.tsx | none | Missing |
| `/events/:eventId` | EventPage.tsx | EventDetailPage.jsx | Partial: registration wizard present; map, engagement, QR pass not verified |
| `/auth` | AuthPage.tsx | AuthPages.jsx | Partial: login and register present |
| `/publish`, `/host` | QuickPostPage.tsx | none | Missing |
| `/add` | InstantAddPage.tsx | InstantAddPage.jsx | Partial: portal import (Devfolio, Unstop) present; no OCR, no WhatsApp parser parity |
| `/plan` | MyPlanPage.tsx | PlanPage.jsx | Not verified |
| `/organizer/events/:eventId` | OrganizerStudioPage.tsx | OrganizerPages.jsx | Partial: organizer form and check-in present; announcements, media, team invitations missing |
| `/organizer` | OrganizerDashboardPage.tsx | OrganizerPages.jsx | Partial |
| `/admin` | AdminPage.tsx | AdminPage.jsx | Not verified |
| `/communities`, `/communities/:id` | CommunityPage.tsx | none | Missing |
| `/profile` | ProfilePage.tsx | ProfilePage.jsx | Ported for Save profile (see thread B check) |
| `*` | NotFoundPage.tsx | NotFoundPage.jsx | Ported |

## Components (original `src/components`, 30 files)

| Component | Status |
|---|---|
| AIEventConcierge | Missing |
| AnnouncementComposer | Missing |
| AppShell (header, harvester banner) | Partial |
| AutonomousHarvesterBar | Missing |
| Badges | Missing |
| BuilderPassport | Missing |
| CategoryRibbon | Missing |
| CommunityCard | Missing |
| CommuteBuddyPanel | Missing |
| DiscoveryInsights | Missing |
| EmptyState | Partial |
| EventCard | Partial |
| EventEngagement | Missing |
| FilterBar | Partial |
| GrowthStudio | Missing |
| LoadingButton | Partial |
| LocalityMap | Not verified (OSM tiles unreachable from sandbox) |
| LocationControls | Partial |
| Logo | Ported |
| MediaLibrary | Missing |
| OrganizerTurnoutPredictor | Missing |
| ParticipantCheckInPass | Partial |
| PublicMediaGallery | Missing |
| QrScannerPanel | Partial (not verified) |
| RegistrationActions | Partial |
| SeriesAutomationPanel | Missing |
| SmartWhatsAppImporterModal | Missing |
| TeamInvitationPanel | Missing |
| TeamSynergyMatrix | Missing |
| UnstopRegistrationModal | Partial (wizard present; Unstop-like flow not matched) |

## Features and back end

| Original piece | Status |
|---|---|
| Supabase Auth (`src/data/supabase/auth.ts`) | Replaced by JWT auth in knot-mern; Supabase Auth itself not ported |
| Supabase Postgres + migrations (24 files) | Replaced by Mongoose models; migrations not ported |
| PostgREST / RPC repository (`repository.ts`) | Replaced by Express routes |
| Realtime (`realtime.ts`) | Partial: Socket.IO notifications only |
| Cloud discovery (`discovery.ts`, `useCloudDiscovery.ts`) | Missing |
| Geocode (`geocode.ts`, `knot-geocode` edge fn) | Missing |
| Edge fn `knot-approved-feed` | Missing |
| Edge fn `knot-provider-worker` | Missing |
| Edge fn `knot-razorpay-webhook` (Razorpay) | Missing |
| Hackathon agent (`agents/hackathon`, 19 files, 15 sources) | Missing |
| Portal import (Devfolio, Unstop) | Ported (server + UI) |
| Portal import (MLH, Eventbrite, Meetup, Tavily, Brave, SerpAPI) | Missing (enabled in approved-sources list, not ported) |
| Portal import (Devpost, HackerEarth, Hack2Skill, DoraHacks, Luma, Townscript, Insider) | Disabled as required; not ported |
| WhatsApp / poster importer (`parser.ts`, `inputAdapters.ts`) | Partial (text parser ported; OCR missing) |
| OCR (Tesseract.js) | Missing |
| Media library (`mediaStore.ts`) | Missing |
| Team invitations | Missing |
| Minor Mode | Missing |
| Razorpay payments | Missing |
| WhatsApp Cloud API / LiveKit | Missing |
| Resend email | Missing |
| Deployed home features: hackathon snapshot, agent status panel, near-me radius, format chips | Missing |

## Tests (original `tests/`, 19 files)

Original suites run against the original repo. knot-mern has its own suites: `server` 108/108 (before this session's changes), `portalImport` 17/17.
Not ported: `hackathon-agent`, `hackathon-ui`, `cloud-discovery`, `cloud-mappers`, `commute`, `discovery-personalization`, `catalog-truthfulness`, `hackathon-truthfulness`, `sources-fixtures`, `importer-safety`, `domain`.
