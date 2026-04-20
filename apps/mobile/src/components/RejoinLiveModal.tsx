import { View, Text, TouchableOpacity, Modal, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useRejoinStore } from '../stores/rejoin.store';
import { auctionsApi } from '../services/api/auctions.api';

export function RejoinLiveModal() {
    const router = useRouter();
    const { activeAuction, setActiveAuction } = useRejoinStore();

    if (!activeAuction) return null;

    const handleRejoin = () => {
        setActiveAuction(null);
        router.push(`/auction/${activeAuction.id}/live?role=broadcaster`);
    };

    const handleDismiss = () => {
        Alert.alert(
            'End Auction?',
            'This will permanently end your live auction. Your buyers will be notified.',
            [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'End Auction',
                style: 'destructive',
                onPress: async () => {
                try {
                    await auctionsApi.end(activeAuction.id);
                } catch { /* ignore */ }
                setActiveAuction(null);
                },
            },
            ]
        );
    };

  return (
    <Modal visible transparent animationType="fade">
      <View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.88)',
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 24,
      }}>
        <View style={{
          backgroundColor: '#111827', borderRadius: 24,
          padding: 28, width: '100%',
          borderWidth: 1, borderColor: '#1F2937',
        }}>
          {/* Pulsing live indicator */}
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: 'rgba(220,38,38,0.15)',
              borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8,
              borderWidth: 1, borderColor: '#DC2626',
              marginBottom: 16,
            }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' }} />
              <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 13 }}>
                STILL LIVE
              </Text>
            </View>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📡</Text>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 20, textAlign: 'center', marginBottom: 8 }}>
              Your live is still running
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>
                "{activeAuction.title}"
              </Text>
              {' '}is still active. Your buyers are waiting!
            </Text>
          </View>

          {/* Stats */}
          <View style={{
            backgroundColor: '#1F2937', borderRadius: 14,
            padding: 16, marginBottom: 24,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Items remaining</Text>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
                {activeAuction.shopItems.filter(i => i.status === 'QUEUED').length} queued
              </Text>
            </View>
            {activeAuction.shopItems.find(i => i.status === 'LIVE') && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Current item</Text>
                <Text style={{ color: '#DC2626', fontWeight: '600', fontSize: 13 }}>
                  🔴 {activeAuction.shopItems.find(i => i.status === 'LIVE')?.title}
                </Text>
              </View>
            )}
          </View>

          {/* Rejoin button */}
          <TouchableOpacity
            style={{
              backgroundColor: '#DC2626', borderRadius: 14,
              paddingVertical: 16, alignItems: 'center', marginBottom: 10,
            }}
            onPress={handleRejoin}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              📡 Rejoin Live Now
            </Text>
            <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 2 }}>
              Your buyers are waiting
            </Text>
          </TouchableOpacity>

          {/* End auction button */}
          <TouchableOpacity
            style={{
              backgroundColor: 'transparent', borderRadius: 14,
              paddingVertical: 14, alignItems: 'center',
              borderWidth: 1, borderColor: '#374151',
            }}
            onPress={handleDismiss}
          >
            <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 15 }}>
              End Auction
            </Text>
            <Text style={{ color: '#4B5563', fontSize: 12, marginTop: 2 }}>
              Close the live and notify buyers
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}