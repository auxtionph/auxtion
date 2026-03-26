export const API_BASE_URL = __DEV__
  ? 'http://localhost:3000/api/v1'
  : 'https://api.auxtion.ph/api/v1';

export const SOCKET_URL = __DEV__
  ? 'http://localhost:3000'
  : 'https://api.auxtion.ph';

export const SOCKET_NAMESPACE = '/auctions';