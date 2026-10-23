import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';

let socket: Socket | null = null;
export function getSocket() {
  if (!socket) socket = io({ auth: { token: getToken() }, autoConnect: true });
  return socket;
}
export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
