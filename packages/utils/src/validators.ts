export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const isValidPhone = (phone: string): boolean =>
  /^(09|\+639)\d{9}$/.test(phone);

export const isValidTrackingNumber = (tracking: string): boolean =>
  tracking.trim().length >= 6;

export const isValidBidAmount = (
  amount: number,
  currentPrice: number,
): boolean => amount > currentPrice;

export const isValidOfferAmount = (
  amount: number,
  minimumOffer: number,
): boolean => amount >= minimumOffer;