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
  videoTrackId: string | null;
  audioTrackId: string | null;
}

interface UseHMSOptions {
  roomId: string | null;
  userName: string;
  role: 'broadcaster' | 'viewer-realtime';
}

export const useHMS = ({ roomId, userName, role }: UseHMSOptions) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hmsRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const [peers, setPeers] = useState<HMSPeerInfo[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  useEffect(() => {
    if (!roomId || initializedRef.current) return;
    initializedRef.current = true;
    setIsLoading(true);
    void initialize(roomId);
    return () => {
      void cleanup();
      initializedRef.current = false;
    };
  }, [roomId]);

  const initialize = async (rid: string) => {
    try {
      const response = await apiClient.post('/streaming/token', { roomId: rid, role });
      const { token } = response.data.data as { token: string };

      const hms = await HMSSDK.build();
      hmsRef.current = hms;

      hms.addEventListener(HMSUpdateListenerActions.ON_JOIN, () => {
        setIsJoined(true);
        setIsLoading(false);
        void fetchPeers();
      });

      hms.addEventListener(HMSUpdateListenerActions.ON_PEER_UPDATE, () => void fetchPeers());
      hms.addEventListener(HMSUpdateListenerActions.ON_TRACK_UPDATE, () => void fetchPeers());

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hms.addEventListener(HMSUpdateListenerActions.ON_ERROR, (data: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        setError(String(data?.error?.message ?? 'Stream error'));
        setIsLoading(false);
      });

      const config = new HMSConfig({ authToken: token, username: userName });
      await hms.join(config);
    } catch (e) {
      console.log('HMS init error:', e);
      setError('Failed to connect to stream');
      setIsLoading(false);
    }
  };

  const fetchPeers = async () => {
    if (!hmsRef.current) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const localPeer = await hmsRef.current.getLocalPeer();
      const allPeers: HMSPeerInfo[] = [];

      if (localPeer) {
        allPeers.push({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          id: String(localPeer.peerID),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          name: String(localPeer.name),
          isLocal: true,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          videoTrackId: localPeer.localVideo?.trackId ? String(localPeer.localVideo.trackId) : null,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          audioTrackId: localPeer.localAudio?.trackId ? String(localPeer.localAudio.trackId) : null,
        });
      }
      setPeers(allPeers);
    } catch (e) {
      console.log('fetchPeers error:', e);
    }
  };

  const toggleMute = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const audioTrack = await hmsRef.current?.getLocalPeer();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      await audioTrack?.localAudio?.setMute(!isMuted);
      setIsMuted(prev => !prev);
    } catch { /* ignore */ }
  }, [isMuted]);

  const toggleCamera = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const peer = await hmsRef.current?.getLocalPeer();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      await peer?.localVideo?.setMute(!isCameraOff);
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

  const localPeer = peers.find(p => p.isLocal);
  const broadcasterPeer = peers.find(p => !p.isLocal);

  return {
    peers,
    localPeer,
    broadcasterPeer,
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