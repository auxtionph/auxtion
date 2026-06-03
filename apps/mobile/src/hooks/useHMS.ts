import { useEffect, useRef, useState, useCallback } from 'react';
import {
  HMSSDK,
  HMSConfig,
  HMSUpdateListenerActions,
  HMSTrackType,
  HMSTrackUpdate,
  HMSPeerUpdate,
  HMSRoleChangeRequest,
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
  role: 'broadcaster' | 'co-broadcaster' | 'viewer-realtime';
  onSellerLeft?: () => void;
  onRoleChanged?: (newRole: string) => void;   // fired after server promotes/demotes us
}

export const useHMS = ({ roomId, userName, role, onSellerLeft, onRoleChanged }: UseHMSOptions) => {
  const hmsRef = useRef<HMSSDK | null>(null);
  const initializedRef = useRef(false);
  const trackMapRef = useRef<Record<string, string>>({});

  const [peers, setPeers] = useState<HMSPeerInfo[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  // ✅ FIX #2: trackMap as state so components re-render when tracks arrive
  const [trackMap, setTrackMap] = useState<Record<string, string>>({});

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

  const buildPeerList = useCallback(async () => {
    if (!hmsRef.current) return;
    try {
      const localPeer = await hmsRef.current.getLocalPeer();
      const remotePeers = await hmsRef.current.getRemotePeers();
      const allPeers: HMSPeerInfo[] = [];

      if (localPeer) {
        // ✅ CORRECT: localVideoTrack() is a method, not a property
        const localVideoTrack = localPeer.localVideoTrack();
        const localAudioTrack = localPeer.localAudioTrack();

        const videoTrackId = localVideoTrack?.trackId
          ? String(localVideoTrack.trackId)
          : null;

        console.log('[HMS] Local peer video:', {
          trackId: videoTrackId,
          isMute: localVideoTrack?.isMute,
        });

        allPeers.push({
          id: String(localPeer.peerID),
          name: String(localPeer.name),
          isLocal: true,
          videoTrackId,
          audioTrackId: localAudioTrack?.trackId
            ? String(localAudioTrack.trackId)
            : null,
        });
      }

      if (Array.isArray(remotePeers)) {
        remotePeers.forEach((peer) => {
          // ✅ FIX #2: Use trackMapRef (populated by ON_TRACK_UPDATE) for remote video
          const mappedTrackId = trackMapRef.current[String(peer.peerID)] ?? null;

          console.log('[HMS] Remote peer:', {
            name: peer.name,
            peerID: peer.peerID,
            mappedTrackId,
            trackMapSnapshot: { ...trackMapRef.current },
          });

          allPeers.push({
            id: String(peer.peerID),
            name: String(peer.name),
            isLocal: false,
            videoTrackId: mappedTrackId,
            audioTrackId: peer.audioTrack?.trackId
              ? String(peer.audioTrack.trackId)
              : null,
          });
        });
      }

      console.log('[HMS] Peers updated:', allPeers.map(p => ({
        name: p.name,
        isLocal: p.isLocal,
        videoTrackId: p.videoTrackId,
      })));

      setPeers(allPeers);
    } catch (e) {
      console.warn('[HMS] buildPeerList error:', e);
    }
  }, []);

  const initialize = async (rid: string) => {
    try {
      const response = await apiClient.post('/streaming/token', {
        roomId: rid,
        role,
      });
      const { token } = response.data.data as { token: string };

      const hms = await HMSSDK.build();
      hmsRef.current = hms;

      // ─── ON_JOIN ────────────────────────────────────────────────
      hms.addEventListener(HMSUpdateListenerActions.ON_JOIN, async () => {
        console.log('[HMS] ON_JOIN — role:', role);
        setIsJoined(true);
        setIsLoading(false);

        // ✅ CORRECT: Use localVideoTrack() method (not .localVideo property)
        if (role === 'broadcaster') {
          try {
            const lp = await hms.getLocalPeer();
            const videoTrack = lp.localVideoTrack();   // ← method call, not property
            const audioTrack = lp.localAudioTrack();   // ← method call, not property

            if (videoTrack) {
              videoTrack.setMute(false);               // ← on the track object, not hms instance
              console.log('[HMS] Broadcaster video unmuted, trackId:', videoTrack.trackId);
            }
            if (audioTrack) {
              audioTrack.setMute(false);
              console.log('[HMS] Broadcaster audio unmuted');
            }
          } catch (e) {
            console.warn('[HMS] Failed to unmute broadcaster tracks:', e);
          }
        }

        await buildPeerList();
      });

      // ─── ON_PEER_UPDATE ─────────────────────────────────────────
      hms.addEventListener(
        HMSUpdateListenerActions.ON_PEER_UPDATE,
        (data: { peer: unknown; type: HMSPeerUpdate }) => {
          console.log('[HMS] ON_PEER_UPDATE type:', data.type);

          // Detect seller leaving
          if (
            data.type === HMSPeerUpdate.PEER_LEFT &&
            role === 'viewer-realtime'
          ) {
            onSellerLeft?.();
          }

          void buildPeerList();
        },
      );

      // ─── ON_TRACK_UPDATE ────────────────────────────────────────
      hms.addEventListener(
        HMSUpdateListenerActions.ON_TRACK_UPDATE,
        (data: {
          peer: { peerID: string; name: string };
          track: {
            trackId: string;
            type: HMSTrackType;
            isMute: boolean;
            trackDescription?: string;
          };
          type: HMSTrackUpdate;
        }) => {
          const { peer, track, type: updateType } = data;

          console.log('[HMS] ON_TRACK_UPDATE', {
            peerName: peer?.name,
            peerId: peer?.peerID,
            trackId: track?.trackId,
            // ✅ FIX #1: Use track.type (HMSTrackType enum), NOT trackDescription string
            trackType: track?.type,
            isMute: track?.isMute,
            updateType,
          });

          // ✅ FIX #1: Check by HMSTrackType enum — reliable, not string matching
          const isVideoTrack = track?.type === HMSTrackType.VIDEO;
          const isAdded = updateType === HMSTrackUpdate.TRACK_ADDED;
          const isUnmuted = updateType === HMSTrackUpdate.TRACK_UNMUTED;

          if (isVideoTrack && peer?.peerID && track?.trackId) {
            if (isAdded || isUnmuted) {
              console.log('[HMS] ✅ Storing video trackId:', {
                peerName: peer.name,
                peerId: peer.peerID,
                trackId: track.trackId,
              });
              // Update ref (sync) + state (triggers re-render)
              trackMapRef.current[peer.peerID] = track.trackId;
              setTrackMap(prev => ({
                ...prev,
                [peer.peerID]: track.trackId,
              }));
            }

            if (updateType === HMSTrackUpdate.TRACK_MUTED) {
              console.log('[HMS] ⚠️ Video track muted for peer:', peer.name);
            }
          }

          void buildPeerList();
        },
      );

      // ─── ON_ROLE_CHANGE_REQUEST ─────────────────────────────────────
      // Fires when server promotes/demotes us (e.g., viewer → co-broadcaster)
      hms.addEventListener(
        HMSUpdateListenerActions.ON_ROLE_CHANGE_REQUEST,
        async (data: { requestedBy?: { name?: string }; suggestedRole: { name: string } }) => {
          const newRole = data.suggestedRole?.name;
          console.log('[HMS] ON_ROLE_CHANGE_REQUEST → auto-accepting:', newRole);
          try {
            await hms.acceptRoleChange();
            console.log('[HMS] Role change accepted, now:', newRole);

            // Local tracks attach asynchronously after promotion — poll a few times
            if (newRole === 'broadcaster' || newRole === 'co-broadcaster') {
              const tryUnmuteAndRebuild = async () => {
                try {
                  const lp = await hms.getLocalPeer();
                  const videoTrack = lp.localVideoTrack();
                  const audioTrack = lp.localAudioTrack();
                  if (videoTrack) {
                    videoTrack.setMute(false);
                    console.log('[HMS] Co-broadcaster video trackId:', videoTrack.trackId);
                  }
                  if (audioTrack) audioTrack.setMute(false);
                  await buildPeerList();
                } catch (err) {
                  console.warn('[HMS] post-promotion unmute attempt failed:', err);
                }
              };
              await tryUnmuteAndRebuild();
              setTimeout(() => { void tryUnmuteAndRebuild(); }, 400);
              setTimeout(() => { void tryUnmuteAndRebuild(); }, 1200);
              setTimeout(() => { void tryUnmuteAndRebuild(); }, 2500);
            }

            onRoleChanged?.(newRole);
            await buildPeerList();
          } catch (e) {
            console.warn('[HMS] acceptRoleChange failed:', e);
          }
        },
      );

      // ─── ON_ERROR ───────────────────────────────────────────────
      hms.addEventListener(
        HMSUpdateListenerActions.ON_ERROR,
        (data: unknown) => {
          console.error('[HMS] ON_ERROR raw payload:', JSON.stringify(data));
          const err = data as { error?: { message?: string; code?: number } } | null;
          const code = err?.error?.code;
          const message = err?.error?.message;

          // Code 4005 = terminal (room ended, token expired) — log only, don't crash UI
          // Code 1003/1004 = network reconnect — transient, ignore
          const terminalCodes = [4005, 4001, 4002];
          const transientCodes = [1003, 1004, 424, 3015]; // 3015 = audio session blip, canRetry=true

          if (code && transientCodes.includes(code)) {
            console.warn('[HMS] Transient error (will auto-recover):', code, message);
            return;
          }

          if (!message && !code) {
            // Empty payload — internal SDK event, safe to ignore
            console.warn('[HMS] ON_ERROR with no payload — likely internal SDK event');
            return;
          }

          console.error('[HMS] Fatal error:', code, message);
          setError(message ?? 'Stream error');
          setIsLoading(false);
        },
      );

      const config = new HMSConfig({ authToken: token, username: userName });
      await hms.join(config);
    } catch (e) {
      console.error('[HMS] init error:', e);
      setError('Failed to connect to stream');
      setIsLoading(false);
    }
  };

  const toggleMute = useCallback(async () => {
    try {
      const lp = await hmsRef.current?.getLocalPeer();
      const audioTrack = lp?.localAudioTrack();
      if (audioTrack) {
        audioTrack.setMute(!isMuted);
        setIsMuted(prev => !prev);
      }
    } catch (e) {
      console.warn('[HMS] toggleMute error:', e);
    }
  }, [isMuted]);

  const toggleCamera = useCallback(async () => {
    try {
      const lp = await hmsRef.current?.getLocalPeer();
      const videoTrack = lp?.localVideoTrack();
      if (videoTrack) {
        videoTrack.setMute(!isCameraOff);
        setIsCameraOff(prev => !prev);
      }
    } catch (e) {
      console.warn('[HMS] toggleCamera error:', e);
    }
  }, [isCameraOff]);

  const switchCamera = useCallback(async () => {
    try {
      const lp = await hmsRef.current?.getLocalPeer();
      const videoTrack = lp?.localVideoTrack();
      if (videoTrack) {
        videoTrack.switchCamera();  // HMS SDK built-in — no params needed
      }
    } catch (e) {
      console.warn('[HMS] switchCamera error:', e);
    }
  }, []);

  const cleanup = async () => {
    try {
      if (hmsRef.current) {
        await hmsRef.current.leave();
        await hmsRef.current.destroy();
        hmsRef.current = null;
      }
    } catch (e) {
      console.warn('[HMS] cleanup error:', e);
    }
  };

  const localPeer = peers.find(p => p.isLocal) ?? null;
  const remoteBroadcasters = peers.filter(p => !p.isLocal);
  const broadcasterPeer = remoteBroadcasters[0] ?? null;   // primary (host)
  const coBroadcasterPeer = remoteBroadcasters[1] ?? null; // secondary (co-host)
  const getLocalPeerId = useCallback(async (): Promise<string | null> => {
    try {
      const lp = await hmsRef.current?.getLocalPeer();
      return lp?.peerID ? String(lp.peerID) : null;
    } catch {
      return null;
    }
  }, []);

  return {
    peers,
    localPeer,
    broadcasterPeer,
    coBroadcasterPeer,
    isJoined,
    isLoading,
    error,
    isMuted,
    isCameraOff,
    trackMap,
    hmsInstance: hmsRef.current,
    toggleMute,
    toggleCamera,
    switchCamera,
    leave: cleanup,
    getLocalPeerId,
  };
};