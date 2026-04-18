import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, connectSocket, disconnectSocket } from '../services/socket/socket.client';
import { SOCKET_EVENTS } from '../services/socket/socket.events';
import * as SecureStore from 'expo-secure-store';

interface BidUpdate {
  auctionId: string;
  itemId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  totalBids: number;
  timestamp: number;
}

interface ChatMessage {
  userId: string;
  displayName: string;
  message: string;
  timestamp: number;
}

interface ItemStarted {
  itemId: string;
  title: string;
  currentPrice: number;
  photos: string[];
}

interface ItemEnded {
  itemId: string;
  winner: { userId: string; displayName: string; amount: number } | null;
}

export interface TimerUpdate {
  itemId: string;
  remaining: number;
  isCounterbid: boolean;
}

export interface TimerStarted {
  itemId: string;
  remaining: number;
  counterbidSeconds: number;
}

interface UseSocketOptions {
  auctionId: string;
  userId?: string;
  onBidUpdate?: (data: BidUpdate) => void;
  onBidConfirmed?: (data: BidUpdate) => void;
  onBidError?: (error: { message: string }) => void;
  onChatMessage?: (data: ChatMessage) => void;
  onChatHistory?: (messages: ChatMessage[]) => void;
  onItemStarted?: (data: ItemStarted) => void;
  onItemEnded?: (data: ItemEnded) => void;
  onViewerCount?: (data: { count: number }) => void;
  onAuctionEnded?: (data: { auctionId: string; timestamp: number }) => void;
  onTimerStarted?: (data: TimerStarted) => void;
  onTimerUpdate?: (data: TimerUpdate) => void;
  onTimerEnded?: (data: { itemId: string }) => void;
  onShopUpdated?: (data: { auctionId: string; timestamp: number }) => void;
  onOfferReceived?: (data: { offerId: string; itemId: string; itemTitle: string; buyerName: string; amount: number; timestamp: number }) => void;
  onOfferResponded?: (data: { offerId: string; status: string; itemTitle: string; amount: number }) => void;
  onTimerPaused?: (data: { itemId: string; remaining: number; reason: string }) => void;
  onTimerResumed?: (data: { itemId: string; remaining: number }) => void;
}

export const useAuctionSocket = ({
  auctionId,
  userId,
  onBidUpdate,
  onBidConfirmed,
  onBidError,
  onChatMessage,
  onChatHistory,
  onItemStarted,
  onItemEnded,
  onViewerCount,
  onAuctionEnded,
  onTimerStarted,
  onTimerUpdate,
  onTimerEnded,
  onShopUpdated,
  onOfferReceived,
  onOfferResponded,
  onTimerPaused,
  onTimerResumed,
}: UseSocketOptions) => {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    void setupSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.emit(SOCKET_EVENTS.LEAVE_AUCTION, { auctionId });
        disconnectSocket();
      }
    };
  }, [auctionId]);

  const setupSocket = async () => {
    const token = await SecureStore.getItemAsync('accessToken');
    await connectSocket();
    const socket = getSocket();
    socketRef.current = socket;
    socket.emit(SOCKET_EVENTS.JOIN_AUCTION, { auctionId, token, sellerId: userId });

    socket.off(SOCKET_EVENTS.BID_UPDATE);
    socket.off(SOCKET_EVENTS.BID_CONFIRMED);
    socket.off(SOCKET_EVENTS.BID_ERROR);
    socket.off(SOCKET_EVENTS.CHAT_RECEIVED);
    socket.off(SOCKET_EVENTS.ITEM_STARTED);
    socket.off(SOCKET_EVENTS.ITEM_ENDED);
    socket.off(SOCKET_EVENTS.VIEWER_COUNT);
    socket.off('chat-history');
    socket.off(SOCKET_EVENTS.AUCTION_ENDED);
    socket.off(SOCKET_EVENTS.TIMER_STARTED);
    socket.off(SOCKET_EVENTS.TIMER_UPDATE);
    socket.off(SOCKET_EVENTS.TIMER_ENDED);
    socket.off('shop-updated');
    socket.off('offer-received');
    socket.off('offer-responded');
    socket.off('timer-paused');
    socket.off('timer-resumed');

    if (onBidUpdate) socket.on(SOCKET_EVENTS.BID_UPDATE, onBidUpdate);
    if (onBidConfirmed) socket.on(SOCKET_EVENTS.BID_CONFIRMED, onBidConfirmed);
    if (onBidError) socket.on(SOCKET_EVENTS.BID_ERROR, onBidError);
    if (onChatMessage) socket.on(SOCKET_EVENTS.CHAT_RECEIVED, onChatMessage);
    if (onItemStarted) socket.on(SOCKET_EVENTS.ITEM_STARTED, onItemStarted);
    if (onItemEnded) socket.on(SOCKET_EVENTS.ITEM_ENDED, onItemEnded);
    if (onViewerCount) socket.on(SOCKET_EVENTS.VIEWER_COUNT, onViewerCount);
    if (onTimerStarted) socket.on(SOCKET_EVENTS.TIMER_STARTED, onTimerStarted);
    if (onTimerUpdate) socket.on(SOCKET_EVENTS.TIMER_UPDATE, onTimerUpdate);
    if (onTimerEnded) socket.on(SOCKET_EVENTS.TIMER_ENDED, onTimerEnded);
    if (onShopUpdated) socket.on('shop-updated', onShopUpdated);
    if (onOfferReceived) socket.on('offer-received', onOfferReceived);
    if (onOfferResponded) socket.on('offer-responded', onOfferResponded);
    if (onTimerPaused) socket.on('timer-paused', onTimerPaused);
    if (onTimerResumed) socket.on('timer-resumed', onTimerResumed);


    if (onChatHistory) {
      socket.on('chat-history', (messages: ChatMessage[]) => {
        console.log(`[Socket] chat-history: ${messages.length} messages`);
        onChatHistory(messages);
      });
    }

    socket.on(SOCKET_EVENTS.AUCTION_ENDED, (data) => {
      console.log('AUCTION_ENDED received:', JSON.stringify(data));
      if (onAuctionEnded) onAuctionEnded(data);
    });
  };

  const placeBid = useCallback((itemId: string, amount: number, bidderId: string) => {
    socketRef.current?.emit(SOCKET_EVENTS.PLACE_BID, { auctionId, itemId, amount, bidderId });
  }, [auctionId]);

  const sendChat = useCallback((message: string, userId?: string, displayName?: string) => {
    socketRef.current?.emit(SOCKET_EVENTS.CHAT_MESSAGE, { auctionId, message, userId, displayName });
  }, [auctionId]);

  const endAuction = useCallback(() => {
    socketRef.current?.emit(SOCKET_EVENTS.END_AUCTION, { auctionId });
  }, [auctionId]);

  const notifyShopUpdated = useCallback(() => {
    socketRef.current?.emit('notify-shop-updated', { auctionId });
  }, [auctionId]);

  const startItemTimer = useCallback((
    itemId: string,
    sellerId: string,
    startSeconds: number,
    counterbidSeconds: number,
  ) => {
    socketRef.current?.emit(SOCKET_EVENTS.START_ITEM_TIMER, {
      auctionId,
      itemId,
      sellerId,
      startSeconds,
      counterbidSeconds,
    });
  }, [auctionId]);

  const pauseTimer = useCallback((itemId: string, sellerId: string) => {
    socketRef.current?.emit('pause-item-timer', { auctionId, itemId, sellerId });
  }, [auctionId]);

  const resumeTimer = useCallback((itemId: string, sellerId: string) => {
    socketRef.current?.emit('resume-item-timer', { auctionId, itemId, sellerId });
  }, [auctionId]);

  return { placeBid, sendChat, endAuction, startItemTimer, notifyShopUpdated, pauseTimer, resumeTimer };
};