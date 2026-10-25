/**
 * Fetches the Avium Map's nation data for a build that has no map checkout beside it,
 * which is every deploy. Next to the map, src/lib/map-data.mjs reads the checkout
 * itself and this does nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FILES } from '../src/lib/map-data.mjs';

const SIBLING = path.resolve('../Avium Map/src/data');
const OUT = path.resolve('.map-data');
const RAW = 'https://raw.githubusercontent.com/auroruse/avium-map/main/src/data/';

if (fs.existsSync(path.join(SIBLING, 'nations.tsv'))) process.exit(0);
fs.mkdirSync(OUT, { recursive: true });
for (const f of FILES) {
  const res = await fetch(RAW + encodeURIComponent(f));
  if (!res.ok) throw new Error(`${f}: ${res.status} from the map repository`);
  fs.writeFileSync(path.join(OUT, f), await res.text());
}
console.log(`map data: ${FILES.length} files fetched`);
