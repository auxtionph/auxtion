import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
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
      // The server derives socket identity from this JWT — it is re-read on
      // every (re)connect, so a refreshed access token is picked up automatically.
      auth: (cb: (data: { token: string }) => void) => {
        SecureStore.getItemAsync('accessToken')
          .then(token => cb({ token: token ?? '' }))
          .catch(() => cb({ token: '' }));
      },
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