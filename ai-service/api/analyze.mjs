import {classify,validateInput} from '../lib/classifier.mjs';
export const ORIGINS=new Set([
  'https://mziarko-d1.github.io',
  'https://pdf-generator-roboczy-cytaty-oceny.doctor-one-6588.chatgpt.site'
]);
export function createHandler({fetchUser=fetch,analyze=classify}={}){
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    const origin=req.headers.origin;
    if(!ORIGINS.has(origin)) return res.status(403).json({error:'Niedozwolony adres generatora.'});
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
    if(req.method==='OPTIONS') return res.status(204).end();
    if(req.method!=='POST') return res.status(405).json({error:'Użyj POST.'});
    const auth=req.headers.authorization||'';
    if(!/^Bearer [A-Za-z0-9_]+$/.test(auth)||auth.length>300) return res.status(401).json({error:'Zaloguj się jako administrator generatora.'});
    try{
      const userResponse=await fetchUser('https://api.github.com/user',{headers:{Authorization:auth,Accept:'application/vnd.github+json','User-Agent':'doctor-one-pdf-analysis'},signal:AbortSignal.timeout(10000)});
      if(!userResponse.ok) return res.status(401).json({error:'Zaloguj się ponownie jako administrator.'});
      const user=await userResponse.json();
      if(user.login!=='mziarko-d1') return res.status(403).json({error:'Analiza jest dostępna dla administratora generatora.'});
    }catch{return res.status(503).json({error:'Nie udało się zweryfikować logowania. Spróbuj ponownie.'});}
    let input;
    try{input=validateInput(req.body);}catch(error){return res.status(400).json({error:error.message});}
    try{
      return res.status(200).json(await analyze(input));
    }catch{
      // Never log source material, GitHub credentials or provider errors.
      return res.status(503).json({error:'Analiza AI jest teraz niedostępna. Spróbuj ponownie lub wyłącz wyróżnienia AI, aby zaimportować samą treść.'});
    }
  };
}
export default createHandler();
