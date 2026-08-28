# PASSERMARKEN
### 90 Sekunden an der Riso · Ein-Daumen-Drucksaal-Runner

> Du bewegst nicht die Figur. Du bewegst die **Passung der Druckplatten**.

---

## 1 · Design-Brief

**PASSERMARKEN** ist ein Auto-Runner, dessen Boden keine Geometrie ist, sondern eine
Schnittmenge: Zwei Riso-Platten (Federal Blau, Fluoreszierend Pink) laufen durch die
Maschine, und tragfähiger Boden existiert ausschließlich dort, wo sich beide Farbschichten
überdecken. Diese Überdeckung verschiebt der Spieler mit dem Daumen — die Pink-Platte
driftet dabei einer wandernden Kurve hinterher, sodass Passung zu einer **kontinuierlichen
Lenkbewegung** wird statt zu diskreten Sprüngen. Visuell ist das Schweizer Plakat-Grid
(Müller-Brockmann, harte Kanten, Mono-Spezifikationstext) kollidiert mit einem echten
Riso-Fehldruck: Alles wird mit `multiply` gedruckt, Pflaume entsteht nur als Produkt von
Blau × Pink. Die Stimmung ist **3:14 Uhr, Drucksaal, allein, koffeiniert** — keine Panik,
sondern nervöse Präzision mit mechanischem Herzschlag. Die Bewegung ist *pressenhaft*:
gequantelt, federnd-verzögert, mit einem Klack am Greiferrand. Nie schwebend.
Ein Bogen läuft exakt 90 Sekunden; wer ihn unpassiert rauslässt, ruiniert die Auflage.

---

## 2 · Der Kern-Mechanik-Twist

| Klassischer Runner | PASSERMARKEN |
|---|---|
| Du steuerst die Figur durch eine feste Welt. | Die Figur läuft stur. Du steuerst die Welt **gegeneinander**. |
| Boden ist Level-Design. | Boden ist `intersect(PlatteA, PlatteB)` — pro Frame neu berechnet. |
| Schwierigkeit = Timing. | Schwierigkeit = **Nachführen einer Drift** bei gleichzeitigem Springen. |

Regeln in einem Satz: *Überdeckung ≥ 6 px trägt, weniger nicht — und die Überdeckung
wandert.*

Verstärker:
- **Farbstand** läuft aus. Bei null übernimmt die Maschine 3,5 s die Plattensteuerung
  (*Farbausfall*) — Scheitern fühlt sich nach Maschine an, nicht nach Game Over.
- **Spritzer** kehren die Steuerrichtung für 2,6 s um (*verschmiert*).
- **4 Gänge** über 90 s: Der Vorschub steigt von 205 auf 380 px/s, jeder Gangwechsel
  ist hör- und spürbar.

---

## 3 · Identitäts-Begründung

**Referenz.** Schweizer Plakatkunst der 60er/70er (Müller-Brockmann-Raster, Akzidenz-Härte,
Spezifikationstext als Gestaltungselement) **+ Riso-Druckfehler**: Fehlpassung, Halftone-Sieb,
Faserkorn, Overprint. Kein „Pixel-Retro“, kein Neon-Cyberpunk — ein vergessenes
Drucksachen-Ästhetik-Register, das in Spielen praktisch nie benutzt wird.

**Warum diese Referenz die Mechanik trägt.** Der Twist ist kein aufgesetztes Gimmick,
sondern die wörtliche Umsetzung des Stils: *Fehlpassung* ist im Siebdruck der Zustand,
in dem das Bild zerfällt. Im Spiel ist es der Zustand, in dem der Boden verschwindet.
Ästhetik und Regel sind dieselbe Tatsache.

**Stimmung.** Melancholische Präzision mit trockenem Humor. Die Texte sind Pressenprotokoll,
kein Game-Copy: *„Makulatur. Farbe nachgefüllt. Weitermachen.“*

### Farbsystem — 3 Primäre + 1 Akzent

| Farbe | Hex | Bedeutung im Regelwerk |
|---|---|---|
| Bogen (Papier) | `#E9E2D0` | Alles, was keine Farbe trägt, ist Risiko. Der Untergrund, den du schützt. |
| Platte A · Federal Blau | `#1B3FD6` | Die ruhende Platte. Raster, Ordnung, Referenz. |
| Platte B · Fluo-Pink | `#FF3D9A` | Die driftende Platte. Zeit, Gefahr, Dringlichkeit. |
| Akzent · Signal-Gelb | `#FFC93C` | Nur Passermarken. Ziel, Auge, Belohnung. |
| *(kein Token)* Pflaume | `#2A1030` | Entsteht ausschließlich als `blue × pink`. Wer gut spielt, sieht mehr Pflaume. |

### Bewegung

- **Pressen-Takt** — Landungen quanteln auf ein 2-px-Raster + 1-Frame-Stauchung.
  `cubic-bezier(.25,1.5,.35,1)`, ~90 ms.
- **Feder-Passung** — `reg += (ziel - reg)·(1 - e^(-13·dt))`. Der Daumen gibt ein Ziel vor,
  die Platte folgt mit Trägheit.
- **Maschinen-Zittern** — 0,6 px Sinus bei 30 Hz auf den Platten, **render-only**:
  die Kollisionsrechnung bleibt jitterfrei, die Maschine wirkt trotzdem lebendig.

### Typografie

`Archivo Black` (Plakat) gegen `IBM Plex Mono` (Spezifikationsblatt). Zwei Familien,
harter Größenkontrast, kein Inter, kein Serif.

---

## 4 · Build & Betrieb

```bash
npm install          # nur typescript als devDependency

npm run dev          # npx serve . → http://localhost:5173
npm run typecheck    # tsc --strict --noEmit über src/
npm run build        # tsc → dist/game.js → scripts/inline.mjs → index.html
```

**Warum der Build inliniert.** Das Spiel muss aus drei Kontexten laufen: statischer Host,
Standalone-PWA-Container und `file://` (USB-Stick, Messe-Laptop). Ein externer
Modul-Import bricht an `file://` am CORS-Modul-Limit. Der kompilierte Build landet deshalb
zwischen den Markern `@@BUILD:START` / `@@BUILD:END` direkt in `index.html`.
`index.html` ist ohne Build-Schritt lauffähig — genau so, wie sie im Repo liegt.

### PWA / Offline

| Datei | Rolle |
|---|---|
| `sw.js` | Cache-First für alles Lokale; Stale-While-Revalidate für Webfonts. Aktiviert sich nur unter `http(s)`, damit `file://` sauber bleibt. |
| `manifest.webmanifest` | `display: standalone`, `orientation: portrait`, Theme `#14110F`. |
| `icon.svg` | Passermarke, aus der Passung gelaufen. Vektor, `any` + `maskable`. |

Nach dem ersten Laden läuft das Spiel im Flugmodus. **Gesamtgewicht ohne Fonts: ~55 KB.**
Kein einziges Bild-, Audio- oder Font-Asset im Bundle.

### Steuerung

| Eingabe | Wirkung |
|---|---|
| Tippen / `Leertaste` | Sprung (wirkt nur am Boden oder in 100 ms Coyote-Time — Fehltipps in der Luft sind harmlos) |
| Wischen / `←` `→` | Plattenversatz, ±112 px |
| Finger/ Taste früh lösen | kurzer Sprung (variable Sprunghöhe) |

### Persistenz (`localStorage['passermarken.v2']`)

Bestauflage, gefahrene Bögen, gesammelte Passermarken, gewählte Spot-Farben,
Ton-/Haptik-Präferenz. Vier Spot-Farbpaare schalten sich über die Bestauflage frei
(0 / 1 800 / 4 200 / 9 000) und färben das Spiel genuinely um.

---

## 5 · Fünf Polish-Entscheidungen, die es vom MVP trennen

1. **Die Figur trägt den Fehler.** Der Läufer wird dreifach gedruckt — Blau, Pink, Pflaume.
   Der Offset der Geisterplatten ist exakt der aktuelle Passungsfehler
   (`|reg + drift(unter den Füßen)| · 0,045`, gekappt bei 6 px). Bei perfekter Registerung
   steht dort eine einzige messerscharfe Figur. *Können wird zur Grafik*, ohne Zahlen-HUD.

2. **Echter Overprint statt Fake-Glow.** Jede Farbe läuft durch `globalCompositeOperation =
   'multiply'`. Gelbe Passermarken werden über Blau grün und über Pink orange wie auf einem
   echten Bogen. Der dunkle Boden ist kein Highlight-Layer, sondern das arithmetische
   Produkt zweier Platten — dieselbe Rechnung, die auch die Kollision bestimmt.
   Grafik und Physik können nicht auseinanderlaufen.

3. **Farbausfall als Drama, nicht als Tod.** Läuft die Farbe leer, übernimmt die Maschine
   3,5 s die Platten (Random Walk), der Bildschirm verliert die Registerung, das
   Pressenbrummen bricht ein, danach gibt es 50 % Farbe zurück. Der Spieler verliert nie
   die Agentur — er verliert sie *kurz*, und die Maschine gewinnt ein Gesicht.

4. **Die Maschine ist der Soundtrack.** Kein Audio-Asset: zwei verstimmte Sägezähne
   (51 / 51,9 Hz, Tiefpass 240 Hz) bilden das Pressenbrummen, dessen Tonhöhe dem Vorschub
   folgt. Landungen sind bandpassgefilterte Rausch-Klicks bei 1,75 kHz, Spritzer bitcrushen
   nach unten. Haptik (`navigator.vibrate`) ist auf drei Muster beschränkt: Landen 6 ms,
   Sammeln 10 ms, Verlust `[24,40,60]`.

5. **Papier mit Gedächtnis.** Faserkorn aus einer vorgerenderten 110-px-Noise-Kachel
   (einmal erzeugt, dann als Pattern), Halftone-Sieb, Transportlochkante die mit der Welt
   scrollt, Greiferrand mit Stanzungen oben, Auswurfschatten unten, Ecken-Passermarken.
   Der Bogen bewegt sich sichtbar durch die Maschine — Fortschritt wird haptisch statt
   nur als Balken lesbar.

---

## 6 · Dateibaum

```
passermarken/
├─ index.html            # lauffähiger Build (Spiel inline, läuft auch von file://)
├─ src/game.ts           # typisierte Quelle · strict · keine Dependencies
├─ scripts/inline.mjs    # dist/game.js → index.html
├─ sw.js                 # Service Worker (Root-Scope)
├─ manifest.webmanifest
├─ icon.svg
├─ package.json
├─ tsconfig.json
└─ README.md
```

## 7 · Bekannte Grenzen

- Webfonts kommen von Google Fonts und sind SW-revalidiert; offline fällt die Seite auf
  `Arial Black` / `ui-monospace` zurück. Das Spiel selbst ist davon unberührt.
- `maskable`-Icon nutzt dieselbe SVG-Quelle; für Store-Listen sollten 192/512-PNG
  nachgerendert werden (`purpose: maskable` braucht in manchen Launchern Rasterformate).
- `navigator.vibrate` ist auf iOS Safari nicht verfügbar — die Haptik schaltet sich dort
  lautlos ab.

---

*Drucksaal B · Nachtschicht · Auflage unlimitiert. Fehldrucke werden nicht weggeworfen,
sie werden gespielt.*
