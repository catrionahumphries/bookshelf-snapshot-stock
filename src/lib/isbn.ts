/** Return a checksum-validated ISBN-13; ISBN-10 input is converted. */
export function normalizeIsbn(value: string): string | null {
  const digits = value.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(digits)) {
    const total = [...digits].reduce((sum, digit, i) => sum + (digit === "X" ? 10 : Number(digit)) * (10 - i), 0);
    if (total % 11) return null;
    const prefix = `978${digits.slice(0, 9)}`;
    const sum = [...prefix].reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0);
    return `${prefix}${(10 - sum % 10) % 10}`;
  }
  if (!/^(978|979)\d{10}$/.test(digits)) return null;
  const sum = [...digits].reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0 ? digits : null;
}

export function acceptBarcode(previous: { isbn: string; time: number } | null, isbn: string, now: number) {
  return !previous || previous.isbn !== isbn || now - previous.time > 2000;
}