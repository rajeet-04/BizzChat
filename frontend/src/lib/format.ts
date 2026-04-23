// ─── Formatting Utilities ─────────────────────────────────
// Convert raw backend values (numbers, ISO dates) into the
// display strings the UI components expect.

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// ─── Unit conversion helpers ───────────────────────────────
// Catalog prices are stored PER BASE UNIT (kg, litre).
// When an order is in sub-units (g, ml), we convert before multiplying.

/** Returns the base (catalog) unit for a given order unit. */
export function toBaseUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  if (unit === "g")  return "kg";
  if (unit === "ml") return "litre";
  return unit;
}

/** Converts order quantity to base unit quantity for price calculation. */
export function toBaseQty(quantity: number, unit: string | null | undefined): number {
  if (unit === "g")  return quantity / 1000; // 500g → 0.5 kg
  if (unit === "ml") return quantity / 1000; // 250ml → 0.25 litre
  return quantity;
}

/** Format a number as ₹X,XX,XXX */
export function formatINR(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return INR.format(amount);
}

/**
 * Parse a date string robustly.
 * Handles both ISO 8601 ("2026-04-05T10:00:00.000Z") and
 * Postgres timestamp format ("2026-04-05 10:00:00.123456") which
 * uses a space instead of "T" and is rejected by strict browsers.
 */
function parseDate(iso: string): Date {
  // Replace the space separator with "T" so every JS engine accepts it
  const normalized = iso.replace(" ", "T");
  return new Date(normalized);
}

/** Format an ISO/Postgres timestamp to "5 Apr, 10:42 AM" style. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDate(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }) +
    ", " +
    d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  );
}

/** Format ISO to "5 Apr 2026" (date only). */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDate(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Map backend status strings to the display statuses used in the UI. */
export function mapStatus(
  backendStatus: string,
): "Paid" | "Pending" | "Processing" | "Draft" | "Failed" {
  switch (backendStatus.toLowerCase()) {
    case "confirmed":
    case "fulfilled":
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "processing":
    case "credit":
      return "Processing";
    case "draft":
      return "Draft";
    case "cancelled":
    case "failed":
      return "Failed";
    default:
      return "Pending";
  }
}

/** Build an items summary string like "2kg Aaloo, 1kg Pyaaz". */
export function summarizeItems(
  items: { product_name: string; quantity: number; price?: number | null; unit?: string | null }[],
): string {
  return items
    .map((i) => `${i.quantity}${i.unit ? ` ${i.unit}` : ""} ${i.product_name}`)
    .join(", ");
}

/**
 * Compute order total from items if the stored total is null/zero.
 * Uses unit-aware quantity (g→kg, ml→litre) before multiplying by per-base-unit price.
 */
export function computeTotal(
  storedTotal: number | null | undefined,
  items: { quantity: number; price?: number | null; unit?: string | null }[],
): number | null {
  if (storedTotal != null && storedTotal > 0) return storedTotal;
  const computed = items.reduce((sum, i) => {
    if (i.price != null && i.price > 0) {
      return sum + toBaseQty(i.quantity, i.unit) * i.price;
    }
    return sum;
  }, 0);
  return computed > 0 ? computed : null;
}
