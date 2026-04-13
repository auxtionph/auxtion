/**
 * All monetary values in Auxtion are stored as centavos (integers).
 * Never use floats for money.
 */
export const toCentavos = (peso: number): number =>
  Math.round(peso * 100);

export const toPeso = (centavos: number): number =>
  centavos / 100;

export const formatPHP = (centavos: number): string =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toPeso(centavos));

export const computeMinimumOffer = (priceCentavos: number): number =>
  Math.round(priceCentavos * 0.7);