import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { RequireAuth } from './components/RequireAuth.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { DiscoverPage } from './pages/DiscoverPage.jsx';
import { EventDetailPage } from './pages/EventDetailPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { LoginPage, SignupPage } from './pages/AuthPages.jsx';
import { PlanPage } from './pages/PlanPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { NotificationsPage } from './pages/NotificationsPage.jsx';
import { OrganizerDashboardPage, OrganizerEventFormPage, OrganizerManagePage } from './pages/OrganizerPages.jsx';
import { InstantAddPage } from './pages/InstantAddPage.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="discover" element={<DiscoverPage />} />
        <Route path="events/:eventId" element={<EventDetailPage />} />
        <Route path="events/:eventId/register" element={<RequireAuth><RegisterPage /></RequireAuth>} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />

        <Route path="plan" element={<RequireAuth><PlanPage /></RequireAuth>} />
        <Route path="profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />

        <Route path="organizer" element={<RequireAuth roles={['organizer', 'admin']}><OrganizerDashboardPage /></RequireAuth>} />
        <Route path="organizer/instant" element={<RequireAuth roles={['organizer', 'admin']}><InstantAddPage /></RequireAuth>} />
        <Route path="organizer/events/new" element={<RequireAuth roles={['organizer', 'admin']}><OrganizerEventFormPage /></RequireAuth>} />
        <Route path="organizer/events/:eventId/edit" element={<RequireAuth roles={['organizer', 'admin']}><OrganizerEventFormPage /></RequireAuth>} />
        <Route path="organizer/events/:eventId" element={<RequireAuth roles={['organizer', 'admin']}><OrganizerManagePage /></RequireAuth>} />

        <Route path="admin" element={<RequireAuth roles={['admin']}><AdminPage /></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
