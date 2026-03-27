export const API_BASE_URL = __DEV__
  ? 'http://192.168.100.206:3000/api/v1'
  : 'https://auxtion-production.up.railway.app/api/v1';

export const SOCKET_URL = __DEV__
  ? 'http://192.168.100.206:3000'
  : 'https://auxtion-production.up.railway.app';

export const SOCKET_NAMESPACE = '/auctions';