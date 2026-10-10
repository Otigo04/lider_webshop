# Vorbestellung im Shop

Stand 2026-10-10. Artikel, die noch nicht eingetroffen sind, lassen sich im
Shop vorbestellen.

## Entscheidungen

- **Gemischter Warenkorb.** Vorbestell-Artikel liegen mit normaler Ware im
  selben Warenkorb und derselben Bestellung. Die Position ist gekennzeichnet.
- **Flag am Artikel**, kein eigener Bestellweg: `products.is_preorder` plus
  optionaler Hinweistext `products.preorder_note` (z. B. „voraussichtlich KW 45").
- **Wirkt nur bei freiem Bestand 0** (`istVorbestellbar()` in `lib/pricing.ts`).
  Kommt Ware an, ist der Artikel automatisch normal; das Flag muss nicht
  zurückgenommen werden.
- **`create_order()` bleibt unverändert.** Es prüft den Bestand seit Migration
  049 nicht mehr und reserviert nur. Die Markierung an der Position setzt ein
  BEFORE-INSERT-Trigger auf `order_items` (`order_items.is_preorder`), damit sie
  an der Bestellung bleibt, auch wenn der Artikel später eintrifft.
- **Nicht betroffen:** Kasse, Katalog („Bald" bleibt die manuelle Markierung im
  Katalog), öffentliche Startseite (kennt keine Bestände).

## Oberfläche

- Karte und Artikelseite: Band „Vorbestellbar" statt „Ausverkauft", Hinweistext,
  Knopf „Vorbestellen", Menge nach oben nicht begrenzt.
- Warenkorb: Position als „Vorbestellung" gekennzeichnet, Menge nicht begrenzt.
- Checkout: Hinweis, wenn der Warenkorb eine Vorbestellung enthält.
- Admin: Schalter „Vorbestellbar" im Flags-Menü der Artikelliste, Hinweisfeld im
  Artikelformular; Bestellpositionen sind markiert.
