/** Formatierung für die deutsche Oberfläche. */

/**
 * PostgREST liefert DECIMAL-Spalten als String, damit keine Präzision verloren
 * geht. Vor jeder Rechnung durch diese Funktion schicken.
 */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number.parseFloat(value);
}

const currency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export function formatPrice(value: number | string | null | undefined): string {
  return currency.format(toNumber(value));
}

const integer = new Intl.NumberFormat("de-DE");

export function formatQuantity(value: number | string | null | undefined): string {
  return integer.format(toNumber(value));
}

const dateTime = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "–";
  return dateTime.format(typeof value === "string" ? new Date(value) : value);
}
