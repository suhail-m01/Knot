import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Event } from '../models/index.js';
import { isObjectIdString } from '../utils/text.js';

let io = null;

/**
 * Real-time channel (Socket.IO):
 *  - user:<id> rooms receive personal notifications (token required)
 *  - event:<id> rooms receive live seat counts (anonymous allowed)
 */
export function createSocketServer(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: env.clientOrigins, credentials: true },
    serveClient: false,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next();
    try {
      const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
      socket.data.userId = String(payload.sub);
      socket.join(`user:${payload.sub}`);
      return next();
    } catch {
      return next(new Error('Invalid session token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('event:watch', (eventId) => {
      if (isObjectIdString(eventId)) socket.join(`event:${eventId}`);
    });
    socket.on('event:unwatch', (eventId) => {
      if (isObjectIdString(eventId)) socket.leave(`event:${eventId}`);
    });
  });

  return io;
}

export const getIo = () => io;

export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function seatPayload(e) {
  const capacity = e.registration?.capacity ?? null;
  return {
    eventId: String(e._id),
    capacity,
    registeredCount: e.registeredCount ?? 0,
    waitlistCount: e.waitlistCount ?? 0,
    seatsLeft: capacity === null ? null : Math.max(0, capacity - (e.registeredCount ?? 0)),
  };
}

/** Re-reads the counters and broadcasts them to everyone watching the event. */
export async function publishSeats(eventId) {
  if (!io) return;
  const doc = await Event.findById(eventId, { registeredCount: 1, waitlistCount: 1, registration: 1 }).lean();
  if (doc) io.to(`event:${eventId}`).emit('seats', seatPayload(doc));
}
