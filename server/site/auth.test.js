const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {createSiteAuth}=require('./auth');
test('admin session is HttpOnly; bad password and cross-origin writes are denied; logout revokes it',async()=>{
 const app=express();app.use(express.urlencoded({extended:false}));app.use(createSiteAuth({token:'a-valid-existing-admin-token',enabled:true,secure:false}));app.post('/api/admin/probe',(req,res)=>res.status(req.siteAdmin?200:401).json({ok:!!req.siteAdmin}));
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{let r=await fetch(base+'/api/auth/password',{method:'POST',body:new URLSearchParams({password:'wrong'}),redirect:'manual'});assert.match(r.headers.get('location'),/error=wrong/);
 r=await fetch(base+'/api/auth/password',{method:'POST',body:new URLSearchParams({password:'a-valid-existing-admin-token',return:'//evil.test'}),redirect:'manual'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/admin');const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.ok(!cookie.includes('a-valid-existing-admin-token'));
 const headers={cookie:cookie.split(';')[0],origin:base};assert.equal((await fetch(base+'/api/admin/probe',{method:'POST',headers})).status,200);
 assert.equal((await fetch(base+'/api/admin/probe',{method:'POST',headers:{...headers,origin:'https://evil.test'}})).status,403);
 await fetch(base+'/api/auth/logout',{method:'POST',headers,redirect:'manual'});assert.equal((await fetch(base+'/api/admin/probe',{method:'POST',headers})).status,401);
 }finally{await new Promise(r=>server.close(r));}
});
