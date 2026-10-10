// Deliverable physical products. Charges are money only and never touch the gold ledger.
export interface DeliveryProduct {
  code: string;
  name: string;
  goldMg: number;
  makingChargeMinor: number;
  shippingMinor: number;
}

export const DELIVERY_PRODUCTS: DeliveryProduct[] = [
  { code: 'COIN_10G', name: '10 g gold coin (24K)', goldMg: 10000, makingChargeMinor: 15000, shippingMinor: 5000 },
  { code: 'BAR_20G', name: '20 g gold bar (24K)', goldMg: 20000, makingChargeMinor: 20000, shippingMinor: 5000 },
  { code: 'BAR_50G', name: '50 g gold bar (24K)', goldMg: 50000, makingChargeMinor: 35000, shippingMinor: 7500 },
];

export const findProduct = (code: string) => DELIVERY_PRODUCTS.find((p) => p.code === code);
export const chargesFor = (p: DeliveryProduct) => p.makingChargeMinor + p.shippingMinor;
