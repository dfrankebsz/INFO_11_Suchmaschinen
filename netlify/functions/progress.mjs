import { progressStore, progressKey, authenticate, publicUser, defaultProgress, mergeProgress, json, functionError } from './_shared.mjs';

export default async function(request){
  try{
    const {user}=await authenticate(request);const store=progressStore();
    if(request.method==='GET'){
      const progress=await store.get(progressKey(user.id),{type:'json',consistency:'strong'})||defaultProgress();
      return json({user:publicUser(user),progress});
    }
    if(request.method==='POST'){
      const len=Number(request.headers.get('content-length')||0);if(len>250000)throw Object.assign(new Error('Die gespeicherten Kursdaten sind zu groß.'),{status:413});
      const body=await request.json();const old=await store.get(progressKey(user.id),{type:'json',consistency:'strong'})||defaultProgress();const merged=mergeProgress(old,body.progress);await store.setJSON(progressKey(user.id),merged);return json({progress:merged});
    }
    return json({error:'Methode nicht erlaubt.'},405);
  }catch(err){return functionError(err)}
}
