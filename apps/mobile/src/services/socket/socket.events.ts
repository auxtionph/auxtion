export const SOCKET_EVENTS = {
  // Client → Server
  JOIN_AUCTION:   'join-auction',
  LEAVE_AUCTION:  'leave-auction',
  PLACE_BID:      'place-bid',
  START_ITEM:     'start-item',
  END_ITEM:       'end-item',
  CHAT_MESSAGE:   'chat-message',

  // Server → Client
  BID_UPDATE:     'bid-update',
  BID_CONFIRMED:  'bid-confirmed',
  BID_ERROR:      'bid-error',
  ITEM_STARTED:   'item-started',
  ITEM_ENDED:     'item-ended',
  VIEWER_COUNT:   'viewer-count',
  CHAT_RECEIVED:  'chat-message',
  BID_STATE:      'bid-state',
} as const;