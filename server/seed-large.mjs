import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { database } from './sqlite.mjs';
import { seed } from '../lib/core.mjs';
const dir=process.env.DATA_DIR||'./data';
await mkdir(dir,{ recursive: true });
const db=database(resolve(dir,'relay.sqlite'));
await seed(db);
const count=Number(process.argv[2]||10000);
if(!Number.isSafeInteger(count)||count<1||count>100000) throw new Error('Choose 1 to 100000 items.');
const now=new Date().toISOString(),insert=db.raw.prepare(`INSERT OR IGNORE INTO items(title,description,type,priority,status,team_id,created_by,version,created_at,updated_at,actor,change,request_key,request_hash) VALUES (?,?,'Task','Normal','Open','engineering','anmol',1,?,?,'anmol','Created load-test item',?,'load-seed')`);
db.raw.exec('BEGIN');
try {
  for(let i=0;i<count;i++)insert.run(`Load-test work item ${i+1}`,'Synthetic data for checking server-side filtering and pagination.',now,now,'load-'+i);
  db.raw.exec('COMMIT');

} catch(e) {
  db.raw.exec('ROLLBACK');
  throw e;

} console.log('Synthetic dataset ready; total items:',db.raw.prepare('SELECT count(*) n FROM items').get().n);
db.raw.close();
