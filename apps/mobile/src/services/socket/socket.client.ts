import { io, Socket } from 'socket.io-client';
import { SOCKET_URL, SOCKET_NAMESPACE } from '../../constants/config';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(`${SOCKET_URL}${SOCKET_NAMESPACE}`, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
};

export const connectSocket = async (): Promise<void> => {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
};

export const disconnectSocket = (): void => {
  if (socket?.connected) {
    socket.disconnect();
  }
  socket = null;
};