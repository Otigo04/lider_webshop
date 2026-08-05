/** Konstanten, die Server und Client gemeinsam brauchen. Keine Server-Imports. */

/** Supabase-Storage-Bucket für Produktfotos. Privat, Zugriff über Signed URLs. */
export const PRODUCT_BUCKET = "products";

/** Muss zum file_size_limit des Buckets passen (siehe supabase/schema.sql). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];
