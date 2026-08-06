/** Setzt strukturierte Adressfelder zu einem Freitext zusammen (z. B. für den Checkout). */
export interface AddressFields {
  street: string;
  zip: string;
  city: string;
  country?: string | null;
}

export function composeAddress(fields: AddressFields): string {
  const lines = [fields.street, `${fields.zip} ${fields.city}`.trim()];
  const country = fields.country?.trim();
  if (country && country.toLowerCase() !== "deutschland") {
    lines.push(country);
  }
  return lines.filter(Boolean).join("\n");
}
