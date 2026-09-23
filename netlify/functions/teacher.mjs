import { usersStore, progressStore, authenticate, profileKey, loginKey, progressKey, progressSummary, json, functionError, revokeUserSessions, hashPassword, cleanText, CORE_TASK_IDS } from './_shared.mjs';

async function classStudents(user){
  const users=usersStore();const {blobs}=await users.list({prefix:`profile/${user.classKey}/`});const out=[];
  for(const b of blobs){const u=await users.get(b.key,{type:'json',consistency:'strong'});if(u?.role==='student')out.push(u)}
  return out;
}
async function targetStudent(teacher,userId){
  const u=await usersStore().get(profileKey(teacher.classKey,cleanText(userId,80)),{type:'json',consistency:'strong'});
  if(!u||u.role!=='student')throw Object.assign(new Error('Schülerkonto in dieser Klasse nicht gefunden.'),{status:404});return u;
}
export default async function(request){
  try{
    const {user}=await authenticate(request);if(user.role!=='teacher')throw Object.assign(new Error('Nur Lehrkräfte können diesen Bereich öffnen.'),{status:403});
    if(request.method==='GET'){
      const students=await classStudents(user),pStore=progressStore();const rows=[];
      for(const s of students){const p=await pStore.get(progressKey(s.id),{type:'json',consistency:'strong'});rows.push({id:s.id,nickname:s.nickname,...progressSummary(p)})}
      rows.sort((a,b)=>a.nickname.localeCompare(b.nickname,'de'));return json({className:user.className,students:rows,totalCoreTasks:CORE_TASK_IDS.length});
    }
    if(request.method==='POST'){
      const body=await request.json();const action=cleanText(body.action,40);const users=usersStore(),pStore=progressStore();
      if(action==='resetAllProgress'){const students=await classStudents(user);for(const s of students){await pStore.delete(progressKey(s.id));await revokeUserSessions(s.id)}return json({ok:true,count:students.length})}
      if(action==='resetProgress'){const target=await targetStudent(user,body.userId);await pStore.delete(progressKey(target.id));await revokeUserSessions(target.id);return json({ok:true})}
      if(action==='resetPassword'){
        const target=await targetStudent(user,body.userId),pw=String(body.newPassword??'');if(pw.length<6||pw.length>128)throw Object.assign(new Error('Das neue Passwort muss 6 bis 128 Zeichen lang sein.'),{status:400});const {salt,hash}=hashPassword(pw);target.passwordSalt=salt;target.passwordHash=hash;target.passwordChangedAt=new Date().toISOString();await users.setJSON(profileKey(user.classKey,target.id),target);await revokeUserSessions(target.id);return json({ok:true})
      }
      if(action==='deleteUser'){
        const target=await targetStudent(user,body.userId);await pStore.delete(progressKey(target.id));await users.delete(loginKey(user.classKey,target.nicknameKey));await users.delete(profileKey(user.classKey,target.id));await revokeUserSessions(target.id);return json({ok:true})
      }
      return json({error:'Unbekannte Aktion.'},400);
    }
    return json({error:'Methode nicht erlaubt.'},405);
  }catch(err){return functionError(err)}
}
