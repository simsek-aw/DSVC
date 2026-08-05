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

### Was bei einer 7 passiert

1. **Abwerfen**: Wer mehr als 7 Rohstoffkarten hat, muss die Hälfte (abgerundet) abgeben und
   wählt selbst aus, welche. Der Räuber lässt sich erst bewegen, wenn alle fertig sind.
2. **Räuber setzen**: Der aktive Spieler wählt ein Feld, das damit blockiert wird.
3. **Klauen**: Wer eine Siedlung oder Stadt an diesem Feld hat, kann bestohlen werden. Sitzen
   dort mehrere Spieler, darf der Räubernde sich das Opfer **aussuchen**. Dessen Hand wird als
   Fächer verdeckter Karten dargestellt, aus dem blind eine Position gezogen wird — und das
   Opfer darf so lange **mischen**, bis wirklich gezogen wurde. Die Ritterkarte löst denselben
   Ablauf aus.

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
- **Verhandlungstisch (großer Handel)**: Tipp auf den Namen eines Mitspielers → "Traden".
  Nimmt er an, öffnet sich bei beiden ein gemeinsamer Tisch: jeder tippt seine eigenen
  Rohstoffe an, um sie darauf zu legen (und nochmal, um sie zurückzunehmen). Beide sehen
  live, was drauf liegt. Erst wenn **beide** bestätigt haben, wird getauscht — und **jede**
  Änderung am Tisch setzt beide Bestätigungen zurück, damit niemand den Deal nachträglich
  zu seinen Gunsten verändern kann.
- **Schnell-Handel ("Ich brauche X")**: Doppeltipp auf eine Ressource in der eigenen Leiste
  ruft in die Runde, dass man sie sucht. Nur Mitspieler, die diesen Rohstoff tatsächlich
  besitzen, sehen die Anfrage und wählen mit einem Tipp aus, was sie im Gegenzug wollen —
  daraus wird ein 1:1-Angebot, das der Fragende annimmt oder ablehnt. Bewusst **nicht** auf
  den aktiven Spieler beschränkt: der Rundruf soll auch funktionieren, während man auf
  seinen Zug wartet.

## Demo-Modus (allein testen)

Der Button **"🎮 Demo starten"** in der Lobby erstellt einen Raum mit drei Spielern, die alle
von diesem einen Gerät gesteuert werden — praktisch, um das Spiel ohne Mitspieler
auszuprobieren. Oben erscheint eine Leiste, über die man zwischen den Sitzplätzen wechselt;
beim Zugwechsel springt sie automatisch auf den Spieler, der dran ist (ein manueller Wechsel
bleibt bis zum nächsten Zugwechsel bestehen, damit man z.B. beide Seiten eines Handels
bedienen kann). Die Leiste liegt bewusst über dem Verhandlungstisch, sodass man auch mitten
im Handel die Seite wechseln kann.

Serverseitig darf nur eine Verbindung in einem als `demoMode` markierten Raum Aktionen im
Namen beliebiger Spieler senden; in normalen Räumen zählt weiterhin ausschließlich die
bestätigte eigene Identität der Verbindung.

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

Im Dev-Modus verbindet sich der Client automatisch mit `http://<hostname>:4000`. Für ein
Deployment mit getrennten Domains für Client und Server `VITE_SERVER_URL` als Env-Variable
für den Client-Build setzen — im kombinierten Deployment (siehe unten) ist das nicht nötig,
da der Server den gebauten Client selbst mit ausliefert (gleicher Origin).

Auf dem Handy: Client-URL im Browser öffnen, Raum erstellen/beitreten, Karte per Ziehen
verschieben und per Zwei-Finger-Pinch zoomen.

## Deployment auf Render.com (empfohlen: kein Kostenrisiko)

Der Server liefert im Produktionsbuild den gebauten Client gleich mit aus (siehe
`server/src/index.ts`), es läuft also nur **ein** Dienst — dasselbe `Dockerfile` wie unten
bei Fly.io. Render's kostenloser "Free"-Plan verlangt keine Kreditkarte und kann nicht
versehentlich Kosten verursachen.

**Wichtiger Kompromiss**: Der Free-Plan hat **keinen persistenten Datenträger**. Jeder
Neustart — egal ob durch ein Redeploy oder durch das automatische Einschlafen nach ~15
Minuten Inaktivität — verwirft alle laufenden Räume. Für ein gelegentliches Spiel mit
Freunden in einer Sitzung ist das meist kein Problem; für ein tagelanges Langzeitspiel würde
man später einen bezahlten Plan mit Disk brauchen (oder Fly.io, siehe unten).

Einrichtung über das Dashboard (kein `render.yaml`-Blueprint-Import nötig, geht aber auch
darüber, falls verfügbar):

1. Auf [dashboard.render.com](https://dashboard.render.com) mit GitHub anmelden.
2. **New +** → **Web Service** → dieses Repo (`simsek-aw/DSVC`) auswählen.
3. Render erkennt automatisch das `Dockerfile` im Root. Als **Instance Type** "Free" wählen.
4. Deploy klicken — fertig. Bei jedem Push auf den Branch redeployt Render automatisch.

Diese Session hat keinen Netzwerkzugriff auf render.com (Policy blockiert `403`), der
eigentliche Klick-Deploy muss also von dir im Browser erfolgen.

## Alternative: Fly.io (mit echter Persistenz, aber Kreditkarte nötig)

Falls die Langzeit-Persistenz später doch wichtiger wird als das Kostenrisiko: `fly.toml`
liegt ebenfalls im Repo und ist mit einem gemounteten Volume vorbereitet, damit Raum-Daten
(`ROOM_DATA_DIR`) einen Neustart überleben.

```bash
fly auth login
fly apps create canos-incognita        # Name in fly.toml anpassen, falls schon vergeben
fly volumes create canos_data --region fra --size 1
fly deploy
```

`fly.toml` stoppt die Maschine bei Inaktivität automatisch (spart Kosten) und startet sie
bei neuen Verbindungen wieder — laufende WebSocket-Verbindungen verhindern das Stoppen
währenddessen. Trotzdem gilt: Fly.io verlangt eine Kreditkarte und kann bei Verbrauch
oberhalb des Freikontingents abrechnen.
