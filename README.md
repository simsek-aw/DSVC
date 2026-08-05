# Canos Incognita

Ein browserbasiertes Siedler-von-Catan-inspiriertes Spiel für 2–6 Spieler, mobile-first,
mit verdeckten Feldern, einer prozeduralen Insel und drei Räuber-Varianten.

## Twists gegenüber dem Original

- **Verdeckte Felder**: Alle Hexfelder liegen zu Spielbeginn mit der Rückseite ("?") oben
  und decken sich erst auf, sobald eine Siedlung sie berührt.
- **Verdeckte Zahlenchips**: Die Ziffern bleiben unsichtbar, bis alle Spieler ihre zwei
  Start-Siedlungen und Straßen gelegt haben — dann drehen sich alle gleichzeitig um.
- **Prozedurale, unrunde Insel**: Die Karte wächst per Blob-Algorithmus aus der Mitte,
  bewusst mit Lobben/Buchten statt einer perfekten Kreisform, und skaliert leicht mit der
  Spielerzahl (19–30 Felder), bleibt aber immer überschaubar.
- **Verdeckte Häfen**: Auch Handelshäfen werden erst beim Aufdecken ihres Feldes sichtbar.
- **Drei Räuber-Varianten** (siehe unten) statt nur des klassischen Räubers.
- **Asynchrones Langzeitspiel**: Der Server persistiert jeden Raum-Zustand; Spieler können
  jederzeit offline gehen, das Spiel wartet einfach auf ihren Zug. Sind alle online, geht
  es ohne Verzögerung normal weiter — es gibt keinen Zugzeit-Timer, der jemanden zwingt.

## Die drei Räuber

1. **Klassischer Räuber** 🥷 — wie im Original: an die gewürfelte 7 gekoppelt. Der aktive
   Spieler setzt ihn auf ein neues Feld, das dadurch komplett blockiert wird.
2. **Boost-Figur** ✨ — eine zweite, feste Figur, die verdeckt (wie ein normales Feld) irgendwo
   auf der Insel steht. Wird ihr Feld enthüllt, verdoppelt sie dessen Ernte dauerhaft für den
   Besitzer — ein Segen ohne Karteneinsatz, einfach Glückssache, wo sie liegt.
3. **Bestochener Räuber** 💰 — eine Entwicklungskarte (siehe unten), die ein Spieler aktiv auf
   ein beliebiges aufgedecktes Feld legt. Ab dann wandert dessen gesamte Ernte zu ihm, bis
   entweder jemand die Karte erneut spielt (verschiebt die Bestechung) oder eine 7 gewürfelt
   wird — die 7 deckt die Bestechung auf und hebt den Effekt sofort auf. Weil sie komplett
   unabhängig vom Würfeln ausgelöst wird, kann sie gezielt eingesetzt werden, ohne durch die
   nächste 7 sofort wieder kassiert zu werden — bleibt aber durch das 7er-Risiko trotzdem
   ein Wagnis statt eines Garantie-Bonus.

## Entwicklungskarten

Gekauft für 1 Erz + 1 Weizen + 1 Wolle, gespielt aus der eigenen (verdeckten) Hand:

- **Ritter** ⚔️ — bewegt den klassischen Räuber sofort (auch ohne 7) und stiehlt eine
  zufällige Rohstoffkarte von einem Gegner am neuen Räuberfeld. Wer die meisten Ritter
  spielt (mind. 3), erhält die **Größte Rittermacht** (+2 Siegpunkte).
- **Straßenbau** 🛤️ — baut sofort 2 kostenlose Straßen.
- **Erfindung** 💡 — nimmt sich 2 beliebige Rohstoffe aus der Bank.
- **Monopol** 📈 — ein Rohstoff wird gewählt; alle anderen Spieler geben ihren gesamten
  Bestand dieses Rohstoffs ab.
- **Bestochener Räuber** 💰 — siehe oben.

## Handel

- **Bankhandel**: 4:1 ohne Hafen, 3:1 über einen "Beliebig"-Hafen, 2:1 über einen
  spezialisierten Hafen (sobald eine eigene Siedlung/Stadt den Hafen berührt).
- **Spieler-Handel**: ein Spieler bietet einem anderen ein Tauschgeschäft an (frei wählbare
  Rohstoffmengen in beide Richtungen); der Zielspieler nimmt an oder lehnt ab.

## Längste Straße & Größte Rittermacht

Wie im Original: die längste zusammenhängende Straße (mind. 5 Felder) bringt +2 Siegpunkte,
die größte Rittermacht (mind. 3 gespielte Ritter) ebenfalls +2. Beide Boni werden bei jeder
relevanten Aktion neu berechnet und können den Besitzer wechseln.

## Weitere Ideen für spätere Ausbaustufen (aus dem Brainstorming, noch nicht umgesetzt)

- Wetter-Events (Sturm blockiert temporär ein Feld, Dürre halbiert eine Ressource)
- Anonyme Spenden-/Verrat-Mechanik in den Bankpool
- Asynchrone Zeitfenster pro Zug mit Auto-Skip
- Verdeckte Handkarten gegenüber anderen Spielern (aktuell sind Rohstoffmengen und
  Kartenhände für alle sichtbar — eine bewusste MVP-Vereinfachung, siehe unten)

## Architektur

```
shared/   Reine Spiellogik (TypeScript, kein Framework-Bezug):
          Hexgrid-Mathematik, prozedurale Kartengenerierung, Regel-Engine (Reducer)
server/   Node.js + Express + Socket.IO. Hält den Raum-Zustand im Speicher und
          persistiert ihn nach jeder Aktion als JSON (server/data/rooms/*.json),
          damit Langzeitspiele einen Server-Neustart überleben.
client/   React + Vite. Mobile-first SVG-Hexmap mit Pan/Zoom (Maus-Wheel + Pinch),
          Lobby/Warteraum, Spielbrett, Aktionsleiste.
```

Rundenreihenfolge, Aufbauphase (Schlangenreihenfolge wie im Original), Würfeln,
Ressourcenproduktion, Bauen (Straße/Siedlung/Stadt) und die Siegbedingung (10 Punkte)
laufen vollständig über die reine `applyAction`-Funktion in `shared/src/gameEngine.ts` —
der Server ruft sie nur auf und verteilt das Ergebnis per Socket.IO an alle Mitspieler.

## Lokal starten

```bash
npm install
npm run build:shared

# Terminal 1
npm run dev:server        # Server auf Port 4000

# Terminal 2
npm run dev:client        # Client auf Port 5173 (Vite)
```

Der Client verbindet sich standardmäßig mit `http://<hostname>:4000`. Für ein Deployment
auf getrennten Domains `VITE_SERVER_URL` als Env-Variable für den Client setzen.

Auf dem Handy: Client-URL im Browser öffnen, Raum erstellen/beitreten, Karte per Ziehen
verschieben und per Zwei-Finger-Pinch zoomen.
