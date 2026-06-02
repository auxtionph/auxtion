export type UserRole = 'BUYER' | 'SELLER' | 'ADMIN';

export type SellerTier = 'NEW' | 'ESTABLISHED' | 'POWER';

export type SellerApplicationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export interface User {
  id: string;
  email: string;
  phone?: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  sellerTier: SellerTier;
  totalSales: number;
  isVerified: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SellerApplication {
  id: string;
  userId: string;
  fullName: string;
  idImageUrl: string;
  contactNo: string;
  description: string;
  payoutInfo: string;
  status: SellerApplicationStatus;
  rejectedReason?: string;
  reviewedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
