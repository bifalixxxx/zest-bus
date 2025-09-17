// api/announcement.js
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

let ANN = {
  text: "ℹ️ Info trafic : en raison de la grève du 18 septembre, les lignes 18 et 24 risquent d’être partiellement surchargées. Les mises à jour trafic seront effectuées manuellement afin de vous tenir informés.",
  visible: true
};

function checkToken(req){
  const tok=req.headers.get?.('x-admin-token') || req.headers['x-admin-token'];
  return ADMIN_TOKEN && tok === ADMIN_TOKEN;
}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){ res.setHeader('Cache-Control','no-store'); return res.status(200).json(ANN); }
    if(req.method==='POST'){
      if(!checkToken(req)) return res.status(401).json({error:'unauthorized'});
      const body = await (async()=>{ try{return await req.json();}catch{return{};} })();
      if(typeof body.text==='string') ANN.text = String(body.text).slice(0,1000);
      if(typeof body.visible==='boolean') ANN.visible = body.visible;
      res.setHeader('Cache-Control','no-store');
      return res.status(200).json({ ok:true, announcement:ANN });
    }
    res.setHeader('Allow','GET,POST'); return res.status(405).end();
  }catch(e){ console.error(e); return res.status(500).json({error:'server'}); }
}
