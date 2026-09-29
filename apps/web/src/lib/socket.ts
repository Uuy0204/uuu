import { io } from 'socket.io-client';

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? (typeof window === 'undefined'
  ? 'http://localhost:3001'
  : window.location.port === '3000'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : window.location.origin);
export const socket = io(serverUrl, { autoConnect: false, transports: ['websocket', 'polling'] });
