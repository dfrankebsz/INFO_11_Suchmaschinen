import { usersStore, progressStore, sessionsStore, json, functionError, validateIdentity, normalizeClass, normalizeNickname, classKeyOf, nicknameKeyOf, profileKey, loginKey, progressKey, hashPassword, verifyPassword, safeTextEqual, defaultProgress, publicUser, createSession, authenticate, bearer, sessionKey, newUserId, cleanText } from './_shared.mjs';

export default async function(request){
  if(request.method!=='POST') return json({error:'Methode nicht erlaubt.'},405);
  try{
    const body=await request.json();const action=cleanText(body.action,30);
    if(action==='register'){
      const role=body.role==='teacher'?'teacher':'student';
      const id=validateIdentity(body);const cKey=classKeyOf(id.className), nKey=nicknameKeyOf(id.nickname);const users=usersStore();
      if(role==='teacher'){
        const expected=process.env.TEACHER_CODE;
        if(!expected) throw Object.assign(new Error('Der Lehrercode ist in Netlify noch nicht eingerichtet.'),{status:503});
        if(!safeTextEqual(body.teacherCode,expected)) throw Object.assign(new Error('Der Lehrercode ist nicht korrekt.'),{status:403});
      }
      const lKey=loginKey(cKey,nKey);const existing=await users.get(lKey,{type:'json',consistency:'strong'});
      if(existing) throw Object.assign(new Error('Dieser Nickname ist in der angegebenen Klasse bereits vergeben.'),{status:409});
      const userId=newUserId();const {salt,hash}=hashPassword(id.password);const user={id:userId,nickname:id.nickname,nicknameKey:nKey,className:id.className,classKey:cKey,role,passwordSalt:salt,passwordHash:hash,createdAt:new Date().toISOString()};
      try{const aliasWrite=await users.setJSON(lKey,{userId},{onlyIfNew:true});if(!aliasWrite.modified)throw new Error('nickname-taken');const profileWrite=await users.setJSON(profileKey(cKey,userId),user,{onlyIfNew:true});if(!profileWrite.modified)throw new Error('profile-collision')}catch(e){const aliasNow=await users.get(lKey,{type:'json',consistency:'strong'});if(aliasNow?.userId===userId)await users.delete(lKey).catch(()=>{});throw Object.assign(new Error('Das Konto konnte nicht angelegt werden. Eventuell wurde der Nickname gerade vergeben.'),{status:409})}
      const session=await createSession(user);const progress=defaultProgress();await progressStore().setJSON(progressKey(user.id),progress);
      return json({token:session.token,user:publicUser(user),progress},201);
    }
    if(action==='login'){
      const cls=normalizeClass(body.className), nick=cleanText(body.nickname,24), pw=String(body.password??'');
      if(!cls||!nick||!pw) throw Object.assign(new Error('Klasse, Nickname und Passwort sind erforderlich.'),{status:400});
      const cKey=classKeyOf(cls),nKey=nicknameKeyOf(nick),users=usersStore();
      const alias=await users.get(loginKey(cKey,nKey),{type:'json',consistency:'strong'});if(!alias)throw Object.assign(new Error('Klasse, Nickname oder Passwort stimmen nicht.'),{status:401});
      const user=await users.get(profileKey(cKey,alias.userId),{type:'json',consistency:'strong'});if(!user||!verifyPassword(pw,user.passwordSalt,user.passwordHash))throw Object.assign(new Error('Klasse, Nickname oder Passwort stimmen nicht.'),{status:401});
      const session=await createSession(user);const progress=await progressStore().get(progressKey(user.id),{type:'json',consistency:'strong'})||defaultProgress();
      return json({token:session.token,user:publicUser(user),progress});
    }
    if(action==='logout'){
      const token=bearer(request);if(token)await sessionsStore().delete(sessionKey(token));return json({ok:true});
    }
    if(action==='me'){const {user}=await authenticate(request);return json({user:publicUser(user)})}
    return json({error:'Unbekannte Aktion.'},400);
  }catch(err){return functionError(err)}
}
