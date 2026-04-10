export const SOCKET_EVENTS = {
  // Client → Server
  JOIN_AUCTION:         'join-auction',
  LEAVE_AUCTION:        'leave-auction',
  PLACE_BID:            'place-bid',
  START_ITEM:           'start-item',
  END_ITEM:             'end-item',
  CHAT_MESSAGE:         'chat-message',
  END_AUCTION:          'end-auction',
  START_ITEM_TIMER:     'start-item-timer',

  // Server → Client
  BID_UPDATE:           'bid-update',
  BID_CONFIRMED:        'bid-confirmed',
  BID_ERROR:            'bid-error',
  ITEM_STARTED:         'item-started',
  ITEM_ENDED:           'item-ended',
  VIEWER_COUNT:         'viewer-count',
  CHAT_RECEIVED:        'chat-message',
  BID_STATE:            'bid-state',
  AUCTION_ENDED:        'auction-ended',
  TIMER_STARTED:        'timer-started',
  TIMER_UPDATE:         'timer-update',
  TIMER_ENDED:          'timer-ended',
} as const;