import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TermsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1117', paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={{ color: '#2563EB', fontSize: 15, fontWeight: '500' }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={{ color: '#EEF2F7', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>Terms of Service</Text>
      </View>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <Section title="1. Acceptance of Terms">
          By creating an account or using Auxtion, you agree to these Terms of Service. If you do not agree, do not use the platform.
        </Section>
        <Section title="2. Platform Description">
          Auxtion is a live auction marketplace connecting sellers and buyers in the Philippines. Sellers host live video auctions; buyers bid in real time. Auxtion facilitates the transaction but is not a party to the sale.
        </Section>
        <Section title="3. Eligibility">
          You must be at least 18 years old and a resident of the Philippines to use Auxtion. Seller accounts require identity verification and admin approval.
        </Section>
        <Section title="4. User Accounts">
          You are responsible for maintaining the confidentiality of your account credentials. You may not share, sell, or transfer your account. Auxtion reserves the right to suspend or terminate accounts that violate these terms.
        </Section>
        <Section title="5. Seller Obligations">
          Sellers must accurately describe items, fulfill orders promptly, and provide valid tracking information. Sellers must not list prohibited items including counterfeit goods, weapons, drugs, or stolen property. Failure to comply may result in account revocation.
        </Section>
        <Section title="6. Buyer Obligations">
          Buyers must pay for items won within the specified payment window. Failure to pay may result in order cancellation and account restrictions. Buyers must provide accurate shipping information.
        </Section>
        <Section title="7. Payments & Fees">
          Payments are processed through PayMongo and manual transfer methods (GCash, bank transfer). Auxtion may charge a platform commission on completed sales. All prices are in Philippine Pesos (PHP) and stored in centavos.
        </Section>
        <Section title="8. Disputes & Refunds">
          Buyers may raise disputes for shipped orders. Auxtion administrators will review disputes and resolve them in favor of the buyer or seller. Refund decisions are at the sole discretion of Auxtion.
        </Section>
        <Section title="9. Prohibited Conduct">
          Users may not manipulate bidding (shill bidding), harass other users, circumvent platform fees, or use the platform for illegal purposes. Violations may result in immediate account termination.
        </Section>
        <Section title="10. Limitation of Liability">
          Auxtion is provided "as is." We do not guarantee uninterrupted service, successful transactions, or item quality. Auxtion is not liable for losses arising from transactions between buyers and sellers.
        </Section>
        <Section title="11. Modifications">
          Auxtion reserves the right to modify these terms at any time. Continued use after changes constitutes acceptance. Material changes will be communicated via in-app notification.
        </Section>
        <Section title="12. Contact">
          For questions about these terms, contact support@auxtion.ph.
        </Section>
        <Text style={{ color: '#5B6675', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
          Last updated: July 2026
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ color: '#EEF2F7', fontSize: 15, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
      <Text style={{ color: '#939EAE', fontSize: 14, lineHeight: 22 }}>{children}</Text>
    </View>
  );
}
