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
  photos: { url: string }[];
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
  onOfferResponded?: (data: { offerId: string; status: string; itemTitle: string; amount: number; buyerName?: string }) => void;
  onTimerPaused?: (data: { itemId: string; remaining: number; reason: string }) => void;
  onTimerResumed?: (data: { itemId: string; remaining: number }) => void;
  onLiveBuyNowStarted?: (data: { itemId: string; title: string; price: number; photos: { url: string }[] }) => void;
  onBuyNowClaimed?: (data: { itemId: string; title: string; price: number; buyerId: string; buyerName: string }) => void;
  onBuyNowPulled?: (data: { itemId: string }) => void;
  onBuyNowClaimFailed?: (data: { itemId: string; reason: string }) => void;
  onReaction?: (data: { emoji: string; userId: string }) => void;
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
  onLiveBuyNowStarted,
  onBuyNowClaimed,
  onBuyNowPulled,
  onBuyNowClaimFailed,
  onReaction,
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
    socket.off('live-buynow-started');
    socket.off('buynow-claimed');
    socket.off('buynow-pulled');
    socket.off('buynow-claim-failed');
    socket.off('bid-state');
    socket.off('reaction');

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
    if (onLiveBuyNowStarted) socket.on('live-buynow-started', onLiveBuyNowStarted);
    if (onBuyNowClaimed) socket.on('buynow-claimed', onBuyNowClaimed);
    if (onBuyNowPulled) socket.on('buynow-pulled', onBuyNowPulled);
    if (onBuyNowClaimFailed) socket.on('buynow-claim-failed', onBuyNowClaimFailed);
    if (onReaction) socket.on('reaction', onReaction);

    socket.on('bid-state', (data: {
      itemId: string;
      currentPrice: number;
      highestBidderId: string | null;
      highestBidderName: string | null;
      totalBids: number;
    }) => {
      if (onBidUpdate) {
        onBidUpdate({
          auctionId,
          itemId: data.itemId,
          bidderId: data.highestBidderId ?? '',
          bidderName: data.highestBidderName ?? '',
          amount: data.currentPrice,
          totalBids: data.totalBids,
          timestamp: Date.now(),
        });
      }
    });

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

    // ← Join LAST so all listeners are ready and sellerId is captured
    socket.emit(SOCKET_EVENTS.JOIN_AUCTION, { auctionId, token, sellerId: userId });
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

  const cancelItemTimer = useCallback((itemId: string) => {
    socketRef.current?.emit('cancel-item-timer', { auctionId, itemId });
  }, [auctionId]);

  const startLiveBuyNow = useCallback((itemId: string, sellerId: string) => {
    socketRef.current?.emit('start-live-buynow', { auctionId, itemId, sellerId });
  }, [auctionId]);

  const claimBuyNow = useCallback((itemId: string, buyerId: string, buyerName: string) => {
    socketRef.current?.emit('claim-buynow', { auctionId, itemId, buyerId, buyerName });
  }, [auctionId]);

  const pullBuyNow = useCallback((itemId: string, sellerId: string) => {
    socketRef.current?.emit('pull-buynow', { auctionId, itemId, sellerId });
  }, [auctionId]);


  const startChatBid = useCallback((itemId: string, sellerId: string, displaySeconds: number) => {
  socketRef.current?.emit('start-chat-bid', { auctionId, itemId, sellerId, displaySeconds });
}, [auctionId]);

  const declareChatWinner = useCallback((
    itemId: string,
    sellerId: string,
    winnerId: string,
    winnerName: string,
    amount: number,
  ) => {
    socketRef.current?.emit('declare-chat-winner', { auctionId, itemId, sellerId, winnerId, winnerName, amount });
  }, [auctionId]);

  const skipChatItem = useCallback((itemId: string, sellerId: string) => {
    socketRef.current?.emit('skip-chat-item', { auctionId, itemId, sellerId });
  }, [auctionId]);

  const sendReaction = useCallback((emoji: string, userId: string) => {
    socketRef.current?.emit('reaction', { auctionId, emoji, userId });
  }, [auctionId]);

  return { placeBid, sendChat, endAuction, startItemTimer, notifyShopUpdated, pauseTimer, resumeTimer, cancelItemTimer, startChatBid, declareChatWinner, skipChatItem, startLiveBuyNow, claimBuyNow, pullBuyNow, sendReaction };
};