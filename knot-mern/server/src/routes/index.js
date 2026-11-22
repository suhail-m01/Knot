import { Router } from 'express';
import { dbReady } from '../config/db.js';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import localitiesRoutes from './localities.routes.js';
import eventsRoutes from './events.routes.js';
import organizerRoutes from './organizer.routes.js';
import notificationsRoutes from './notifications.routes.js';
import adminRoutes from './admin.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (req, res) => {
  const ok = dbReady();
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    database: ok ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  });
});

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', usersRoutes);
apiRouter.use('/localities', localitiesRoutes);
apiRouter.use('/events', eventsRoutes);
apiRouter.use('/organizer', organizerRoutes);
apiRouter.use('/notifications', notificationsRoutes);
apiRouter.use('/admin', adminRoutes);
