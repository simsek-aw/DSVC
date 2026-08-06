import { generateMap, axialKey, axialNeighbors, TILE_SIZE } from "./dist/index.js";
// re-implement articulation check to verify no 1-hex necks remain
function landNb(c,set){return axialNeighbors(c).filter(n=>set.has(axialKey(n)));}
function aps(list,set){const id=new Map();list.forEach((c,i)=>id.set(axialKey(c),i));const n=list.length;const disc=Array(n).fill(-1),low=Array(n).fill(0),ap=Array(n).fill(false);let t=0;
 const dfs=(u,p)=>{disc[u]=low[u]=t++;let ch=0;for(const nb of landNb(list[u],set)){const v=id.get(axialKey(nb));if(disc[v]===-1){ch++;dfs(v,u);low[u]=Math.min(low[u],low[v]);if(p!==-1&&low[v]>=disc[u])ap[u]=true;}else if(v!==p)low[u]=Math.min(low[u],disc[v]);}if(p===-1&&ch>1)ap[u]=true;};
 for(let i=0;i<n;i++)if(disc[i]===-1)dfs(i,-1);return list.filter((_,i)=>ap[i]);}
let bad=0, sizes=[];
for(let i=0;i<200;i++){const {tiles}=generateMap({playerCount:4,tileSize:TILE_SIZE});const coords=tiles.map(t=>t.coord);const set=new Set(coords.map(axialKey));sizes.push(coords.length);if(aps(coords,set).length>0)bad++;}
sizes.sort((a,b)=>a-b);
console.log("Karten mit 1-Hex-Engpass:",bad,"/200; Größe min/median/max:",sizes[0],sizes[100],sizes[199]);
if (bad > 0) { console.error("FAIL: Karten mit Engpass"); process.exit(1); }
console.log("ALLE ENGPASS-TESTS BESTANDEN");
