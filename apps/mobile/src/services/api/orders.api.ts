import { apiClient } from './client';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING_MANUAL_PAYMENT'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED';

export type CourierKey =
  | 'JT_EXPRESS'
  | 'LBC'
  | 'NINJA_VAN'
  | 'FLASH_EXPRESS'
  | 'GRAB_EXPRESS'
  | 'OTHER';

export const COURIER_LABELS: Record<CourierKey, string> = {
  JT_EXPRESS: 'J&T Express',
  LBC: 'LBC',
  NINJA_VAN: 'Ninja Van',
  FLASH_EXPRESS: 'Flash Express',
  GRAB_EXPRESS: 'Grab Express',
  OTHER: 'Other',
};

export const COURIER_KEYS = Object.keys(COURIER_LABELS) as CourierKey[];

export interface Order {
  id: string;
  itemId: string;
  auctionId: string | null;
  sellerId: string;
  buyerId: string;
  amount: number;
  commissionAmount: number;
  processingFee: number;
  sellerPayout: number;
  paymentMethod: 'CARD' | 'GCASH' | 'MAYA' | 'MANUAL';
  status: OrderStatus;
  mode: string;
  courier: CourierKey | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  autoConfirmAt: string | null;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingLine1: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingPostalCode: string | null;
  paidAt: string | null;
  createdAt: string;
  item: { id: string; title: string; photos: { url: string }[] };
  buyer: { id: string; displayName: string };
  seller: { id: string; displayName: string };
  payment?: { status: string; paymongoRef: string | null } | null;
  dispute?: { reason: string; status: string } | null;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  line1: string;
  city: string;
  province: string;
  postalCode: string;
}

export const ordersApi = {
  listBuying: () =>
    apiClient.get<Order[]>('/orders/buying').then(r => r.data),

  listSelling: () =>
    apiClient.get<Order[]>('/orders/selling').then(r => r.data),

  getById: (id: string) =>
    apiClient.get<Order>(`/orders/${id}`).then(r => r.data),

  getDefaultAddress: () =>
    apiClient.get<ShippingAddress | null>('/orders/address/default').then(r => r.data),

  updateShippingAddress: (id: string, address: ShippingAddress) =>
    apiClient.patch(`/orders/${id}/shipping-address`, address).then(r => r.data),

  markPaid: (id: string) =>
    apiClient.patch(`/orders/${id}/mark-paid`).then(r => r.data),

  ship: (id: string, courier: CourierKey, trackingNumber: string) =>
    apiClient.patch(`/orders/${id}/ship`, { courier, trackingNumber }).then(r => r.data),

  confirmReceipt: (id: string) =>
    apiClient.patch(`/orders/${id}/confirm-receipt`).then(r => r.data),

  dispute: (id: string, reason: string) =>
    apiClient.patch(`/orders/${id}/dispute`, { reason }).then(r => r.data),

  cancel: (id: string) =>
    apiClient.patch(`/orders/${id}/cancel`).then(r => r.data),
};