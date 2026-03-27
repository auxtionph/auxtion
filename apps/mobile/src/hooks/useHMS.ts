import { useEffect, useRef, useState, useCallback } from 'react';
import {
  HMSSDK,
  HMSConfig,
  HMSUpdateListenerActions,
} from '@100mslive/react-native-hms';
import { apiClient } from '../services/api/client';

interface HMSPeerInfo {
  id: string;
  name: string;
  isLocal: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videoTrack: { trackId: string } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audioTrack: { trackId: string } | null;
}

interface UseHMSOptions {
  roomId: string;
  userName: string;
  role: 'broadcaster' | 'viewer-realtime';
}

export const useHMS = ({ roomId, userName, role }: UseHMSOptions) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hmsRef = useRef<any>(null);
  const [peers, setPeers] = useState<HMSPeerInfo[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  useEffect(() => {
    void initialize();
    return () => {
      void cleanup();
    };
  }, [roomId]);

  const initialize = async () => {
    try {
      // Get auth token from our backend
      const response = await apiClient.post('/streaming/token', {
        roomId,
        role,
      });
      const { token } = response.data.data as { token: string };

      // Build HMS instance
      const hms = await HMSSDK.build();
      hmsRef.current = hms;

      // Listeners
      hms.addEventListener(
        HMSUpdateListenerActions.ON_JOIN,
        () => {
          setIsJoined(true);
          setIsLoading(false);
          updatePeers(hms);
        },
      );

      hms.addEventListener(
        HMSUpdateListenerActions.ON_PEER_UPDATE,
        () => updatePeers(hms),
      );

      hms.addEventListener(
        HMSUpdateListenerActions.ON_TRACK_UPDATE,
        () => updatePeers(hms),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hms.addEventListener(HMSUpdateListenerActions.ON_ERROR, (data: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        setError(String(data?.error?.message ?? 'Stream error'));
        setIsLoading(false);
      });

      // Join the room
      const config = new HMSConfig({ authToken: token, username: userName });
      await hms.join(config);
    } catch {
      setError('Failed to connect to stream');
      setIsLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePeers = (hms: any) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const room = hms.getRoom();
      if (!room) return;
      const allPeers: HMSPeerInfo[] = [];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (room.localPeer) {
        allPeers.push({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          id: room.localPeer.peerID,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          name: room.localPeer.name,
          isLocal: true,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          videoTrack: room.localPeer.videoTrack ? { trackId: room.localPeer.videoTrack.trackId } : null,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          audioTrack: room.localPeer.audioTrack ? { trackId: room.localPeer.audioTrack.trackId } : null ,
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      room.peers?.forEach((peer: HMSPeerInfo) => {
        allPeers.push({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          id: (peer as any).peerID,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          name: peer.name,
          isLocal: false,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          videoTrack: peer.videoTrack,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          audioTrack: peer.audioTrack,
        });
      });
      setPeers(allPeers);
    } catch {
      // ignore
    }
  };

  const toggleMute = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await hmsRef.current?.localPeer?.localAudioTrack()?.setMute(!isMuted);
      setIsMuted(prev => !prev);
    } catch { /* ignore */ }
  }, [isMuted]);

  const toggleCamera = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await hmsRef.current?.localPeer?.localVideoTrack()?.setMute(!isCameraOff);
      setIsCameraOff(prev => !prev);
    } catch { /* ignore */ }
  }, [isCameraOff]);

  const cleanup = async () => {
    try {
      if (hmsRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await hmsRef.current.leave();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await hmsRef.current.destroy();
        hmsRef.current = null;
      }
    } catch { /* ignore */ }
  };

  const broadcasterPeer = peers.find(p => !p.isLocal);
  const localPeer = peers.find(p => p.isLocal);

  return {
    peers,
    broadcasterPeer,
    localPeer,
    isJoined,
    isLoading,
    error,
    isMuted,
    isCameraOff,
    toggleMute,
    toggleCamera,
    leave: cleanup,
  };
};