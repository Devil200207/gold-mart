// Display-only formatting from integers (used by the receipt and the mock checkout page).
export function formatMg(mg: number): string {
  const sign = mg < 0 ? '-' : '';
  const abs = Math.abs(mg);
  return `${sign}${Math.trunc(abs / 1000)}.${String(abs % 1000).padStart(3, '0')} g`;
}

export function formatMoney(minor: number, currency: string, decimals = 2): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const unit = 10 ** decimals;
  const major = new Intl.NumberFormat('en-US').format(Math.trunc(abs / unit));
  return decimals > 0 ? `${sign}${currency} ${major}.${String(abs % unit).padStart(decimals, '0')}` : `${sign}${currency} ${major}`;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
