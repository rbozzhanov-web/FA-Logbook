/**
 * Money as a payslip prints it: thin-spaced thousands, decimals only where there are any.
 *
 * Deliberately not `Intl.NumberFormat` with a currency: the tenge symbol's placement and the
 * separator differ by locale, and a figure being checked against a spreadsheet should look the
 * same on every device rather than following whatever the phone is set to.
 */
export function formatMoney(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const negative = rounded < 0;
  const [whole, fraction] = Math.abs(rounded).toFixed(2).split('.');

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const decimals = fraction === '00' ? '' : `,${fraction.replace(/0$/, '')}`;

  return `${negative ? '−' : ''}${grouped}${decimals}`;
}

/** Hours as the pay bands count them: decimal, two places, matching the spreadsheet's cells. */
export function formatHours(hours: number): string {
  return (Math.round(hours * 100) / 100).toFixed(2);
}
