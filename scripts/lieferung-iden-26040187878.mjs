/**
 * Lieferung Iden Logistikcenter, Rechnung 26040187878 vom 22.09.2026.
 *
 * Abgetippt aus den sechs Rechnungsseiten. Spalten der Rechnung:
 *   ean    – zweite Nummer der Zeile (EAN/GTIN), nicht die Iden-Artikelnummer
 *   name   – Beschreibung
 *   menge  – Stück
 *   uvp    – unverbindliche Preisempfehlung, brutto (Ladenpreis)
 *   vk     – "VK-Preis" der Rechnung: Listenpreis des Lieferanten, netto
 *   rabatt – Einkaufsrabatt dieser Zeile
 *
 * Der tatsächlich gezahlte Einkaufspreis ist vk × (1 − rabatt). Genau der
 * gehört als Einkaufspreis an den Artikel, nicht der Listenpreis.
 *
 * Nicht enthalten, weil keine Handelsware:
 *   Pos 390  LEGO Endverbraucherbroschüren (Gratis-Werbematerial)
 *   Pos 970  Servicegebühr 3,95 €
 */

/** Positionen 10–950 der Rechnung, Rabatt 10 % wo auf der Zeile ausgewiesen. */
export const POSITIONEN = [
  // --- Seite 1 · LEGO CITY ---------------------------------------------------
  { ean: "5702017161884", name: "LEGO CITY Polizeiauto", menge: 4, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702017582931", name: "LEGO CITY Feuerwehrhubschrauber", menge: 4, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702017812458", name: "LEGO CITY Verfolgungsjagd mit dem Polizeimotorrad", menge: 4, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702018031902", name: "LEGO CITY Fahrzeuge Hot Rod", menge: 4, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702017566733", name: "LEGO CITY Go-Karts mit Rennfahrern", menge: 4, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702017812489", name: "LEGO CITY F1 Rennfahrer mit McLaren Rennauto", menge: 4, uvp: 12.99, vk: 8.0, rabatt: 0.1 },
  { ean: "5702018031926", name: "LEGO CITY Fahrzeuge Gelbes Taxi", menge: 4, uvp: 14.99, vk: 9.23, rabatt: 0.1 },
  { ean: "5702017566757", name: "LEGO CITY Blauer Monstertruck", menge: 4, uvp: 14.99, vk: 9.23, rabatt: 0.1 },
  { ean: "5702017812533", name: "LEGO CITY Fahrzeuge Offroad Geländewagen", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702018031933", name: "LEGO CITY Fahrzeuge Traktor", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702017416335", name: "LEGO CITY Feuerwehrboot", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702018056608", name: "LEGO CITY Fahrzeuge Motorradtransporter", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702017784694", name: "LEGO CITY Feuerwehr Feuerwehrleiterfahrzeug", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },

  // --- Seite 2 · LEGO CITY, NINJAGO -----------------------------------------
  { ean: "5702017812410", name: "LEGO CITY Fahrzeuge Rettungswagen", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702017583679", name: "LEGO CITY Polizei Verfolgungsjagd mit Polizeiauto & Muscle Car", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702017567471", name: "LEGO CITY Burger-Truck", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702018056813", name: "LEGO CITY Fahrzeuge PommesTruck", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702017588094", name: "LEGO CITY Weltraum Raumschiff", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702017812632", name: "LEGO CITY F1 Williams Racing und Haas F1 Rennautos", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702018056806", name: "LEGO CITY Fahrzeuge Gelber Baggerlader", menge: 1, uvp: 29.99, vk: 18.47, rabatt: 0.1 },
  { ean: "5702018056837", name: "LEGO CITY Fahrzeuge Passagierjet", menge: 1, uvp: 29.99, vk: 18.47, rabatt: 0.1 },
  { ean: "5702018056905", name: "LEGO CITY Fahrzeuge Der LEGO Lieferwagen", menge: 1, uvp: 29.99, vk: 18.47, rabatt: 0.1 },
  { ean: "5702018056820", name: "LEGO CITY Fahrzeuge Düsenflieger vs. Rennauto", menge: 1, uvp: 29.99, vk: 18.47, rabatt: 0.1 },
  { ean: "5702018056790", name: "LEGO CITY Fahrzeuge Betonmischer", menge: 1, uvp: 39.99, vk: 25.98, rabatt: 0.1 },
  { ean: "5702017812649", name: "LEGO CITY Notfallrettungsflugzeug", menge: 1, uvp: 49.99, vk: 32.47, rabatt: 0.1 },
  { ean: "5702018056875", name: "LEGO CITY Pizza Liefererlebnis mit Fahrzeugen", menge: 1, uvp: 49.99, vk: 32.48, rabatt: 0.1 },
  { ean: "5702018056882", name: "LEGO CITY Waschstraße", menge: 1, uvp: 54.99, vk: 35.72, rabatt: 0.1 },
  { ean: "5702017812656", name: "LEGO CITY Gelber Bulldozer mit Frontlader", menge: 1, uvp: 59.99, vk: 38.96, rabatt: 0.1 },
  { ean: "5702018056950", name: "LEGO CITY Fahrzeuge Kombinationsset mit Flugzeug Wartungsfahrzeug und Luftkissenboot", menge: 1, uvp: 69.99, vk: 45.46, rabatt: 0.1 },
  { ean: "5702017582962", name: "LEGO CITY Feuerwehrstation mit Drehleiterfahrzeug", menge: 1, uvp: 79.99, vk: 51.96, rabatt: 0.1 },
  { ean: "5702017812519", name: "LEGO CITY F1 Transporter mit RB20 & AMR24 F1 Rennautos", menge: 1, uvp: 99.99, vk: 64.95, rabatt: 0.1 },
  { ean: "5702017815718", name: "LEGO NINJAGO Kais Motorradrennen", menge: 3, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702017815626", name: "LEGO NINJAGO Zanes Action Mech", menge: 4, uvp: 9.99, vk: 6.15, rabatt: 0.1 },

  // --- Seite 3 · NINJAGO, Minecraft -----------------------------------------
  { ean: "5702017399676", name: "LEGO NINJAGO Kais Ninja-Rennwagen EVO", menge: 4, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702018055700", name: "LEGO NINJAGO Lloyds Drachen Mech Battle Set", menge: 4, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702018031971", name: "LEGO NINJAGO Kais DrachenMech Battle Set", menge: 4, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702018033982", name: "LEGO NINJAGO Nya vs. Elementarmonster Spinner", menge: 1, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702018033999", name: "LEGO NINJAGO Lloyd vs. Elementarmonster Spinner", menge: 1, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702018055717", name: "LEGO NINJAGO Zilvar auf seinem Drachentier Grimtak", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702017815725", name: "LEGO NINJAGO Arins Spinjitzumech", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702018055236", name: "LEGO NINJAGO Duell mit Jays Drachen Mech", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702017818757", name: "LEGO NINJAGO Drachen Spinjitzu Battle Pack", menge: 1, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702017815633", name: "LEGO NINJAGO Lloyds Actionflitzer", menge: 2, uvp: 24.99, vk: 15.39, rabatt: 0.1 },
  { ean: "5702018055809", name: "LEGO NINJAGO Kais und Coles Kombi Flitzer", menge: 2, uvp: 29.99, vk: 18.47, rabatt: 0.1 },
  { ean: "5702018031988", name: "LEGO NINJAGO Coles Action Mech und Drachen Zane", menge: 2, uvp: 29.99, vk: 18.47, rabatt: 0.1 },
  { ean: "5702017584522", name: "LEGO NINJAGO Kais Feuermech", menge: 2, uvp: 29.99, vk: 18.47, rabatt: 0.1 },
  { ean: "5702018055779", name: "LEGO NINJAGO Die Zwillings Titanmechs", menge: 1, uvp: 139.99, vk: 95.05, rabatt: 0.1 },
  { ean: "5702017815404", name: "LEGO Minecraft Das Lava Duell im Nether", menge: 4, uvp: 9.99, vk: 6.28, rabatt: 0.1 },
  { ean: "5702018055892", name: "LEGO Minecraft Reise durch Nether und Endportal", menge: 4, uvp: 14.99, vk: 9.42, rabatt: 0.1 },
  { ean: "5702017815411", name: "LEGO Minecraft Die Illager Wüstenpatrouille", menge: 4, uvp: 14.99, vk: 9.42, rabatt: 0.1 },
  { ean: "5702017815428", name: "LEGO Minecraft Das Babyschwein Haus", menge: 2, uvp: 19.99, vk: 12.57, rabatt: 0.1 },

  // --- Seite 4 · Minecraft, TECHNIC -----------------------------------------
  { ean: "5702018055854", name: "LEGO Minecraft Blasser Garten", menge: 2, uvp: 19.99, vk: 12.57, rabatt: 0.1 },
  { ean: "5702018056011", name: "LEGO Minecraft Angriff des Hühnerreiters in der Wüste", menge: 2, uvp: 24.99, vk: 15.71, rabatt: 0.1 },
  { ean: "5702018055861", name: "LEGO Minecraft Zombieverlies", menge: 1, uvp: 29.99, vk: 18.85, rabatt: 0.1 },
  { ean: "5702018056028", name: "LEGO Minecraft Erstes Abenteuer in der Nacht", menge: 1, uvp: 29.99, vk: 18.85, rabatt: 0.1 },
  { ean: "5702017815435", name: "LEGO Minecraft Die Expedition zur Gürteltiermine", menge: 1, uvp: 29.99, vk: 18.85, rabatt: 0.1 },
  { ean: "5702018262146", name: "LEGO Minecraft Hühner-Jockey", menge: 1, uvp: 29.99, vk: 18.85, rabatt: 0.1 },
  { ean: "5702017815503", name: "LEGO Minecraft Der Creeper", menge: 2, uvp: 39.99, vk: 26.48, rabatt: 0.1 },
  { ean: "5702018056035", name: "LEGO Minecraft Das Skelett", menge: 2, uvp: 44.99, vk: 29.79, rabatt: 0.1 },
  { ean: "5702018055977", name: "LEGO Minecraft Der Fuchs", menge: 1, uvp: 44.99, vk: 29.79, rabatt: 0.1 },
  { ean: "5702018056042", name: "LEGO Minecraft Der Enderdrache", menge: 1, uvp: 59.99, vk: 39.72, rabatt: 0.1 },
  { ean: "5702017815534", name: "LEGO Minecraft Der Enderman Turm", menge: 1, uvp: 99.99, vk: 66.21, rabatt: 0.1 },
  { ean: "5702018035016", name: "LEGO TECHNIC Rad Harvester John Deere 1470H", menge: 4, uvp: 9.99, vk: 6.28, rabatt: 0.1 },
  { ean: "5702017802589", name: "LEGO TECHNIC Baggerlader", menge: 4, uvp: 9.99, vk: 6.28, rabatt: 0.1 },
  { ean: "5702018069356", name: "LEGO TECHNIC Gelbes Motorrad", menge: 4, uvp: 9.99, vk: 6.28, rabatt: 0.1 },
  { ean: "5702017816234", name: "LEGO TECHNIC Monster Jam ThunderROARus", menge: 1, uvp: 27.99, vk: 17.59, rabatt: 0.1 },
  { ean: "5702018035023", name: "LEGO TECHNIC Monster Jam Grave Digger Feuer und Eis", menge: 1, uvp: 29.99, vk: 18.85, rabatt: 0.1 },
  { ean: "5702018034804", name: "LEGO TECHNIC Monster Jam Sparkle Smash mit Rückziehmotor", menge: 1, uvp: 29.99, vk: 18.85, rabatt: 0.1 },
  { ean: "5702018067772", name: "LEGO TECHNIC Ducati Desmo450 MX Factory Motorrad", menge: 1, uvp: 49.99, vk: 33.1, rabatt: 0.1 },
  { ean: "5702017816265", name: "LEGO TECHNIC Kipplaster", menge: 1, uvp: 49.99, vk: 33.1, rabatt: 0.1 },

  // --- Seite 5 · SPEED CHAMPIONS, BOTANICALS, Friends ------------------------
  { ean: "5702017816081", name: "LEGO SPEED CHAMPIONS Bugatti Centodieci Hypersportwagen", menge: 1, uvp: 26.99, vk: 16.97, rabatt: 0.1 },
  { ean: "5702017816074", name: "LEGO SPEED CHAMPIONS Porsche 911 GT3 RS Supersportwagen", menge: 1, uvp: 26.99, vk: 16.97, rabatt: 0.1 },
  { ean: "5702017816043", name: "LEGO SPEED CHAMPIONS Dodge Challenger SRT Hellcat Sportwagen", menge: 1, uvp: 26.99, vk: 16.97, rabatt: 0.1 },
  { ean: "5702018068182", name: "LEGO SPEED CHAMPIONS Bugatti Vision GT Hypersportwagen", menge: 1, uvp: 27.99, vk: 17.59, rabatt: 0.1 },
  { ean: "5702018068205", name: "LEGO SPEED CHAMPIONS Ferrari SF90 XX Stradale Sportwagen", menge: 1, uvp: 27.99, vk: 17.59, rabatt: 0.1 },
  { ean: "5702018068410", name: "LEGO SPEED CHAMPIONS Ford Ken Blocks 1965 Ford Mustang Hoonicorn V1", menge: 1, uvp: 27.99, vk: 17.59, rabatt: 0.1 },
  { ean: "5702018068397", name: "LEGO SPEED CHAMPIONS Toyota The Fast and The Furious Toyota Supra MK4", menge: 1, uvp: 27.99, vk: 17.59, rabatt: 0.1 },
  { ean: "5702018068229", name: "LEGO SPEED CHAMPIONS Zeitmaschine aus Zurück in die Zukunft", menge: 1, uvp: 27.99, vk: 17.59, rabatt: 0.1 },
  { ean: "5702018068243", name: "LEGO SPEED CHAMPIONS McLaren W1", menge: 1, uvp: 27.99, vk: 17.59, rabatt: 0.1 },
  { ean: "5702018068212", name: "LEGO SPEED CHAMPIONS Lightning McQueen", menge: 1, uvp: 27.99, vk: 17.59, rabatt: 0.1 },
  { ean: "5702018068403", name: "LEGO SPEED CHAMPIONS Ferrari Ferrari 499P", menge: 1, uvp: 27.99, vk: 17.59, rabatt: 0.1 },
  { ean: "5702017816067", name: "LEGO SPEED CHAMPIONS Lamborghini Revuelto und Huracán STO", menge: 1, uvp: 49.99, vk: 33.1, rabatt: 0.1 },
  { ean: "5702017583976", name: "LEGO SPEED CHAMPIONS Mercedes-AMG G 63 & Mercedes-AMG SL 63", menge: 1, uvp: 49.99, vk: 33.1, rabatt: 0.1 },
  { ean: "5702018061800", name: "LEGO BOTANICALS Waldpilze", menge: 1, uvp: 79.99, vk: 51.96, rabatt: 0.1 },
  { ean: "5702017583488", name: "LEGO Botanicals Rosenstrauß", menge: 1, uvp: 59.99, vk: 39.72, rabatt: 0.1 },
  { ean: "5702017812540", name: "LEGO BOTANICALS Schöner Rosafarbener Blumenstrauß", menge: 1, uvp: 59.99, vk: 38.97, rabatt: 0.1 },
  { ean: "5702018061770", name: "LEGO BOTANICALS Tulpenstrauß", menge: 1, uvp: 59.99, vk: 38.97, rabatt: 0.1 },
  { ean: "5702017815312", name: "LEGO Friends Welpenspielplatz", menge: 2, uvp: 9.99, vk: 6.15, rabatt: 0.1 },

  // --- Seite 6 · Friends, Bruder --------------------------------------------
  { ean: "5702018033258", name: "LEGO Friends Eis und Luftballonstand", menge: 2, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702018054864", name: "LEGO Friends Einhorn Kuchenlieferwagen", menge: 2, uvp: 9.99, vk: 6.15, rabatt: 0.1 },
  { ean: "5702018054918", name: "LEGO Friends Heartlake City MiniMarkt", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702018054895", name: "LEGO Friends Haustierzubehör Van", menge: 2, uvp: 19.99, vk: 12.31, rabatt: 0.1 },
  { ean: "5702018054901", name: "LEGO Friends Heartlake City Hasenhotel", menge: 1, uvp: 24.99, vk: 15.39, rabatt: 0.1 },
  // Pos 950 führt keinen Rabatt – 2 × 21,29 ergibt genau den Betrag 42,58.
  { ean: "4001702027414", name: "Bruder LKW MAN TGA Absetzcontainer rot", menge: 2, uvp: 43.49, vk: 21.29, rabatt: 0 },

  /*
   * Pos 960 ist ein Display: eine Rechnungszeile, aber sechs Artikel mit je
   * eigener GTIN, eigenem Preis und eigenem Etikett. Im Regal stehen sie
   * einzeln, also werden sie auch einzeln geführt – ein Sammelartikel
   * "Display" ließe sich weder scannen noch verkaufen.
   *
   * Der Displaypreis von 174,27 € netto liegt 20 % unter der Summe der
   * Einzelpreise (217,84 €); der Nachlass wird deshalb auf die Positionen
   * umgelegt statt bei einer von ihnen zu landen.
   */
  { ean: "4001702024413", name: "bruder Gelenkradlader Cat gelb/schwarz 1:16", menge: 2, uvp: 24.79, vk: 16.31, rabatt: 0.2 },
  { ean: "4001702021405", name: "bruder Teleskoplader JLG 2505 orange 1:16", menge: 2, uvp: 28.49, vk: 18.61, rabatt: 0.2 },
  { ean: "4001702021917", name: "bruder Hoflader Schäffer 2630 mit Zubehör und Figur rot 1:16", menge: 2, uvp: 30.49, vk: 19.99, rabatt: 0.2 },
  { ean: "4001702021412", name: "bruder Teleskoplader Cat gelb 1:16", menge: 2, uvp: 29.19, vk: 19.2, rabatt: 0.2 },
  { ean: "4001702024437", name: "bruder Kettendozer Cat gelb 1:16", menge: 2, uvp: 25.79, vk: 16.92, rabatt: 0.2 },
  { ean: "4001702024277", name: "bruder Baggerlader JCB Midi CX gelb 1:16", menge: 2, uvp: 26.99, vk: 17.89, rabatt: 0.2 },
];

/** Nettosumme laut Rechnung, einschließlich Servicegebühr. */
export const RECHNUNG_NETTO = 2547.39;
/** Nicht als Artikel erfasst, zählt aber zur Rechnungssumme. */
export const SERVICEGEBUEHR = 3.95;

export const MWST = 0.19;

const runde = (wert) => Math.round(wert * 100) / 100;

/**
 * Rechnungszeile in die drei Preise des Shops übersetzen.
 *
 *   EK  – was tatsächlich gezahlt wurde: Listenpreis abzüglich Einkaufsrabatt
 *   EH  – Ladenpreis brutto: die UVP des Herstellers
 *   GH  – Großhandelspreis netto: die UVP ohne Mehrwertsteuer. Der Händler
 *         zahlt damit brutto wieder die UVP; die Marge bleibt dieselbe wie
 *         im Laden, nur ohne Steuer gerechnet.
 */
export function preise(position) {
  return {
    ek: runde(position.vk * (1 - position.rabatt)),
    eh: runde(position.uvp),
    gh: runde(position.uvp / (1 + MWST)),
  };
}
