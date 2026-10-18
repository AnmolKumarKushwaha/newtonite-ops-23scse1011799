/** Application service shared by the hosted Worker, portable server and API tests. */
export class Problem extends Error {
  constructor(status,message,extra={}) {
    super(message);
    this.status=status;
    this.extra=extra;

  }
}
export const STATES=['Open','In progress','Review','Resolved','Closed'];
export const PRIORITIES=['Urgent','High','Normal','Low'];
export const TYPES=['Incident','Customer issue','Payment','Compliance','Task'];
export const DEMO_PASSWORD='RelayDemo2026!';
export const ACCOUNTS=[{ id: 'anmol',name: 'Anmol Kumar',email: 'anmol@relay.demo' },{ id: 'maya',name: 'Maya Rao',email: 'maya@relay.demo' },{ id: 'arjun',name: 'Arjun Mehta',email: 'arjun@relay.demo' },{ id: 'isha',name: 'Isha Sen',email: 'isha@relay.demo' },{ id: 'kabir',name: 'Kabir Shah',email: 'kabir@relay.demo' },{ id: 'noor',name: 'Noor Ali',email: 'noor@relay.demo' }];
const iso=() => new Date().toISOString();
const hex=b => Array.from(new Uint8Array(b),x => x.toString(16).padStart(2,'0')).join('');
export const digest=async s => hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
async function passwordHash(password,salt) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2',hash: 'SHA-256',iterations: 100000,salt: new TextEncoder().encode(salt) },key,256));

}
const stmt=(db,sql,...args) => db.prepare(sql).bind(...args);
const one=(db,sql,...args) => stmt(db,sql,...args).first();
const all=async (db,sql,...args) => (await stmt(db,sql,...args).all()).results;
const run=(db,sql,...args) => stmt(db,sql,...args).run();
function str(value,name,max,required=true) {
  if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim())) throw new Problem(400,`${name} must be ${required? '1':'0'}–${max} characters.`);
  return value.trim();

}
function choice(v,list,name) {
  if(!list.includes(v)) throw new Problem(400,`Invalid ${name}.`);
  return v;

}
function dueDate(v) {
  if(v===null||v==='') return null;
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v) throw new Problem(400,'Use a valid due date.');
  return v;

}
async function role(db,user,team,write=false) {
  const r=await one(db,'SELECT role FROM memberships WHERE user_id=? AND team_id=?',user.id,team);
  if(!r||(write&&r.role==='Viewer')) throw new Problem(403,'You do not have permission for this team action.');
  return r.role;

}
async function itemFor(db,user,id) {
  const item=await one(db,'SELECT * FROM items WHERE id=?',id);
  if(!item) throw new Problem(404,'Work item not found.');
  await role(db,user,item.team_id);
  return item;

}
export async function seed(db) {
  if(await one(db,'SELECT id FROM users LIMIT 1')) return;
  const salt=crypto.randomUUID(),hash=salt+':'+await passwordHash(DEMO_PASSWORD,salt);
  const q=[];
  for(const u of ACCOUNTS) q.push(stmt(db,'INSERT OR IGNORE INTO users VALUES (?,?,?,?)',u.id,u.name,u.email,hash));
  for(const [id,name] of [['engineering','Engineering'],['support','Customer success'],['finance','Finance']]) q.push(stmt(db,'INSERT OR IGNORE INTO teams VALUES (?,?)',id,name));
  for(const [u,t,r] of [['anmol','engineering','Lead'],['anmol','support','Member'],['maya','engineering','Member'],['arjun','engineering','Member'],['isha','engineering','Viewer'],['isha','support','Lead'],['kabir','finance','Lead'],['noor','finance','Member']]) q.push(stmt(db,'INSERT OR IGNORE INTO memberships VALUES (?,?,?)',u,t,r));
  await db.batch(q);
  const titles=['Payment webhook retries exceeding threshold','Investigate delayed customer exports','Review elevated API error rate','Approve access to production metrics','Resolve duplicate invoice report','Triage checkout timeout on mobile','Reconcile missing settlement records','Review account verification backlog','Investigate notification delivery gap','Confirm recovery after cache incident','Update escalation ownership','Verify customer data correction'];
  const rows=[];
  for(let i=0;i<42;i++) {
    let team=i<26? 'engineering':i<35? 'support':'finance',creator=team==='finance'? 'kabir':team==='support'? 'isha':'anmol',status=STATES[i%5],assignee=i%4===0? null:team==='engineering'? ['anmol','maya','arjun'][i%3]:creator;
    const created=new Date(Date.now()-(42-i)*3600000).toISOString();
    rows.push(stmt(db,`INSERT OR IGNORE INTO items (title,description,type,priority,status,team_id,assignee,created_by,due,version,created_at,updated_at,actor,change,request_key,request_hash) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?)`,titles[i%titles.length]+(i>=12? ' · '+(Math.floor(i/12)+1):''),'Investigate the reported behaviour, record findings in the activity timeline, and include verification steps before requesting approval.',TYPES[i%5],PRIORITIES[i%4],status,team,assignee,creator,new Date(Date.now()+(i%7-2)*86400000).toISOString().slice(0,10),created,created,creator,'Created work item','seed-'+i,'seed'));

  } await db.batch(rows);

}
export async function handle(request,db) {
  try {
    const url=new URL(request.url),path=url.pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean),method=request.method;
    if(!['GET','HEAD'].includes(method)) {
      const origin=request.headers.get('origin');
      if(origin&&origin!==url.origin) throw new Problem(403,'Cross-origin mutation blocked.');
      if(!request.headers.get('content-type')?.startsWith('application/json')) throw new Problem(415,'Send application/json.');

    }
    let body={};
    if(!['GET','HEAD'].includes(method)) {
      const raw=await request.text();
      if(raw.length>20000) throw new Problem(413,'Request is too large.');
      try {
        body=JSON.parse(raw||'{}');

      } catch {
        throw new Problem(400,'Invalid JSON.');

      } if(!body||Array.isArray(body)||typeof body!=='object') throw new Problem(400,'Expected a JSON object.');

    }
    const json=(data,status=200,headers={}) => Response.json(data,{ status,headers: { 'Cache-Control': 'no-store',...headers } });
    if(path[0]==='health') return json({ ok: true });
    if(path[0]==='login'&&method==='POST') {
      await seed(db);
      const email=str(body.email,'Email',200).toLowerCase(),password=str(body.password,'Password',200),now=Date.now();
      await run(db,`INSERT INTO login_attempts(email,count,reset) VALUES (?,1,?) ON CONFLICT(email) DO UPDATE SET count=CASE WHEN reset<? THEN 1 ELSE count+1 END,reset=CASE WHEN reset<? THEN excluded.reset ELSE reset END`,email,now+600000,now,now);
      const attempt=await one(db,'SELECT count FROM login_attempts WHERE email=?',email);
      if(attempt.count>15) throw new Problem(429,'Too many login attempts. Try again in ten minutes.');
      const u=await one(db,'SELECT * FROM users WHERE email=?',email);
      const [salt,expected]=(u?.password_hash||'invalid:invalid').split(':');
      if(await passwordHash(password,salt)!==expected) throw new Problem(401,'Email or password is incorrect.');
      const token=hex(crypto.getRandomValues(new Uint8Array(32)));
      await run(db,'INSERT INTO sessions VALUES (?,?,?)',await digest(token),u.id,now+28800000);
      await run(db,'DELETE FROM sessions WHERE expires<?',now);
      return json({ ok: true },200,{ 'Set-Cookie': `relay_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${url.protocol==='https:'? '; Secure':''}` });

    }
    const token=request.headers.get('cookie')?.match(/(?:^|;\s*)relay_session=([^;]+)/)?.[1];
    const user=token? await one(db,`SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?`,await digest(token),Date.now()):null;
    if(!user) throw new Problem(401,'Please sign in to your workspace.');
    if(path[0]==='logout'&&method==='POST') {
      await run(db,'DELETE FROM sessions WHERE token=?',await digest(token));
      return json({ ok: true },200,{ 'Set-Cookie': 'relay_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });

    }
    if(path[0]==='me'&&method==='GET') return json({ user,teams: await all(db,'SELECT t.*,m.role FROM teams t JOIN memberships m ON m.team_id=t.id WHERE m.user_id=? ORDER BY t.name',user.id) });
    if(path[0]==='members'&&method==='GET') {
      await role(db,user,url.searchParams.get('team'));
      return json(await all(db,'SELECT u.id,u.name,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.team_id=? ORDER BY u.name',url.searchParams.get('team')));

    }
    if(path[0]!=='items') throw new Problem(404,'Endpoint not found.');
    if(path.length===1&&method==='GET') {
      const p=url.searchParams,team=p.get('team');
      await role(db,user,team);
      const where=['i.team_id=?'],args=[team];
      if(p.get('status')) {
        where.push('i.status=?');
        args.push(choice(p.get('status'),STATES,'status'));

      } if(p.get('priority')) {
        where.push('i.priority=?');
        args.push(choice(p.get('priority'),PRIORITIES,'priority'));

      }
      const view=p.get('view');
      if(view==='mine') {
        where.push('i.assignee=?');
        args.push(user.id);

      } if(view==='urgent') {
        where.push("i.assignee IS NULL AND i.priority='Urgent' AND i.status NOT IN ('Resolved','Closed')");

      } if(view==='review') where.push("i.status='Review'");
      if(view==='overdue') where.push("i.due<date('now') AND i.status NOT IN ('Resolved','Closed')");
      if(p.get('q')) {
        where.push("(i.title LIKE ? ESCAPE '\\' OR i.description LIKE ? ESCAPE '\\')");
        const term='%'+str(p.get('q'),'Search',100).replace(/[\\%_]/g,'\\$&')+'%';
        args.push(term,term);

      }
      if(p.has('cursor')) {
        const cursor=Number(p.get('cursor'));
        if(!Number.isSafeInteger(cursor)||cursor<1) throw new Problem(400,'Invalid cursor.');
        where.push('i.id<?');
        args.push(cursor);

      }
      const limit=20,rows=await all(db,`SELECT i.*,u.name AS assignee_name FROM items i LEFT JOIN users u ON u.id=i.assignee WHERE ${where.join(' AND ')} ORDER BY i.id DESC LIMIT ?`,...args,limit+1);
      const stats=await one(db,`SELECT count(*) total,sum(status NOT IN ('Resolved','Closed')) active,sum(assignee=? AND status NOT IN ('Resolved','Closed')) mine,sum(status='Review') review,sum(assignee IS NULL AND priority='Urgent' AND status NOT IN ('Resolved','Closed')) urgent,sum(due<date('now') AND status NOT IN ('Resolved','Closed')) overdue FROM items WHERE team_id=?`,user.id,team);
      return json({ items: rows.slice(0,limit),nextCursor: rows.length>limit? rows[limit-1].id:null,stats });

    }
    if(path.length===1&&method==='POST') {
      const team=str(body.team_id,'Team',50);
      await role(db,user,team,true);
      const key=str(request.headers.get('Idempotency-Key'),'Idempotency-Key',100);
      const data={ title: str(body.title,'Title',160),description: str(body.description??'','Description',4000,false),type: choice(body.type,TYPES,'type'),priority: choice(body.priority,PRIORITIES,'priority'),team_id: team,due: dueDate(body.due??null) };
      const hash=await digest(JSON.stringify(data)),now=iso();
      await run(db,`INSERT INTO items (title,description,type,priority,status,team_id,created_by,due,version,created_at,updated_at,actor,change,request_key,request_hash) VALUES (?,?,?,?,'Open',?,?,?,1,?,?,?,'Created work item',?,?) ON CONFLICT(created_by,request_key) DO NOTHING`,data.title,data.description,data.type,data.priority,team,user.id,data.due,now,now,user.id,key,hash);
      const item=await one(db,'SELECT * FROM items WHERE created_by=? AND request_key=?',user.id,key);
      if(item.request_hash!==hash) throw new Problem(409,'This request key was already used with different content.');
      return json(item,201);

    }
    const id=Number(path[1]);
    if(!Number.isSafeInteger(id)||id<1) throw new Problem(400,'Invalid work-item ID.');
    const item=await itemFor(db,user,id);
    if(path.length===2&&method==='GET') return json(item);
    if(path[2]==='activity'&&method==='GET') {
      const c=url.searchParams.get('cursor');
      if(c&&(!Number.isSafeInteger(Number(c))||Number(c)<1)) throw new Problem(400,'Invalid cursor.');
      const rows=await all(db,`SELECT e.*,u.name AS actor_name FROM events e JOIN users u ON u.id=e.actor WHERE item_id=? ${c? 'AND e.id<?':''} ORDER BY e.id DESC LIMIT 31`,id,...(c? [Number(c)]:[]));
      return json({ events: rows.slice(0,30),nextCursor: rows.length>30? rows[29].id:null });


    }
    const r=await role(db,user,item.team_id,true);
    if(path[2]==='comments'&&method==='POST') {
      const comment=str(body.body,'Comment',2000);
      await run(db,"INSERT INTO events(item_id,actor,kind,body,created_at,version) VALUES (?,?,'comment',?,?,?)",id,user.id,comment,iso(),item.version);
      return json({ ok: true },201);

    }
    if(!Number.isSafeInteger(body.version)||body.version<1) throw new Problem(400,'A valid version is required.');
    if(item.version!==body.version) throw new Problem(409,'This item changed while you were viewing it. Reload the latest version.',{ latest: item });
    let changes={},message='';
    if(path[2]==='claim'&&method==='POST') {
      if(item.assignee) throw new Problem(409,'Someone already owns this item.');
      if(['Closed','Resolved'].includes(item.status)) throw new Problem(422,'Reopen the item before claiming it.');
      changes={ assignee: user.id };
      message='Claimed responsibility';

    }
    else if(path[2]==='transition'&&method==='POST') {
      const target=choice(body.status,STATES,'status'),allowed={ Open: ['In progress'],'In progress': ['Review'],Review: ['Resolved','In progress'],Resolved: ['Closed','In progress'],Closed: ['Open'] };
      if(!allowed[item.status].includes(target)) throw new Problem(422,`Cannot move from ${item.status} to ${target}.`);
      if(['Review','Resolved','Closed'].includes(item.status)&&r!=='Lead') throw new Problem(403,'Only a team lead can approve, close or reopen this item.');
      if(r!=='Lead'&&item.assignee!==user.id) throw new Problem(403,'Claim this item before changing its workflow.');
      if(!item.assignee) throw new Problem(422,'Assign an owner before progressing this item.');
      changes={ status: target };
      message=`Status: ${item.status} → ${target}`;

    } else if(path.length===2&&method==='PATCH') {
      if(r!=='Lead'&&item.assignee!==user.id) throw new Problem(403,'Only the owner or team lead can edit this item.');
      if(item.status==='Closed') throw new Problem(422,'Reopen a closed item before editing it.');
      if('title' in body) changes.title=str(body.title,'Title',160);
      if('description' in body) changes.description=str(body.description,'Description',4000,false);
      if('priority' in body) changes.priority=choice(body.priority,PRIORITIES,'priority');
      if('due' in body) changes.due=dueDate(body.due);
      if('assignee' in body) {
        if(r!=='Lead') throw new Problem(403,'Only a team lead can reassign work.');
        if(body.assignee!==null) {
          str(body.assignee,'Assignee',100);
          const m=await one(db,'SELECT role FROM memberships WHERE user_id=? AND team_id=?',body.assignee,item.team_id);
          if(!m||m.role==='Viewer') throw new Problem(400,'Choose a member or lead from this team.');

        } changes.assignee=body.assignee;

      }
      if(!Object.keys(changes).length) throw new Problem(400,'No editable fields provided.');
      message=Object.entries(changes).map(([k,v]) => `${k}: ${item[k]??'Unassigned'} → ${v??'Unassigned'}`).join('\n');

    } else throw new Problem(404,'Endpoint not found.');
    const fields=Object.keys(changes);
    const updated=await one(db,`UPDATE items SET ${fields.map(k => k+'=?').join(',')},version=version+1,updated_at=?,actor=?,change=? WHERE id=? AND version=? ${path[2]==='claim'? 'AND assignee IS NULL':''} RETURNING *`,...Object.values(changes),iso(),user.id,message,id,body.version);
    if(!updated) throw new Problem(409,'Another update won the race. Reload the latest version.',{ latest: await itemFor(db,user,id) });
    return json(updated);

  } catch(e) {
    if(e instanceof Problem) return Response.json({ error: e.message,...e.extra },{ status: e.status,headers: { 'Cache-Control': 'no-store' } });
    console.error('Request failed',e);
    return Response.json({ error: 'An unexpected server error occurred. Please retry.' },{ status: 500 });

  }

}
