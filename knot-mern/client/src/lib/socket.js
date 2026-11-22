import { io } from 'socket.io-client';
import { getToken } from './session.js';

// One shared Socket.IO connection. The token is read at connect time, so reconnecting after
// sign-in or sign-out switches the notification channel without a page reload.
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: getToken() || undefined }),
    });
  }
  return socket;
}

export function reconnectSocket() {
  const s = getSocket();
  s.disconnect();
  s.connect();
}
