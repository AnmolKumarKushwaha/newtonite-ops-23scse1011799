import { createServer } from 'node:http';
import { readFile,stat,mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { database } from './sqlite.mjs';
import { handle,seed } from '../lib/core.mjs';
const dataDir=process.env.DATA_DIR||'./data';
await mkdir(dataDir,{ recursive: true });
const db=database(resolve(dataDir,'relay.sqlite'));
await seed(db);
const root=resolve('dist-local'),port=Number(process.env.PORT||3000);
const mime={ '.html': 'text/html','.js': 'text/javascript','.css': 'text/css','.svg': 'image/svg+xml','.png': 'image/png' };
const server=createServer(async (req,res) => {

  try {
    if(req.url.startsWith('/api/')) {

      let size=0;
      const parts=[];
      for await(const chunk of req) {
        size+=chunk.length;
        if(size>22000) {
          res.writeHead(413,{ 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request is too large.' }));
          return;

        } parts.push(chunk);

      }
      const request=new Request('http://'+req.headers.host+req.url,{ method: req.method,headers: req.headers,...(!['GET','HEAD'].includes(req.method)? { body: Buffer.concat(parts) }:{}) });
      const response=await handle(request,db);
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;


    }
    let path=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;

    }
    try {
      if(!(await stat(path)).isFile()) path=resolve(root,'index.html');

    } catch {
      path=resolve(root,'index.html');

    }
    const content=await readFile(path);
    res.writeHead(200,{ 'Content-Type': mime[extname(path)]||'application/octet-stream','X-Content-Type-Options': 'nosniff','Referrer-Policy': 'same-origin','Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'" });
    res.end(content);

  } catch(err) {
    console.error(err);
    res.writeHead(500);
    res.end('Server error. Build the frontend with npm run build:local first.');

  }

});
server.listen(port,'0.0.0.0',() => console.log(`Relay running at http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close(() => {
  db.raw.close();
  process.exit(0)

}));
