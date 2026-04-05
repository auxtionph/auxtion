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

interface UseSocketOptions {
  auctionId: string;
  onBidUpdate?: (data: BidUpdate) => void;
  onBidConfirmed?: (data: BidUpdate) => void;
  onBidError?: (error: { message: string }) => void;
  onChatMessage?: (data: ChatMessage) => void;
  onItemStarted?: (data: ItemStarted) => void;
  onItemEnded?: (data: ItemEnded) => void;
  onViewerCount?: (data: { count: number }) => void;
}

export const useAuctionSocket = ({
  auctionId,
  onBidUpdate,
  onBidConfirmed,
  onBidError,
  onChatMessage,
  onItemStarted,
  onItemEnded,
  onViewerCount,
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

    // Join auction room
    socket.emit(SOCKET_EVENTS.JOIN_AUCTION, { auctionId, token });

    // Listeners
    if (onBidUpdate) socket.on(SOCKET_EVENTS.BID_UPDATE, onBidUpdate);
    if (onBidConfirmed) socket.on(SOCKET_EVENTS.BID_CONFIRMED, onBidConfirmed);
    if (onBidError) socket.on(SOCKET_EVENTS.BID_ERROR, onBidError);
    if (onChatMessage) socket.on(SOCKET_EVENTS.CHAT_RECEIVED, onChatMessage);
    if (onItemStarted) socket.on(SOCKET_EVENTS.ITEM_STARTED, onItemStarted);
    if (onItemEnded) socket.on(SOCKET_EVENTS.ITEM_ENDED, onItemEnded);
    if (onViewerCount) socket.on(SOCKET_EVENTS.VIEWER_COUNT, onViewerCount);
  };

  const placeBid = useCallback((itemId: string, amount: number) => {
    socketRef.current?.emit(SOCKET_EVENTS.PLACE_BID, { auctionId, itemId, amount });
  }, [auctionId]);

  const sendChat = useCallback((message: string, userId?: string, displayName?: string) => {
    socketRef.current?.emit(SOCKET_EVENTS.CHAT_MESSAGE, { auctionId, message, userId, displayName });
  }, [auctionId]);

  return { placeBid, sendChat };
};