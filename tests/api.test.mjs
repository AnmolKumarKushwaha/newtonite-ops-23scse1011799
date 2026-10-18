import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from '../server/sqlite.mjs';
import { handle,seed,DEMO_PASSWORD } from '../lib/core.mjs';
async function fixture() {

  const db=database();
  await seed(db);
  const cookies={};
  async function request(who,path,method='GET',body,headers={}) {
    const r=await handle(new Request('http://localhost/api/'+path,{ method,headers: { 'Content-Type': 'application/json',...(cookies[who]? { Cookie: cookies[who] }:{}),...headers },...(body? { body: JSON.stringify(body) }:{}) }),db);
    return { status: r.status,data: await r.json(),headers: r.headers };

  }
  for(const who of ['anmol','maya','arjun','isha','kabir']) {
    const r=await request(who,'login','POST',{ email: who+'@relay.demo',password: DEMO_PASSWORD });
    assert.equal(r.status,200);
    cookies[who]=r.headers.get('set-cookie').split(';')[0];

  }
  const create=(who='anmol',extra={},key=crypto.randomUUID()) => request(who,'items','POST',{ title: 'Investigate duplicate callbacks',description: 'Track impact and verify a fix.',team_id: 'engineering',type: 'Incident',priority: 'High',...extra },{ 'Idempotency-Key': key });
  return { db,request,create };

}

test('session cookie is httpOnly; unauthenticated access fails; logout revokes session',async () => {
  const { db,request }=await fixture();
  assert.equal((await request('unknown','items?team=engineering')).status,401);
  const login=await request('none','login','POST',{ email: 'maya@relay.demo',password: DEMO_PASSWORD });
  assert.match(login.headers.get('set-cookie'),/HttpOnly/);
  assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);
  assert.equal((await request('anmol','logout','POST',{})).status,200);
  assert.equal((await request('anmol','me')).status,401);
  db.raw.close()

});
test('concurrent claims produce exactly one winner and one history event',async () => {
  const { db,request,create }=await fixture();
  const { data: item }=await create();
  const results=await Promise.all(['maya','arjun'].map(u => request(u,`items/${item.id}/claim`,'POST',{ version: 1 })));
  assert.deepEqual(results.map(r => r.status).sort(),[200,409]);
  const stored=(await request('anmol','items/'+item.id)).data;
  assert.ok(['maya','arjun'].includes(stored.assignee));
  assert.equal(stored.version,2);
  const events=(await request('anmol',`items/${item.id}/activity`)).data.events;
  assert.equal(events.length,2);
  assert.equal(events.filter(e => e.kind==='updated').length,1);
  db.raw.close()

});
test('stale updates cannot overwrite a newer priority',async () => {
  const { db,request,create }=await fixture();
  const { data: item }=await create();
  assert.equal((await request('anmol','items/'+item.id,'PATCH',{ version: 1,priority: 'Urgent' })).status,200);
  const stale=await request('anmol','items/'+item.id,'PATCH',{ version: 1,priority: 'Low' });
  assert.equal(stale.status,409);
  assert.equal(stale.data.latest.priority,'Urgent');
  assert.equal((await request('anmol',`items/${item.id}/activity`)).data.events.length,2);
  db.raw.close()

});
test('duplicate concurrent creates return one item; altered payload with reused key conflicts',async () => {
  const { db,create,request }=await fixture();
  const key=crypto.randomUUID();
  const [a,b]=await Promise.all([create('anmol',{},key),create('anmol',{},key)]);
  assert.equal(a.status,201);
  assert.equal(b.status,201);
  assert.equal(a.data.id,b.data.id);
  assert.equal((await request('anmol',`items/${a.data.id}/activity`)).data.events.length,1);
  assert.equal((await create('anmol',{ title: 'different' },key)).status,409);
  db.raw.close()

});
test('permissions follow team membership and cannot be bypassed with a guessed item ID',async () => {
  const { db,request,create }=await fixture();
  const { data: item }=await create();
  for(const path of [`items/${item.id}`,`items/${item.id}/activity`,'items?team=engineering','members?team=engineering']) assert.equal((await request('kabir',path)).status,403);
  assert.equal((await request('kabir',`items/${item.id}/claim`,'POST',{ version: 1 })).status,403);
  assert.equal((await create('isha')).status,403);
  assert.equal((await request('isha',`items/${item.id}/comments`,'POST',{ body: 'not allowed' })).status,403);
  assert.equal((await request('isha',`items/${item.id}`,'PATCH',{ version: 1,title: 'forbidden' })).status,403);
  db.raw.close()

});
test('workflow requires owner, valid transition and team-lead approval',async () => {
  const { db,request,create }=await fixture();
  let item=(await create()).data;
  assert.equal((await request('anmol',`items/${item.id}/transition`,'POST',{ version: 1,status: 'Closed' })).status,422);
  assert.equal((await request('anmol',`items/${item.id}/transition`,'POST',{ version: 1,status: 'In progress' })).status,422);
  item=(await request('maya',`items/${item.id}/claim`,'POST',{ version: item.version })).data;
  assert.equal((await request('arjun',`items/${item.id}/transition`,'POST',{ version: item.version,status: 'In progress' })).status,403);
  for(const status of ['In progress','Review']) {
    const r=await request('maya',`items/${item.id}/transition`,'POST',{ version: item.version,status });
    assert.equal(r.status,200);
    item=r.data;

  } assert.equal((await request('maya',`items/${item.id}/transition`,'POST',{ version: item.version,status: 'Resolved' })).status,403);
  item=(await request('anmol',`items/${item.id}/transition`,'POST',{ version: item.version,status: 'Resolved' })).data;
  assert.equal(item.status,'Resolved');
  item=(await request('anmol',`items/${item.id}/transition`,'POST',{ version: item.version,status: 'Closed' })).data;
  assert.equal((await request('anmol',`items/${item.id}`,'PATCH',{ version: item.version,title: 'edit closed' })).status,422);
  db.raw.close()

});
test('assignment only accepts eligible team members and only leads may reassign',async () => {
  const { db,request,create }=await fixture();
  let item=(await create()).data;
  for(const assignee of ['kabir','isha','missing']) assert.equal((await request('anmol','items/'+item.id,'PATCH',{ version: 1,assignee })).status,400);
  item=(await request('maya',`items/${item.id}/claim`,'POST',{ version: 1 })).data;
  assert.equal((await request('maya','items/'+item.id,'PATCH',{ version: item.version,assignee: 'arjun' })).status,403);
  assert.equal((await request('anmol','items/'+item.id,'PATCH',{ version: item.version,assignee: 'arjun' })).data.assignee,'arjun');
  db.raw.close()

});
test('history failure rolls back the item update and history is append-only',async () => {
  const { db,request,create }=await fixture();
  const { data: item }=await create();
  db.raw.exec("CREATE TRIGGER simulate_history_failure BEFORE INSERT ON events WHEN NEW.kind='updated' BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
  const old=console.error;
  console.error=() => {

  };
  let result;
  try {
    result=await request('anmol','items/'+item.id,'PATCH',{ version: 1,priority: 'Urgent' })

  } finally {
    console.error=old

  } assert.equal(result.status,500);
  const stored=(await request('anmol','items/'+item.id)).data;
  assert.equal(stored.priority,'High');
  assert.equal(stored.version,1);
  assert.throws(() => db.raw.prepare('DELETE FROM events WHERE item_id=?').run(item.id),/append-only/);
  assert.throws(() => db.raw.prepare("UPDATE events SET body='changed' WHERE item_id=?").run(item.id),/append-only/);
  db.raw.close()

});
test('keyset pagination stays disjoint after a new insert and searches are scoped',async () => {
  const { db,request,create }=await fixture();
  const first=await request('anmol','items?team=engineering');
  assert.equal(first.data.items.length,20);
  assert.ok(first.data.nextCursor);
  await create();
  const second=await request('anmol','items?team=engineering&cursor='+first.data.nextCursor);
  assert.ok(second.data.items.every(x => !first.data.items.some(y => x.id===y.id)));
  const finance=await request('kabir','items?team=finance');
  assert.ok(finance.data.items.every(x => x.team_id==='finance'));
  const literal=await request('anmol','items?team=engineering&q='+encodeURIComponent("%' OR 1=1 --"));
  assert.equal(literal.data.items.length,0);
  assert.equal((await request('anmol','items?team=engineering&cursor=oops')).status,400);
  db.raw.close()

});
test('validation rejects invalid data and cross-origin writes without mutating storage',async () => {
  const { db,request,create }=await fixture();
  for(const extra of [{ title: '' },{ priority: 'Critical' },{ due: '2026-02-30' },{ description: 'a'.repeat(4001) }]) assert.equal((await create('anmol',extra)).status,400);
  assert.equal((await request('anmol','items','POST',{ title: 'cross site' },{ Origin: 'https://evil.example' })).status,403);
  const malformed=await handle(new Request('http://localhost/api/login',{ method: 'POST',headers: { 'Content-Type': 'application/json' },body: '{' }),db);
  assert.equal(malformed.status,400);
  db.raw.close()

});
test('comments are visible to teammates; oversized comments rejected; activity is paginated',async () => {
  const { db,request,create }=await fixture();
  const { data: item }=await create();
  for(let i=0;i<32;i++)assert.equal((await request('maya',`items/${item.id}/comments`,'POST',{ body: 'Finding '+i })).status,201);
  const first=(await request('isha',`items/${item.id}/activity`)).data;
  assert.equal(first.events.length,30);
  const second=(await request('isha',`items/${item.id}/activity?cursor=${first.nextCursor}`)).data;
  assert.equal(second.events.length,3);
  assert.equal((await request('maya',`items/${item.id}/comments`,'POST',{ body: 'a'.repeat(2001) })).status,400);
  db.raw.close()

});
test('login throttling rejects repeated invalid credentials',async () => {
  const { db,request }=await fixture();
  for(let i=0;i<15;i++)await request('nobody','login','POST',{ email: 'unknown@relay.demo',password: 'wrong' });
  assert.equal((await request('nobody','login','POST',{ email: 'unknown@relay.demo',password: 'wrong' })).status,429);
  db.raw.close()

});
