import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1117', paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={{ color: '#2563EB', fontSize: 15, fontWeight: '500' }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={{ color: '#EEF2F7', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>Privacy & Seller Policy</Text>
      </View>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <Text style={{ color: '#2563EB', fontSize: 13, fontWeight: '700', marginBottom: 20, letterSpacing: 1 }}>PRIVACY POLICY</Text>
        <Section title="1. Information We Collect">
          We collect your name, email, phone number, shipping address, payment method details (GCash number, bank account), and government-issued ID (for seller verification). We also collect usage data including bids, purchases, and device information.
        </Section>
        <Section title="2. How We Use Your Information">
          Your information is used to facilitate transactions, verify seller identity, process payments, deliver notifications, and improve the platform. We do not sell your personal data to third parties.
        </Section>
        <Section title="3. Data Sharing">
          We share limited information with transaction counterparties (buyer sees seller payment info for manual transfers; seller sees buyer shipping address). Payment data is shared with PayMongo for processing. ID photos are stored securely on Cloudinary and visible only to administrators.
        </Section>
        <Section title="4. Data Security">
          Passwords are hashed. Authentication uses JWT tokens stored in device secure storage. Seller ID numbers are masked in the database. API endpoints are protected by role-based access controls.
        </Section>
        <Section title="5. Data Retention">
          Account data is retained while your account is active. Transaction records are retained for legal and accounting purposes. You may request account deletion by contacting support@auxtion.ph.
        </Section>
        <Text style={{ color: '#2563EB', fontSize: 13, fontWeight: '700', marginTop: 28, marginBottom: 20, letterSpacing: 1 }}>SELLER POLICY</Text>
        <Section title="1. Application & Approval">
          Seller status requires submitting a valid government-issued ID, contact information, and payout details. Applications are reviewed by Auxtion administrators within 48 hours. Approval is at Auxtion's sole discretion.
        </Section>
        <Section title="2. Listing Standards">
          Items must be accurately described with clear photos. Prohibited items include counterfeit goods, weapons, controlled substances, stolen property, and items violating Philippine law. Auxtion reserves the right to remove listings without notice.
        </Section>
        <Section title="3. Order Fulfillment">
          Sellers must ship items within 3 business days of confirmed payment. Valid tracking information must be provided. Failure to fulfill orders may result in seller status revocation.
        </Section>
        <Section title="4. Payouts">
          Seller payouts are held until buyer confirms receipt or auto-confirmed after the review period. Payouts are released to the seller's registered GCash or bank account. Auxtion may withhold payouts for disputed orders pending resolution.
        </Section>
        <Section title="5. Revocation">
          Auxtion administrators may revoke seller status for violations including non-fulfillment, counterfeit items, harassment, or repeated disputes. Revoked sellers may not reapply for 48 hours.
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
