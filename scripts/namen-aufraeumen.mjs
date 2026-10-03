/**
 * Einmaliger Lauf: Bezeichnungen der Iden-Lieferung (26040187878) kürzen.
 *
 *   node --env-file=.env.local scripts/namen-aufraeumen.mjs --probe
 *   node --env-file=.env.local scripts/namen-aufraeumen.mjs
 *
 * Die Iden-Rechnung beschreibt jede Position ausführlich ("LEGO CITY
 * Fahrzeuge Kombinationsset mit Flugzeug Wartungsfahrzeug und
 * Luftkissenboot", 84 Zeichen) – das ist ihre Beschreibung, nicht der
 * Artikelname fürs Regal. nameSatz() schreibt den Namen voll aus und schrumpft
 * dafür die Schrift bis auf die Hälfte; bei 84 Zeichen steht am Ende eine
 * kaum lesbare Zeile. Gekürzt wird hier **inhaltlich** (Füllwörter raus,
 * Doppelungen raus, Marke in Titelschreibung) statt mit "…" abgeschnitten –
 * genau die Regel, die nameSatz() selbst befolgt.
 *
 * Unterscheidende Angaben (Farbe, Modell, Maßstab, Fahrzeugname) bleiben
 * stehen, wo sie den Artikel von einem ähnlichen im selben Sortiment
 * abgrenzen – bei den sechs Bruder-Baufahrzeugen zum Beispiel Marke und
 * Farbe, aber nicht der für alle sechs gleiche Maßstab 1:16.
 *
 * Schlüssel ist der Barcode, nicht die SKU: er kam unverändert von der
 * Rechnung und ist deshalb die verlässlichere Zuordnung.
 */
import { adminClient } from "./admin-session.mjs";

const UMBENENNUNGEN = {
  "5702017161884": "LEGO City Polizeiauto",
  "5702017582931": "LEGO City Feuerwehrhubschrauber",
  "5702017812458": "LEGO City Verfolgungsjagd Polizeimotorrad",
  "5702018031902": "LEGO City Hot Rod",
  "5702017566733": "LEGO City Go-Karts mit Rennfahrern",
  "5702017812489": "LEGO City F1 McLaren Rennauto",
  "5702018031926": "LEGO City Gelbes Taxi",
  "5702017566757": "LEGO City Blauer Monstertruck",
  "5702017812533": "LEGO City Offroad Geländewagen",
  "5702018031933": "LEGO City Traktor",
  "5702017416335": "LEGO City Feuerwehrboot",
  "5702018056608": "LEGO City Motorradtransporter",
  "5702017784694": "LEGO City Feuerwehrleiterfahrzeug",
  "5702017812410": "LEGO City Rettungswagen",
  "5702017583679": "LEGO City Verfolgungsjagd Muscle Car",
  "5702017567471": "LEGO City Burger-Truck",
  "5702018056813": "LEGO City Pommes-Truck",
  "5702017588094": "LEGO City Raumschiff",
  "5702017812632": "LEGO City F1 Williams & Haas Rennautos",
  "5702018056806": "LEGO City Gelber Baggerlader",
  "5702018056837": "LEGO City Passagierjet",
  "5702018056905": "LEGO City Lieferwagen",
  "5702018056820": "LEGO City Düsenflieger vs. Rennauto",
  "5702018056790": "LEGO City Betonmischer",
  "5702017812649": "LEGO City Notfallrettungsflugzeug",
  "5702018056875": "LEGO City Pizza-Lieferservice",
  "5702018056882": "LEGO City Waschstraße",
  "5702017812656": "LEGO City Bulldozer mit Frontlader",
  "5702018056950": "LEGO City Flugzeug, Fahrzeug & Boot",
  "5702017582962": "LEGO City Feuerwehrstation Drehleiter",
  "5702017812519": "LEGO City F1 Transporter RB20 & AMR24",
  "5702017815718": "LEGO Ninjago Kais Motorradrennen",
  "5702017815626": "LEGO Ninjago Zanes Action Mech",
  "5702017399676": "LEGO Ninjago Kais Rennwagen EVO",
  "5702018055700": "LEGO Ninjago Lloyds Drachenmech",
  "5702018031971": "LEGO Ninjago Kais Drachenmech",
  "5702018033982": "LEGO Ninjago Nya vs. Monster-Spinner",
  "5702018033999": "LEGO Ninjago Lloyd vs. Monster-Spinner",
  "5702018055717": "LEGO Ninjago Zilvar auf Drachentier Grimtak",
  "5702017815725": "LEGO Ninjago Arins Spinjitzumech",
  "5702018055236": "LEGO Ninjago Duell: Jays Drachenmech",
  "5702017818757": "LEGO Ninjago Drachen-Spinjitzu Pack",
  "5702017815633": "LEGO Ninjago Lloyds Actionflitzer",
  "5702018055809": "LEGO Ninjago Kai & Cole Flitzer",
  "5702018031988": "LEGO Ninjago Cole & Zane Mechs",
  "5702017584522": "LEGO Ninjago Kais Feuermech",
  "5702018055779": "LEGO Ninjago Zwillings-Titanmechs",
  "5702017815404": "LEGO Minecraft Lava-Duell im Nether",
  "5702018055892": "LEGO Minecraft Nether & Endportal",
  "5702017815411": "LEGO Minecraft Illager-Wüstenpatrouille",
  "5702017815428": "LEGO Minecraft Babyschweinhaus",
  "5702018055854": "LEGO Minecraft Blasser Garten",
  "5702018056011": "LEGO Minecraft Hühnerreiter-Angriff",
  "5702018055861": "LEGO Minecraft Zombieverlies",
  "5702018056028": "LEGO Minecraft Abenteuer in der Nacht",
  "5702017815435": "LEGO Minecraft Expedition Gürteltiermine",
  "5702018262146": "LEGO Minecraft Hühner-Jockey",
  "5702017815503": "LEGO Minecraft Der Creeper",
  "5702018056035": "LEGO Minecraft Das Skelett",
  "5702018055977": "LEGO Minecraft Der Fuchs",
  "5702018056042": "LEGO Minecraft Der Enderdrache",
  "5702017815534": "LEGO Minecraft Der Enderman-Turm",
  "5702018035016": "LEGO Technic John Deere 1470H",
  "5702017802589": "LEGO Technic Baggerlader",
  "5702018069356": "LEGO Technic Gelbes Motorrad",
  "5702017816234": "LEGO Technic Monster Jam ThunderROARus",
  "5702018035023": "LEGO Technic Monster Jam Grave Digger",
  "5702018034804": "LEGO Technic Monster Jam Sparkle Smash",
  "5702018067772": "LEGO Technic Ducati Desmo450 MX",
  "5702017816265": "LEGO Technic Kipplaster",
  "5702017816081": "LEGO Speed Champions Bugatti Centodieci",
  "5702017816074": "LEGO Speed Champions Porsche 911 GT3 RS",
  "5702017816043": "LEGO Speed Champions Dodge Challenger Hellcat",
  "5702018068182": "LEGO Speed Champions Bugatti Vision GT",
  "5702018068205": "LEGO Speed Champions Ferrari SF90 XX Stradale",
  "5702018068410": "LEGO Speed Champions Mustang Hoonicorn V1",
  "5702018068397": "LEGO Speed Champions Toyota Supra MK4",
  "5702018068229": "LEGO Speed Champions Zeitmaschine",
  "5702018068243": "LEGO Speed Champions McLaren W1",
  "5702018068212": "LEGO Speed Champions Lightning McQueen",
  "5702018068403": "LEGO Speed Champions Ferrari 499P",
  "5702017816067": "LEGO Speed Champions Revuelto & Huracán STO",
  "5702017583976": "LEGO Speed Champions AMG G63 & SL63",
  "5702018061800": "LEGO Botanicals Waldpilze",
  "5702017583488": "LEGO Botanicals Rosenstrauß",
  "5702017812540": "LEGO Botanicals Rosa Blumenstrauß",
  "5702018061770": "LEGO Botanicals Tulpenstrauß",
  "5702017815312": "LEGO Friends Welpenspielplatz",
  "5702018033258": "LEGO Friends Eis & Luftballonstand",
  "5702018054864": "LEGO Friends Einhorn Kuchenlieferwagen",
  "5702018054918": "LEGO Friends Heartlake City Minimarkt",
  "5702018054895": "LEGO Friends Haustierzubehör Van",
  "5702018054901": "LEGO Friends Heartlake City Hasenhotel",
  "4001702027414": "Bruder MAN TGA Absetzcontainer rot",
  "4001702024413": "Bruder Gelenkradlader Cat gelb/schwarz",
  "4001702021405": "Bruder Teleskoplader JLG 2505 orange",
  "4001702021917": "Bruder Hoflader Schäffer 2630 rot",
  "4001702021412": "Bruder Teleskoplader Cat gelb",
  "4001702024437": "Bruder Kettendozer Cat gelb",
  "4001702024277": "Bruder Baggerlader JCB Midi CX gelb",
};

const PROBE = process.argv.includes("--probe");
const { db, admin } = await adminClient();
console.log(`Angemeldet als ${admin.full_name || admin.email}`);

const barcodes = Object.keys(UMBENENNUNGEN);
const { data: zeilen, error } = await db
  .from("products")
  .select("id, sku, name, barcode")
  .in("barcode", barcodes);
if (error) throw new Error(error.message);

const gefunden = new Set(zeilen.map((z) => z.barcode));
const fehlend = barcodes.filter((code) => !gefunden.has(code));
if (fehlend.length) {
  console.log(`${fehlend.length} Barcodes ohne Artikel – wurden sie schon umbenannt oder gelöscht?`);
  for (const code of fehlend) console.log(" ", code, UMBENENNUNGEN[code]);
}

let laenger = 0;
for (const zeile of zeilen) {
  const neu = UMBENENNUNGEN[zeile.barcode];
  const kuerzer = neu.length < zeile.name.length;
  if (!kuerzer) laenger++;
  console.log(
    `${zeile.sku}  ${String(zeile.name.length).padStart(3)} -> ${String(neu.length).padStart(3)}  ` +
      `${zeile.name}${kuerzer ? "" : "  [nicht kürzer]"}`,
  );
}
console.log(`${zeilen.length} Artikel, ${laenger} davon nicht gekürzt.`);

if (PROBE) {
  console.log("… Probelauf, nichts geändert.");
  process.exit(0);
}

for (const zeile of zeilen) {
  const neu = UMBENENNUNGEN[zeile.barcode];
  if (neu === zeile.name) continue;
  const { error: updateFehler } = await db
    .from("products")
    .update({ name: neu })
    .eq("id", zeile.id);
  if (updateFehler) {
    console.error(`Fehler bei ${zeile.sku}:`, updateFehler.message);
  }
}

console.log("Umbenannt.");
