// Ports must sit on an edge that really faces the open sea — never on land,
// and never on an enclosed lagoon or a one-hex nook.
import { generateMap, axialKey, axialNeighbors, tileVertices, vertexKey, TILE_SIZE } from "./dist/index.js";
let bad = 0, total = 0, lagoons = 0;
for (let run = 0; run < 40; run++) {
  const { tiles } = generateMap({ playerCount: 4, tileSize: TILE_SIZE });
  const land = new Set(tiles.map((t) => axialKey(t.coord)));
  for (const t of tiles) {
    if (!t.port) continue;
    total++;
    const keys = new Set(t.port.edgeVertices.map(vertexKey));
    const across = axialNeighbors(t.coord).find((n) => {
      const vs = new Set(tileVertices(n, TILE_SIZE).map(vertexKey));
      return [...keys].every((k) => vs.has(k));
    });
    if (!across) { bad++; console.log("kein Nachbar über der Kante"); continue; }
    if (land.has(axialKey(across))) { bad++; console.log("Hafen zeigt auf Land!"); }
  }
}
console.log(`Häfen gesamt: ${total}, fehlerhaft: ${bad}`);
if (bad > 0 || total === 0) process.exit(1);
console.log("ALLE HAFEN-TESTS BESTANDEN");
