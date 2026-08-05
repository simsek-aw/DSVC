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

1. **Klassischer Räuber** 🥷 — wie im Original: wird bei einer gewürfelten 7 vom aktiven
   Spieler auf ein neues Feld gesetzt und blockiert dessen Ernte komplett.
2. **Bestochener Räuber** 💰 — ein zweiter, verdeckter "Wildcard"-Räuber sitzt von Anfang an
   irgendwo auf der Insel. Wird sein Feld enthüllt, leitet er ab sofort jede Ernte dieses
   Feldes an einen zufällig bestimmten anderen Spieler um ("er wurde bestochen").
3. **Boost-Räuber** ✨ — die andere mögliche Ausprägung desselben Wildcard-Tokens: verdoppelt
   dauerhaft die Ernte auf seinem Feld für dessen Besitzer.

Welche der beiden Wildcard-Varianten (Bestochen/Boost) auf der Karte liegt, wird zufällig
beim Kartengenerieren festgelegt und bleibt bis zur Aufdeckung geheim — niemand weiß vorher,
ob ein bestimmtes Feld ein Fluch oder ein Segen ist.

## Weitere Ideen für spätere Ausbaustufen (aus dem Brainstorming, noch nicht umgesetzt)

- Wetter-Events (Sturm blockiert temporär ein Feld, Dürre halbiert eine Ressource)
- Anonyme Spenden-/Verrat-Mechanik in den Bankpool
- Asynchrone Zeitfenster pro Zug mit Auto-Skip
- Handel zwischen Spielern, Entwicklungskarten, Längste-Straße/Größte-Rittermacht-Wertung

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
