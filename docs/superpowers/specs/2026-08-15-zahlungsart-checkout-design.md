# Zahlungsart im Checkout

Datum: 2026-08-15

## Ziel

Der Kunde entscheidet im Checkout weiterhin, ob er abholt oder sich liefern
lässt (`delivery_method`, bereits vorhanden). Neu: passend zur Lieferart wird
jetzt auch eine Zahlungsart festgehalten und dem Kunden angezeigt:

- Abholung → Barzahlung bei Abholung
- Versand → Überweisung nach Rechnung

Die beiden sind fest gekoppelt (1:1), es gibt keine freie Kombination und
keine separate Auswahl im Formular. Die Zahlungsart ergibt sich automatisch
aus der Lieferart.

## Datenmodell

Migration `supabase/migrations/016_zahlungsart.sql`, gleiches Muster wie
`004_artikelnummern_und_versand.sql`:

```sql
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'invoice';

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cash', 'invoice'));
```

`create_order()` bekommt **keinen** neuen Parameter. Die Funktion leitet
`payment_method` serverseitig aus dem vorhandenen `p_delivery_method` ab:

```sql
CASE p_delivery_method WHEN 'pickup' THEN 'cash' ELSE 'invoice' END
```

Damit ist ausgeschlossen, dass der Client eine abweichende Zahlungsart
unterschieben kann.

## Types (`lib/types.ts`)

```ts
export type PaymentMethod = "cash" | "invoice";
```

`Order` bekommt `payment_method: PaymentMethod`.

## Labels (`lib/shipping.ts`)

Neben `DELIVERY_METHOD_LABELS`:

```ts
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Bar bei Abholung",
  invoice: "Überweisung nach Rechnung",
};
```

## Checkout-Formular (`components/forms/checkout-form.tsx`)

Kein neues Eingabefeld. Unter der Lieferart-Auswahl erscheint ein Infotext,
der sich mit der gewählten `deliveryMethod` mitändert:

- `pickup` → "Zahlung: Bar bei Abholung."
- `shipping` → "Zahlung: Überweisung nach Rechnung."

`lib/actions/orders.ts` (`createOrder`) bleibt unverändert bis auf das, was
sich aus der DB-Signatur ergibt — es wird weiterhin nur `deliveryMethod` an
`create_order` übergeben.

## Anzeige in Bestelldetails

`app/orders/[id]/page.tsx` (Kunde) und `app/admin/orders/[id]/page.tsx`
(Admin) bekommen je ein zusätzliches `dt/dd`-Feld "Zahlung" neben
"Lieferung", mit `PAYMENT_METHOD_LABELS[order.payment_method]`.

`lib/queries/orders.ts` (`ORDER_COLUMNS`) bekommt `delivery_method` und
`payment_method` ergänzt. `delivery_method` fehlt dort aktuell (Bug: die
Kunden-Detailseite zeigt ohne diese Spalte `undefined` bei "Lieferung") —
wird im selben Zug mitkorrigiert. Admin-Queries (`lib/queries/admin.ts`)
nutzen bereits `select("*")` und brauchen keine Änderung.

Übersichtsseiten (`app/admin/orders/page.tsx`, `app/orders/page.tsx`) bleiben
unverändert — dort wird `delivery_method` ebenfalls nicht als Spalte gezeigt,
gleiche Konsistenz.

## Rechnung

`lib/invoice.ts` (PDF) und `lib/emails/invoice.ts` (Mail) bekommen je eine
zusätzliche Zeile am Ende, abhängig von `order.payment_method`:

- `cash` → "Zahlung: bar bei Abholung."
- `invoice` → "Zahlung: per Überweisung nach Erhalt dieser Rechnung."

`generateInvoicePdf` und `invoiceEmail` bekommen dafür keinen neuen
Parameter — `order.payment_method` steht bereits über das `Order`-Objekt
zur Verfügung, das beide Funktionen schon entgegennehmen.

Die Bestellbestätigungsmail (`lib/emails/order-confirmation.ts`) bleibt
unverändert — sie zeigt heute auch die Lieferart nicht an, gleiche
Konsistenz.

## Out of scope

- Keine tatsächliche Zahlungsabwicklung (kein Payment-Provider).
- Keine IBAN/Bankverbindung im Rechnungs-PDF (der Platzhalter-Kommentar in
  `lib/invoice.ts` für die Absenderadresse bleibt wie er ist).
- Keine Änderung an Übersichts-/Listenseiten.
