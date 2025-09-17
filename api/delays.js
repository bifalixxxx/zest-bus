// api/delays.js
const TOMTOM_KEY = process.env.TOMTOM_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;  // <— AJOUT
const ZOOM = 10, TIMEOUT_MS = 5000, MAX_LINE_DELAY = 60;
const LINE_POINTS = {
  "11":[[43.7379,7.4209],[43.7447,7.4040],[43.7442,7.4010]],
  "12":[[43.7395,7.4238],[43.7425,7.4248],[43.7460,7.4220]],
  "13":[[43.7405,7.4205],[43.7420,7.4232],[43.7390,7.4230]],
  "18":[[43.7385,7.4246],[43.7663,7.4915],[43.7725,7.4964]],
  "24":[[43.7746,7.4940],[43.7779,7.5041],[43.7808,7.5122]]
};

let STORE = { mode:"auto", multiplier:1.0, manual:{}, lastAuto:null, lastAutoTs:0 };
const CACHE_TTL_AUTO_MS = 60000;

const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function fetchTomTom([lat,lng]) {
  if (!TOMTOM_KEY) throw new Error('no-key');
  const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/${ZOOM}/json?point=${lat},${lng}&key=${TOMTOM_KEY}`;
  const ctl = new AbortController(); const to = setTimeout(()=>ctl.abort(), TIMEOUT_MS);
  try { const r=await fetch(url,{signal:ctl.signal,cache:'no-store'}); if(!r.ok) throw new Error('http '+r.status); return r.json(); }
  finally { clearTimeout(to); }
}
function delayFromTomTomJson(d){
  const cur=Number(d?.flowSegmentData?.currentTravelTime), free0=Number(d?.flowSegmentData?.freeFlowTravelTime);
  if(!Number.isFinite(cur)||cur<=0) return 0; let free=free0; if(!Number.isFinite(free)||free<=0) free=Math.max(1,Math.round(cur*0.8));
  return Math.max(0,(cur-free)/60);
}
async function delayForLine(points){
  const arr=[]; for(let i=0;i<points.length;i++){ try{ const j=await fetchTomTom(points[i]); arr.push(delayFromTomTomJson(j)); if(i<points.length-1) await sleep(150);}catch{} }
  if(!arr.length) return 0; arr.sort((a,b)=>a-b); const core=arr.length>2?arr.slice(1,-1):arr; const avg=core.reduce((s,x)=>s+x,0)/core.length;
  return Math.min(MAX_LINE_DELAY, Math.round(avg));
}
async function computeAuto(){
  if(Date.now()-STORE.lastAutoTs<CACHE_TTL_AUTO_MS && STORE.lastAuto) return STORE.lastAuto;
  if(!TOMTOM_KEY){ const demo={"11":1,"12":3,"13":0,"18":12,"24":5}; STORE.lastAuto=demo; STORE.lastAutoTs=Date.now(); return demo; }
  const out={}; await Promise.all(Object.keys(LINE_POINTS).map(async k=>{ try{ out[k]=await delayForLine(LINE_POINTS[k]); }catch{ out[k]=0; } }));
  STORE.lastAuto=out; STORE.lastAutoTs=Date.now(); return out;
}
function applyMultiplier(base, mult){
  const out={}; Object.keys(LINE_POINTS).forEach(k=>{ const v=Math.round((base[k]||0)*(mult||1)); out[k]=Math.max(0,Math.min(MAX_LINE_DELAY,v)); });
  return out;
}
function checkToken(req){
  const tok=req.headers.get?.('x-admin-token') || req.headers['x-admin-token'];
  return ADMIN_TOKEN && tok === ADMIN_TOKEN;
}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const base = (STORE.mode==='manual') ? { ...STORE.manual } : await computeAuto();
      const effective = applyMultiplier(base, STORE.multiplier);
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({ mode:STORE.mode, multiplier:STORE.multiplier, delays:effective });
    }
    if(req.method==='POST'){
      if(!checkToken(req)) return res.status(401).json({error:'unauthorized'});
      const body = await (async()=>{ try{return await req.json();}catch{return{};} })();
      if(typeof body.mode==='string') STORE.mode = (body.mode==='manual'?'manual':'auto');
      if(body.multiplier!==undefined){ const m=Number(body.multiplier); STORE.multiplier = Number.isFinite(m)&&m>0 ? m : 1.0; }
      if(body.manual && typeof body.manual==='object'){
        Object.entries(body.manual).forEach(([k,v])=>{
          if(/^\d+$/.test(String(k))){ const n=Math.round(Number(v)||0); STORE.manual[k]=Math.max(0,Math.min(MAX_LINE_DELAY,n)); }
        });
      }
      if(body.clearManual) STORE.manual = {};
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({ ok:true, mode:STORE.mode, multiplier:STORE.multiplier, manual:STORE.manual });
    }
    res.setHeader('Allow','GET,POST'); return res.status(405).end();
  }catch(e){ console.error(e); return res.status(500).json({error:'server'}); }
}
