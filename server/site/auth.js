const express=require('express');const crypto=require('node:crypto');
function equal(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function createSiteAuth({token,enabled,secure=process.env.NODE_ENV==='production'}){
 const router=express.Router(),sessions=new Map(),attempts=new Map();const lifetime=8*3600e3;
 const cookie=id=>`aibaize_admin=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${id?lifetime/1000:0}${secure?'; Secure':''}`;
 function sameOrigin(req){try{const origin=new URL(req.get('origin'));const host=req.get('x-forwarded-host')||req.get('host');const scheme=req.get('x-forwarded-proto')||req.protocol;return origin.host===host&&origin.protocol===`${scheme}:`;}catch{return false;}}
 router.use((req,res,next)=>{
  const id=/(?:^|;\s*)aibaize_admin=([a-f0-9]{64})(?:;|$)/.exec(req.get('cookie')||'')?.[1];
  const expiry=id&&sessions.get(id);if(expiry&&expiry>Date.now()){req.siteAdmin=true;req.siteSessionId=id;}else if(id)sessions.delete(id);
  if(req.siteAdmin&&!['GET','HEAD','OPTIONS'].includes(req.method)&&(req.path.startsWith('/api/admin/')||req.path==='/api/auth/logout')&&!sameOrigin(req))return res.status(403).json({error:'请求来源不符'});
  next();
 });
 router.get('/api/auth/options',(_req,res)=>res.json({password:!!enabled,feishu:false}));
 router.get('/api/auth/login',(req,res)=>res.redirect(303,`/admin/login?${new URLSearchParams({return:/^\/admin(?:\/|\?|$)/.test(String(req.query.return||''))?req.query.return:'/admin'})}`));
 router.post('/api/auth/password',express.urlencoded({extended:false,limit:'4kb'}),(req,res)=>{
  res.set('Cache-Control','no-store');if(!enabled)return res.redirect(303,'/admin/login?error=unset');
  if(req.get('origin')&&!sameOrigin(req))return res.status(403).json({error:'请求来源不符'});
  const now=Date.now();for(const [key,value]of attempts)if(value.until<=now)attempts.delete(key);for(const [key,value]of sessions)if(value<=now)sessions.delete(key);
  const key=req.ip;const record=attempts.get(key)||{count:0,until:now+15*60e3};if(record.count>=10)return res.redirect(303,'/admin/login?error=too-many');
  if(!equal(req.body.password,token)){record.count++;if(attempts.size<4096||attempts.has(key))attempts.set(key,record);return res.redirect(303,'/admin/login?error=wrong');}
  attempts.delete(key);if(sessions.size>=4096)return res.status(503).json({error:'稍后重试'});
  const id=crypto.randomBytes(32).toString('hex');sessions.set(id,now+lifetime);res.set('Set-Cookie',cookie(id));
  const target=String(req.body.return||'');res.redirect(303,/^\/admin(?:\/|\?|$)/.test(target)&&!target.includes('\\')?target:'/admin');
 });
 router.post('/api/auth/logout',(req,res)=>{if(req.siteSessionId)sessions.delete(req.siteSessionId);res.set('Set-Cookie',cookie(''));res.redirect(303,'/admin/login');});
 router.get('/api/admin/me',(req,res)=>{res.set('Cache-Control','no-store');if(!req.siteAdmin&&!equal(req.get('x-admin-token'),token))return res.status(401).json({error:'Unauthorized'});res.json({name:'AI.BAIZE 管理员',dev:false});});
 return router;
}
module.exports={createSiteAuth};
