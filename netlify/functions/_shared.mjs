import { getStore } from '@netlify/blobs';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { TASK_XP, SHOP_ITEMS, SECTIONS, CORE_TASK_IDS } from '../../course-data.js';
export { CORE_TASK_IDS };

const REGION = 'eu-central-1';
export const usersStore = () => getStore({ name: 'searchquest-users-v1', region: REGION, consistency: 'strong' });
export const progressStore = () => getStore({ name: 'searchquest-progress-v1', region: REGION, consistency: 'strong' });
export const sessionsStore = () => getStore({ name: 'searchquest-sessions-v1', region: REGION, consistency: 'strong' });

export const json = (data, status=200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }
});

export const cleanText = (value, max=80) => String(value ?? '').normalize('NFKC').trim().slice(0,max);
export const normalizeClass = value => cleanText(value,40).replace(/\s+/g,' ');
export const normalizeNickname = value => cleanText(value,24).toLocaleLowerCase('de-DE');
export const sha256 = value => createHash('sha256').update(String(value)).digest('hex');
export const classKeyOf = className => sha256(normalizeClass(className).toLocaleLowerCase('de-DE'));
export const nicknameKeyOf = nickname => sha256(normalizeNickname(nickname));
export const profileKey = (classKey,userId) => `profile/${classKey}/${userId}`;
export const loginKey = (classKey,nicknameKey) => `login/${classKey}/${nicknameKey}`;
export const progressKey = userId => `progress/${userId}`;
export const sessionKey = token => `session/${sha256(token)}`;

export function validateIdentity({className,nickname,password}){
  const cls=normalizeClass(className), nick=cleanText(nickname,24), pw=String(password??'');
  if(cls.length<1) throw Object.assign(new Error('Bitte eine Klasse angeben.'),{status:400});
  if(nick.length<2 || nick.length>24) throw Object.assign(new Error('Der Nickname muss 2 bis 24 Zeichen lang sein.'),{status:400});
  if(!/^[\p{L}\p{N}_.-]+$/u.test(nick)) throw Object.assign(new Error('Der Nickname darf Buchstaben, Zahlen, Punkt, Unterstrich und Bindestrich enthalten.'),{status:400});
  if(pw.length<6 || pw.length>128) throw Object.assign(new Error('Das Passwort muss 6 bis 128 Zeichen lang sein.'),{status:400});
  return {className:cls,nickname:nick,password:pw};
}

export function hashPassword(password, salt=randomBytes(16).toString('hex')){
  const hash=scryptSync(password,salt,64).toString('hex');
  return {salt,hash};
}
export function verifyPassword(password,salt,storedHash){
  try{
    const a=Buffer.from(scryptSync(password,salt,64).toString('hex'),'hex');
    const b=Buffer.from(storedHash,'hex');
    return a.length===b.length && timingSafeEqual(a,b);
  }catch{return false}
}
export function safeTextEqual(a,b){
  const ah=createHash('sha256').update(String(a??'')).digest();
  const bh=createHash('sha256').update(String(b??'')).digest();
  return timingSafeEqual(ah,bh);
}

export function defaultProgress(){return {version:1,answers:{},completed:[],revealed:[],inventory:[],equipped:{background:'default',avatar:'🧑‍💻',pet:''},currentSection:'start',updatedAt:null}}
export function publicUser(u){return {id:u.id,nickname:u.nickname,className:u.className,role:u.role,createdAt:u.createdAt}}

export async function createSession(user){
  const token=randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+30*24*60*60*1000).toISOString();
  await sessionsStore().setJSON(sessionKey(token),{userId:user.id,classKey:user.classKey,role:user.role,expiresAt,createdAt:new Date().toISOString()});
  return {token,expiresAt};
}

export function bearer(request){
  const h=request.headers.get('authorization')||'';
  const m=h.match(/^Bearer\s+(.+)$/i);return m?m[1]:'';
}
export async function authenticate(request){
  const token=bearer(request);if(!token) throw Object.assign(new Error('Nicht angemeldet.'),{status:401});
  const ss=sessionsStore(), session=await ss.get(sessionKey(token),{type:'json',consistency:'strong'});
  if(!session) throw Object.assign(new Error('Sitzung ungültig. Bitte erneut anmelden.'),{status:401});
  if(new Date(session.expiresAt).getTime()<Date.now()){await ss.delete(sessionKey(token));throw Object.assign(new Error('Sitzung abgelaufen. Bitte erneut anmelden.'),{status:401})}
  const user=await usersStore().get(profileKey(session.classKey,session.userId),{type:'json',consistency:'strong'});
  if(!user){await ss.delete(sessionKey(token));throw Object.assign(new Error('Nutzerkonto nicht mehr vorhanden.'),{status:401})}
  return {token,session,user};
}
export async function revokeUserSessions(userId){
  const store=sessionsStore(), {blobs}=await store.list({prefix:'session/'});
  for(const b of blobs){const s=await store.get(b.key,{type:'json',consistency:'strong'});if(s?.userId===userId)await store.delete(b.key)}
}

const validTaskIds=new Set(Object.keys(TASK_XP));
const validSections=new Set(SECTIONS.map(s=>s.id));
const shopById=Object.fromEntries(SHOP_ITEMS.map(x=>[x.id,x]));
function cleanAnswerValue(v,depth=0){
  if(depth>3)return null;
  if(typeof v==='string')return v.slice(0,2000);
  if(typeof v==='number'||typeof v==='boolean'||v===null)return v;
  if(Array.isArray(v))return v.slice(0,100).map(x=>cleanAnswerValue(x,depth+1));
  if(typeof v==='object'){const o={};for(const [k,val] of Object.entries(v).slice(0,100))o[String(k).slice(0,120)]=cleanAnswerValue(val,depth+1);return o}
  return null;
}
export function xpFor(completed){return [...new Set(completed||[])].filter(id=>validTaskIds.has(id)).reduce((s,id)=>s+(TASK_XP[id]||0),0)}
export function sanitizeProgress(input){
  const p=defaultProgress();const src=input&&typeof input==='object'?input:{};
  p.completed=[...new Set((Array.isArray(src.completed)?src.completed:[]).filter(id=>validTaskIds.has(id)))];
  p.revealed=[...new Set((Array.isArray(src.revealed)?src.revealed:[]).filter(id=>validTaskIds.has(id)))];
  p.answers={};
  if(src.answers&&typeof src.answers==='object')for(const [id,a] of Object.entries(src.answers)){if(!validTaskIds.has(id)||!a||typeof a!=='object')continue;p.answers[id]={value:cleanAnswerValue(a.value),updatedAt:cleanText(a.updatedAt,40)}}
  const xp=xpFor(p.completed);
  p.inventory=[...new Set((Array.isArray(src.inventory)?src.inventory:[]).filter(id=>shopById[id]&&xp>=shopById[id].threshold))];
  const eq=src.equipped||{};
  const bg=SHOP_ITEMS.find(x=>x.kind==='background'&&x.value===eq.background&&p.inventory.includes(x.id));
  const av=SHOP_ITEMS.find(x=>x.kind==='avatar'&&x.value===eq.avatar&&p.inventory.includes(x.id));
  const pet=SHOP_ITEMS.find(x=>x.kind==='pet'&&x.value===eq.pet&&p.inventory.includes(x.id));
  p.equipped={background:bg?.value||'default',avatar:av?.value||'🧑‍💻',pet:pet?.value||''};
  p.currentSection=validSections.has(src.currentSection)?src.currentSection:'start';
  p.updatedAt=new Date().toISOString();return p;
}
export function mergeProgress(existingRaw,incomingRaw){
  const a=sanitizeProgress(existingRaw||defaultProgress()), b=sanitizeProgress(incomingRaw||defaultProgress());
  const merged={...b};merged.completed=[...new Set([...a.completed,...b.completed])];merged.revealed=[...new Set([...a.revealed,...b.revealed])];
  merged.answers={...a.answers};
  for(const [id,val] of Object.entries(b.answers)){const old=merged.answers[id];const ot=Date.parse(old?.updatedAt||0)||0, nt=Date.parse(val?.updatedAt||0)||0;if(!old||nt>=ot)merged.answers[id]=val}
  const xp=xpFor(merged.completed);merged.inventory=[...new Set([...a.inventory,...b.inventory])].filter(id=>shopById[id]&&xp>=shopById[id].threshold);
  const candidate=b.equipped||{};const inv=new Set(merged.inventory);
  const validEq=(kind,value,def)=>{const item=SHOP_ITEMS.find(x=>x.kind===kind&&x.value===value);return item&&inv.has(item.id)?value:def};
  merged.equipped={background:validEq('background',candidate.background,'default'),avatar:validEq('avatar',candidate.avatar,'🧑‍💻'),pet:validEq('pet',candidate.pet,'')};
  merged.updatedAt=new Date().toISOString();return merged;
}
export function progressSummary(pRaw){
  const p=sanitizeProgress(pRaw||defaultProgress());
  const core=p.completed.filter(id=>CORE_TASK_IDS.includes(id)).length;
  return {completed:core,progressPercent:Math.round(core/CORE_TASK_IDS.length*100),xp:xpFor(p.completed),updatedAt:pRaw?.updatedAt||null,currentSection:p.currentSection};
}
export const newUserId=()=>randomUUID();
export function functionError(err){return json({error:err?.message||'Interner Fehler.'},err?.status||500)}
