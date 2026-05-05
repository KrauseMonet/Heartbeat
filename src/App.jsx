import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, getDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut as fbSignOut, GoogleAuthProvider, signInWithPopup, deleteUser } from "firebase/auth";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { Heart, GameController, Leaf, UserCircle, Bell, ArrowLeft, Fire, Camera, PencilSimple, CheckCircle, Plus, X, CaretRight, Heartbeat, Envelope, Jar, ListChecks, HandsPraying, Scales, MaskHappy, HandPointing, ChartBar, ChatTeardrop, FlowerLotus, Sparkle, HouseSimple, Gear, SignOut, CalendarBlank, MapPin, Clock, Star, CalendarHeart, Shuffle, ArrowRight, Pen } from "@phosphor-icons/react";
import {
  getDailyQuestion, getDailyWYR, getNHIESet,
  getTruthQuestion, getDare, getCompatSet,
  getDesirePrompt, getWatchSuggestions,
  getDateTemplate, BUCKET_SUGGESTIONS,
  getWeeklyCheckIn, getDailyWordle, getPictionaryWords,
} from "./data/content.js";
// ── FIREBASE ───────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:      import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};
const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);
const auth  = getAuth(fbApp);
const googleProvider = new GoogleAuthProvider();
const messaging = getMessaging(fbApp);

async function requestNotifPermission(uid) {
  try {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });
    if (token) await updateDoc(doc(db,"users",uid), { fcmToken:token });
  } catch(e) { console.error("Notif setup failed:", e); }
}

async function sendPushToPartner(partnerUid, title, body) {
  try {
    const snap = await getDoc(doc(db,"users",partnerUid));
    const token = snap.data()?.fcmToken;
    if (!token) return;
    await fetch("/api/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, title, body }),
    });
  } catch(e) { console.error("Push failed:", e); }
}

// ── CLAUDE ─────────────────────────────────────────────────────────────────
async function callClaude(system, msg) {
  const r = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, message: msg }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Claude API failed");
  return d.text;
}

// ── CLOUDINARY ─────────────────────────────────────────────────────────────
async function uploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, { method:"POST", body:fd });
  const d = await r.json(); return d.secure_url;
}

// ── FIRESTORE ──────────────────────────────────────────────────────────────
const genCode  = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const todayKey = () => new Date().toISOString().split("T")[0].replace(/-/g,"");
const todayStr = () => new Date().toISOString().split("T")[0];

async function createRoom(uid, userData) {
  const code = genCode();
  await setDoc(doc(db,"rooms",code), {
    users:{ A:{...userData,uid}, B:null },
    coupleName:"", anniversary:"", howWeMet:{A:"",B:""}, couplePhoto:"", distance:"",
    nextMeeting:null, notes:[], bucket:[], memories:[], notifications:[],
streak:{count:1,lastDate:todayStr()}, lastHeartbeat:null,
datePlans:[], watchHistory:[], outfitCards:[],  });
  await updateDoc(doc(db,"users",uid), { roomId:code, userKey:"A", onboardingDone:true });
  return code;
}
async function joinRoom(uid, code, userData) {
  const ref = doc(db,"rooms",code.toUpperCase());
  // Write uid as pendingJoin first so rules can validate
  await updateDoc(ref, { pendingJoinUid: uid });
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Room not found. Check the code.");
  if (snap.data().users?.B?.name) throw new Error("This room already has two people.");
  await updateDoc(ref, { "users.B":{...userData,uid}, pendingJoinUid:null });
  await updateDoc(doc(db,"users",uid), { roomId:code.toUpperCase(), userKey:"B", onboardingDone:true });
  return code.toUpperCase();
}
async function roomUpdate(roomId, updates) { await updateDoc(doc(db,"rooms",roomId), updates); }
async function addNotif(roomId, userKey, type, message) {
  const n = { id:Date.now()+Math.random(), from:userKey, type, message, ts:Date.now(), readA:userKey==="A", readB:userKey==="B" };
  const snap = await getDoc(doc(db,"rooms",roomId));
  const cur  = snap.data()?.notifications || [];
  await updateDoc(doc(db,"rooms",roomId), { notifications:[n,...cur].slice(0,40) });
}
async function markNotifsRead(roomId, userKey, notifications) {
  const key = userKey==="A"?"readA":"readB";
  await updateDoc(doc(db,"rooms",roomId), { notifications:notifications.map(n=>({...n,[key]:true})) });
}

// ── UTILS ──────────────────────────────────────────────────────────────────
const daysUntil    = s => { if(!s) return null; const d=Math.ceil((new Date(s)-Date.now())/86400000); return d>=0?d:null; };
const togetherDays = s => { if(!s) return null; const d=Math.floor((Date.now()-new Date(s))/86400000); return d>=0?d:null; };
const initials     = (n="?") => n.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
const greet        = () => { const h=new Date().getHours(); return h<12?"Good morning":h<17?"Good afternoon":"Good evening"; };
const timeAgo      = ts => { const m=Math.floor((Date.now()-ts)/60000); return m<1?"just now":m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`; };
const getTimeInZone = tz => tz ? new Date().toLocaleTimeString("en",{timeZone:tz,hour:"2-digit",minute:"2-digit",hour12:true}) : "--:--";
const isBirthday   = bd => { if(!bd) return false; const t=new Date(),b=new Date(bd); return t.getMonth()===b.getMonth()&&t.getDate()===b.getDate(); };

const TIMEZONES = [
  {label:"IST — India",value:"Asia/Kolkata"},{label:"GMT — UK",value:"Europe/London"},
  {label:"EST — US East",value:"America/New_York"},{label:"CST — US Central",value:"America/Chicago"},
  {label:"PST — US West",value:"America/Los_Angeles"},{label:"CET — Europe",value:"Europe/Paris"},
  {label:"GST — Gulf",value:"Asia/Dubai"},{label:"SGT — Singapore",value:"Asia/Singapore"},
  {label:"AEST — Australia",value:"Australia/Sydney"},{label:"JST — Japan",value:"Asia/Tokyo"},
];
const MOODS=[{e:"🥰",l:"Missing you"},{e:"😊",l:"Happy"},{e:"😌",l:"Calm"},{e:"🤩",l:"Excited"},{e:"😴",l:"Tired"},{e:"😔",l:"Low"},{e:"🤭",l:"Playful"},{e:"😤",l:"Stressed"}];
const LOVE_LANGS=[{key:"words",title:"Words of Affirmation",desc:"Compliments & kind words"},{key:"time",title:"Quality Time",desc:"Undivided attention"},{key:"gifts",title:"Receiving Gifts",desc:"Thoughtful surprises"},{key:"acts",title:"Acts of Service",desc:"Doing things that help"},{key:"touch",title:"Physical Touch",desc:"Closeness & presence"}];

// ── DESIGN ─────────────────────────────────────────────────────────────────
const PF = "'Playfair Display', Georgia, serif";
const LT = "'Lato', system-ui, sans-serif";

const C = {
  bg:"#FFF6F3", surface:"rgba(255,255,255,0.97)", glass:"rgba(255,246,243,0.75)",
  text:"#1A0A05", muted:"#9A7A68", inverse:"#FFF6F3",
  rose:"#D4526A", roseSoft:"#FDE8ED", roseBd:"rgba(212,82,106,0.2)", roseGlow:"rgba(212,82,106,0.15)",
  accent:"#C4522A", accentSoft:"#FAE8DF", accentBd:"rgba(196,82,42,0.2)",
  gold:"#D4922A", goldSoft:"#FDF3E0", goldBd:"rgba(212,146,42,0.25)",
  sage:"#6B8F71", sageSoft:"#EEF4EF", sageBd:"rgba(107,143,113,0.25)",
  purple:"#8B6BAD", purpleSoft:"#F3EFFC", purpleBd:"rgba(139,107,173,0.25)",
  border:"rgba(212,82,106,0.10)", borderSoft:"rgba(212,82,106,0.06)",
  gradHero:"linear-gradient(145deg,#FFB3B3 0%,#FFCDB8 40%,#FFE8D6 100%)",
  gradHome:"linear-gradient(180deg,#FFD6D6 0%,#FFF0EC 50%,#FFF6F3 100%)",
  gradPlay:"linear-gradient(180deg,#FFD0E8 0%,#FFF0F8 50%,#FFF6F3 100%)",
  gradUs:"linear-gradient(180deg,#FFE0C8 0%,#FFF5EE 50%,#FFF6F3 100%)",
  gradProfile:"linear-gradient(180deg,#E8D0FF 0%,#F8F0FF 50%,#FFF6F3 100%)",
  gradCard:"linear-gradient(135deg,rgba(255,255,255,0.99) 0%,rgba(255,246,243,0.94) 100%)",
  gradDark:"linear-gradient(145deg,#2A0F08 0%,#1A0A05 100%)",
  gradRose:"linear-gradient(135deg,#F093A0 0%,#D4526A 100%)",
  gradGold:"linear-gradient(135deg,#F0C060 0%,#D4922A 100%)",
  gradSage:"linear-gradient(135deg,#90C498 0%,#6B8F71 100%)",
  gradPeach:"linear-gradient(135deg,#FFB3A0 0%,#FF8C78 100%)",
  gradWarm:"linear-gradient(135deg,#FFD6C8 0%,#FFBBA8 100%)",
};

const SHADOWS = {
  sm:"0 2px 8px rgba(212,82,106,0.08),0 1px 3px rgba(212,82,106,0.05)",
  md:"0 8px 24px rgba(212,82,106,0.10),0 2px 8px rgba(212,82,106,0.06)",
  lg:"0 20px 48px rgba(212,82,106,0.14),0 8px 20px rgba(212,82,106,0.08)",
  xl:"0 32px 64px rgba(212,82,106,0.18),0 12px 28px rgba(212,82,106,0.10)",
};

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Lato:wght@300;400;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html{scroll-behavior:smooth;}
  body{background:#FFF6F3;font-family:${LT};color:#1A0A05;-webkit-font-smoothing:antialiased;}
body::before{content:'';position:fixed;inset:0;background:url('/images/bg.jpg') center/cover no-repeat;opacity:0.07;pointer-events:none;z-index:0;}
  @keyframes fadeRise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes hbBeat{0%,100%{transform:scale(1)}30%{transform:scale(1.22)}65%{transform:scale(1.06)}}
  @keyframes hbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  @keyframes hbSpin{to{transform:rotate(360deg)}}
  @keyframes hbRing1{0%{transform:scale(1);opacity:0.5}100%{transform:scale(2.2);opacity:0}}
  @keyframes hbRing2{0%{transform:scale(1);opacity:0.35}100%{transform:scale(2.8);opacity:0}}
  @keyframes slowPulse{0%,100%{box-shadow:0 0 0 0 rgba(212,82,106,0.4)}60%{box-shadow:0 0 0 18px rgba(212,82,106,0)}}
  @keyframes fastPulse{0%,100%{box-shadow:0 0 0 0 rgba(212,82,106,0.6);transform:scale(1)}50%{box-shadow:0 0 0 22px rgba(212,82,106,0);transform:scale(1.10)}}
  @keyframes heartFloat{0%,100%{transform:scale(1) translateY(0)}50%{transform:scale(1.08) translateY(-4px)}}
  @keyframes slideIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
  @keyframes stagger1{0%{opacity:0;transform:translateY(16px)}100%{opacity:1;transform:none}}
  @keyframes shake{0%,100%{transform:translateX(0)}10%,50%,90%{transform:translateX(-4px)}30%,70%{transform:translateX(4px)}}

  .fade-rise{animation:fadeRise 0.45s cubic-bezier(0.22,1,0.36,1) both;}
  .fade-in{animation:fadeIn 0.35s ease both;}
  .hb-float{animation:hbFloat 3.8s ease-in-out infinite;}
  .hb-beat{animation:hbBeat 0.5s ease-in-out;}
  .hb-spin{animation:hbSpin 1.4s linear infinite;}
  .hb-slow{animation:slowPulse 2.4s ease-in-out infinite;}
  .hb-fast{animation:fastPulse 0.45s ease-in-out infinite;}
  .heart-float{animation:heartFloat 2.2s ease-in-out infinite;}
  .slide-in{animation:slideIn 0.4s cubic-bezier(0.22,1,0.36,1) both;}

  .card-hover{transition:transform 0.22s cubic-bezier(0.22,1,0.36,1),box-shadow 0.22s ease;}
  .card-hover:hover{transform:translateY(-3px);}
  .card-hover:active{transform:scale(0.97);}

  .s1{animation:fadeRise 0.4s 0.05s both;}
  .s2{animation:fadeRise 0.4s 0.12s both;}
  .s3{animation:fadeRise 0.4s 0.19s both;}
  .s4{animation:fadeRise 0.4s 0.26s both;}
  .s5{animation:fadeRise 0.4s 0.33s both;}
  .s6{animation:fadeRise 0.4s 0.40s both;}

  ::-webkit-scrollbar{width:0;height:0;}
  input,textarea,select{font-family:${LT};}
`;

// ── PRIMITIVE COMPONENTS ───────────────────────────────────────────────────
function Field({label,textarea,select,children,style:es,...p}){
  const [f,setF]=useState(false);
  const base={width:"100%",background:"rgba(255,255,255,0.85)",border:`1.5px solid ${f?"rgba(212,82,106,0.5)":C.border}`,borderRadius:16,padding:"14px 18px",fontFamily:LT,fontSize:15,color:C.text,outline:"none",transition:"all 0.25s",display:"block",boxShadow:f?`0 0 0 4px ${C.roseGlow}`:"none",...(textarea?{resize:"none"}:{}),...es};
  return (
    <div style={{marginBottom:18}}>
      {label&&<div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:8,fontFamily:LT}}>{label}</div>}
      {select?<select {...p} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{...base,cursor:"pointer",appearance:"none"}}>{children}</select>
      :textarea?<textarea {...p} rows={3} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={base}/>
      :<input {...p} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={base}/>}
    </div>
  );
}

function Btn({children,variant="fill",style:s,disabled,onClick,small}){
  const v={
    fill:{background:C.gradRose,color:"#fff",border:"none",boxShadow:SHADOWS.md},
    gold:{background:C.gradGold,color:"#fff",border:"none",boxShadow:SHADOWS.md},
    sage:{background:C.gradSage,color:"#fff",border:"none",boxShadow:SHADOWS.md},
    dark:{background:C.gradDark,color:"#FAF0E8",border:"none",boxShadow:SHADOWS.lg},
    outline:{background:"transparent",color:C.rose,border:`1.5px solid ${C.rose}`,boxShadow:"none"},
    ghost:{background:"rgba(255,255,255,0.65)",color:C.muted,border:`1px solid ${C.border}`,boxShadow:SHADOWS.sm},
    glass:{background:"rgba(255,255,255,0.55)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",color:C.text,border:"1px solid rgba(255,255,255,0.75)",boxShadow:SHADOWS.sm},
  };
  return (
    <button disabled={disabled} onClick={onClick} className="card-hover" style={{display:"block",width:"100%",borderRadius:18,padding:small?"10px 18px":"15px 24px",fontFamily:LT,fontSize:small?13:15,fontWeight:700,letterSpacing:"0.04em",cursor:disabled?"not-allowed":"pointer",transition:"all 0.2s",opacity:disabled?0.45:1,...v[variant],...s}}>{children}</button>
  );
}

function Card({children,style:s,glass,elevated,gradient,onClick,layer}){
  return (
    <div onClick={onClick} className={onClick?"card-hover":""} style={{background:gradient||C.gradCard,backdropFilter:glass?"blur(20px)":"none",WebkitBackdropFilter:glass?"blur(20px)":"none",borderRadius:20,padding:22,border:glass?"1px solid rgba(255,255,255,0.6)":"1px solid rgba(255,255,255,0.92)",boxShadow:elevated?SHADOWS.lg:SHADOWS.md,marginBottom:14,position:"relative",overflow:layer?"hidden":"visible",cursor:onClick?"pointer":"default",...s}}>
      {layer&&<div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0) 100%)",pointerEvents:"none",borderRadius:20,zIndex:1}}/>}
      <div style={{position:"relative",zIndex:2}}>{children}</div>
    </div>
  );
}

function Avatar({name,photo,size=48,gradient=C.gradRose}){
  return photo
    ?<img src={photo} alt={name} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,border:"3px solid rgba(255,255,255,0.9)",boxShadow:SHADOWS.md}}/>
    :<div style={{width:size,height:size,borderRadius:"50%",background:gradient,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.34,fontWeight:700,color:"#fff",flexShrink:0,border:"3px solid rgba(255,255,255,0.9)",boxShadow:SHADOWS.md,fontFamily:LT}}>{initials(name)}</div>;
}

function BackBtn({onClick}){
  return (
    <button onClick={onClick} style={{background:"rgba(255,255,255,0.75)",border:"1px solid rgba(255,255,255,0.92)",borderRadius:14,cursor:"pointer",padding:"9px 11px",lineHeight:1,boxShadow:SHADOWS.sm,backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"center",transition:"all 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=SHADOWS.md}
      onMouseLeave={e=>e.currentTarget.style.boxShadow=SHADOWS.sm}>
      <ArrowLeft size={20} color={C.text}/>
    </button>
  );
}

function Spinner({text="One moment..."}){
  return (
    <div style={{textAlign:"center",padding:"48px 0",color:C.muted}}>
      <div style={{display:"inline-block",marginBottom:14}} className="hb-spin"><Sparkle size={32} color={C.rose}/></div>
      <div style={{fontSize:14,fontFamily:LT}}>{text}</div>
    </div>
  );
}

function ErrBox({msg}){
  return msg?<div style={{background:"rgba(212,82,106,0.07)",border:"1px solid rgba(212,82,106,0.22)",borderRadius:14,padding:"12px 16px",marginBottom:16,fontSize:13,color:C.rose,fontFamily:LT,display:"flex",alignItems:"center",gap:10}}><X size={16} color={C.rose}/>{msg}</div>:null;
}

function Hdr({title,sub,back,right}){
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:26}}>
      <BackBtn onClick={back}/>
      <div style={{flex:1}}>
        <h2 style={{fontFamily:PF,fontSize:22,fontWeight:400,fontStyle:"italic",color:C.text,lineHeight:1.2}}>{title}</h2>
        {sub&&<div style={{fontSize:12,color:C.muted,fontFamily:LT,marginTop:3}}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function PhotoUpload({current,onUpload,size=80}){
  const [loading,setLoading]=useState(false);
  const ref=useRef();
  const handle=async e=>{ const file=e.target.files[0]; if(!file) return; setLoading(true); try{ const url=await uploadImage(file); onUpload(url); }catch(err){console.error(err);} setLoading(false); };
  return (
    <div style={{position:"relative",width:size,height:size,cursor:"pointer"}} onClick={()=>ref.current.click()}>
      {current?<img src={current} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",border:"3px solid rgba(255,255,255,0.92)",boxShadow:SHADOWS.lg}}/>
      :<div style={{width:size,height:size,borderRadius:"50%",background:C.gradHero,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,boxShadow:SHADOWS.md}}><Camera size={size*0.32} color="rgba(255,255,255,0.85)" weight="light"/><span style={{fontSize:9,color:"rgba(255,255,255,0.7)",fontFamily:LT,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>Add photo</span></div>}
      {current&&<div style={{position:"absolute",bottom:2,right:2,background:C.gradRose,borderRadius:"50%",width:size*0.3,height:size*0.3,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.sm}}><Camera size={size*0.14} color="#fff" weight="fill"/></div>}
      {loading&&<div style={{position:"absolute",inset:0,borderRadius:"50%",background:"rgba(255,255,255,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center"}}><div className="hb-spin"><Sparkle size={size*0.3} color={C.rose}/></div></div>}
      <input ref={ref} type="file" accept="image/*" onChange={handle} style={{display:"none"}}/>
    </div>
  );
}

function GradOrb({size=320,top=-80,color1="rgba(255,150,130,0.35)",color2="rgba(255,200,180,0.12)"}){
  return <div style={{position:"absolute",top,left:"50%",transform:"translateX(-50%)",width:size,height:size,borderRadius:"50%",background:`radial-gradient(circle,${color1} 0%,${color2} 60%,transparent 100%)`,filter:"blur(40px)",pointerEvents:"none",zIndex:0}}/>;
}

function ScreenWrap({gradient,children,pb}){
  return <div style={{minHeight:"100vh",background:gradient||C.gradHome,paddingBottom:pb||100}}>{children}</div>;
}

// ── ONBOARDING ─────────────────────────────────────────────────────────────
function Onboarding({onDone}){
  const [slide,setSlide]=useState(0);
  const slides=[
    {gradient:"linear-gradient(160deg,#FFB3B3 0%,#FFCDB8 50%,#FFE8D6 100%)",icon:<div style={{position:"relative",width:160,height:160}}><div style={{position:"absolute",inset:0,borderRadius:"50%",background:"rgba(255,255,255,0.25)",animation:"hbRing1 2s ease-out infinite"}}/><div style={{position:"absolute",inset:-20,borderRadius:"50%",background:"rgba(255,255,255,0.15)",animation:"hbRing2 2s ease-out infinite 0.5s"}}/><div style={{position:"absolute",inset:20,borderRadius:"50%",background:"rgba(255,255,255,0.92)",boxShadow:SHADOWS.xl,display:"flex",alignItems:"center",justifyContent:"center"}}><Heart size={56} color={C.rose} weight="fill"/></div></div>,title:"Feel each other's presence",body:"A single tap sends a heartbeat. No words needed — just a pulse that says \"I'm thinking of you.\""},
    {gradient:"linear-gradient(160deg,#FFB3D6 0%,#FFCCE8 50%,#FFE8F5 100%)",icon:<div style={{position:"relative",width:160,height:160,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{position:"absolute",inset:0,borderRadius:"50%",background:"rgba(255,255,255,0.3)",boxShadow:SHADOWS.xl}}/><div style={{position:"relative",display:"flex",gap:-10}}><div style={{background:"rgba(255,255,255,0.95)",borderRadius:20,padding:20,boxShadow:SHADOWS.lg,transform:"rotate(-8deg) translateX(8px)"}}><ChatTeardrop size={40} color={C.rose} weight="fill"/></div><div style={{background:"rgba(255,255,255,0.95)",borderRadius:20,padding:20,boxShadow:SHADOWS.lg,transform:"rotate(8deg) translateX(-8px)"}}><GameController size={40} color={C.gold} weight="fill"/></div></div></div>,title:"Play and discover each other",body:"Daily questions, games and challenges that bring you closer — even from opposite sides of the world."},
    {gradient:"linear-gradient(160deg,#FFCCA8 0%,#FFE0C8 50%,#FFF5EE 100%)",icon:<div style={{position:"relative",width:160,height:160,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{position:"absolute",inset:0,borderRadius:"50%",background:"rgba(255,255,255,0.3)",boxShadow:SHADOWS.xl}}/><div style={{position:"relative",background:"rgba(255,255,255,0.95)",borderRadius:24,padding:24,boxShadow:SHADOWS.lg,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}><Jar size={48} color={C.gold} weight="fill"/><div style={{display:"flex",gap:6}}>{["🥰","✨","💫"].map(e=><span key={e} style={{fontSize:14}}>{e}</span>)}</div></div></div>,title:"Build your story together",body:"Every memory, note, and milestone — saved in your private shared space. Your relationship, documented."},
  ];
  const s=slides[slide];
  return (
    <div style={{minHeight:"100vh",background:s.gradient,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",padding:"72px 32px 52px",textAlign:"center",transition:"background 0.6s ease"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:40}} className="fade-rise">
        <div className="hb-float" key={slide}>{s.icon}</div>
        <div>
          <h2 style={{fontFamily:PF,fontSize:30,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:16,lineHeight:1.3}}>{s.title}</h2>
          <p style={{fontSize:16,color:"rgba(26,10,5,0.65)",lineHeight:1.8,fontFamily:LT,maxWidth:300}}>{s.body}</p>
        </div>
      </div>
      <div style={{width:"100%"}}>
        <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:36}}>{slides.map((_,i)=><div key={i} style={{width:i===slide?28:8,height:8,borderRadius:4,background:i===slide?"rgba(26,10,5,0.6)":"rgba(26,10,5,0.2)",transition:"all 0.35s"}}/>)}</div>
        {slide<slides.length-1?<Btn onClick={()=>setSlide(s=>s+1)} variant="glass">Next →</Btn>:<Btn onClick={onDone} variant="glass">Get started →</Btn>}
        {slide>0&&<button onClick={()=>setSlide(s=>s-1)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(26,10,5,0.5)",fontSize:14,fontFamily:LT,marginTop:18,display:"block",width:"100%"}}>← Back</button>}
        {slide===0&&<button onClick={onDone} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(26,10,5,0.4)",fontSize:13,fontFamily:LT,marginTop:16,display:"block",width:"100%"}}>Skip</button>}
      </div>
    </div>
  );
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function Login({onLogin}){
  const [mode,setMode]=useState("signin");
  const [email,setEmail]=useState(""); const [pass,setPass]=useState(""); const [name,setName]=useState("");
  const [busy,setBusy]=useState(false); const [err,setErr]=useState("");
  const submit=async()=>{
    if(!email.trim()||!pass.trim()) return; if(mode==="signup"&&!name.trim()) return;
    setBusy(true); setErr("");
    try {
      let cred;
      if(mode==="signin"){cred=await signInWithEmailAndPassword(auth,email.trim(),pass);}
else {
  cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  await setDoc(doc(db,"users",cred.user.uid), {
    name:name.trim(),photo:"",status:"",timezone:"",
    birthday:"",favoriteEmoji:"♥",
    roomId:null,userKey:null,onboardingDone:false
  });
  await new Promise(r=>setTimeout(r,500));
}      onLogin(cred.user);
    }catch(e){const msgs={"auth/invalid-credential":"Wrong email or password.","auth/user-not-found":"No account found.","auth/wrong-password":"Wrong password.","auth/email-already-in-use":"Email already registered.","auth/weak-password":"Password needs at least 6 characters.","auth/invalid-email":"Please enter a valid email."}; setErr(msgs[e.code]||e.message);}
    setBusy(false);
  };
const googleLogin=async()=>{
  setBusy(true); setErr("");
  try{
    const result=await signInWithPopup(auth,googleProvider);
    const u=result.user;
    const snap=await getDoc(doc(db,"users",u.uid));
    if(!snap.exists()) await setDoc(doc(db,"users",u.uid),{
      name:u.displayName||"",photo:u.photoURL||"",
      status:"",timezone:"",birthday:"",
      favoriteEmoji:"♥",roomId:null,userKey:null,onboardingDone:false
    });
    onLogin(u);
  }catch(e){
    if(e.code!=="auth/popup-closed-by-user") setErr(e.message);
  }
  setBusy(false);
};
  return (
    <div style={{minHeight:"100vh",background:C.gradHero,position:"relative",overflow:"hidden"}}>
      <GradOrb size={400} top={-100} color1="rgba(255,150,130,0.4)" color2="rgba(255,200,180,0.15)"/>
      <div style={{padding:"72px 32px 52px",textAlign:"center",position:"relative",zIndex:1}}>
        <div style={{marginBottom:20}} className="hb-float"><div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,0.92)",boxShadow:SHADOWS.xl}}><Heart size={40} color={C.rose} weight="fill"/></div></div>
        <h1 style={{fontFamily:PF,fontSize:46,fontWeight:400,fontStyle:"italic",color:C.text,marginBottom:14,lineHeight:1.1}}>Heartbeat</h1>
        <p style={{fontFamily:LT,fontSize:16,color:"rgba(26,10,5,0.6)",lineHeight:1.8,maxWidth:260,margin:"0 auto"}}>Close the distance.<br/>Feel each other's presence<br/>across any miles.</p>
        <div style={{display:"flex",justifyContent:"center",gap:28,marginTop:28}}>{[[Heart,"Daily moments"],[GameController,"Play together"],[Jar,"Build memories"]].map(([Icon,l])=>(<div key={l} style={{textAlign:"center"}}><div style={{background:"rgba(255,255,255,0.6)",borderRadius:14,padding:"10px 10px 6px",marginBottom:6,backdropFilter:"blur(8px)"}}><Icon size={20} color="rgba(26,10,5,0.55)" weight="regular"/></div><div style={{fontSize:9,color:"rgba(26,10,5,0.5)",fontFamily:LT,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div></div>))}</div>
      </div>
      <div style={{background:C.surface,borderRadius:"32px 32px 0 0",padding:"36px 24px 48px",position:"relative",zIndex:1,boxShadow:"0 -8px 40px rgba(212,82,106,0.12)"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:28,background:"rgba(212,82,106,0.06)",borderRadius:16,padding:4}}>{[["signin","Sign in"],["signup","Create account"]].map(([k,l])=>(<button key={k} onClick={()=>{setMode(k);setErr("");}} style={{padding:"12px 0",borderRadius:13,border:"none",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,background:mode===k?C.surface:"transparent",color:mode===k?C.rose:C.muted,boxShadow:mode===k?SHADOWS.sm:"none",transition:"all 0.2s"}}>{l}</button>))}</div>
        <button onClick={googleLogin} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,width:"100%",padding:"14px 20px",borderRadius:18,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.85)",cursor:"pointer",fontFamily:LT,fontSize:15,fontWeight:700,color:C.text,marginBottom:18,boxShadow:SHADOWS.sm,transition:"all 0.2s"}}><svg width="18" height="18" viewBox="0 0 18 18"><path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4"/><path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z" fill="#34A853"/><path d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z" fill="#FBBC05"/><path d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z" fill="#EA4335"/></svg>Continue with Google</button>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><div style={{flex:1,height:1,background:C.border}}/><span style={{fontSize:11,color:C.muted,fontFamily:LT}}>or</span><div style={{flex:1,height:1,background:C.border}}/></div>
        {mode==="signup"&&<Field label="Your name" placeholder="e.g. Koustav" value={name} onChange={e=>setName(e.target.value)}/>}
        <Field label="Email" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
        <Field label="Password" type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)}/>
        <ErrBox msg={err}/>
        {busy?<Spinner text={mode==="signin"?"Signing in...":"Creating your account..."}/>:<Btn disabled={!email.trim()||!pass.trim()||(mode==="signup"&&!name.trim())} onClick={submit}>{mode==="signin"?"Sign in →":"Create account →"}</Btn>}
      </div>
    </div>
  );
}

// ── PROFILE SETUP ──────────────────────────────────────────────────────────
function ProfileSetup({uid, existingName, existingPhoto, onDone}) {
  const [name, setName] = useState(existingName || "");
  const [photo, setPhoto] = useState(existingPhoto || "");
  const [busy, setBusy] = useState(false);
  const EMOJIS = ["♥","🌙","⭐","🌸","🦋","🌊","☀️","🌿","🎵","✨"];
  const [emoji, setEmoji] = useState("♥");

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await updateDoc(doc(db, "users", uid), {
      name: name.trim(),
      photo,
      favoriteEmoji: emoji,
      // Defaults for deferred fields
      birthday: "",
      timezone: "",
      status: "",
      onboardingDone: true,
    });
    onDone({ name: name.trim(), photo, favoriteEmoji: emoji });
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#FFD6D6 0%,#FFF0EC 100%)", transition: "background 0.5s ease" }}>
      <GradOrb size={300} top={-60} />
      <div style={{ padding: "48px 24px 0", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: C.gradRose, boxShadow: SHADOWS.lg, marginBottom: 16 }} className="hb-float">
            <Heart size={28} color="#fff" weight="fill" />
          </div>
          <h2 style={{ fontFamily: PF, fontSize: 28, fontStyle: "italic", fontWeight: 400, color: C.text }}>Who are you?</h2>
          <p style={{ fontSize: 13, color: "rgba(26,10,5,0.55)", fontFamily: LT, marginTop: 8, lineHeight: 1.6 }}>Just the basics — you can fill in the rest later.</p>
        </div>

        <div style={{ background: C.surface, borderRadius: 28, padding: 28, boxShadow: SHADOWS.xl }}>
          <div className="fade-rise">
            {/* Photo */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28, gap: 10 }}>
              <PhotoUpload current={photo} onUpload={setPhoto} size={96} />
              <p style={{ fontSize: 12, color: C.muted, fontFamily: LT }}>Tap to add your photo (optional)</p>
            </div>

            {/* Name */}
            <Field
              label="Your name"
              placeholder="What should your partner call you?"
              value={name}
              onChange={e => setName(e.target.value)}
            />

            {/* Emoji */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10, fontFamily: LT }}>Your emoji</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setEmoji(e)} style={{ width: 42, height: 42, borderRadius: 13, border: `2px solid ${emoji === e ? C.rose : C.border}`, background: emoji === e ? C.roseSoft : "transparent", fontSize: 20, cursor: "pointer", transition: "all 0.15s", boxShadow: emoji === e ? SHADOWS.sm : "none" }}>{e}</button>
                ))}
              </div>
            </div>

            {busy
              ? <Spinner text="Setting up your profile..." />
              : <Btn disabled={!name.trim()} onClick={save}>Let's go →</Btn>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ROOM SETUP — anniversary optional, invite link ─────────────────
function RoomSetup({ uid, userData, onDone, inviteCode }) {
  // If an invite code was passed via URL, start on join tab
  const [tab, setTab] = useState(inviteCode ? "join" : "create");
  const [code, setCode] = useState(inviteCode || "");
  const [anniversary, setAnniversary] = useState("");
  const [coupleName, setCoupleName] = useState("");
  const [distance, setDistance] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const create = async () => {
    setBusy(true); setErr("");
    try {
      const c = await createRoom(uid, userData);
      // Anniversary is now optional
      await updateDoc(doc(db, "rooms", c), {
        anniversary: anniversary.trim() || "",
        coupleName: coupleName.trim(),
        distance: distance.trim(),
      });
      onDone(c, "A");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const join = async () => {
    if (!code.trim()) { setErr("Please enter the room code."); return; }
    setBusy(true); setErr("");
    try {
      await joinRoom(uid, code.trim(), userData);
      onDone(code.trim().toUpperCase(), "B");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.gradHero, position: "relative" }}>
      <GradOrb size={350} top={-80} />
      <div style={{ padding: "64px 24px 40px", position: "relative", zIndex: 1, textAlign: "center", marginBottom: 32 }}>
        <div className="hb-float" style={{ marginBottom: 20 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.92)", boxShadow: SHADOWS.xl }}>
            <Heart size={36} color={C.rose} weight="fill" />
          </div>
        </div>
        <h2 style={{ fontFamily: PF, fontSize: 30, fontStyle: "italic", fontWeight: 400, color: C.text, marginBottom: 10 }}>Connect with your person</h2>
        <p style={{ fontSize: 15, color: "rgba(26,10,5,0.6)", fontFamily: LT, lineHeight: 1.7 }}>
          {inviteCode
            ? `You were invited! Join with code ${inviteCode}.`
            : "Create a room and share the link, or enter your partner's code."
          }
        </p>
      </div>

      <div style={{ background: C.surface, borderRadius: "32px 32px 0 0", padding: "32px 24px 60px", boxShadow: "0 -8px 40px rgba(212,82,106,0.12)", position: "relative", zIndex: 1 }}>
        {/* Tab toggle */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 28, background: "rgba(212,82,106,0.06)", borderRadius: 16, padding: 4 }}>
          {[["create", "Create a room"], ["join", "Join a room"]].map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); setErr(""); }} style={{ padding: "12px 0", borderRadius: 13, border: "none", cursor: "pointer", fontFamily: LT, fontSize: 13, fontWeight: 700, background: tab === k ? C.surface : "transparent", color: tab === k ? C.rose : C.muted, boxShadow: tab === k ? SHADOWS.sm : "none", transition: "all 0.2s" }}>{l}</button>
          ))}
        </div>

        {/* Create tab */}
        {tab === "create" && (
          <div className="fade-rise">
            <Field
              label="Anniversary date (optional)"
              type="date"
              value={anniversary}
              onChange={e => setAnniversary(e.target.value)}
            />
            <Field
              label="Couple name (optional)"
              placeholder="e.g. Koustav & Ankita"
              value={coupleName}
              onChange={e => setCoupleName(e.target.value)}
            />
            <Field
              label="Distance between you (optional)"
              placeholder="e.g. Bangalore ↔ London"
              value={distance}
              onChange={e => setDistance(e.target.value)}
            />
            <p style={{ fontSize: 12, color: C.muted, fontFamily: LT, marginBottom: 18, lineHeight: 1.6, textAlign: "center" }}>
              You can add all of this later from your profile.
            </p>
          </div>
        )}

        {/* Join tab */}
        {tab === "join" && (
          <div className="fade-rise">
            <Field
              label="Partner's room code"
              placeholder="ABC123"
              value={code}
              onChange={e => setCode(e.target.value)}
              style={{ textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, fontSize: 20 }}
            />
          </div>
        )}

        <ErrBox msg={err} />
        {busy
          ? <Spinner text={tab === "create" ? "Creating your room..." : "Joining room..."} />
          : <Btn onClick={tab === "create" ? create : join}>{tab === "create" ? "Create room →" : "Join room →"}</Btn>
        }
      </div>
    </div>
  );
}

// ── WAITING — with shareable invite link ───────────────────────────
function Waiting({ code, onSignOut, onLeave, uid }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shared, setShared] = useState(false);

  const inviteLink = `${window.location.origin}?invite=${code}`;

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2200);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on Heartbeat",
          text: "I made us a space on Heartbeat — tap to join ♥",
          url: inviteLink,
        });
        setShared(true);
      } catch (e) {
        // User cancelled share — fallback to copy
        copyLink();
      }
    } else {
      copyLink();
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.gradHero, display: "flex", flexDirection: "column", alignItems: "center", padding: "72px 24px", textAlign: "center", position: "relative" }}>
      <GradOrb size={350} top={-80} />
      <div style={{ position: "relative", zIndex: 1, width: "100%" }}>

        <div className="hb-float" style={{ marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.92)", boxShadow: SHADOWS.xl }}>
            <Heart size={40} color={C.rose} weight="fill" />
          </div>
        </div>

        <h2 style={{ fontFamily: PF, fontSize: 28, fontStyle: "italic", fontWeight: 400, color: C.text, marginBottom: 8 }}>Room created!</h2>
        <p style={{ color: "rgba(26,10,5,0.6)", fontSize: 15, lineHeight: 1.75, marginBottom: 32, fontFamily: LT }}>
          Share the link or code with your partner.<br />They just need to tap it to join.
        </p>

        {/* ── INVITE LINK — primary CTA ── */}
        <div style={{ background: "rgba(255,255,255,0.95)", borderRadius: 24, padding: "20px 22px", marginBottom: 14, boxShadow: SHADOWS.lg, border: `1px solid ${C.roseBd}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10, fontFamily: LT }}>Invite link</div>
          <div style={{ fontSize: 13, color: C.rose, fontFamily: LT, fontWeight: 600, wordBreak: "break-all", marginBottom: 14, lineHeight: 1.5 }}>
            {inviteLink}
          </div>
          <button onClick={shareLink} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "13px 20px", borderRadius: 16,
            background: C.gradRose, border: "none", cursor: "pointer",
            fontFamily: LT, fontSize: 14, fontWeight: 700, color: "#fff",
            boxShadow: SHADOWS.md, transition: "all 0.2s",
          }}>
            {copiedLink || shared
              ? <><CheckCircle size={16} color="#fff" weight="fill" /> {shared ? "Shared!" : "Link copied!"}</>
              : <><Envelope size={16} color="#fff" weight="fill" /> Send invite link</>
            }
          </button>
        </div>

        {/* ── ROOM CODE — secondary ── */}
        <Card elevated layer gradient={C.gradCard} style={{ cursor: "pointer", marginBottom: 28 }} onClick={copyCode}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, fontFamily: LT }}>Or share the code</div>
          <div style={{ fontSize: 48, fontWeight: 700, color: C.rose, letterSpacing: "0.22em", fontFamily: PF }}>{code}</div>
          <div style={{ fontSize: 13, color: C.rose, marginTop: 12, fontWeight: 700, fontFamily: LT, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {copiedCode
              ? <><CheckCircle size={16} color={C.sage} weight="fill" /> Copied!</>
              : <><CaretRight size={14} color={C.rose} /> Tap to copy code</>
            }
          </div>
        </Card>

        {/* Waiting indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "rgba(26,10,5,0.5)", fontSize: 14, marginBottom: 36, fontFamily: LT }}>
          <div className="hb-spin"><Sparkle size={18} color={C.rose} /></div>
          Waiting for your partner...
        </div>

        <Btn variant="glass" style={{ marginBottom: 12 }} onClick={async () => {
          await updateDoc(doc(db, "users", uid), { roomId: null, userKey: null, onboardingDone: true });
          onLeave();
        }}>
          Join a different room instead →
        </Btn>
        <button onClick={onSignOut} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(26,10,5,0.4)", fontFamily: LT }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// NOTIFICATION PANEL — clickable, navigable, animated
// ══════════════════════════════════════════════════════════════════
const NOTIF_ICONS_MAP={heartbeat:Heart,note:Envelope,mood:Sparkle,qa:ChatTeardrop,wyr:Scales,nhie:HandPointing,tord:MaskHappy,grat:HandsPraying,memory:Jar,bucket:ListChecks,compat:ChartBar,lovelang:Heart,desire:Fire};
const NOTIF_NAV={heartbeat:"home",note:"notes",memory:"memories",qa:"play",wyr:"play",nhie:"play",tord:"play",desire:"play",compat:"play",lovelang:"play",grat:"us",bucket:"us",mood:"home"};

function NotifPanel({notifications,userKey,roomId,onClose,onNavigate}){
  const readKey=userKey==="A"?"readA":"readB";
  const mine=notifications.filter(n=>n.from!==userKey);
  const [clicked,setClicked]=useState(null);

  useEffect(()=>{ if(mine.some(n=>!n[readKey])) markNotifsRead(roomId,userKey,notifications); },[]);

  const handleClick=(n)=>{
    setClicked(n.id);
    const dest=NOTIF_NAV[n.type]||"home";
    setTimeout(()=>{ onClose(); if(onNavigate) onNavigate(dest, n.type); },220);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:100,background:"rgba(26,10,5,0.38)",backdropFilter:"blur(6px)",display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="slide-in" style={{background:"linear-gradient(180deg,rgba(255,246,243,0.98) 0%,rgba(255,255,255,0.99) 100%)",borderRadius:"28px 28px 0 0",padding:"24px 0 48px",maxHeight:"74vh",overflowY:"auto",boxShadow:"0 -12px 48px rgba(212,82,106,0.14)"}}>
        {/* Handle */}
        <div style={{width:36,height:4,borderRadius:2,background:"rgba(212,82,106,0.15)",margin:"0 auto 22px"}}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,padding:"0 22px"}}>
          <h3 style={{fontFamily:PF,fontStyle:"italic",fontSize:22,fontWeight:400,color:C.text}}>Notifications</h3>
          <button onClick={onClose} style={{background:C.roseSoft,border:`1px solid ${C.roseBd}`,borderRadius:"50%",cursor:"pointer",width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}><X size={16} color={C.rose}/></button>
        </div>

        {mine.length===0
          ? <div style={{textAlign:"center",padding:"40px 22px",color:C.muted,fontFamily:LT}}>
              <div style={{marginBottom:14}}><Bell size={44} color="rgba(212,82,106,0.18)" weight="fill"/></div>
              <p style={{fontSize:14,lineHeight:1.7}}>Nothing yet — activity from your partner shows up here.</p>
            </div>
          : mine.map((n,i)=>{
              const IconComp=NOTIF_ICONS_MAP[n.type]||Heart;
              const isUnread=!n[readKey];
              const isClicked=clicked===n.id;
              const dest=NOTIF_NAV[n.type]||"home";
              return (
                <button key={n.id} onClick={()=>handleClick(n)} className={`s${Math.min(i+1,6)}`} style={{
                  display:"flex",alignItems:"flex-start",gap:14,padding:"14px 22px",
                  width:"100%",background:isClicked?"rgba(212,82,106,0.06)":isUnread?"rgba(255,246,243,0.8)":"transparent",
                  border:"none",cursor:"pointer",textAlign:"left",
                  transition:"all 0.2s",borderLeft:isUnread?`3px solid ${C.rose}`:"3px solid transparent",
                }}>
                  <div style={{width:42,height:42,borderRadius:14,background:isUnread?C.gradRose:C.roseSoft,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:isUnread?SHADOWS.sm:"none",transition:"all 0.2s"}}>
                    <IconComp size={20} color={isUnread?"#fff":C.rose} weight="fill"/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,color:C.text,lineHeight:1.55,fontFamily:LT,fontWeight:isUnread?600:400}}>{n.message}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:4,fontFamily:LT,display:"flex",alignItems:"center",gap:5}}>
                      {timeAgo(n.ts)}
                      <span style={{fontSize:9,color:C.rose,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.04em",background:C.roseSoft,padding:"2px 7px",borderRadius:10}}>→ {dest}</span>
                    </div>
                  </div>
                  {isUnread&&<div style={{width:8,height:8,borderRadius:"50%",background:C.rose,flexShrink:0,marginTop:6,boxShadow:`0 0 6px ${C.rose}`}}/>}
                </button>
              );
            })
        }
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// HOME TAB — Pinterest masonry, hero, floating heart CTA
// ══════════════════════════════════════════════════════════════════
function HomeTab({me,partner,myUser,partnerUser,roomData,roomId,userKey,update,addN}){
  const pk=userKey==="A"?"B":"A";
  const [myBeating,setMyBeating]=useState(false);
  const [partnerMsg,setPartnerMsg]=useState(false);
  const days=daysUntil(roomData?.nextMeeting);
  const together=togetherDays(roomData?.anniversary);
  const myBirthday=isBirthday(myUser?.birthday);
  const partnerBirthday=isBirthday(partnerUser?.birthday);

  useEffect(()=>{
    if(!roomData?.lastHeartbeat) return;
    const {from,ts}=roomData.lastHeartbeat;
    if(from!==userKey&&Date.now()-ts<8000){ setPartnerMsg(true); setTimeout(()=>setPartnerMsg(false),5000); }
  },[roomData?.lastHeartbeat?.ts]);

const sendHeart=async()=>{
  setMyBeating(true); setTimeout(()=>setMyBeating(false),600);
  await update({lastHeartbeat:{from:userKey,ts:Date.now()}});
  await addN("heartbeat",`${me?.name} sent you a heartbeat ♥`);
};
  const setMood=async emoji=>{
    await update({[`users.${userKey}.mood`]:emoji});
    await addN("mood",`${me?.name} is feeling ${emoji}`);
  };

  const memories=roomData?.memories||[];
  const notes=roomData?.notes||[];
  const recentNotes=notes.slice(0,4);
  const recentMemories=memories.slice(0,4);

  // Build masonry feed items
  const feedItems=[
    // Partner status card
    partner&&partnerUser?.status&&{type:"status",key:"status"},
    // Streak card
    roomData?.streak?.count>=2&&{type:"streak",key:"streak"},
    // Countdown
    days!==null&&{type:"countdown",key:"countdown"},
    // Recent memories
    ...recentMemories.map((m,i)=>({type:"memory",key:`mem-${i}`,data:m})),
    // Recent notes
    ...recentNotes.filter(n=>n.from!==userKey).map((n,i)=>({type:"note",key:`note-${i}`,data:n})),
    // Mood card
    {type:"mood",key:"mood"},
  ].filter(Boolean);

  return (
    <div style={{background:C.gradHome,minHeight:"100vh",paddingBottom:100,position:"relative"}}>

{/* ── HERO ── */}
<div style={{position:"relative",height:300,overflow:"hidden"}}>
  <img
    src={roomData?.couplePhoto || "/images/hero.jpg"}
    alt="couple"
    style={{
      width:"100%",
      height:"100%",
      objectFit:"cover",
      objectPosition:"center top",
      transform:"scale(1.04)",
      transition:"transform 8s ease",
    }}
    className="fade-in"
  />
  {/* Dark gradient overlay — keeps text readable */}
  <div style={{
    position:"absolute",inset:0,
    background:"linear-gradient(to bottom, rgba(26,10,5,0.04) 0%, rgba(26,10,5,0.58) 100%)"
  }}/>
  {/* Couple name and together days */}
  <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"24px 20px"}} className="fade-rise">
    <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",fontFamily:LT,marginBottom:4}}>{greet()}</div>
    <h2 style={{fontFamily:PF,fontSize:28,fontStyle:"italic",fontWeight:400,color:"#fff",lineHeight:1.2,marginBottom:6,textShadow:"0 2px 12px rgba(26,10,5,0.3)"}}>
      {roomData?.coupleName||`${me?.name} & ${partner?.name}`}
    </h2>
    {together!==null&&<div style={{fontSize:13,color:"rgba(255,255,255,0.8)",fontFamily:LT,display:"flex",alignItems:"center",gap:5}}>
      <Heart size={11} color="rgba(255,255,255,0.8)" weight="fill"/> {together} days together
    </div>}
  </div>
  {/* Birthday banner */}
  {(myBirthday||partnerBirthday)&&<div style={{position:"absolute",top:16,left:16,right:16,background:"rgba(255,220,160,0.92)",borderRadius:14,padding:"10px 16px",backdropFilter:"blur(8px)"}}>
    <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:LT}}>🎂 {myBirthday?`Happy birthday, ${me?.name}!`:`Happy birthday, ${partner?.name}!`} 🎉</div>
  </div>}
</div>

      {/* ── RELATIONSHIP STRIP ── */}
      <div style={{padding:"20px 20px 0",overflowX:"auto",whiteSpace:"nowrap",display:"flex",gap:12,scrollbarWidth:"none"}}>
        {[
          {label:"Together",value:together!==null?`${together}d`:"—",sub:"days",Icon:Heart,color:C.rose,bg:C.roseSoft,cls:"s1"},
          {label:"Next meet",value:days!==null?`${days}d`:"—",sub:"away",Icon:CalendarBlank,color:C.gold,bg:C.goldSoft,cls:"s2"},
          {label:"Streak",value:roomData?.streak?.count>=1?`${roomData.streak.count}🔥`:"1",sub:"days",Icon:Fire,color:C.accent,bg:C.accentSoft,cls:"s3"},
          {label:partner?.name||"Partner",value:partner?.mood||"🥰",sub:MOODS.find(m=>m.e===partner?.mood)?.l||"",Icon:Sparkle,color:C.purple,bg:C.purpleSoft,cls:"s4"},
        ].map(item=>(
          <div key={item.label} className={item.cls} style={{flexShrink:0,background:item.bg,borderRadius:18,padding:"14px 18px",minWidth:110,boxShadow:SHADOWS.sm,border:`1px solid ${item.color}20`,display:"flex",flexDirection:"column",gap:4,whiteSpace:"normal",transition:"transform 0.2s"}}
            onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
            onMouseLeave={e=>e.currentTarget.style.transform="none"}>
            <div style={{fontSize:10,fontWeight:700,color:item.color,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:LT}}>{item.label}</div>
            <div style={{fontSize:22,fontWeight:700,color:C.text,fontFamily:PF,lineHeight:1}}>{item.value}</div>
            <div style={{fontSize:10,color:C.muted,fontFamily:LT}}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* ── MASONRY FEED ── */}
      <div style={{padding:"20px 16px 80px",columnCount:2,columnGap:12}}>

        {/* Partner status */}
        {partner&&partnerUser?.status&&(
          <div style={{breakInside:"avoid",marginBottom:12}} className="s1">
            <div className="card-hover" style={{background:"linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,235,228,0.92))",borderRadius:20,padding:"18px 16px",boxShadow:SHADOWS.md,border:"1px solid rgba(255,255,255,0.92)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <Avatar name={partner?.name||"?"} photo={partnerUser?.photo} size={36} gradient={C.gradGold}/>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,fontFamily:LT}}>{partner?.name}</div>
              </div>
              <p style={{fontFamily:PF,fontSize:15,fontStyle:"italic",color:C.text,lineHeight:1.55}}>"{partnerUser.status}"</p>
            </div>
          </div>
        )}

        {/* Streak */}
        {roomData?.streak?.count>=2&&(
          <div style={{breakInside:"avoid",marginBottom:12}} className="s2">
            <div className="card-hover" style={{background:"linear-gradient(135deg,#FFE0B0,#FFD090)",borderRadius:20,padding:"18px 16px",boxShadow:SHADOWS.md}}>
              <div style={{fontSize:32,fontWeight:700,color:C.text,fontFamily:PF}}>{roomData.streak.count}</div>
              <div style={{fontSize:11,fontWeight:700,color:"rgba(26,10,5,0.65)",fontFamily:LT,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>day streak</div>
              <div style={{fontSize:11,color:"rgba(26,10,5,0.5)",fontFamily:LT,marginTop:4}}>Keep showing up ✦</div>
            </div>
          </div>
        )}

        {/* Countdown */}
        {days!==null&&(
          <div style={{breakInside:"avoid",marginBottom:12}} className="s3">
            <div className="card-hover" style={{background:"linear-gradient(135deg,rgba(212,82,106,0.10),rgba(255,180,170,0.15))",borderRadius:20,padding:"18px 16px",boxShadow:SHADOWS.sm,border:`1px solid ${C.roseBd}`}}>
              <CalendarBlank size={20} color={C.rose} weight="fill" style={{marginBottom:8}}/>
              <div style={{fontSize:28,fontWeight:700,color:C.rose,fontFamily:PF,lineHeight:1}}>{days}</div>
              <div style={{fontSize:11,color:C.muted,fontFamily:LT,marginTop:4}}>days until you're together</div>
            </div>
          </div>
        )}

        {/* Recent memories */}
{recentMemories.map((m,i)=>(
  <div key={`mem-${i}`} style={{breakInside:"avoid",marginBottom:12}} className={`s${Math.min(i+3,6)}`}>
    <div className="card-hover" style={{position:"relative",borderRadius:20,overflow:"hidden",boxShadow:SHADOWS.md}}>
      <img
        src={m.image||"/images/polaroid.jpg"}
        alt="memory"
        style={{width:"100%",height:140,objectFit:"cover",display:"block"}}
      />
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(26,10,5,0.78) 0%,transparent 100%)",padding:"12px 14px"}}>
        <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.65)",fontFamily:LT,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>{m.name} · {m.date}</div>
        <p style={{fontFamily:LT,fontSize:13,color:"#fff",lineHeight:1.55,margin:0}}>{m.text.slice(0,70)}{m.text.length>70?"...":""}</p>
      </div>
    </div>
  </div>
))}
        {/* Recent notes from partner */}
        {recentNotes.filter(n=>n.from!==userKey).map((n,i)=>(
          <div key={`note-${i}`} style={{breakInside:"avoid",marginBottom:12}} className={`s${Math.min(i+2,6)}`}>
            <div className="card-hover" style={{background:C.gradRose,borderRadius:20,padding:"18px 14px",boxShadow:SHADOWS.md}}>
              <Envelope size={16} color="rgba(255,255,255,0.7)" weight="fill" style={{marginBottom:10}}/>
              <p style={{fontFamily:PF,fontSize:14,fontStyle:"italic",color:"#fff",lineHeight:1.6}}>{n.text.slice(0,80)}{n.text.length>80?"...":""}</p>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",fontFamily:LT,marginTop:8}}>{n.date}</div>
            </div>
          </div>
        ))}

        {/* Mood picker card */}
        <div style={{breakInside:"avoid",marginBottom:12,columnSpan:"all"}} className="s4">
          <div style={{background:"rgba(255,255,255,0.85)",borderRadius:20,padding:"16px",boxShadow:SHADOWS.sm}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Your vibe right now</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {MOODS.map(m=>(
                <button key={m.e} onClick={()=>setMood(m.e)} style={{padding:"7px 12px",borderRadius:20,fontSize:12,cursor:"pointer",fontFamily:LT,fontWeight:600,border:`1.5px solid ${me?.mood===m.e?C.rose:"rgba(212,82,106,0.12)"}`,background:me?.mood===m.e?C.roseSoft:"rgba(255,255,255,0.8)",color:me?.mood===m.e?C.rose:C.text,transition:"all 0.18s"}}>{m.e} {m.l}</button>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── FLOATING HEART CTA ── */}
<div style={{position:"fixed",bottom:110,right:16,zIndex:15,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
  {partnerMsg&&(
    <div className="fade-rise" style={{background:"rgba(255,255,255,0.96)",borderRadius:20,padding:"9px 15px",fontSize:11,color:C.rose,fontFamily:LT,fontWeight:700,boxShadow:SHADOWS.lg,backdropFilter:"blur(10px)",whiteSpace:"nowrap",border:`1px solid ${C.roseBd}`,textAlign:"center",lineHeight:1.5}}>
      {partner?.name} is thinking<br/>of you ♥
    </div>
  )}
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7}}>
    <button onClick={sendHeart} className={myBeating?"hb-beat":partnerMsg?"hb-fast":"heart-float"} style={{width:76,height:76,borderRadius:"50%",border:"none",background:partnerMsg?C.gradGold:C.gradRose,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:partnerMsg?`0 10px 32px rgba(212,146,42,0.55)`:SHADOWS.xl,transition:"background 0.5s,box-shadow 0.5s",position:"relative",flexShrink:0}}>
      <div style={{position:"absolute",inset:-12,borderRadius:"50%",border:`2px solid ${partnerMsg?"rgba(212,146,42,0.40)":"rgba(212,82,106,0.32)"}`,animation:"hbRing1 2.6s ease-out infinite",pointerEvents:"none"}}/>
      <div style={{position:"absolute",inset:-26,borderRadius:"50%",border:`1.5px solid ${partnerMsg?"rgba(212,146,42,0.20)":"rgba(212,82,106,0.16)"}`,animation:"hbRing2 2.6s ease-out infinite 0.7s",pointerEvents:"none"}}/>
      <Heart size={34} color="#fff" weight="fill"/>
    </button>
    <div style={{background:"rgba(255,255,255,0.92)",backdropFilter:"blur(8px)",borderRadius:13,padding:"5px 13px",fontSize:11,fontWeight:700,color:partnerMsg?C.gold:C.rose,fontFamily:LT,boxShadow:SHADOWS.sm,border:`1px solid ${partnerMsg?C.goldBd:C.roseBd}`,whiteSpace:"nowrap",letterSpacing:"0.02em"}}>
      {partnerMsg?`${partner?.name} ♥`:"Send a heartbeat"}
    </div>
  </div>
</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PLAY TAB — hero, category pills, stacked game cards
// ══════════════════════════════════════════════════════════════════
function PlayTab({me,partner,userKey,roomData,update,addN,go}){
  const pk=userKey==="A"?"B":"A";
  const today=todayKey();
  const [playMode,setPlayMode]=useState("connect"); // connect|games
  const [activecat,setActivecat]=useState("all");

  const getStatus=key=>{
    const d=roomData?.[`${key}_${today}`];
    if(!d) return "start";
    if(key==="qa"){ if(!d.question) return "start"; if(!d.answers?.[userKey]) return "your-turn"; if(!d.guesses?.[userKey]) return "your-turn"; if(!d.answers?.[pk]||!d.guesses?.[pk]) return "waiting"; return "done"; }
    if(key==="wyr"||key==="compat"){ if(!d.a&&!d.questions) return "start"; if(!d.choices?.[userKey]&&Object.keys(d.ratings?.[userKey]||{}).length===0) return "your-turn"; return "waiting"; }
    if(key==="ninh"){ if(!d.statements) return "start"; if(d.statements.some(s=>!s[userKey])) return "your-turn"; if(d.statements.some(s=>!s[pk])) return "waiting"; return "done"; }
    return "start";
  };

  const cats=[{key:"all",label:"All"},{key:"daily",label:"Daily"},{key:"discovery",label:"Discover"},{key:"spicy",label:"Spicy"}];

  const intimateGames=[
    {Icon:ChatTeardrop,title:"Daily Q&A",desc:"Guess each other's deepest answers",key:"qa",cat:"daily",grad:"linear-gradient(135deg,#F093A0,#D4526A)",accent:"#fff",status:getStatus("qa"),featured:true},
    {Icon:Scales,title:"Would You Rather",desc:"No right answer — just interesting choices",key:"wyr",cat:"daily",grad:"linear-gradient(135deg,#F0C060,#D4922A)",accent:"#fff",status:getStatus("wyr")},
    {Icon:HandPointing,title:"Never Have I Ever",desc:"Who's actually done what?",key:"nhie",cat:"discovery",grad:"linear-gradient(135deg,#90C498,#6B8F71)",accent:"#fff",status:getStatus("nhie")},
    {Icon:MaskHappy,title:"Truth or Dare",desc:"Pick your fate — brave or daring?",key:"tord",cat:"discovery",grad:"linear-gradient(135deg,#B0A0E0,#8B6BAD)",accent:"#fff"},
    {Icon:ChartBar,title:"Compatibility",desc:"See how alike you really are",key:"compat",cat:"discovery",grad:"linear-gradient(135deg,#F0C060,#D4922A)",accent:"#fff",status:getStatus("compat")},
    {Icon:Heart,title:"Weekly Check-In",desc:"How are we doing this week?",key:"checkin",cat:"daily",grad:"linear-gradient(135deg,#F0C060,#D4922A)",accent:"#fff"},
    {Icon:Fire,title:"Desire",desc:"Bold. Daring. Just the two of you.",key:"desire",cat:"spicy",grad:"linear-gradient(135deg,#2A0F08,#8B2A1A)",accent:"#E8A080",dark:true},
  ];

  const arcadeGames = [
    { Icon: GameController, title: "Tic Tac Toe", desc: "Best of 5 rounds • Head-to-head", key: "tictactoe", grad: "linear-gradient(135deg,#FF6B9D,#E85D7B)", accent: "#fff" },
    { Icon: ChatTeardrop, title: "Wordle Duel", desc: "Daily word • Async solving", key: "wordle", grad: "linear-gradient(135deg,#FFB347,#E89D3C)", accent: "#fff" },
    { Icon: Pen, title: "Pictionary", desc: "Draw & guess • Real-time", key: "pictionary", grad: "linear-gradient(135deg,#9B59B6,#8E44AD)", accent: "#fff" },
  ];

  const filtered=playMode==="connect"?(activecat==="all"?intimateGames:intimateGames.filter(g=>g.cat===activecat)):arcadeGames;

  const statusLabel={start:"Start","your-turn":"Your turn",waiting:"Waiting",done:"Done ✓"};
  const statusColor={start:C.gold,"your-turn":C.rose,waiting:C.sage,done:C.sage};

  return (
    <ScreenWrap gradient={C.gradPlay}>
      <div style={{position:"relative",overflow:"hidden"}}>
        <GradOrb size={300} top={-60} color1="rgba(200,100,160,0.22)" color2="rgba(220,150,200,0.08)"/>

        {/* HERO */}
        <div style={{padding:"32px 22px 24px",position:"relative",zIndex:1,textAlign:"center"}} className="fade-rise">
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:60,height:60,borderRadius:"50%",background:C.gradRose,boxShadow:SHADOWS.lg,marginBottom:16}}><GameController size={30} color="#fff" weight="fill"/></div>
          <h2 style={{fontFamily:PF,fontSize:30,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:8}}>Play together</h2>
          <p style={{fontSize:14,color:C.muted,fontFamily:LT,lineHeight:1.65}}>Moments that bring you closer</p>
        </div>

        {/* MODE TOGGLE — Connect vs Games */}
        <div style={{padding:"0 20px 20px",display:"flex",gap:10,position:"relative",zIndex:1}}>
          <button onClick={()=>{setPlayMode("connect");setActivecat("all");}} style={{flex:1,padding:"10px 0",borderRadius:24,border:"none",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,background:playMode==="connect"?C.gradRose:"rgba(255,255,255,0.8)",color:playMode==="connect"?"#fff":C.muted,boxShadow:playMode==="connect"?SHADOWS.md:SHADOWS.sm,transition:"all 0.25s"}}>
            Connect
          </button>
          <button onClick={()=>setPlayMode("games")} style={{flex:1,padding:"10px 0",borderRadius:24,border:"none",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,background:playMode==="games"?C.gradRose:"rgba(255,255,255,0.8)",color:playMode==="games"?"#fff":C.muted,boxShadow:playMode==="games"?SHADOWS.md:SHADOWS.sm,transition:"all 0.25s"}}>
            Games
          </button>
        </div>

        {/* CATEGORY STRIP — only for Connect mode */}
        {playMode==="connect"&&(
          <div style={{padding:"0 20px 20px",overflowX:"auto",display:"flex",gap:10,scrollbarWidth:"none",position:"relative",zIndex:1}}>
            {cats.map(c=>(
              <button key={c.key} onClick={()=>setActivecat(c.key)} style={{flexShrink:0,padding:"9px 20px",borderRadius:24,border:"none",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,background:activecat===c.key?C.gradRose:"rgba(255,255,255,0.8)",color:activecat===c.key?"#fff":C.muted,boxShadow:activecat===c.key?SHADOWS.md:SHADOWS.sm,transition:"all 0.25s",backdropFilter:"blur(8px)"}}>
                {c.label}
              </button>
            ))}
            {/* Shuffle */}
            <button onClick={()=>{ const random=filtered[Math.floor(Math.random()*filtered.length)]; go(random.key); }} style={{flexShrink:0,padding:"9px 16px",borderRadius:24,border:`1px solid ${C.border}`,cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,background:"rgba(255,255,255,0.8)",color:C.muted,boxShadow:SHADOWS.sm,display:"flex",alignItems:"center",gap:6,backdropFilter:"blur(8px)"}}>
              <Shuffle size={14} color={C.muted}/> Shuffle
            </button>
          </div>
        )}

        {/* GAME FEED — stacked large cards */}
        <div style={{padding:"0 16px 20px",position:"relative",zIndex:1,display:"flex",flexDirection:"column",gap:14}}>
          {filtered.map((g,i)=>(
            <div key={g.key} className={`s${Math.min(i+1,6)}`}>
              <button onClick={()=>go(g.key)} style={{
                display:"block",width:"100%",background:g.grad,
                borderRadius:g.featured?24:20,
                padding:g.featured?"28px 24px":"22px 20px",
                border:"none",cursor:"pointer",textAlign:"left",
                boxShadow:g.featured?SHADOWS.xl:SHADOWS.lg,
                position:"relative",overflow:"hidden",
                transition:"all 0.22s cubic-bezier(0.22,1,0.36,1)"
             }}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=g.featured?"0 36px 72px rgba(212,82,106,0.22)":"0 24px 52px rgba(212,82,106,0.16)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=g.featured?SHADOWS.xl:SHADOWS.lg;}}
                onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
                onMouseUp={e=>e.currentTarget.style.transform="none"}
              >
                {/* Decorative orb */}
                <div style={{position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,0.08)",pointerEvents:"none"}}/>
                <div style={{position:"absolute",bottom:-20,left:-20,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,0.06)",pointerEvents:"none"}}/>
                <div style={{position:"relative",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{width:g.featured?52:44,height:g.featured?52:44,borderRadius:16,background:"rgba(255,255,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14,boxShadow:"0 4px 14px rgba(0,0,0,0.12)"}}>
                      <g.Icon size={g.featured?26:22} color={g.accent||"#fff"} weight="fill"/>
                    </div>
                    <h3 style={{fontFamily:PF,fontSize:g.featured?22:18,fontStyle:"italic",fontWeight:400,color:g.dark?"#FAF0E8":"#fff",marginBottom:6,lineHeight:1.2}}>{g.title}</h3>
                    <p style={{fontSize:13,color:g.dark?"rgba(250,240,232,0.6)":"rgba(255,255,255,0.75)",fontFamily:LT,lineHeight:1.55}}>{g.desc}</p>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:10,flexShrink:0}}>
                    {g.status&&<div style={{background:"rgba(255,255,255,0.18)",borderRadius:20,padding:"6px 12px",fontSize:10,fontWeight:700,color:g.dark?"#E8A080":"rgba(255,255,255,0.9)",fontFamily:LT,letterSpacing:"0.04em",backdropFilter:"blur(4px)"}}>{statusLabel[g.status]}</div>}
                    <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center"}}><ArrowRight size={18} color={g.dark?"#E8A080":"#fff"}/></div>
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>

      </div>
    </ScreenWrap>
  );
}

// ══════════════════════════════════════════════════════════════════
// US TAB
// ══════════════════════════════════════════════════════════════════
function UsTab({me,partner,userKey,roomData,update,addN,go}){
  const pk=userKey==="A"?"B":"A"; const readKey=userKey==="A"?"readA":"readB";
  const unreadNotes=(roomData?.notes||[]).filter(n=>n.from===pk&&!n[readKey+"_note"]).length;
  const bucketDone=(roomData?.bucket||[]).filter(i=>i.done).length;
  const today=todayKey(); const grat=roomData?.[`grat_${today}`];
  const gratBoth=!!(grat?.[userKey]&&grat?.[pk]); const gratMine=!!grat?.[userKey];
  const sections=[
    {Icon:Envelope,title:"Love Notes",desc:unreadNotes>0?`${unreadNotes} unread from ${partner?.name}`:"Write something beautiful",key:"notes",badge:unreadNotes,grad:C.gradRose},
    {Icon:HandsPraying,title:"Gratitude",desc:gratBoth?"Both shared today ✓":gratMine?`Waiting for ${partner?.name}`:"Share what you love about them",key:"grat",grad:C.gradGold,done:gratBoth},
    {Icon:ListChecks,title:"Bucket List",desc:`${bucketDone} of ${(roomData?.bucket||[]).length} done together`,key:"bucket",grad:C.gradSage},
    {Icon:Jar,title:"Memory Jar",desc:`${(roomData?.memories||[]).length} memories saved`,key:"memories",grad:"linear-gradient(135deg,#B0A0E0,#8B6BAD)"},
  ];
  return (
    <ScreenWrap gradient={C.gradUs}>
      <div style={{position:"relative",overflow:"hidden"}}>
        <GradOrb size={300} top={-60} color1="rgba(200,130,80,0.22)" color2="rgba(220,180,130,0.08)"/>
        <div style={{padding:"32px 22px 24px",position:"relative",zIndex:1,textAlign:"center"}} className="fade-rise">
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:60,height:60,borderRadius:"50%",background:C.gradGold,boxShadow:SHADOWS.lg,marginBottom:16}}><Leaf size={30} color="#fff" weight="fill"/></div>
          <h2 style={{fontFamily:PF,fontSize:30,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:8}}>Us</h2>
          <p style={{fontSize:14,color:C.muted,fontFamily:LT}}>Everything you build together.</p>
        </div>
        <div style={{padding:"0 16px",position:"relative",zIndex:1,display:"flex",flexDirection:"column",gap:12}}>
          {sections.map((s,i)=>(
            <button key={s.key} onClick={()=>go(s.key)} className={`s${i+1}`} style={{
              display:"block",width:"100%",
              background:s.done?"rgba(107,143,113,0.10)":"rgba(255,255,255,0.93)",
              border:`1px solid ${s.done?"rgba(107,143,113,0.28)":"rgba(255,255,255,0.92)"}`,
              borderRadius:20,padding:"18px 18px",textAlign:"left",cursor:"pointer",
              fontFamily:LT,boxShadow:SHADOWS.md,
              transition:"all 0.22s cubic-bezier(0.22,1,0.36,1)"
            }}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=SHADOWS.lg;}}
              onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=SHADOWS.md;}}
              onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
              onMouseUp={e=>e.currentTarget.style.transform="none"}
            >
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <div style={{width:50,height:50,borderRadius:16,background:s.grad,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SHADOWS.sm}}><s.Icon size={24} color="#fff" weight="fill"/></div>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:3}}>{s.title}</div>
                  <div style={{fontSize:12,color:C.muted}}>{s.desc}</div>
                </div>
                {s.badge>0&&<div style={{background:C.gradRose,color:"#fff",borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0,boxShadow:SHADOWS.sm}}>{s.badge}</div>}
                {s.done?<CheckCircle size={22} color={C.sage} weight="fill"/>:<CaretRight size={20} color={C.muted}/>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </ScreenWrap>
  );
}

// ══════════════════════════════════════════════════════════════════
// PROFILE TAB — blurred hero, spacious, minimal
// ══════════════════════════════════════════════════════════════════
function DeleteAccountButton({uid, roomId, userKey, roomData, onSignOut}){
  const [step, setStep] = useState("idle"); // idle | confirm | deleting | done
  const pk = userKey === "A" ? "B" : "A";

  const handleDelete = async () => {
    setStep("deleting");
    try {
      // 1 — Remove user from the room
      if (roomId) {
        const partnerExists = roomData?.users?.[pk]?.uid;
        if (partnerExists) {
          // Partner is still in the room — just remove this user's side
          await updateDoc(doc(db, "rooms", roomId), {
            [`users.${userKey}`]: null,
            notes: (roomData?.notes || []).filter(n => n.from !== userKey),
            memories: (roomData?.memories || []).filter(m => m.userKey !== userKey),
          });
        } else {
          // No partner — delete the whole room
          await updateDoc(doc(db, "rooms", roomId), {
            users: { A: null, B: null },
            notes: [],
            memories: [],
            bucket: [],
            notifications: [],
          });
        }
      }

      // 2 — Delete user document from Firestore
      await updateDoc(doc(db, "users", uid), {
        name: "[deleted]",
        photo: "",
        status: "",
        birthday: "",
        timezone: "",
        favoriteEmoji: "",
        fcmToken: "",
        roomId: null,
        userKey: null,
      });

      // 3 — Delete Firebase Auth account
      const currentUser = auth.currentUser;
      if (currentUser) await deleteUser(currentUser);

      setStep("done");
      setTimeout(() => onSignOut(), 1800);
    } catch (e) {
      console.error("Delete failed:", e);
      // If deleteUser fails it may need re-authentication
      // In that case sign out and show message
      setStep("idle");
      alert("Please sign out and sign back in, then try deleting again. This is a security requirement.");
    }
  };

  if (step === "done") return (
    <div style={{background:"rgba(107,143,113,0.08)",border:`1px solid ${C.sageBd}`,borderRadius:14,padding:"13px 16px",fontSize:13,color:C.sage,fontFamily:LT,textAlign:"center"}}>
      Account deleted. Goodbye ♥
    </div>
  );

  if (step === "deleting") return (
    <div style={{background:"rgba(212,82,106,0.05)",border:`1px solid ${C.roseBd}`,borderRadius:14,padding:"13px 16px",fontSize:13,color:C.muted,fontFamily:LT,display:"flex",alignItems:"center",gap:8}}>
      <div className="hb-spin"><Sparkle size={14} color={C.muted}/></div>
      Deleting your account...
    </div>
  );

  if (step === "confirm") return (
    <div style={{background:"rgba(212,82,106,0.06)",border:`1px solid ${C.roseBd}`,borderRadius:16,padding:18}}>
      <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:LT,marginBottom:6}}>Are you sure?</div>
      <p style={{fontSize:13,color:C.muted,fontFamily:LT,lineHeight:1.6,marginBottom:16}}>
        This permanently deletes your account and removes your data from this room. Your partner will remain but you will be removed. This cannot be undone.
      </p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <button onClick={()=>setStep("idle")} style={{padding:"11px 0",borderRadius:13,border:`1px solid ${C.border}`,background:"transparent",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,color:C.muted}}>
          Cancel
        </button>
        <button onClick={handleDelete} style={{padding:"11px 0",borderRadius:13,border:"none",background:C.gradRose,cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,color:"#fff",boxShadow:"0 4px 14px rgba(212,82,106,0.35)"}}>
          Yes, delete
        </button>
      </div>
    </div>
  );

  return (
    <button onClick={()=>setStep("confirm")} style={{display:"flex",alignItems:"center",gap:12,background:"transparent",border:`1px solid rgba(212,82,106,0.20)`,borderRadius:14,padding:"13px 16px",cursor:"pointer",fontSize:14,color:"rgba(212,82,106,0.6)",fontFamily:LT,width:"100%",fontWeight:600,transition:"all 0.2s"}}
      onMouseEnter={e=>{e.currentTarget.style.background="rgba(212,82,106,0.06)";e.currentTarget.style.color=C.rose;e.currentTarget.style.borderColor=C.rose;}}
      onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(212,82,106,0.6)";e.currentTarget.style.borderColor="rgba(212,82,106,0.20)";}}>
      <X size={18} color="rgba(212,82,106,0.6)"/> Delete account
    </button>
  );
}
function ProfileTab({me,partner,myUser,partnerUser,uid,userKey,roomId,roomData,update,onSignOut}){
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(myUser?.name||""); const [photo,setPhoto]=useState(myUser?.photo||"");
  const [status,setStatus]=useState(myUser?.status||""); const [timezone,setTimezone]=useState(myUser?.timezone||"");
  const [birthday,setBirthday]=useState(myUser?.birthday||""); const [emoji,setEmoji]=useState(myUser?.favoriteEmoji||"♥");
  const [coupleName,setCoupleName]=useState(roomData?.coupleName||""); const [anniversary,setAnniversary]=useState(roomData?.anniversary||"");
  const [distance,setDistance]=useState(roomData?.distance||""); const [howWeMet,setHowWeMet]=useState(roomData?.howWeMet?.[userKey]||"");
  const [couplePhoto,setCouplePhoto]=useState(roomData?.couplePhoto||""); const [busy,setBusy]=useState(false);
  const EMOJIS=["♥","🌙","⭐","🌸","🦋","🌊","☀️","🌿","🎵","✨"];
  const together=togetherDays(roomData?.anniversary);
  const save=async()=>{ setBusy(true); await updateDoc(doc(db,"users",uid),{name:name.trim(),photo,status:status.trim(),timezone,birthday,favoriteEmoji:emoji}); await update({[`users.${userKey}.name`]:name.trim(),[`users.${userKey}.mood`]:me?.mood||"🥰",coupleName:coupleName.trim(),anniversary,distance:distance.trim(),[`howWeMet.${userKey}`]:howWeMet.trim(),couplePhoto}); setEditing(false); setBusy(false); };

  return (
    <div style={{minHeight:"100vh",background:C.gradProfile,paddingBottom:100}}>

      {/* HERO — blurred background */}
      <div style={{position:"relative",height:220,overflow:"hidden"}}>
        {(roomData?.couplePhoto||myUser?.photo)
          ?<img src={roomData?.couplePhoto||myUser?.photo} style={{width:"100%",height:"100%",objectFit:"cover",filter:"blur(18px)",transform:"scale(1.12)"}} alt="bg"/>
          :<div style={{width:"100%",height:"100%",background:"linear-gradient(160deg,#E8D0FF,#FFD0E8)"}}/>
        }
        <div style={{position:"absolute",inset:0,background:"rgba(26,10,5,0.22)"}}/>

        {/* Floating avatars */}
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",gap:28}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}} className="fade-rise">
            <Avatar name={me?.name||""} photo={myUser?.photo} size={68} gradient={C.gradRose}/>
            <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:LT,textShadow:"0 1px 6px rgba(0,0,0,0.3)"}}>{me?.name}</div>
          </div>
          <Heart size={22} color="rgba(255,255,255,0.7)" weight="fill"/>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}} className="fade-rise">
            <Avatar name={partner?.name||"?"} photo={partnerUser?.photo} size={68} gradient={C.gradGold}/>
            <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:LT,textShadow:"0 1px 6px rgba(0,0,0,0.3)"}}>{partner?.name||"—"}</div>
          </div>
        </div>

        {/* Edit button */}
        <button onClick={()=>setEditing(!editing)} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.88)",border:"none",borderRadius:14,padding:"8px 16px",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,color:editing?C.rose:C.text,backdropFilter:"blur(8px)",boxShadow:SHADOWS.sm,display:"flex",alignItems:"center",gap:6}}>
          {editing?<X size={14} color={C.rose}/>:<PencilSimple size={14} color={C.muted}/>}{editing?"Cancel":"Edit"}
        </button>
      </div>

      {/* Relationship headline */}
      <div style={{padding:"20px 22px 0",textAlign:"center"}} className="s1">
        <h3 style={{fontFamily:PF,fontSize:22,fontStyle:"italic",fontWeight:400,color:C.rose,marginBottom:6}}>{roomData?.coupleName||`${me?.name} & ${partner?.name}`}</h3>
        {together!==null&&<div style={{fontSize:13,color:C.muted,fontFamily:LT,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}><Heart size={12} color={C.rose} weight="fill"/> Together {together} days{roomData?.anniversary?` · since ${new Date(roomData.anniversary).toLocaleDateString("en",{month:"long",year:"numeric"})}`:""}</div>}
        {roomData?.distance&&<div style={{fontSize:12,color:C.muted,fontFamily:LT,marginTop:4,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}><MapPin size={11} color={C.muted}/>{roomData.distance}</div>}
      </div>

      <div style={{padding:"20px 18px 0"}}>

        {/* YOUR CARD */}
        <Card elevated style={{marginBottom:14}} className="s2">
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:16,fontFamily:LT}}>You</div>
          {editing?(
            <div>
              <div style={{display:"flex",justifyContent:"center",marginBottom:22}}><PhotoUpload current={photo} onUpload={setPhoto} size={88}/></div>
              <Field label="Display name" value={name} onChange={e=>setName(e.target.value)}/>
              <Field label="Status message" placeholder="What's on your mind?" value={status} onChange={e=>setStatus(e.target.value)}/>
              <Field label="Birthday" type="date" value={birthday} onChange={e=>setBirthday(e.target.value)}/>
              <Field label="Timezone" select value={timezone} onChange={e=>setTimezone(e.target.value)}><option value="">Select timezone</option>{TIMEZONES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</Field>
              <div style={{marginBottom:18}}><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Favourite emoji</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{EMOJIS.map(e=><button key={e} onClick={()=>setEmoji(e)} style={{width:40,height:40,borderRadius:12,border:`2px solid ${emoji===e?C.rose:C.border}`,background:emoji===e?C.roseSoft:"transparent",fontSize:18,cursor:"pointer",transition:"all 0.15s"}}>{e}</button>)}</div></div>
            </div>
          ):(
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <Avatar name={me?.name||""} photo={myUser?.photo} size={60} gradient={C.gradRose}/>
              <div>
                <div style={{fontSize:17,fontWeight:700,color:C.text,fontFamily:LT}}>{me?.name} {myUser?.favoriteEmoji}</div>
                {myUser?.status&&<div style={{fontSize:13,color:C.muted,fontFamily:PF,fontStyle:"italic",marginTop:4}}>"{myUser.status}"</div>}
                {myUser?.timezone&&<div style={{fontSize:11,color:C.muted,fontFamily:LT,marginTop:5,display:"flex",alignItems:"center",gap:4}}><Clock size={11} color={C.muted}/>{TIMEZONES.find(t=>t.value===myUser.timezone)?.label||myUser.timezone}</div>}
                {myUser?.birthday&&<div style={{fontSize:11,color:C.muted,fontFamily:LT,marginTop:3}}>🎂 {new Date(myUser.birthday).toLocaleDateString("en",{month:"long",day:"numeric"})}</div>}
              </div>
            </div>
          )}
        </Card>

        {/* PARTNER CARD */}
        <Card elevated style={{marginBottom:14}} className="s3">
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:16,fontFamily:LT}}>Your person</div>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <Avatar name={partner?.name||"?"} photo={partnerUser?.photo} size={60} gradient={C.gradGold}/>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:C.text,fontFamily:LT}}>{partner?.name||"Waiting..."} {partnerUser?.favoriteEmoji}</div>
              {partnerUser?.status&&<div style={{fontSize:13,color:C.muted,fontFamily:PF,fontStyle:"italic",marginTop:4}}>"{partnerUser.status}"</div>}
              {partnerUser?.timezone&&<div style={{fontSize:11,color:C.muted,fontFamily:LT,marginTop:5,display:"flex",alignItems:"center",gap:4}}><Clock size={11} color={C.muted}/>{TIMEZONES.find(t=>t.value===partnerUser?.timezone)?.label||partnerUser?.timezone}</div>}
            </div>
          </div>
        </Card>

        {/* RELATIONSHIP CARD */}
        <Card elevated style={{marginBottom:14}} className="s4">
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:16,fontFamily:LT}}>Your relationship</div>
          {editing?(
            <div>
              <div style={{marginBottom:18}}><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Couple photo</div><PhotoUpload current={couplePhoto} onUpload={setCouplePhoto} size={70}/></div>
              <Field label="Couple name" placeholder="e.g. Koustav & Ankita" value={coupleName} onChange={e=>setCoupleName(e.target.value)}/>
              <Field label="Anniversary date *" type="date" value={anniversary} onChange={e=>setAnniversary(e.target.value)}/>
              <Field label="Distance between you" placeholder="e.g. Bangalore ↔ London" value={distance} onChange={e=>setDistance(e.target.value)}/>
              <Field label="How you met (your side)" textarea placeholder="One line about how you two found each other..." value={howWeMet} onChange={e=>setHowWeMet(e.target.value)}/>
            </div>
          ):(
            <div>
              {roomData?.couplePhoto&&<img src={roomData.couplePhoto} style={{width:"100%",borderRadius:16,marginBottom:14,objectFit:"cover",height:140}} alt="couple"/>}
              {roomData?.howWeMet?.A&&<p style={{fontFamily:PF,fontSize:15,fontStyle:"italic",color:C.muted,marginBottom:6,lineHeight:1.6}}>"{roomData.howWeMet.A}"</p>}
              {roomData?.howWeMet?.B&&<p style={{fontFamily:PF,fontSize:15,fontStyle:"italic",color:C.muted,lineHeight:1.6}}>"{roomData.howWeMet.B}"</p>}
            </div>
          )}
        </Card>

        {/* ACTIONS */}
        {editing&&(busy?<Spinner text="Saving..."/>:<Btn onClick={save} style={{marginBottom:12}} className="s5">Save changes</Btn>)}

{/* Settings */}
        <Card style={{marginBottom:20}} className="s6">
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:14,fontFamily:LT}}>Settings</div>
{/* Enable notifications */}
<button onClick={()=>requestNotifPermission(uid)} style={{display:"flex",alignItems:"center",gap:12,background:"rgba(212,82,106,0.05)",border:`1px solid ${C.roseBd}`,borderRadius:14,padding:"13px 16px",cursor:"pointer",fontSize:14,color:C.rose,fontFamily:LT,width:"100%",fontWeight:600,marginBottom:10,transition:"all 0.2s"}}
  onMouseEnter={e=>e.currentTarget.style.background="rgba(212,82,106,0.10)"}
  onMouseLeave={e=>e.currentTarget.style.background="rgba(212,82,106,0.05)"}>
  <Bell size={18} color={C.rose}/> Enable notifications
</button>
          {/* Privacy policy link */}
          <a href="/privacy.html" target="_blank" style={{display:"flex",alignItems:"center",gap:12,background:"rgba(212,82,106,0.04)",border:`1px solid ${C.roseBd}`,borderRadius:14,padding:"13px 16px",textDecoration:"none",fontSize:14,color:C.rose,fontFamily:LT,width:"100%",fontWeight:600,marginBottom:10,transition:"all 0.2s"}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(212,82,106,0.08)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(212,82,106,0.04)"}>
            <Sparkle size={18} color={C.rose}/> Privacy policy
          </a>

          {/* Sign out */}
          <button onClick={onSignOut} style={{display:"flex",alignItems:"center",gap:12,background:"rgba(212,82,106,0.05)",border:`1px solid ${C.roseBd}`,borderRadius:14,padding:"13px 16px",cursor:"pointer",fontSize:14,color:C.rose,fontFamily:LT,width:"100%",fontWeight:600,marginBottom:10,transition:"all 0.2s"}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(212,82,106,0.10)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(212,82,106,0.05)"}>
            <SignOut size={18} color={C.rose}/> Sign out
          </button>

          {/* Delete account */}
          <DeleteAccountButton uid={uid} roomId={roomId} userKey={userKey} roomData={roomData} onSignOut={onSignOut}/>
        </Card>
      </div>
    </div>
  );
}
const DATE_VIBES = [
  {key:"romantic",label:"Romantic",emoji:"🌹"},
  {key:"cozy",label:"Cozy",emoji:"☕"},
  {key:"foodie",label:"Foodie",emoji:"🍽️"},
  {key:"adventurous",label:"Adventurous",emoji:"🗺️"},
  {key:"cultural",label:"Cultural",emoji:"🎭"},
  {key:"silly",label:"Silly",emoji:"🎉"},
  {key:"luxe",label:"Luxe",emoji:"✨"},
  {key:"budget",label:"Budget",emoji:"💚"},
];

const DATE_OCCASIONS = [
  {key:"datenight",label:"Date Night"},
  {key:"videocall",label:"Video Call"},
  {key:"goingout",label:"Going Out"},
  {key:"casual",label:"Casual Day"},
  {key:"special",label:"Special Occasion"},
];

const OUTFIT_VIBES = [
  {key:"elegant",label:"Elegant"},
  {key:"casual",label:"Casual"},
  {key:"bold",label:"Bold"},
  {key:"soft",label:"Soft"},
  {key:"streetwear",label:"Streetwear"},
  {key:"vintage",label:"Vintage"},
];

const WATCH_MOODS = [
  {key:"romantic",label:"Romantic"},
  {key:"thriller",label:"Thriller"},
  {key:"comedy",label:"Comedy"},
  {key:"documentary",label:"Documentary"},
  {key:"comfort",label:"Comfort rewatch"},
  {key:"surprise",label:"Surprise me"},
];

const PLATFORMS = [
  {key:"netflix",label:"Netflix",url:"https://netflix.com"},
  {key:"prime",label:"Prime Video",url:"https://primevideo.com"},
  {key:"youtube",label:"YouTube",url:"https://youtube.com"},
  {key:"disney",label:"Disney+",url:"https://disneyplus.com"},
  {key:"hotstar",label:"Hotstar",url:"https://hotstar.com"},
  {key:"appletv",label:"Apple TV+",url:"https://tv.apple.com"},
];

// ── DATE PLANNER SCREEN ────────────────────────────────────────────
function DatePlannerScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A";
  const [step,setStep]=useState("format"); // format|vibe|city|generating|result|history
  const [format,setFormat]=useState(""); // inperson|virtual
  const [vibe,setVibe]=useState("");
  const [city,setCity]=useState(roomData?.distance?.split("↔")?.[0]?.trim()||"");
  const [plan,setPlan]=useState(null);
  const [loading,setLoading]=useState(false);
  const [savedPlans,setSavedPlans]=useState(roomData?.datePlans||[]);
  const [scheduledDate,setScheduledDate]=useState("");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{setSavedPlans(roomData?.datePlans||[]);},[roomData?.datePlans]);

  const generate=async()=>{
    setStep("generating"); setLoading(true);
    try{
      const system=`You are a romantic date planner for couples. Generate creative, specific, and thoughtful date plans. For in-person dates, suggest real types of venues with specific neighbourhood areas and timing. For virtual dates, create a structured evening with specific activities. Always format your response as valid JSON only with no markdown backticks.`;

      const pastPlans=savedPlans.slice(0,5).map(p=>p.title).join(", ");
      const avoidStr=pastPlans?`Avoid repeating these past date ideas: ${pastPlans}.`:"";

      const prompt=format==="inperson"
        ?`Create a ${vibe} in-person date plan for a couple in ${city||"their city"}. ${avoidStr}
Return ONLY this JSON structure:
{
  "title": "short romantic title",
  "format": "inperson",
  "vibe": "${vibe}",
  "city": "${city}",
  "description": "one warm sentence about this date",
  "stops": [
    {
      "time": "7:00 PM",
      "place": "specific place name or type",
      "area": "neighbourhood or area of city",
      "description": "one line about this stop",
      "mapsQuery": "search term for google maps"
    }
  ],
  "tips": "one practical tip for this date"
}`
        :`Create a ${vibe} virtual date plan for a long-distance couple. ${avoidStr}
Return ONLY this JSON structure:
{
  "title": "short romantic title",
  "format": "virtual",
  "vibe": "${vibe}",
  "description": "one warm sentence about this date",
  "stops": [
    {
      "time": "8:00 PM",
      "activity": "specific activity name",
      "platform": "tool or platform to use",
      "description": "one line about this activity",
      "link": "https://relevant-platform-url.com"
    }
  ],
  "tips": "one practical tip for this virtual date"
}`;

      const raw=await callClaude(system,prompt);
      const m=raw.match(/\{[\s\S]*\}/);
      const parsed=JSON.parse(m?m[0]:raw);
      setPlan(parsed);
      setStep("result");
    }catch(e){
      console.error(e);
      setStep("vibe");
    }
    setLoading(false);
  };

  const savePlan=async()=>{
    if(!plan) return;
    setSaving(true);
    const newPlan={
      id:Date.now()+Math.random(),
      ...plan,
      savedBy:userKey,
      savedAt:Date.now(),
      scheduledDate:scheduledDate||null,
      done:false,
      doneNote:"",
      donePhoto:"",
    };
    const updated=[newPlan,...(roomData?.datePlans||[])];
    await update({datePlans:updated});
    await addN("date",`${me?.name} planned a date: ${plan.title}`);
    setSavedPlans(updated);
    setPlan(null);
    setStep("history");
    setSaving(false);
  };

  const markDone=async(planId,note)=>{
    const updated=(roomData?.datePlans||[]).map(p=>p.id===planId?{...p,done:true,doneNote:note,doneAt:Date.now()}:p);
    await update({datePlans:updated});
    // Also add to memory jar
    const donePlan=(roomData?.datePlans||[]).find(p=>p.id===planId);
    if(donePlan){
      const memory={id:Date.now()+Math.random(),userKey,name:me?.name,text:`We went on our ${donePlan.vibe} date — ${donePlan.title} 🌹`,image:"",date:new Date().toLocaleDateString("en",{month:"short",day:"numeric"})};
      await update({memories:[memory,...(roomData?.memories||[])]});
    }
  };

  const gradDate="linear-gradient(180deg,#FFE0C0 0%,#FFF5EE 50%,#FFF6F3 100%)";
  const gradCard="linear-gradient(135deg,#FF8C42,#E85D26)";
  const gradCardSoft="linear-gradient(135deg,rgba(255,140,66,0.10),rgba(232,93,38,0.06))";
  const accentColor="#E85D26";
  const accentSoft="rgba(232,93,38,0.08)";
  const accentBd="rgba(232,93,38,0.20)";

  return (
    <div style={{minHeight:"100vh",background:gradDate,paddingBottom:100}}>
      <div style={{position:"relative",overflow:"hidden"}}>
        <GradOrb size={300} top={-60} color1="rgba(255,140,66,0.22)" color2="rgba(255,200,140,0.08)"/>

        {/* HEADER */}
        <div style={{padding:"22px 18px 0",position:"relative",zIndex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
            <BackBtn onClick={back}/>
            <div style={{flex:1}}>
              <h2 style={{fontFamily:PF,fontSize:22,fontWeight:400,fontStyle:"italic",color:C.text}}>Date Planner</h2>
              <div style={{fontSize:12,color:C.muted,fontFamily:LT}}>Plan something beautiful together</div>
            </div>
            <button onClick={()=>setStep(step==="history"?"format":"history")} style={{background:step==="history"?"rgba(232,93,38,0.10)":"rgba(255,255,255,0.85)",border:`1px solid ${accentBd}`,borderRadius:14,padding:"8px 14px",cursor:"pointer",fontFamily:LT,fontSize:12,fontWeight:700,color:accentColor,backdropFilter:"blur(8px)"}}>
              {step==="history"?"+ New plan":"History"}
            </button>
          </div>
        </div>

        <div style={{padding:"0 18px",position:"relative",zIndex:1}}>

          {/* STEP — FORMAT */}
          {step==="format"&&(
            <div className="fade-rise">
              <div style={{textAlign:"center",marginBottom:28}}>
                <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:72,height:72,borderRadius:"50%",background:gradCard,boxShadow:SHADOWS.xl,marginBottom:16}} className="hb-float">
                  <CalendarHeart size={36} color="#fff" weight="fill"/>
                </div>
                <h3 style={{fontFamily:PF,fontSize:26,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:8}}>What kind of date?</h3>
                <p style={{fontSize:14,color:C.muted,fontFamily:LT}}>In person or virtual — we'll plan it perfectly.</p>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
                {[
                  {key:"inperson",icon:"📍",title:"In Person",desc:"A real date — restaurants, parks, adventures"},
                  {key:"virtual",icon:"💻",title:"Virtual",desc:"A digital date night across the distance"},
                ].map(f=>(
                  <button key={f.key} onClick={()=>{setFormat(f.key);setStep("vibe");}} className="card-hover" style={{background:"rgba(255,255,255,0.95)",border:`2px solid ${accentBd}`,borderRadius:22,padding:"24px 16px",cursor:"pointer",fontFamily:LT,textAlign:"center",boxShadow:SHADOWS.md,transition:"all 0.25s"}}>
                    <div style={{fontSize:36,marginBottom:12}}>{f.icon}</div>
                    <div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:PF,fontStyle:"italic",marginBottom:6}}>{f.title}</div>
                    <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>{f.desc}</div>
                  </button>
                ))}
              </div>
              {/* History preview */}
              {savedPlans.length>0&&(
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>Recent plans</div>
                  {savedPlans.slice(0,2).map(p=>(
                    <div key={p.id} style={{background:"rgba(255,255,255,0.85)",borderRadius:16,padding:"14px 16px",marginBottom:10,boxShadow:SHADOWS.sm,border:`1px solid ${accentBd}`,display:"flex",alignItems:"center",gap:12}}>
                      <div style={{fontSize:20}}>{p.format==="inperson"?"📍":"💻"}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:LT}}>{p.title}</div>
                        <div style={{fontSize:11,color:C.muted,fontFamily:LT,marginTop:2}}>{p.vibe} · {p.done?"Done ✓":"Upcoming"}</div>
                      </div>
                    </div>
                  ))}
                  <button onClick={()=>setStep("history")} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:accentColor,fontFamily:LT,fontWeight:700,display:"block",width:"100%",textAlign:"center",padding:"8px 0"}}>See all plans →</button>
                </div>
              )}
            </div>
          )}

          {/* STEP — VIBE */}
          {step==="vibe"&&(
            <div className="fade-rise">
              <div style={{marginBottom:24}}>
                <h3 style={{fontFamily:PF,fontSize:24,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:8}}>What's the vibe?</h3>
                <p style={{fontSize:14,color:C.muted,fontFamily:LT}}>Pick one — Claude will shape the whole plan around it.</p>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:24}}>
                {DATE_VIBES.map(v=>(
                  <button key={v.key} onClick={()=>setVibe(v.key)} className="card-hover" style={{background:vibe===v.key?`rgba(232,93,38,0.10)`:"rgba(255,255,255,0.90)",border:`2px solid ${vibe===v.key?accentColor:accentBd}`,borderRadius:18,padding:"16px 14px",cursor:"pointer",fontFamily:LT,textAlign:"center",boxShadow:vibe===v.key?SHADOWS.md:SHADOWS.sm,transition:"all 0.2s"}}>
                    <div style={{fontSize:24,marginBottom:6}}>{v.emoji}</div>
                    <div style={{fontSize:13,fontWeight:700,color:vibe===v.key?accentColor:C.text}}>{v.label}</div>
                  </button>
                ))}
              </div>
              {format==="inperson"&&(
                <div style={{marginBottom:20}}>
                  <Field label="Which city?" placeholder="e.g. Bangalore, London, New York..." value={city} onChange={e=>setCity(e.target.value)}/>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <Btn variant="ghost" onClick={()=>setStep("format")}>← Back</Btn>
                <Btn disabled={!vibe||(format==="inperson"&&!city.trim())} onClick={generate} style={{background:gradCard,border:"none",color:"#fff",boxShadow:SHADOWS.lg}}>Plan this date →</Btn>
              </div>
            </div>
          )}

          {/* STEP — GENERATING */}
          {step==="generating"&&(
            <div className="fade-rise" style={{textAlign:"center",padding:"48px 0"}}>
              <div style={{position:"relative",display:"inline-block",marginBottom:28}}>
                <div style={{position:"absolute",inset:-20,borderRadius:"50%",border:`2px solid rgba(232,93,38,0.25)`,animation:"hbRing1 2.5s ease-out infinite"}}/>
                <div style={{width:90,height:90,borderRadius:"50%",background:gradCard,display:"inline-flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.xl}}>
                  <CalendarHeart size={44} color="#fff" weight="fill" className="hb-spin"/>
                </div>
              </div>
              <h3 style={{fontFamily:PF,fontSize:24,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:10}}>Planning your date...</h3>
              <p style={{fontSize:14,color:C.muted,fontFamily:LT,lineHeight:1.7}}>Finding the perfect places<br/>and crafting your evening.</p>
            </div>
          )}

          {/* STEP — RESULT */}
          {step==="result"&&plan&&(
            <div className="fade-rise">
              {/* Plan header card */}
              <div style={{background:gradCard,borderRadius:24,padding:"24px 22px",marginBottom:20,boxShadow:SHADOWS.xl,position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:-20,right:-20,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,0.08)"}}/>
                <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:8,fontFamily:LT,display:"flex",alignItems:"center",gap:6}}>
                  <CalendarHeart size={12} color="rgba(255,255,255,0.7)" weight="fill"/>
                  {plan.vibe} · {plan.format==="inperson"?plan.city:"Virtual date"}
                </div>
                <h3 style={{fontFamily:PF,fontSize:24,fontStyle:"italic",fontWeight:400,color:"#fff",marginBottom:10,lineHeight:1.3}}>{plan.title}</h3>
                <p style={{fontSize:14,color:"rgba(255,255,255,0.8)",fontFamily:LT,lineHeight:1.6}}>{plan.description}</p>
              </div>

              {/* Stops */}
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>Your evening</div>
                {plan.stops?.map((stop,i)=>(
                  <div key={i} style={{display:"flex",gap:14,marginBottom:14}}>
                    {/* Timeline dot */}
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:gradCard,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.sm,fontSize:12,fontWeight:700,color:"#fff",fontFamily:LT}}>{i+1}</div>
                      {i<plan.stops.length-1&&<div style={{width:2,flex:1,background:"rgba(232,93,38,0.15)",minHeight:20,marginTop:4}}/>}
                    </div>
                    {/* Stop card */}
                    <div style={{flex:1,background:"rgba(255,255,255,0.95)",borderRadius:18,padding:"14px 16px",boxShadow:SHADOWS.sm,border:`1px solid ${accentBd}`,marginBottom:4}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                        <div style={{fontSize:11,fontWeight:700,color:accentColor,fontFamily:LT}}>{stop.time}</div>
                        {stop.area&&<div style={{fontSize:10,color:C.muted,fontFamily:LT,background:"rgba(232,93,38,0.06)",padding:"2px 8px",borderRadius:8}}>{stop.area}</div>}
                      </div>
                      <div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:LT,marginBottom:4}}>{stop.place||stop.activity}</div>
                      <div style={{fontSize:12,color:C.muted,fontFamily:LT,lineHeight:1.5,marginBottom:stop.mapsQuery||stop.link?8:0}}>{stop.description}</div>
                      {stop.mapsQuery&&(
                        <a href={`https://www.google.com/maps/search/${encodeURIComponent(stop.mapsQuery+(city?` ${city}`:""))}`} target="_blank" rel="noreferrer" style={{fontSize:11,fontWeight:700,color:accentColor,fontFamily:LT,display:"flex",alignItems:"center",gap:4,textDecoration:"none"}}>
                          <MapPin size={11} color={accentColor} weight="fill"/> Open in Maps →
                        </a>
                      )}
                      {stop.link&&(
                        <a href={stop.link} target="_blank" rel="noreferrer" style={{fontSize:11,fontWeight:700,color:accentColor,fontFamily:LT,display:"flex",alignItems:"center",gap:4,textDecoration:"none"}}>
                          <ArrowRight size={11} color={accentColor}/> Open {stop.platform} →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tips */}
              {plan.tips&&(
                <div style={{background:"rgba(232,93,38,0.06)",border:`1px solid ${accentBd}`,borderRadius:16,padding:"14px 16px",marginBottom:20}}>
                  <div style={{fontSize:11,fontWeight:700,color:accentColor,marginBottom:6,fontFamily:LT,textTransform:"uppercase",letterSpacing:"0.06em"}}>Tip</div>
                  <div style={{fontSize:13,color:C.text,fontFamily:LT,lineHeight:1.6}}>{plan.tips}</div>
                </div>
              )}

              {/* Schedule date */}
              <Field label="When is this date? (optional)" type="date" value={scheduledDate} onChange={e=>setScheduledDate(e.target.value)}/>

              {/* Actions */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                <Btn variant="ghost" onClick={()=>setStep("vibe")}>Try again →</Btn>
                <Btn onClick={savePlan} disabled={saving} style={{background:gradCard,border:"none",color:"#fff",boxShadow:SHADOWS.lg}}>
                  {saving?"Saving...":"Save this plan"}
                </Btn>
              </div>
            </div>
          )}

          {/* STEP — HISTORY */}
          {step==="history"&&(
            <div className="fade-rise">
              <div style={{marginBottom:20}}>
                <h3 style={{fontFamily:PF,fontSize:24,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:6}}>Your date history</h3>
                <p style={{fontSize:13,color:C.muted,fontFamily:LT}}>{savedPlans.length} plans saved together</p>
              </div>
              {savedPlans.length===0?(
                <div style={{textAlign:"center",padding:"44px 0"}}>
                  <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:72,height:72,borderRadius:"50%",background:gradCard,boxShadow:SHADOWS.lg,marginBottom:16}} className="hb-float"><CalendarHeart size={32} color="#fff" weight="fill"/></div>
                  <div style={{color:C.muted,fontSize:15,fontFamily:LT}}>No plans yet — create your first date.</div>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {savedPlans.map((p,i)=>(
                    <HistoryCard key={p.id} plan={p} accentColor={accentColor} accentBd={accentBd} gradCard={gradCard} onMarkDone={markDone} me={me}/>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── HISTORY CARD ───────────────────────────────────────────────────
function HistoryCard({plan,accentColor,accentBd,gradCard,onMarkDone,me}){
  const [expanded,setExpanded]=useState(false);
  const [note,setNote]=useState("");
  const [marking,setMarking]=useState(false);

  const handleDone=async()=>{
    setMarking(true);
    await onMarkDone(plan.id,note);
    setMarking(false);
    setExpanded(false);
  };

  return (
    <div style={{background:"rgba(255,255,255,0.95)",borderRadius:20,overflow:"hidden",boxShadow:SHADOWS.md,border:`1px solid ${plan.done?"rgba(107,143,113,0.20)":accentBd}`}}>
      <div style={{padding:"16px 18px"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
          <div style={{width:44,height:44,borderRadius:14,background:plan.done?"linear-gradient(135deg,#90C498,#6B8F71)":gradCard,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SHADOWS.sm}}>
            {plan.done?<CheckCircle size={22} color="#fff" weight="fill"/>:<CalendarHeart size={22} color="#fff" weight="fill"/>}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:LT,marginBottom:3}}>{plan.title}</div>
            <div style={{fontSize:11,color:C.muted,fontFamily:LT,display:"flex",gap:8,flexWrap:"wrap"}}>
              <span style={{background:plan.done?"rgba(107,143,113,0.10)":"rgba(232,93,38,0.08)",padding:"2px 8px",borderRadius:8,color:plan.done?C.sage:accentColor,fontWeight:700}}>{plan.done?"Done ✓":"Upcoming"}</span>
              <span>{plan.format==="inperson"?`📍 ${plan.city}`:"💻 Virtual"}</span>
              <span>{plan.vibe}</span>
              {plan.scheduledDate&&<span>📅 {new Date(plan.scheduledDate).toLocaleDateString("en",{month:"short",day:"numeric"})}</span>}
            </div>
          </div>
          <button onClick={()=>setExpanded(!expanded)} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:12,fontFamily:LT,fontWeight:700,flexShrink:0}}>
            {expanded?"Less":"Details"}
          </button>
        </div>
      </div>
      {expanded&&(
        <div style={{borderTop:`1px solid rgba(232,93,38,0.08)`,padding:"14px 18px"}}>
          <div style={{fontSize:13,color:C.muted,fontFamily:LT,lineHeight:1.6,marginBottom:12}}>{plan.description}</div>
          {plan.stops?.slice(0,3).map((stop,i)=>(
            <div key={i} style={{fontSize:12,color:C.text,fontFamily:LT,marginBottom:6,display:"flex",gap:8}}>
              <span style={{color:accentColor,fontWeight:700,flexShrink:0}}>{stop.time}</span>
              <span>{stop.place||stop.activity}</span>
            </div>
          ))}
          {!plan.done&&(
            <div style={{marginTop:14}}>
              <Field textarea label="How was it? (optional note)" placeholder="A memory from this date..." value={note} onChange={e=>setNote(e.target.value)}/>
              <Btn onClick={handleDone} disabled={marking} style={{background:C.gradSage,border:"none",color:"#fff"}}>{marking?"Saving...":"Mark as done ✓"}</Btn>
            </div>
          )}
          {plan.done&&plan.doneNote&&(
            <div style={{background:"rgba(107,143,113,0.08)",borderRadius:12,padding:"10px 14px",marginTop:10}}>
              <div style={{fontSize:12,color:C.sage,fontFamily:PF,fontStyle:"italic",lineHeight:1.6}}>"{plan.doneNote}"</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── OUTFIT PLANNER SCREEN ──────────────────────────────────────────
const AMAZON_TAG = "heartbeat054-21";

const PLATFORMS_INDIA = [
  {name:"Amazon",color:"#FF9900",bg:"rgba(255,153,0,0.10)",bd:"rgba(255,153,0,0.25)",getUrl:(query)=>`https://www.amazon.in/s?k=${encodeURIComponent(query)}&tag=${AMAZON_TAG}`,logo:"A"},
  {name:"Myntra",color:"#FF3F6C",bg:"rgba(255,63,108,0.08)",bd:"rgba(255,63,108,0.20)",getUrl:(query)=>`https://www.myntra.com/${encodeURIComponent(query.split(" ").join("-"))}`,logo:"M"},
  {name:"Ajio",color:"#001845",bg:"rgba(0,24,69,0.06)",bd:"rgba(0,24,69,0.15)",getUrl:(query)=>`https://www.ajio.com/search/?text=${encodeURIComponent(query)}`,logo:"Aj"},
  {name:"Nykaa",color:"#FC2779",bg:"rgba(252,39,121,0.08)",bd:"rgba(252,39,121,0.20)",getUrl:(query)=>`https://www.nykaafashion.com/search?q=${encodeURIComponent(query)}`,logo:"N"},
];

const PLATFORMS_INTL = [
  {name:"Amazon",color:"#FF9900",bg:"rgba(255,153,0,0.10)",bd:"rgba(255,153,0,0.25)",getUrl:(query)=>`https://www.amazon.com/s?k=${encodeURIComponent(query)}&tag=${AMAZON_TAG}`,logo:"A"},
  {name:"ASOS",color:"#2D2D2D",bg:"rgba(45,45,45,0.06)",bd:"rgba(45,45,45,0.15)",getUrl:(query)=>`https://www.asos.com/search/?q=${encodeURIComponent(query)}`,logo:"AS"},
  {name:"H&M",color:"#E50010",bg:"rgba(229,0,16,0.06)",bd:"rgba(229,0,16,0.15)",getUrl:(query)=>`https://www2.hm.com/en_gb/search-results.html?q=${encodeURIComponent(query)}`,logo:"H"},
  {name:"Zara",color:"#1A1A1A",bg:"rgba(26,26,26,0.06)",bd:"rgba(26,26,26,0.15)",getUrl:(query)=>`https://www.zara.com/us/en/search?searchTerm=${encodeURIComponent(query)}`,logo:"Z"},
];

function ShoppingRow({piece,timezone}){
  const isIndia=timezone==="Asia/Kolkata"||timezone==="Asia/Colombo"||timezone==="Asia/Dhaka";
  const platforms=isIndia?PLATFORMS_INDIA:PLATFORMS_INTL;
  return (
    <div style={{marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:LT,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
        <span style={{color:C.purple}}>✦</span> {piece}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {platforms.map(p=>(
          <a key={p.name} href={p.getUrl(piece)} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:6,background:p.bg,border:`1px solid ${p.bd}`,borderRadius:20,padding:"6px 12px",textDecoration:"none",fontSize:12,fontWeight:700,color:p.color,fontFamily:LT,transition:"all 0.2s",whiteSpace:"nowrap"}}
            onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow=SHADOWS.sm;}}
            onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
            <span style={{width:18,height:18,borderRadius:"50%",background:p.color,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{p.logo}</span>
            {p.name}
          </a>
        ))}
      </div>
    </div>
  );
}
function OutfitPlannerScreen({me,partner,userKey,roomData,update,addN,back}){
  const myUser = roomData?.users?.[userKey];
  const pk=userKey==="A"?"B":"A";
  const [mode,setMode]=useState(""); // forme|forpartner|react
  const [occasion,setOccasion]=useState("");
  const [vibe,setVibe]=useState("");
  const [note,setNote]=useState("");
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState(null);
  const [partnerNote,setPartnerNote]=useState("");

  const outfitCards=roomData?.outfitCards||[];
  const pendingForMe=outfitCards.filter(c=>c.for===userKey&&!c.seen);
  const myCards=outfitCards.filter(c=>c.by===userKey);

  const generate=async()=>{
    setLoading(true);
    try{
      const target=mode==="forme"?me?.name:partner?.name;
      const system="You are a thoughtful personal stylist. Generate specific, wearable outfit suggestions with colour palettes, key pieces, and styling notes. Be warm and personal. Return only JSON.";
      const prompt=`Generate a ${vibe} outfit suggestion for ${target} for a ${occasion} occasion.${note?` Special note: ${note}`:""}
Return ONLY this JSON:
{
  "title": "outfit name",
  "keyPieces": ["piece 1", "piece 2", "piece 3"],
  "colours": ["colour 1", "colour 2"],
  "styling": "2-3 sentences of styling advice",
  "avoid": "one thing to avoid",
  "mood": "one word mood of this outfit"
}`;
      const raw=await callClaude(system,prompt);
      const m=raw.match(/\{[\s\S]*\}/);
      setResult(JSON.parse(m?m[0]:raw));
    }catch(e){console.error(e);}
    setLoading(false);
  };

  const sendToPartner=async()=>{
    if(!result) return;
    const card={id:Date.now()+Math.random(),by:userKey,for:pk,occasion,vibe,result,note,seen:false,revisions:[],ts:Date.now()};
    await update({outfitCards:[card,...outfitCards]});
    await addN("outfit",`${me?.name} has an outfit idea for you ✨`);
    setResult(null); setMode(""); setOccasion(""); setVibe(""); setNote("");
  };

  const requestChange=async(cardId,changeNote)=>{
    setLoading(true);
    try{
      const card=outfitCards.find(c=>c.id===cardId);
      const system="You are a personal stylist. Revise an outfit suggestion based on feedback. Return only JSON.";
      const prompt=`Original outfit: ${JSON.stringify(card.result)}. Requested change: "${changeNote}". Generate a revised outfit keeping the original spirit but incorporating the change.
Return ONLY this JSON:
{
  "title": "revised outfit name",
  "keyPieces": ["piece 1", "piece 2", "piece 3"],
  "colours": ["colour 1", "colour 2"],
  "styling": "2-3 sentences of styling advice",
  "avoid": "one thing to avoid",
  "mood": "one word mood"
}`;
      const raw=await callClaude(system,prompt);
      const m=raw.match(/\{[\s\S]*\}/);
      const revised=JSON.parse(m?m[0]:raw);
      const updated=outfitCards.map(c=>c.id===cardId?{...c,result:revised,revisions:[...c.revisions,{note:changeNote,ts:Date.now()}],seen:true}:c);
      await update({outfitCards:updated});
    }catch(e){console.error(e);}
    setLoading(false);
  };

  const gradOutfit="linear-gradient(135deg,#C084FC,#8B6BAD)";
  const outfitColor=C.purple;
  const outfitBd=C.purpleBd;

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#EAD6FF 0%,#F8F0FF 50%,#FFF6F3 100%)",paddingBottom:100}}>
      <div style={{position:"relative",overflow:"hidden"}}>
        <GradOrb size={280} top={-50} color1="rgba(139,107,173,0.25)" color2="rgba(180,150,220,0.08)"/>
        <div style={{padding:"22px 18px 0",position:"relative",zIndex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
            <BackBtn onClick={back}/>
            <div style={{flex:1}}>
              <h2 style={{fontFamily:PF,fontSize:22,fontWeight:400,fontStyle:"italic",color:C.text}}>Outfit Planner</h2>
              <div style={{fontSize:12,color:C.muted,fontFamily:LT}}>Dress for each other</div>
            </div>
            {pendingForMe.length>0&&<div style={{background:gradOutfit,borderRadius:20,padding:"5px 12px",display:"flex",alignItems:"center",gap:4,boxShadow:SHADOWS.sm}}><Sparkle size={12} color="#fff" weight="fill"/><span style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:LT}}>{pendingForMe.length} for you</span></div>}
          </div>

          {!mode&&(
            <div className="fade-rise">
              {pendingForMe.length>0&&(
                <div style={{marginBottom:24}}>
                  <div style={{fontSize:11,fontWeight:700,color:outfitColor,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>From {partner?.name} ✨</div>
                  {pendingForMe.map(card=>(
                    <OutfitCard key={card.id} card={card} me={me} partner={partner} userKey={userKey} outfitColor={outfitColor} outfitBd={outfitBd} gradOutfit={gradOutfit} onRequestChange={requestChange} loading={loading}/>
                  ))}
                </div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {[
                  {key:"forme",icon:"✨",title:"Get outfit ideas",desc:"AI suggests an outfit for you"},
                  {key:"forpartner",icon:"💌",title:`Suggest for ${partner?.name}`,desc:"Send your partner an outfit idea"},
                ].map(m=>(
                  <button key={m.key} onClick={()=>setMode(m.key)} className="card-hover" style={{background:"rgba(255,255,255,0.95)",border:`1.5px solid ${outfitBd}`,borderRadius:20,padding:"20px 18px",cursor:"pointer",fontFamily:LT,textAlign:"left",boxShadow:SHADOWS.md,display:"flex",alignItems:"center",gap:16}}>
                    <div style={{width:50,height:50,borderRadius:16,background:gradOutfit,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22,boxShadow:SHADOWS.sm}}>{m.icon}</div>
                    <div><div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>{m.title}</div><div style={{fontSize:12,color:C.muted}}>{m.desc}</div></div>
                    <CaretRight size={18} color={C.muted} style={{marginLeft:"auto",flexShrink:0}}/>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode&&!result&&!loading&&(
            <div className="fade-rise">
              <h3 style={{fontFamily:PF,fontSize:22,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:20}}>{mode==="forme"?"What are you dressing for?":`What should ${partner?.name} wear?`}</h3>
              <div style={{marginBottom:18}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Occasion</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {DATE_OCCASIONS.map(o=><button key={o.key} onClick={()=>setOccasion(o.key)} style={{padding:"8px 16px",borderRadius:20,border:`1.5px solid ${occasion===o.key?outfitColor:outfitBd}`,background:occasion===o.key?C.purpleSoft:"rgba(255,255,255,0.8)",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:600,color:occasion===o.key?outfitColor:C.muted,transition:"all 0.18s"}}>{o.label}</button>)}
                </div>
              </div>
              <div style={{marginBottom:18}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Vibe</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {OUTFIT_VIBES.map(v=><button key={v.key} onClick={()=>setVibe(v.key)} style={{padding:"8px 16px",borderRadius:20,border:`1.5px solid ${vibe===v.key?outfitColor:outfitBd}`,background:vibe===v.key?C.purpleSoft:"rgba(255,255,255,0.8)",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:600,color:vibe===v.key?outfitColor:C.muted,transition:"all 0.18s"}}>{v.label}</button>)}
                </div>
              </div>
              {mode==="forpartner"&&<Field label="A note (optional)" placeholder={`e.g. I want to see you in something soft and warm...`} value={note} onChange={e=>setNote(e.target.value)}/>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <Btn variant="ghost" onClick={()=>{setMode("");setOccasion("");setVibe("");}}>← Back</Btn>
                <Btn disabled={!occasion||!vibe} onClick={generate} style={{background:gradOutfit,border:"none",color:"#fff"}}>Generate →</Btn>
              </div>
            </div>
          )}

          {loading&&<Spinner text="Styling your look..."/>}

          {result&&!loading&&(
            <div className="fade-rise">
              <div style={{background:gradOutfit,borderRadius:24,padding:"24px 22px",marginBottom:20,boxShadow:SHADOWS.xl}}>
                <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:8,fontFamily:LT}}>{vibe} · {occasion}</div>
                <h3 style={{fontFamily:PF,fontSize:22,fontStyle:"italic",fontWeight:400,color:"#fff",marginBottom:6}}>{result.title}</h3>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",fontFamily:LT}}>Mood: {result.mood}</div>
              </div>
              <Card elevated style={{marginBottom:14}}>
  <div style={{fontSize:11,fontWeight:700,color:outfitColor,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:14,fontFamily:LT,display:"flex",alignItems:"center",gap:6}}>
    <Sparkle size={12} color={outfitColor} weight="fill"/>
    Key pieces — tap to shop
  </div>
  {result.keyPieces?.map((p,i)=>(
    <ShoppingRow key={i} piece={p} timezone={myUser?.timezone||""}/>
  ))}
  <div style={{fontSize:10,color:C.muted,fontFamily:LT,marginTop:8,fontStyle:"italic",borderTop:`1px solid ${C.border}`,paddingTop:8}}>
    Links open in your browser. Amazon links support Heartbeat via affiliate commission at no extra cost to you.
  </div>
</Card>
              <Card elevated style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:outfitColor,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Colour palette</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{result.colours?.map((col,i)=><span key={i} style={{background:C.purpleSoft,color:outfitColor,padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:700,fontFamily:LT,border:`1px solid ${outfitBd}`}}>{col}</span>)}</div>
              </Card>
              <Card elevated style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:outfitColor,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:8,fontFamily:LT}}>Styling notes</div>
                <div style={{fontSize:14,color:C.text,fontFamily:LT,lineHeight:1.65}}>{result.styling}</div>
                {result.avoid&&<div style={{fontSize:12,color:C.muted,fontFamily:LT,marginTop:10,fontStyle:"italic"}}>Avoid: {result.avoid}</div>}
              </Card>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <Btn variant="ghost" onClick={()=>setResult(null)}>Try again →</Btn>
                {mode==="forpartner"?<Btn onClick={sendToPartner} style={{background:gradOutfit,border:"none",color:"#fff"}}>Send to {partner?.name} →</Btn>:<Btn variant="ghost" onClick={()=>{setResult(null);setMode("");}}>Done</Btn>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── OUTFIT CARD ────────────────────────────────────────────────────
function OutfitCard({card,me,partner,userKey,outfitColor,outfitBd,gradOutfit,onRequestChange,loading}){
  const [expanded,setExpanded]=useState(true);
  const [changeNote,setChangeNote]=useState("");
  const [requesting,setRequesting]=useState(false);

  const handleChange=async()=>{
    if(!changeNote.trim()) return;
    setRequesting(true);
    await onRequestChange(card.id,changeNote);
    setChangeNote("");
    setRequesting(false);
  };

  return (
    <div style={{background:"rgba(255,255,255,0.95)",borderRadius:20,overflow:"hidden",boxShadow:SHADOWS.md,border:`1px solid ${outfitBd}`,marginBottom:12}}>
      <div style={{background:gradOutfit,padding:"14px 18px"}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontFamily:LT,marginBottom:4}}>{card.vibe} · {card.occasion}</div>
        <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:PF,fontStyle:"italic"}}>{card.result.title}</div>
      </div>
      <div style={{padding:"14px 18px"}}>
      {card.result.keyPieces?.map((p,i)=>(
  <ShoppingRow key={i} piece={p} timezone={"Asia/Kolkata"}/>
))}
        <div style={{fontSize:13,color:C.muted,fontFamily:LT,lineHeight:1.6,marginTop:10}}>{card.result.styling}</div>
        {card.note&&<div style={{fontSize:12,color:outfitColor,fontFamily:PF,fontStyle:"italic",marginTop:10}}>"{card.note}"</div>}
        {card.revisions?.length>0&&<div style={{fontSize:11,color:C.muted,fontFamily:LT,marginTop:8}}>Revised {card.revisions.length} time{card.revisions.length>1?"s":""}</div>}
        <div style={{marginTop:14}}>
          <Field placeholder="Request a change... e.g. try a warmer colour" value={changeNote} onChange={e=>setChangeNote(e.target.value)}/>
          <Btn disabled={!changeNote.trim()||requesting||loading} onClick={handleChange} style={{background:gradOutfit,border:"none",color:"#fff",fontSize:13}}>{requesting?"Revising...":"Request this change →"}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── WATCH PARTY SCREEN ─────────────────────────────────────────────
function WatchPartyScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A";
  const [step,setStep]=useState("mood");
  const [mood,setMood]=useState("");
  const [loading,setLoading]=useState(false);
  const [suggestions,setSuggestions]=useState(null);
  const [picked,setPicked]=useState(null);
  const [partnerPicked,setPartnerPicked]=useState(null);
  const [platform,setPlatform]=useState("");
  const [countdown,setCountdown]=useState(null);
  const [reaction,setReaction]=useState("");
  const watchKey=`watch_${new Date().toISOString().split("T")[0].replace(/-/g,"")}`;
  const watchData=roomData?.[watchKey];

  useEffect(()=>{
    if(watchData?.suggestions) setSuggestions(watchData.suggestions);
    if(watchData?.[`pick_${pk}`]) setPartnerPicked(watchData[`pick_${pk}`]);
    if(watchData?.countdown) setCountdown(watchData.countdown);
    if(watchData?.step) setStep(watchData.step);
    if(watchData?.mood) setMood(watchData.mood);
  },[watchData]);

  // Get fresh suggestions — reshuffles for both users
  const getSuggestions=async(currentMood)=>{
    setLoading(true);
    const m=currentMood||mood;
    const allFilms=getWatchSuggestions(m);
    const history=(roomData?.watchHistory||[]).map(w=>w.title);
    // Exclude current suggestions to ensure new ones
    const currentTitles=(watchData?.suggestions||[]).map(f=>f.title);
    const fresh=allFilms.filter(f=>!history.includes(f.title)&&!currentTitles.includes(f.title));
    const pool=fresh.length>=3?fresh:allFilms.filter(f=>!currentTitles.includes(f.title));
    const finalPool=pool.length>=3?pool:allFilms;
    // Shuffle and pick 5
    const shuffled=[...finalPool].sort(()=>Math.random()-0.5).slice(0,5);
    await update({
      [`${watchKey}.suggestions`]:shuffled,
      [`${watchKey}.mood`]:m,
      [`${watchKey}.step`]:"suggestions",
      [`${watchKey}.pick_${userKey}`]:null,
      [`${watchKey}.pick_${pk}`]:null,
      [`${watchKey}.confirmed`]:null,
    });
    setSuggestions(shuffled);
    setPicked(null);
    setStep("suggestions");
    setLoading(false);
  };

  // Go back to mood selection — clears everything for both
  const backToMood=async()=>{
    await update({
      [`${watchKey}.step`]:"mood",
      [`${watchKey}.suggestions`]:null,
      [`${watchKey}.pick_${userKey}`]:null,
      [`${watchKey}.pick_${pk}`]:null,
      [`${watchKey}.confirmed`]:null,
    });
    setSuggestions(null);
    setPicked(null);
    setMood("");
    setStep("mood");
  };

  const pickFilm=async(film)=>{
    setPicked(film);
    await update({[`${watchKey}.pick_${userKey}`]:film});
    await addN("watch",`${me?.name} picked ${film.title}`);
    if(watchData?.[`pick_${pk}`]){
      const theirPick=watchData[`pick_${pk}`];
      if(theirPick.title===film.title){
        await update({[`${watchKey}.confirmed`]:film,[`${watchKey}.step`]:"platform"});
        setStep("platform");
      }
    }
  };

  const startCountdown=async()=>{
    const ts=Date.now()+10000;
    await update({[`${watchKey}.countdown`]:ts,[`${watchKey}.step`]:"countdown"});
    setCountdown(ts);
    setStep("countdown");
    await addN("watch",`${me?.name} started the countdown!`);
  };

  const sendReaction=async(emoji)=>{
    setReaction(emoji);
    await update({[`${watchKey}.reaction_${userKey}`]:emoji});
    const confirmed=watchData?.confirmed;
    if(confirmed){
      const entry={id:Date.now()+Math.random(),title:confirmed.title,mood,platform,watchedAt:Date.now(),[`reaction_${userKey}`]:emoji};
      await update({watchHistory:[entry,...(roomData?.watchHistory||[])].slice(0,20)});
    }
  };

  const CountdownTimer=()=>{
    const [remaining,setRemaining]=useState(null);
    useEffect(()=>{
      if(!countdown) return;
      const tick=()=>{ const r=Math.ceil((countdown-Date.now())/1000); setRemaining(r>0?r:0); };
      tick(); const interval=setInterval(tick,200);
      return ()=>clearInterval(interval);
    },[countdown]);
    return <div style={{fontSize:96,fontWeight:700,color:"#fff",fontFamily:PF,lineHeight:1,textShadow:"0 4px 24px rgba(0,0,0,0.3)"}}>{remaining>0?remaining:"▶"}</div>;
  };

  const watchColor="#E8A080";

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#1A0A05 0%,#2A1A08 40%,#FFF6F3 100%)",paddingBottom:100}}>
      <div style={{position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-80,left:"50%",transform:"translateX(-50%)",width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,rgba(232,140,80,0.20) 0%,transparent 70%)",filter:"blur(40px)",pointerEvents:"none"}}/>
        <div style={{padding:"22px 18px 0",position:"relative",zIndex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
            <button
              onClick={step==="suggestions"?backToMood:back}
              style={{background:"rgba(255,255,255,0.10)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:14,cursor:"pointer",padding:"9px 11px",lineHeight:1,display:"flex",alignItems:"center"}}
            >
              <ArrowLeft size={20} color="rgba(255,255,255,0.7)"/>
            </button>
            <div style={{flex:1}}>
              <h2 style={{fontFamily:PF,fontSize:22,fontWeight:400,fontStyle:"italic",color:"#FAF0E8"}}>Watch Party</h2>
              <div style={{fontSize:12,color:"rgba(250,240,232,0.5)",fontFamily:LT}}>Watch something together tonight</div>
            </div>
          </div>

          {step==="mood"&&(
            <div className="fade-rise">
              <div style={{textAlign:"center",marginBottom:32}}>
                <div style={{width:80,height:80,borderRadius:"50%",background:"linear-gradient(135deg,#E85D26,#C4522A)",display:"inline-flex",alignItems:"center",justifyContent:"center",boxShadow:"0 12px 40px rgba(232,93,38,0.4)",marginBottom:16}} className="hb-float">
                  <Star size={40} color="#FAF0E8" weight="fill"/>
                </div>
                <h3 style={{fontFamily:PF,fontSize:26,fontStyle:"italic",fontWeight:400,color:"#FAF0E8",marginBottom:8}}>What's the mood tonight?</h3>
                <p style={{fontSize:14,color:"rgba(250,240,232,0.55)",fontFamily:LT}}>Pick a vibe — we'll find the perfect film.</p>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:24}}>
                {WATCH_MOODS.map(m=>(
                  <button key={m.key} onClick={()=>setMood(m.key)} className="card-hover" style={{background:mood===m.key?"rgba(232,93,38,0.20)":"rgba(255,255,255,0.06)",border:`2px solid ${mood===m.key?"rgba(232,93,38,0.60)":"rgba(255,255,255,0.10)"}`,borderRadius:16,padding:"16px 12px",cursor:"pointer",fontFamily:LT,textAlign:"center",color:mood===m.key?watchColor:"rgba(255,255,255,0.6)",fontWeight:700,fontSize:13,transition:"all 0.2s"}}>
                    {m.label}
                  </button>
                ))}
              </div>
              {loading?<Spinner text="Finding films..."/>:<button onClick={()=>getSuggestions(mood)} disabled={!mood} className="card-hover" style={{display:"block",width:"100%",borderRadius:18,padding:"15px 24px",fontFamily:LT,fontSize:15,fontWeight:700,background:"linear-gradient(135deg,#E85D26,#C4522A)",color:"#FAF0E8",border:"none",cursor:mood?"pointer":"not-allowed",opacity:mood?1:0.45,boxShadow:"0 8px 24px rgba(232,93,38,0.40)"}}>Find films →</button>}
            </div>
          )}

          {step==="suggestions"&&suggestions&&(
            <div className="fade-rise">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                <div>
                  <h3 style={{fontFamily:PF,fontSize:22,fontStyle:"italic",fontWeight:400,color:"#FAF0E8",marginBottom:4}}>Pick your film</h3>
                  <p style={{fontSize:13,color:"rgba(250,240,232,0.5)",fontFamily:LT}}>Both pick — if you match, it's confirmed.</p>
                </div>
                {/* Reshuffle button */}
                <button
                  onClick={()=>getSuggestions(mood)}
                  disabled={loading}
                  style={{background:"rgba(232,93,38,0.20)",border:"1px solid rgba(232,93,38,0.40)",borderRadius:14,padding:"8px 14px",cursor:"pointer",fontFamily:LT,fontSize:12,fontWeight:700,color:watchColor,display:"flex",alignItems:"center",gap:6,flexShrink:0}}
                >
                  <Shuffle size={14} color={watchColor}/> Reshuffle
                </button>
              </div>
              {loading?<Spinner text="Finding new films..."/>:suggestions.map((film,i)=>(
                <button key={i} onClick={()=>pickFilm(film)} className="card-hover" style={{display:"block",width:"100%",background:picked?.title===film.title?"rgba(232,93,38,0.20)":partnerPicked?.title===film.title?"rgba(107,143,113,0.15)":"rgba(255,255,255,0.06)",border:`2px solid ${picked?.title===film.title?"rgba(232,93,38,0.60)":partnerPicked?.title===film.title?"rgba(107,143,113,0.40)":"rgba(255,255,255,0.10)"}`,borderRadius:20,padding:"18px 16px",fontFamily:LT,textAlign:"left",marginBottom:12,cursor:"pointer",transition:"all 0.2s"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:8}}>
                    <div style={{fontSize:16,fontWeight:700,color:"#FAF0E8",fontFamily:PF,fontStyle:"italic",flex:1}}>{film.title}</div>
                    <div style={{fontSize:11,color:"rgba(250,240,232,0.5)",flexShrink:0}}>{film.runtime}</div>
                  </div>
                  <div style={{fontSize:11,color:"rgba(250,240,232,0.5)",marginBottom:8,display:"flex",gap:8}}><span>{film.year}</span><span>·</span><span>{film.genre}</span></div>
                  <div style={{fontSize:13,color:"rgba(250,240,232,0.70)",lineHeight:1.55}}>{film.pitch}</div>
                  {picked?.title===film.title&&<div style={{fontSize:11,color:watchColor,fontWeight:700,marginTop:8,fontFamily:LT}}>✓ Your pick</div>}
                  {partnerPicked?.title===film.title&&picked?.title!==film.title&&<div style={{fontSize:11,color:C.sage,fontWeight:700,marginTop:8,fontFamily:LT}}>✓ {partner?.name}'s pick</div>}
                </button>
              ))}
              {picked&&!watchData?.confirmed&&<div style={{textAlign:"center",fontSize:13,color:"rgba(250,240,232,0.5)",fontFamily:LT,marginTop:8}}>Waiting for {partner?.name} to pick...</div>}
            </div>
          )}

          {step==="platform"&&(
            <div className="fade-rise">
              <div style={{marginBottom:20}}>
                <h3 style={{fontFamily:PF,fontSize:22,fontStyle:"italic",fontWeight:400,color:"#FAF0E8",marginBottom:6}}>Where are you watching?</h3>
                <p style={{fontSize:13,color:"rgba(250,240,232,0.5)",fontFamily:LT}}>Pick your platform — we'll send you straight there.</p>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
                {PLATFORMS.map(p=>(
                  <button key={p.key} onClick={()=>setPlatform(p.key)} className="card-hover" style={{background:platform===p.key?"rgba(232,93,38,0.20)":"rgba(255,255,255,0.06)",border:`2px solid ${platform===p.key?"rgba(232,93,38,0.60)":"rgba(255,255,255,0.10)"}`,borderRadius:16,padding:"14px 12px",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,color:platform===p.key?watchColor:"rgba(255,255,255,0.6)",transition:"all 0.2s",textAlign:"center"}}>
                    {p.label}
                  </button>
                ))}
              </div>
              {platform&&<a href={PLATFORMS.find(p=>p.key===platform)?.url} target="_blank" rel="noreferrer" style={{display:"block",textAlign:"center",fontSize:13,color:watchColor,fontFamily:LT,fontWeight:700,marginBottom:20,textDecoration:"none"}}>→ Open {PLATFORMS.find(p=>p.key===platform)?.label}</a>}
              <button onClick={startCountdown} disabled={!platform} className="card-hover" style={{display:"block",width:"100%",borderRadius:18,padding:"15px 24px",fontFamily:LT,fontSize:15,fontWeight:700,background:"linear-gradient(135deg,#E85D26,#C4522A)",color:"#FAF0E8",border:"none",cursor:platform?"pointer":"not-allowed",opacity:platform?1:0.45,boxShadow:"0 8px 24px rgba(232,93,38,0.40)"}}>Start the countdown →</button>
            </div>
          )}

          {step==="countdown"&&(
            <div className="fade-rise" style={{textAlign:"center",paddingTop:40}}>
              <p style={{fontSize:14,color:"rgba(250,240,232,0.55)",fontFamily:LT,marginBottom:32}}>Press play when you see ▶</p>
              <CountdownTimer/>
              <p style={{fontSize:16,color:"rgba(250,240,232,0.7)",fontFamily:PF,fontStyle:"italic",marginTop:32}}>Enjoy your film together ♥</p>
              <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:40,flexWrap:"wrap"}}>
                {["😱","😂","🥹","😍","🤯","😤"].map(emoji=>(
                  <button key={emoji} onClick={()=>sendReaction(emoji)} style={{fontSize:32,background:reaction===emoji?"rgba(255,255,255,0.20)":"rgba(255,255,255,0.08)",border:`2px solid ${reaction===emoji?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.10)"}`,borderRadius:"50%",width:56,height:56,cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",justifyContent:"center"}}>{emoji}</button>
                ))}
              </div>
              <button onClick={()=>setStep("done")} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"rgba(250,240,232,0.4)",fontFamily:LT,marginTop:32,display:"block",width:"100%"}}>Film's over →</button>
            </div>
          )}

          {step==="done"&&(
            <div className="fade-rise" style={{textAlign:"center",paddingTop:40}}>
              <div style={{fontSize:64,marginBottom:16}}>🎬</div>
              <h3 style={{fontFamily:PF,fontSize:26,fontStyle:"italic",fontWeight:400,color:"#FAF0E8",marginBottom:10}}>How was it?</h3>
              <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:32,flexWrap:"wrap"}}>
                {["😱","😂","🥹","😍","🤯","😤"].map(emoji=>(
                  <button key={emoji} onClick={()=>sendReaction(emoji)} style={{fontSize:32,background:reaction===emoji?"rgba(255,255,255,0.20)":"rgba(255,255,255,0.08)",border:`2px solid ${reaction===emoji?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.10)"}`,borderRadius:"50%",width:56,height:56,cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",justifyContent:"center"}}>{emoji}</button>
                ))}
              </div>
              <button onClick={back} style={{background:"rgba(255,255,255,0.10)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:18,padding:"14px 28px",cursor:"pointer",fontFamily:LT,fontSize:14,fontWeight:700,color:"rgba(250,240,232,0.8)"}}>Back to Date tab</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DATE TAB ───────────────────────────────────────────────────────
function DateTab({me,partner,userKey,roomData,update,addN,go}){
  const savedPlans=roomData?.datePlans||[];
  const watchHistory=roomData?.watchHistory||[];
  const outfitCards=roomData?.outfitCards||[];
  const pk=userKey==="A"?"B":"A";
  const pendingOutfits=outfitCards.filter(c=>c.for===userKey&&!c.seen);
  const upcomingDates=savedPlans.filter(p=>!p.done&&p.scheduledDate);

  const gradDate="linear-gradient(180deg,#FFE0C0 0%,#FFF5EE 50%,#FFF6F3 100%)";
  const accentColor="#E85D26";
  const accentBd="rgba(232,93,38,0.20)";
  const gradCard="linear-gradient(135deg,#FF8C42,#E85D26)";

  const sections=[
    {Icon:CalendarHeart,title:"Date Planner",desc:upcomingDates.length>0?`${upcomingDates.length} date${upcomingDates.length>1?"s":""} coming up`:`${savedPlans.length} dates planned together`,key:"dateplanner",grad:gradCard,badge:0},
    {Icon:Sparkle,title:"Outfit Planner",desc:pendingOutfits.length>0?`${pendingOutfits.length} suggestion from ${partner?.name}`:"Dress for each other",key:"outfitplanner",grad:"linear-gradient(135deg,#C084FC,#8B6BAD)",badge:pendingOutfits.length},
    {Icon:Star,title:"Watch Party",desc:watchHistory.length>0?`${watchHistory.length} films watched together`:"Plan a movie night",key:"watchparty",grad:"linear-gradient(135deg,#E85D26,#C4522A)"},
  ];

  return (
    <div style={{minHeight:"100vh",background:gradDate,paddingBottom:100}}>
      <div style={{position:"relative",overflow:"hidden"}}>
        <GradOrb size={300} top={-60} color1="rgba(255,140,66,0.22)" color2="rgba(255,200,140,0.08)"/>
        <div style={{padding:"32px 22px 24px",position:"relative",zIndex:1,textAlign:"center"}} className="fade-rise">
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:60,height:60,borderRadius:"50%",background:gradCard,boxShadow:SHADOWS.lg,marginBottom:16}} className="hb-float">
            <CalendarHeart size={30} color="#fff" weight="fill"/>
          </div>
          <h2 style={{fontFamily:PF,fontSize:30,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:8}}>Date Night</h2>
          <p style={{fontSize:14,color:C.muted,fontFamily:LT}}>Plan, dress, and watch together.</p>
        </div>

        {/* Upcoming date banner */}
        {upcomingDates.length>0&&(
          <div style={{padding:"0 18px 16px",position:"relative",zIndex:1}} className="s1">
            <div style={{background:gradCard,borderRadius:20,padding:"16px 18px",boxShadow:SHADOWS.lg,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:14,background:"rgba(255,255,255,0.20)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><CalendarHeart size={22} color="#fff" weight="fill"/></div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontFamily:LT,marginBottom:2}}>Upcoming date</div>
                <div style={{fontSize:15,fontWeight:700,color:"#fff",fontFamily:LT}}>{upcomingDates[0].title}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontFamily:LT}}>📅 {new Date(upcomingDates[0].scheduledDate).toLocaleDateString("en",{month:"long",day:"numeric"})}</div>
              </div>
            </div>
          </div>
        )}

        <div style={{padding:"0 18px",position:"relative",zIndex:1,display:"flex",flexDirection:"column",gap:12}}>
          {sections.map((s,i)=>(
            <button key={s.key} onClick={()=>go(s.key)} className={`s${i+1}`} style={{display:"block",width:"100%",background:"rgba(255,255,255,0.95)",border:`1px solid ${accentBd}`,borderRadius:20,padding:"18px 18px",textAlign:"left",cursor:"pointer",fontFamily:LT,boxShadow:SHADOWS.md,transition:"all 0.22s cubic-bezier(0.22,1,0.36,1)"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=SHADOWS.lg;}}
              onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=SHADOWS.md;}}
              onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
              onMouseUp={e=>e.currentTarget.style.transform="none"}
            >
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <div style={{width:50,height:50,borderRadius:16,background:s.grad,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SHADOWS.sm}}><s.Icon size={24} color="#fff" weight="fill"/></div>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:3}}>{s.title}</div>
                  <div style={{fontSize:12,color:C.muted}}>{s.desc}</div>
                </div>
                {s.badge>0&&<div style={{background:C.gradRose,color:"#fff",borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0,boxShadow:SHADOWS.sm}}>{s.badge}</div>}
                <CaretRight size={20} color={C.muted}/>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
function RelationshipCheckIn({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A";
  const weekKey=`checkin_${Math.floor(Date.now()/(7*86400000))}`;
  const checkin=roomData?.[weekKey];
  const set=getWeeklyCheckIn();
  const myRatings=checkin?.ratings?.[userKey]||{};
  const theirRatings=checkin?.ratings?.[pk]||{};
  const myDone=set.questions.every(q=>myRatings[q.id]!==undefined);
  const theirDone=set.questions.every(q=>theirRatings[q.id]!==undefined);
  const both=myDone&&theirDone;
  const [reflection,setReflection]=useState(checkin?.reflections?.[userKey]||"");
  const [submitted,setSubmitted]=useState(!!checkin?.reflections?.[userKey]);

  const rate=async(qid,val)=>{
    if(myRatings[qid]!==undefined) return;
    await update({[`${weekKey}.ratings.${userKey}.${qid}`]:val});
  };

  const submitReflection=async()=>{
    if(!reflection.trim()) return;
    await update({[`${weekKey}.reflections.${userKey}`]:reflection.trim()});
    await addN("checkin",`${me?.name} completed this week's check-in`);
    setSubmitted(true);
  };

  const avgScore=(ratings)=>{
    const vals=set.questions.map(q=>ratings[q.id]).filter(Boolean);
    if(!vals.length) return null;
    return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*20);
  };

  const myScore=myDone?avgScore(myRatings):null;
  const theirScore=theirDone?avgScore(theirRatings):null;

  return (
    <ScreenWrap gradient="linear-gradient(180deg,#FFE8D8 0%,#FFF5EE 50%,#FFF6F3 100%)">
      <div style={{position:"relative",overflow:"hidden"}}>
        <GradOrb size={280} top={-50} color1="rgba(212,146,42,0.20)" color2="rgba(240,200,120,0.08)"/>
        <div style={{padding:"22px 18px 48px",position:"relative",zIndex:1}}>
          <Hdr title="Weekly Check-In" sub="How are we doing this week?" back={back} right={<div style={{width:40,height:40,borderRadius:14,background:C.gradGold,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.md}}><Heart size={20} color="#fff" weight="fill"/></div>}/>

          {/* Scores if both done */}
          {both&&<Card elevated gradient="linear-gradient(135deg,rgba(212,146,42,0.10),rgba(255,220,140,0.08))" style={{marginBottom:20,textAlign:"center",border:`1px solid ${C.goldBd}`}}>
            <div style={{fontSize:11,fontWeight:700,color:C.gold,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:16,fontFamily:LT}}>This week's pulse</div>
            <div style={{display:"flex",justifyContent:"center",gap:32}}>
              {[[me?.name,myScore,C.rose,C.roseSoft],[partner?.name,theirScore,C.gold,C.goldSoft]].map(([name,score,color,soft])=>(
                <div key={name} style={{textAlign:"center"}}>
                  <div style={{fontSize:40,fontWeight:700,color,fontFamily:PF,lineHeight:1}}>{score}%</div>
                  <div style={{fontSize:11,color:C.muted,fontFamily:LT,marginTop:4}}>{name}</div>
                </div>
              ))}
            </div>
            {myScore&&theirScore&&<div style={{fontSize:13,color:C.muted,fontFamily:LT,marginTop:14,lineHeight:1.6}}>
              {Math.abs(myScore-theirScore)<=10?"You're in a similar place this week ♥":"You're feeling this week a bit differently — worth talking about"}
            </div>}
          </Card>}

          {/* Questions */}
          <div style={{marginBottom:20}}>
            {set.questions.map((q,i)=>{
              const myVal=myRatings[q.id];
              const theirVal=theirRatings[q.id];
              const answered=myVal!==undefined;
              return (
                <Card key={q.id} elevated style={{marginBottom:12}} className={`s${Math.min(i+1,6)}`}>
                  <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:LT,marginBottom:8,lineHeight:1.5}}>{q.q}</div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:8,fontFamily:LT}}>
                    <span>{q.low}</span><span>{q.high}</span>
                  </div>
                  <div style={{display:"flex",gap:6,marginBottom:both?10:0}}>
                    {[1,2,3,4,5].map(v=>(
                      <button key={v} onClick={()=>!answered&&rate(q.id,v)} style={{
                        flex:1,padding:"10px 0",borderRadius:12,border:"none",
                        background:myVal===v?C.gradRose:"rgba(255,255,255,0.85)",
                        cursor:answered?"default":"pointer",
                        fontFamily:LT,fontSize:13,fontWeight:myVal===v?700:400,
                        color:myVal===v?"#fff":C.text,
                        transition:"all 0.15s",
                        boxShadow:myVal===v?SHADOWS.md:SHADOWS.sm,
                      }}>{v}</button>
                    ))}
                  </div>
                  {both&&myVal&&theirVal&&(
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
                      <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:C.roseSoft,color:C.rose,border:`1px solid ${C.roseBd}`,fontFamily:LT}}>{me?.name}: {myVal}</span>
                      <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:C.goldSoft,color:C.gold,border:`1px solid ${C.goldBd}`,fontFamily:LT}}>{partner?.name}: {theirVal}</span>
                      {Math.abs(myVal-theirVal)>=2&&<span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(212,82,106,0.08)",color:C.rose,border:`1px solid ${C.roseBd}`,fontFamily:LT}}>Worth a chat</span>}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Reflection question */}
          {myDone&&(
            <Card elevated style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:700,color:C.muted,fontFamily:LT,marginBottom:12,lineHeight:1.55,fontStyle:"italic"}}>"{set.reflection}"</div>
              {!submitted?(
                <div>
                  <Field textarea value={reflection} onChange={e=>setReflection(e.target.value)} placeholder="Be honest — this is just for us..."/>
                  <Btn variant="gold" disabled={!reflection.trim()} onClick={submitReflection}>Submit my reflection</Btn>
                </div>
              ):(
                <div>
                  <div style={{fontSize:14,color:C.text,fontFamily:LT,lineHeight:1.65,marginBottom:both&&checkin?.reflections?.[pk]?14:0}}>{reflection}</div>
                  {both&&checkin?.reflections?.[pk]&&(
                    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:14}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.gold,fontFamily:LT,marginBottom:8}}>{partner?.name} said:</div>
                      <div style={{fontSize:14,color:C.text,fontFamily:LT,lineHeight:1.65}}>{checkin.reflections[pk]}</div>
                    </div>
                  )}
                  {!theirDone&&<div style={{fontSize:12,color:C.muted,fontFamily:LT,marginTop:10,display:"flex",alignItems:"center",gap:5}}><Sparkle size={12} color={C.muted}/>Waiting for {partner?.name} to complete theirs...</div>}
                </div>
              )}
            </Card>
          )}

          {!myDone&&<p style={{textAlign:"center",fontSize:13,color:C.muted,fontFamily:LT}}>Rate all five to unlock the reflection question.</p>}

        </div>
      </div>
    </ScreenWrap>
  );
}
// ── GLASSMORPHISM TAB BAR ──────────────────────────────────────────────────
function TabBar({tab,setTab,unread,notesBadge}){
  const tabs=[
  {key:"home",Icon:HouseSimple,label:"Home"},
  {key:"play",Icon:GameController,label:"Play"},
  {key:"dates",Icon:CalendarHeart,label:"Dates"},
  {key:"us",Icon:Leaf,label:"Us",badge:notesBadge},
  {key:"profile",Icon:UserCircle,label:"Profile"},
];
  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,246,243,0.78)",backdropFilter:"blur(28px)",WebkitBackdropFilter:"blur(28px)",borderTop:"1px solid rgba(255,255,255,0.72)",boxShadow:"0 -8px 40px rgba(212,82,106,0.09),0 -1px 0 rgba(255,255,255,0.6)",padding:"10px 24px 28px",display:"flex",justifyContent:"space-around",zIndex:20}}>
      {tabs.map(t=>(
        <button key={t.key} onClick={()=>setTab(t.key)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",padding:"6px 12px",borderRadius:18,position:"relative",transition:"all 0.22s cubic-bezier(0.22,1,0.36,1)",transform:tab===t.key?"translateY(-2px)":"none"}}>
          {t.badge>0&&<div style={{position:"absolute",top:3,right:8,background:C.gradRose,color:"#fff",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,boxShadow:SHADOWS.sm}}>{t.badge}</div>}
          <div style={{width:46,height:30,borderRadius:15,background:tab===t.key?C.gradRose:"transparent",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:tab===t.key?SHADOWS.md:"none",transition:"all 0.25s"}}>
            <t.Icon size={20} color={tab===t.key?"#fff":C.muted} weight={tab===t.key?"fill":"regular"}/>
          </div>
          <span style={{fontSize:10,fontWeight:700,color:tab===t.key?C.rose:C.muted,letterSpacing:"0.04em",fontFamily:LT,transition:"color 0.25s"}}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── GAME SCREENS ───────────────────────────────────────────────────────────
function QAScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A";
  const fk=`qa_${todayKey()}`;
  const qa=roomData?.[fk];
  const [ans,setAns]=useState(qa?.answers?.[userKey]||"");
  const [guess,setGuess]=useState(qa?.guesses?.[userKey]||"");

  const phase=!qa?.question?"gen":!qa?.answers?.[userKey]?"answer":!qa?.guesses?.[userKey]?"guess":"result";

  const generate=async()=>{
    const q=getDailyQuestion();
    await update({[fk]:{question:q,answers:{},guesses:{},date:todayStr()}});
  };

  const QCard=()=><Card elevated gradient="linear-gradient(135deg,rgba(255,228,220,0.99),rgba(255,248,244,0.96))" style={{marginBottom:22}}><div style={{fontSize:11,fontWeight:700,color:C.rose,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT,display:"flex",alignItems:"center",gap:6}}><ChatTeardrop size={14} color={C.rose} weight="fill"/>Today's question</div><p style={{fontFamily:PF,fontSize:20,fontStyle:"italic",lineHeight:1.65,color:C.text,margin:0}}>"{qa.question}"</p></Card>;

  return (
    <ScreenWrap gradient={C.gradHome}><div style={{position:"relative",overflow:"hidden"}}><GradOrb size={280} top={-50}/>
    <div style={{padding:"22px 18px 48px",position:"relative",zIndex:1}}>
      <Hdr title="Daily Question" sub={new Date().toLocaleDateString("en",{weekday:"long",month:"long",day:"numeric"})} back={back} right={<div style={{width:40,height:40,borderRadius:14,background:C.gradRose,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.md}}><ChatTeardrop size={20} color="#fff" weight="fill"/></div>}/>
      {phase==="gen"&&<div className="fade-rise" style={{textAlign:"center",paddingTop:20}}>
        <div style={{marginBottom:24,position:"relative",display:"inline-block"}}>
          <div style={{position:"absolute",inset:-16,borderRadius:"50%",background:"rgba(212,82,106,0.12)",animation:"hbRing1 3s ease-out infinite"}}/>
          <div style={{width:100,height:100,borderRadius:"50%",background:C.gradRose,display:"inline-flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.xl}}><ChatTeardrop size={48} color="#fff" weight="fill"/></div>
        </div>
        <h3 style={{fontFamily:PF,fontSize:24,fontStyle:"italic",fontWeight:400,marginBottom:10,color:C.text}}>Today's question awaits</h3>
        <p style={{color:C.muted,fontSize:15,lineHeight:1.75,marginBottom:36,fontFamily:LT}}>A fresh question, just for you two.</p>
        <Btn onClick={generate}>Get today's question</Btn>
      </div>}
      {phase==="answer"&&<div className="fade-rise"><QCard/><Field textarea label={`Your answer, ${me?.name}`} value={ans} onChange={e=>setAns(e.target.value)} placeholder="Be honest — your partner will try to guess this..."/><Btn disabled={!ans.trim()} onClick={async()=>{if(!ans.trim())return;await update({[`${fk}.answers.${userKey}`]:ans.trim()});await addN("qa",`${me?.name} answered today's question`);}}>Lock in my answer →</Btn></div>}
      {phase==="guess"&&<div className="fade-rise"><QCard/><Card style={{marginBottom:18,background:"rgba(212,82,106,0.06)",border:`1px solid ${C.roseBd}`}}><div style={{fontSize:11,fontWeight:700,color:C.rose,marginBottom:8,fontFamily:LT,display:"flex",alignItems:"center",gap:5}}><CheckCircle size={14} color={C.rose} weight="fill"/>Your answer is locked in</div><div style={{fontSize:15,color:C.text,fontFamily:LT}}>{qa?.answers?.[userKey]}</div></Card>{!qa?.answers?.[pk]&&<Card style={{marginBottom:18,background:"rgba(212,146,42,0.06)",border:`1px solid ${C.goldBd}`}}><div style={{fontSize:13,color:C.gold,fontFamily:LT,display:"flex",alignItems:"center",gap:6}}><Sparkle size={14} color={C.gold}/>{partner?.name} hasn't answered yet — but you can still guess!</div></Card>}<Field textarea label={`What do you think ${partner?.name} said?`} value={guess} onChange={e=>setGuess(e.target.value)} placeholder={`Guess ${partner?.name}'s answer...`}/><Btn disabled={!guess.trim()} onClick={async()=>{if(!guess.trim())return;await update({[`${fk}.guesses.${userKey}`]:guess.trim()});await addN("qa",`${me?.name} guessed your answer`);}}>Submit my guess →</Btn></div>}
      {phase==="result"&&<div className="fade-rise"><Card elevated style={{marginBottom:22}}><p style={{fontFamily:PF,fontSize:18,fontStyle:"italic",lineHeight:1.65,color:C.text,margin:0}}>"{qa.question}"</p></Card>{[[userKey,me?.name,C.rose,"rgba(212,82,106,0.08)",C.roseBd,pk],[pk,partner?.name,C.gold,"rgba(212,146,42,0.08)",C.goldBd,userKey]].map(([key,name,color,soft,bd,gk])=><Card key={key} style={{background:soft,border:`1px solid ${bd}`,marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>{name}'s answers</div><div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,marginBottom:4,fontFamily:LT}}>Their answer:</div><div style={{fontSize:15,color:C.text,fontFamily:LT,lineHeight:1.5}}>{qa?.answers?.[key]||<i style={{color:C.muted}}>Not answered yet</i>}</div></div><div><div style={{fontSize:11,color:C.muted,marginBottom:4,fontFamily:LT}}>{key===userKey?`${partner?.name}'s guess:`:`${me?.name}'s guess:`}</div><div style={{fontSize:15,color:C.text,fontFamily:LT,lineHeight:1.5}}>{qa?.guesses?.[gk]||<i style={{color:C.muted}}>Not guessed yet</i>}</div></div></Card>)}<Btn variant="ghost" onClick={back}>← Back</Btn></div>}
    </div></div></ScreenWrap>
  );
}

function WYRScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A";
  const fk=`wyr_${todayKey()}`;
  const wyr=roomData?.[fk];

  const generate=async()=>{
    const pair=getDailyWYR();
    await update({[fk]:{a:pair.a,b:pair.b,choices:{}}});
  };

  const choose=async opt=>{
    if(wyr?.choices?.[userKey]) return;
    await update({[`${fk}.choices.${userKey}`]:opt});
    await addN("wyr",`${me?.name} made their choice`);
  };

  const mine=wyr?.choices?.[userKey],theirs=wyr?.choices?.[pk],both=mine&&theirs,agree=both&&mine===theirs;
  const opts=[{key:"a",text:wyr?.a,color:C.rose,soft:"rgba(212,82,106,0.08)",bd:C.roseBd,label:"Option A",grad:C.gradRose},{key:"b",text:wyr?.b,color:C.gold,soft:"rgba(212,146,42,0.08)",bd:C.goldBd,label:"Option B",grad:C.gradGold}];

  return (
    <ScreenWrap gradient={C.gradPlay}><div style={{position:"relative",overflow:"hidden"}}><GradOrb size={280} top={-50} color1="rgba(200,100,160,0.22)" color2="rgba(220,150,200,0.08)"/>
    <div style={{padding:"22px 18px 48px",position:"relative",zIndex:1}}>
      <Hdr title="Would You Rather" sub="Make choices, discover each other" back={back} right={<div style={{width:40,height:40,borderRadius:14,background:C.gradGold,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.md}}><Scales size={20} color="#fff" weight="fill"/></div>}/>
      {!wyr?.a?(<div style={{textAlign:"center",paddingTop:20}} className="fade-rise">
        <div style={{marginBottom:24,position:"relative",display:"inline-block"}}>
          <div style={{position:"absolute",inset:-16,borderRadius:"50%",background:"rgba(212,146,42,0.12)",animation:"hbRing1 3s ease-out infinite"}}/>
          <div style={{width:100,height:100,borderRadius:"50%",background:C.gradGold,display:"inline-flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.xl}}><Scales size={48} color="#fff" weight="fill"/></div>
        </div>
        <p style={{color:C.muted,fontSize:15,lineHeight:1.75,marginBottom:36,fontFamily:LT}}>No obvious right answer — just interesting choices.</p>
        <Btn variant="gold" onClick={generate}>Get today's dilemma</Btn>
      </div>):(<div className="fade-rise">
        <p style={{fontFamily:PF,fontSize:20,fontStyle:"italic",color:C.muted,textAlign:"center",marginBottom:24}}>Would you rather...</p>
        {opts.map(opt=>{ const chosen=mine===opt.key,pp=theirs===opt.key; return <button key={opt.key} onClick={()=>!mine&&choose(opt.key)} className="card-hover" style={{display:"block",width:"100%",background:chosen?opt.soft:"rgba(255,255,255,0.93)",border:`2px solid ${chosen?opt.color:"rgba(255,255,255,0.92)"}`,borderRadius:22,padding:22,textAlign:"left",cursor:mine?"default":"pointer",fontFamily:LT,marginBottom:14,boxShadow:chosen?SHADOWS.lg:SHADOWS.md}}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}><div style={{width:32,height:32,borderRadius:10,background:opt.grad,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SHADOWS.sm,fontSize:10,fontWeight:700,color:"#fff",fontFamily:LT}}>{opt.label.split(" ")[1]}</div><div style={{fontSize:11,fontWeight:700,color:opt.color,textTransform:"uppercase",letterSpacing:"0.09em"}}>{opt.label}</div></div><div style={{fontFamily:PF,fontSize:19,fontStyle:"italic",color:C.text,lineHeight:1.55}}>{opt.text}</div>{both&&<div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap"}}>{chosen&&<span style={{fontSize:11,fontWeight:700,color:opt.color,background:opt.soft,padding:"4px 10px",borderRadius:20,border:`1px solid ${opt.bd}`,fontFamily:LT}}>✓ {me?.name}</span>}{pp&&<span style={{fontSize:11,fontWeight:700,color:opt.color,background:opt.soft,padding:"4px 10px",borderRadius:20,border:`1px solid ${opt.bd}`,fontFamily:LT}}>✓ {partner?.name}</span>}</div>}</button>; })}
        {!mine&&<p style={{textAlign:"center",fontSize:13,color:C.muted,fontFamily:LT}}>Tap to choose — no changing your mind!</p>}
        {mine&&!theirs&&<Card style={{background:"rgba(212,146,42,0.06)",border:`1px solid ${C.goldBd}`,textAlign:"center"}}><div style={{fontSize:13,color:C.gold,fontFamily:LT,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Sparkle size={14} color={C.gold}/>Waiting for {partner?.name}...</div></Card>}
        {both&&<div style={{marginTop:8}}><Card elevated gradient={agree?"linear-gradient(135deg,rgba(107,143,113,0.10),rgba(144,196,152,0.08))":"linear-gradient(135deg,rgba(212,82,106,0.06),rgba(255,200,180,0.08))"} style={{textAlign:"center",marginBottom:14,border:`1px solid ${agree?C.sageBd:C.roseBd}`}}><div style={{fontSize:32,marginBottom:8}}>{agree?"🎉":"✨"}</div><div style={{fontWeight:700,color:agree?C.sage:C.rose,fontSize:14,fontFamily:LT}}>{agree?"You both chose the same!":"You chose differently — great conversation starter!"}</div></Card><Btn variant="outline" onClick={()=>update({[fk]:{a:"",b:"",choices:{}}})}>New dilemma →</Btn></div>}
      </div>)}
    </div></div></ScreenWrap>
  );
}

function NHIE({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A";
  const fk=`ninh_${todayKey()}`;
  const ninh=roomData?.[fk];

  const generate=async()=>{
    const statements=getNHIESet(false).map(t=>({text:t,A:null,B:null}));
    await update({[fk]:{statements}});
  };

  const vote=async(i,choice)=>{
    if(!ninh?.statements||ninh.statements[i][userKey]) return;
    const stmts=[...ninh.statements];
    stmts[i]={...stmts[i],[userKey]:choice};
    await update({[`${fk}.statements`]:stmts});
    await addN("nhie",`${me?.name} voted on Never Have I Ever`);
  };

  return (
    <ScreenWrap gradient={C.gradUs}><div style={{position:"relative",overflow:"hidden"}}><GradOrb size={280} top={-50} color1="rgba(107,143,113,0.22)" color2="rgba(144,196,152,0.08)"/>
    <div style={{padding:"22px 18px 48px",position:"relative",zIndex:1}}>
      <Hdr title="Never Have I Ever" sub="Find out who's done what" back={back} right={<div style={{width:40,height:40,borderRadius:14,background:C.gradSage,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.md}}><HandPointing size={20} color="#fff" weight="fill"/></div>}/>
      {!ninh?.statements?(<div style={{textAlign:"center",paddingTop:20}} className="fade-rise">
        <div style={{marginBottom:24,display:"inline-flex",alignItems:"center",justifyContent:"center",width:100,height:100,borderRadius:"50%",background:C.gradSage,boxShadow:SHADOWS.xl}}><HandPointing size={48} color="#fff" weight="fill"/></div>
        <p style={{color:C.muted,fontSize:15,lineHeight:1.75,marginBottom:36,fontFamily:LT}}>5 statements. Have or never?</p>
        <Btn variant="sage" onClick={generate}>Get statements</Btn>
      </div>):(
      <div className="fade-rise">
        {ninh.statements.map((s,i)=><Card key={i} elevated style={{marginBottom:12}} className={`s${Math.min(i+1,6)}`}><div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8,fontFamily:LT,display:"flex",alignItems:"center",gap:5}}><Star size={12} color={C.muted} weight="fill"/>Statement {i+1}</div><p style={{fontSize:14,color:C.text,marginBottom:14,lineHeight:1.55,fontFamily:LT}}>{s.text}</p>{!s[userKey]?(<div style={{display:"flex",gap:10}}><button onClick={()=>vote(i,"have")} className="card-hover" style={{flex:1,padding:"11px",borderRadius:14,border:"none",background:"linear-gradient(135deg,rgba(107,143,113,0.15),rgba(144,196,152,0.10))",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,color:C.sage,boxShadow:SHADOWS.sm}}>I have</button><button onClick={()=>vote(i,"never")} className="card-hover" style={{flex:1,padding:"11px",borderRadius:14,border:"none",background:"rgba(212,82,106,0.08)",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,color:C.rose,boxShadow:SHADOWS.sm}}>Never</button></div>):(<div style={{display:"flex",flexWrap:"wrap",gap:8}}>{[[userKey,me?.name],[pk,partner?.name]].map(([key,name])=>s[key]?<span key={key} style={{fontSize:11,fontWeight:700,padding:"5px 12px",borderRadius:20,background:s[key]==="have"?C.sageSoft:C.roseSoft,color:s[key]==="have"?C.sage:C.rose,border:`1px solid ${s[key]==="have"?C.sageBd:C.roseBd}`,fontFamily:LT}}>{name}: {s[key]==="have"?"Have":"Never"}</span>:<span key={key} style={{fontSize:11,color:C.muted,fontStyle:"italic",fontFamily:LT}}>⏳ {name}...</span>)}</div>)}</Card>)}
        {ninh.statements.every(s=>s.A&&s.B)&&<Btn variant="outline" style={{marginTop:6}} onClick={()=>update({[fk]:null})}>New round →</Btn>}
      </div>)}
    </div></div></ScreenWrap>
  );
}

function TruthOrDare({me,partner,userKey,roomData,update,addN,back}){
  const tord=roomData?.tord;
  const [spicy,setSpicy]=useState(false);

  const pick=async type=>{
    const content=type==="truth"?getTruthQuestion(spicy):getDare(spicy);
    await update({tord:{type,content,done:false,spicy}});
    await addN("tord",`${me?.name} picked a ${type}${spicy?" 🔥":""}`);
  };

  return (
    <ScreenWrap gradient={spicy?"linear-gradient(180deg,#2A0F08 0%,#3D1A12 30%,#FFF6F3 100%)":C.gradPlay}><div style={{position:"relative",overflow:"hidden"}}>{!spicy&&<GradOrb size={280} top={-50} color1="rgba(139,107,173,0.22)" color2="rgba(180,150,220,0.08)"/>}
    <div style={{padding:"22px 18px 48px",position:"relative",zIndex:1}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:26}}>
        <BackBtn onClick={back}/>
        <div style={{flex:1}}><h2 style={{fontFamily:PF,fontSize:22,fontWeight:400,fontStyle:"italic",color:spicy?"#FAF0E8":C.text}}>Truth or Dare</h2></div>
        <button onClick={()=>setSpicy(s=>!s)} style={{background:spicy?"rgba(255,160,80,0.18)":"rgba(255,255,255,0.75)",border:`1px solid ${spicy?"rgba(255,160,80,0.35)":C.border}`,borderRadius:20,padding:"7px 14px",cursor:"pointer",fontFamily:LT,fontSize:12,fontWeight:700,color:spicy?"#E8A080":C.muted,backdropFilter:"blur(8px)",display:"flex",alignItems:"center",gap:6,transition:"all 0.25s"}}><Fire size={14} color={spicy?"#E8A080":C.muted} weight={spicy?"fill":"regular"}/>{spicy?"Spicy on":"Spicy"}</button>
        <div style={{width:40,height:40,borderRadius:14,background:spicy?"linear-gradient(135deg,#2A0F08,#8B2A1A)":"linear-gradient(135deg,#B0A0E0,#8B6BAD)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.md}}><MaskHappy size={20} color="#fff" weight="fill"/></div>
      </div>
      {!tord?.type?(<div className="fade-rise"><div style={{textAlign:"center",paddingTop:8,marginBottom:28}}><div style={{marginBottom:14,display:"inline-flex",alignItems:"center",justifyContent:"center",width:80,height:80,borderRadius:"50%",background:spicy?"linear-gradient(135deg,#2A0F08,#8B2A1A)":"linear-gradient(135deg,#B0A0E0,#8B6BAD)",boxShadow:SHADOWS.xl}} className="hb-float"><MaskHappy size={40} color="#fff" weight="fill"/></div><p style={{color:spicy?"rgba(250,240,232,0.6)":C.muted,fontSize:15,lineHeight:1.7,fontFamily:LT}}>What will it be?</p></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <button onClick={()=>pick("truth")} className="card-hover" style={{background:spicy?"rgba(250,240,232,0.08)":"rgba(212,82,106,0.06)",border:`2px solid ${spicy?"rgba(250,240,232,0.15)":C.roseBd}`,borderRadius:22,padding:"28px 14px",cursor:"pointer",fontFamily:LT,textAlign:"center",boxShadow:SHADOWS.md}}><div style={{width:48,height:48,borderRadius:16,background:spicy?"rgba(250,240,232,0.15)":C.gradRose,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",boxShadow:SHADOWS.sm}}><ChatTeardrop size={24} color={spicy?"#FAF0E8":"#fff"} weight="fill"/></div><div style={{fontSize:17,fontWeight:700,color:spicy?"#E8C0A0":C.rose,fontFamily:PF,fontStyle:"italic"}}>Truth</div></button>
        <button onClick={()=>pick("dare")} className="card-hover" style={{background:spicy?"rgba(250,240,232,0.08)":"rgba(212,146,42,0.06)",border:`2px solid ${spicy?"rgba(250,240,232,0.15)":C.goldBd}`,borderRadius:22,padding:"28px 14px",cursor:"pointer",fontFamily:LT,textAlign:"center",boxShadow:SHADOWS.md}}><div style={{width:48,height:48,borderRadius:16,background:spicy?"rgba(250,240,232,0.15)":C.gradGold,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",boxShadow:SHADOWS.sm}}><Fire size={24} color={spicy?"#FAF0E8":"#fff"} weight="fill"/></div><div style={{fontSize:17,fontWeight:700,color:spicy?"#E8C0A0":C.gold,fontFamily:PF,fontStyle:"italic"}}>Dare</div></button>
      </div></div>):(
      <div className="fade-rise"><Card elevated layer gradient={tord.spicy?"linear-gradient(145deg,rgba(42,15,8,0.96),rgba(80,25,15,0.91))":tord.type==="truth"?"linear-gradient(135deg,rgba(212,82,106,0.08),rgba(255,200,180,0.12))":"linear-gradient(135deg,rgba(212,146,42,0.08),rgba(255,220,140,0.12))"} style={{marginBottom:20,textAlign:"center"}}><div style={{fontSize:11,fontWeight:700,color:tord.spicy?"#E8A080":tord.type==="truth"?C.rose:C.gold,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:16,fontFamily:LT,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>{tord.type==="truth"?<ChatTeardrop size={14} color={tord.spicy?"#E8A080":C.rose} weight="fill"/>:<Fire size={14} color={tord.spicy?"#E8A080":C.gold} weight="fill"/>}{tord.type==="truth"?"Truth":"Dare"}{tord.spicy?" — Spicy":""}</div><p style={{fontFamily:PF,fontSize:19,fontStyle:"italic",color:tord.spicy?"#FAF0E8":C.text,lineHeight:1.65,margin:0}}>{tord.content}</p></Card>
      {!tord.done?(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Btn onClick={async()=>await update({tord:{...tord,done:true}})}>Done!</Btn><Btn variant="ghost" onClick={async()=>await update({tord:null})}>Skip →</Btn></div>):(<div><Card gradient="linear-gradient(135deg,rgba(107,143,113,0.10),rgba(144,196,152,0.08))" style={{textAlign:"center",marginBottom:16,border:`1px solid ${C.sageBd}`}}><CheckCircle size={32} color={C.sage} weight="fill" style={{marginBottom:8}}/><div style={{fontWeight:700,color:C.sage,fontFamily:LT}}>Challenge completed!</div></Card><Btn variant="outline" onClick={async()=>await update({tord:null})}>Pick another →</Btn></div>)}
      </div>)}
    </div></div></ScreenWrap>
  );
}

function CompatScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A";
  const fk=`compat_${todayKey()}`;
  const compat=roomData?.[fk];

  const generate=async()=>{
    const questions=getCompatSet();
    await update({[fk]:{questions,ratings:{A:{},B:{}}}});
  };

  const rate=async(i,val)=>{
    if(compat?.ratings?.[userKey]?.[i]!==undefined) return;
    await update({[`${fk}.ratings.${userKey}.${i}`]:val});
    await addN("compat",`${me?.name} rated question ${i+1}`);
  };

  const myR=compat?.ratings?.[userKey]||{},theirR=compat?.ratings?.[pk]||{};
  const myDone=compat?.questions&&Object.keys(myR).length===compat.questions.length;
  const theirDone=compat?.questions&&Object.keys(theirR).length===compat.questions.length;
  const both=myDone&&theirDone;
  const score=both?Math.round(100-compat.questions.reduce((acc,_,i)=>acc+Math.abs((myR[i]||3)-(theirR[i]||3)),0)/compat.questions.length*20):null;
  const scoreColor=score>=80?C.sage:score>=60?C.gold:C.rose;

  return (
    <ScreenWrap gradient="linear-gradient(180deg,#FFE8D0 0%,#FFF5EE 50%,#FFF6F3 100%)"><div style={{position:"relative",overflow:"hidden"}}><GradOrb size={280} top={-50} color1="rgba(212,146,42,0.22)" color2="rgba(240,200,120,0.08)"/>
    <div style={{padding:"22px 18px 48px",position:"relative",zIndex:1}}>
      <Hdr title="Compatibility" sub="See how alike you really are" back={back} right={<div style={{width:40,height:40,borderRadius:14,background:C.gradGold,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.md}}><ChartBar size={20} color="#fff" weight="fill"/></div>}/>
      {!compat?.questions?(<div style={{textAlign:"center",paddingTop:20}} className="fade-rise">
        <div style={{marginBottom:24,display:"inline-flex",alignItems:"center",justifyContent:"center",width:100,height:100,borderRadius:"50%",background:C.gradGold,boxShadow:SHADOWS.xl}}><ChartBar size={48} color="#fff" weight="fill"/></div>
        <p style={{color:C.muted,fontSize:15,lineHeight:1.75,marginBottom:36,fontFamily:LT}}>6 questions. Rate your preferences. See your match.</p>
        <Btn variant="gold" onClick={generate}>Start the quiz</Btn>
      </div>):(
      <div className="fade-rise">
        {both&&<Card elevated layer gradient="linear-gradient(135deg,rgba(212,146,42,0.10),rgba(255,220,140,0.08))" style={{textAlign:"center",marginBottom:22,border:`1px solid ${C.goldBd}`}}><div style={{fontSize:11,fontWeight:700,color:C.gold,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Your compatibility</div><div style={{fontSize:56,fontWeight:700,color:scoreColor,fontFamily:PF,marginBottom:8}}>{score}%</div><div style={{fontSize:14,color:C.muted,fontFamily:LT}}>{score>=80?"Beautifully aligned":score>=60?"Lovely mix of similarities":"Opposites attract"}</div></Card>}
        {compat.questions.map((q,i)=>{ const my=myR[i],their=theirR[i],answered=my!==undefined; return <Card key={i} elevated style={{marginBottom:12}} className={`s${Math.min(i+1,6)}`}><div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,fontFamily:LT}}>Q{i+1}</div><div style={{fontSize:14,color:C.text,marginBottom:12,lineHeight:1.45,fontWeight:700,fontFamily:LT}}>{q.q}</div><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:10,fontFamily:LT}}><span>{q.low}</span><span>{q.high}</span></div><div style={{display:"flex",gap:8,marginBottom:12}}>{[1,2,3,4,5].map(v=><button key={v} onClick={()=>!answered&&rate(i,v)} className="card-hover" style={{flex:1,padding:"11px 0",borderRadius:14,border:"none",background:my===v?C.gradRose:"rgba(255,255,255,0.8)",cursor:answered?"default":"pointer",fontFamily:LT,fontSize:14,fontWeight:my===v?700:400,color:my===v?"#fff":C.text,transition:"all 0.15s",boxShadow:my===v?SHADOWS.md:SHADOWS.sm}}>{v}</button>)}</div>{both&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><span style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,background:C.roseSoft,color:C.rose,border:`1px solid ${C.roseBd}`,fontFamily:LT}}>{me?.name}: {my}</span><span style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,background:C.goldSoft,color:C.gold,border:`1px solid ${C.goldBd}`,fontFamily:LT}}>{partner?.name}: {their}</span>{Math.abs(my-their)<=1&&<span style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:C.sageSoft,color:C.sage,border:`1px solid ${C.sageBd}`,fontFamily:LT}}>Aligned</span>}</div>}{!answered&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic",fontFamily:LT}}>Tap a number to rate</div>}</Card>; })}
        {both&&<Btn variant="ghost" style={{marginTop:6}} onClick={()=>update({[fk]:null})}>Retake →</Btn>}
        {!both&&myDone&&<Card style={{background:"rgba(212,146,42,0.06)",border:`1px solid ${C.goldBd}`,textAlign:"center"}}><div style={{fontSize:13,color:C.gold,fontFamily:LT,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Sparkle size={14} color={C.gold}/>Waiting for {partner?.name} to finish...</div></Card>}
      </div>)}
    </div></div></ScreenWrap>
  );
}

function LoveLangScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const ll=roomData?.lovelang; const mine=ll?.[userKey]; const theirs=ll?.[pk]; const both=mine&&theirs; const match=both&&mine===theirs;
  const pick=async key=>{ await update({[`lovelang.${userKey}`]:key}); await addN("lovelang",`${me?.name} chose their love language`); };
  const LLIcons={words:ChatTeardrop,time:Heart,gifts:Star,acts:Sparkle,touch:FlowerLotus};
  return (
    <ScreenWrap gradient="linear-gradient(180deg,#FFD6E8 0%,#FFF0F8 50%,#FFF6F3 100%)"><div style={{position:"relative",overflow:"hidden"}}><GradOrb size={280} top={-50} color1="rgba(212,82,106,0.25)" color2="rgba(255,150,180,0.10)"/>
    <div style={{padding:"22px 18px 48px",position:"relative",zIndex:1}}>
      <Hdr title="Love Language" sub="How do you feel loved?" back={back} right={<div style={{width:40,height:40,borderRadius:14,background:C.gradRose,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.md}}><FlowerLotus size={20} color="#fff" weight="fill"/></div>}/>
      {!mine?(<div className="fade-rise"><div style={{textAlign:"center",marginBottom:28}}><div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:80,height:80,borderRadius:"50%",background:C.gradRose,boxShadow:SHADOWS.xl,marginBottom:16}} className="hb-float"><FlowerLotus size={40} color="#fff" weight="fill"/></div><p style={{fontFamily:PF,fontSize:22,fontStyle:"italic",color:C.text,lineHeight:1.6}}>Which speaks to your heart most?</p></div>{LOVE_LANGS.map((l,i)=>{ const LLI=LLIcons[l.key]||Heart; return <button key={l.key} onClick={()=>pick(l.key)} className={`card-hover s${Math.min(i+1,5)}`} style={{display:"block",width:"100%",background:"rgba(255,255,255,0.93)",border:"1.5px solid rgba(255,255,255,0.92)",borderRadius:20,padding:"18px 20px",textAlign:"left",cursor:"pointer",fontFamily:LT,marginBottom:11,boxShadow:SHADOWS.md}}><div style={{display:"flex",alignItems:"center",gap:16}}><div style={{width:48,height:48,borderRadius:16,background:C.gradRose,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SHADOWS.sm}}><LLI size={24} color="#fff" weight="fill"/></div><div style={{flex:1}}><div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:LT}}>{l.title}</div><div style={{fontSize:12,color:C.muted,marginTop:3,fontFamily:LT}}>{l.desc}</div></div><CaretRight size={18} color={C.muted} style={{flexShrink:0}}/></div></button>; })}</div>):(
      <div className="fade-rise">{!theirs&&<Card style={{background:"rgba(212,146,42,0.06)",border:`1px solid ${C.goldBd}`,textAlign:"center",marginBottom:18}}><div style={{fontSize:13,color:C.gold,fontFamily:LT,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Sparkle size={14} color={C.gold}/>Waiting for {partner?.name} to pick...</div></Card>}{both&&<Card elevated gradient={match?"linear-gradient(135deg,rgba(107,143,113,0.10),rgba(144,196,152,0.08))":"linear-gradient(135deg,rgba(139,107,173,0.08),rgba(180,150,220,0.06))"} style={{textAlign:"center",marginBottom:20,border:`1px solid ${match?C.sageBd:C.purpleBd}`}}><div style={{fontSize:32,marginBottom:10}}>{match?"🎉":"💡"}</div><div style={{fontWeight:700,fontSize:15,color:match?C.sage:C.purple,fontFamily:LT}}>{match?"You share the same love language!":"Different languages — knowing this helps you love better."}</div></Card>}{LOVE_LANGS.map(l=>{ const isMe=mine===l.key,isTheirs=theirs===l.key; if(!isMe&&!isTheirs) return null; const LLI=LLIcons[l.key]||Heart; return <Card key={l.key} elevated style={{marginBottom:12,border:`1.5px solid ${isMe&&isTheirs?C.sageBd:isMe?C.roseBd:C.goldBd}`}}><div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}><div style={{width:48,height:48,borderRadius:16,background:C.gradRose,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SHADOWS.sm}}><LLI size={24} color="#fff" weight="fill"/></div><div style={{flex:1}}><div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:LT}}>{l.title}</div><div style={{fontSize:12,color:C.muted,fontFamily:LT}}>{l.desc}</div></div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{isMe&&<span style={{fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:20,background:C.roseSoft,color:C.rose,border:`1px solid ${C.roseBd}`,fontFamily:LT}}><Heart size={10} color={C.rose} weight="fill" style={{marginRight:4}}/>{me?.name}</span>}{isTheirs&&<span style={{fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:20,background:C.goldSoft,color:C.gold,border:`1px solid ${C.goldBd}`,fontFamily:LT}}><Heart size={10} color={C.gold} weight="fill" style={{marginRight:4}}/>{partner?.name}</span>}</div></Card>; })}<Btn variant="ghost" style={{marginTop:6}} onClick={()=>update({"lovelang":null})}>Retake →</Btn></div>
      )}
    </div></div></ScreenWrap>
  );
}

// ── LOVE NOTES — masonry Pinterest feed ────────────────────────────────────
function LoveNotes({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A";
  const readKey=userKey==="A"?"readA_note":"readB_note";
  const notes=roomData?.notes||[];
  const [text,setText]=useState("");
  const [focused,setFocused]=useState(false);
  const unread=notes.filter(n=>n.from===pk&&!n[readKey]).length;

  const send=async()=>{
    if(!text.trim()) return;
    const note={id:Date.now()+Math.random(),from:userKey,text:text.trim(),date:new Date().toLocaleDateString("en",{month:"short",day:"numeric"}),readA_note:userKey==="A",readB_note:userKey==="B"};
    await update({notes:[note,...notes]}); await addN("note",`${me?.name} sent you a love note`); setText("");
  };

  const reveal=async id=>{ await update({notes:notes.map(n=>n.id===id?{...n,[readKey]:true}:n)}); };

  const NOTE_GRADS=["linear-gradient(135deg,#F093A0,#D4526A)","linear-gradient(135deg,#F0C060,#D4922A)","linear-gradient(135deg,#90C498,#6B8F71)","linear-gradient(135deg,#B0A0E0,#8B6BAD)","linear-gradient(135deg,#FFB3A0,#FF8C78)","linear-gradient(135deg,#A0D4E0,#5A9DB8)"];

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#FFD6D6 0%,#FFF0EC 40%,#FFF6F3 100%)",paddingBottom:100}}>
      <div style={{position:"relative",overflow:"hidden"}}>
        <GradOrb size={300} top={-60}/>

        {/* HERO with back button */}
        <div style={{padding:"22px 22px 20px",position:"relative",zIndex:1}} className="fade-rise">
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
            <BackBtn onClick={back}/>
            <div style={{flex:1,textAlign:"center"}}>
              <h2 style={{fontFamily:PF,fontSize:28,fontStyle:"italic",fontWeight:400,color:C.text}}>Love Notes</h2>
              <p style={{fontSize:13,color:C.muted,fontFamily:LT,marginTop:4}}>Little letters, big feelings</p>
            </div>
            {unread>0
              ?<div style={{background:C.gradRose,borderRadius:20,padding:"5px 12px",display:"flex",alignItems:"center",gap:4,boxShadow:SHADOWS.sm}}><Envelope size={12} color="#fff" weight="fill"/><span style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:LT}}>{unread}</span></div>
              :<div style={{width:40}}/>
            }
          </div>
        </div>

        {/* WRITE CARD */}
        <div style={{padding:"0 18px 20px",position:"relative",zIndex:1}} className="s1">
          <div style={{background:"rgba(255,255,255,0.96)",borderRadius:24,padding:22,boxShadow:focused?`${SHADOWS.lg},0 0 0 4px ${C.roseGlow}`:SHADOWS.lg,border:`1px solid ${focused?"rgba(212,82,106,0.35)":"rgba(255,255,255,0.92)"}`,transition:"all 0.3s"}}>
            <textarea value={text} onChange={e=>setText(e.target.value)} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} placeholder={`Write to ${partner?.name}...`} rows={3} style={{width:"100%",background:"transparent",border:"none",outline:"none",fontFamily:PF,fontSize:16,fontStyle:"italic",color:C.text,resize:"none",lineHeight:1.7,marginBottom:14}}/>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:12,color:C.muted,fontFamily:LT}}>{text.length>0?`${text.length} chars`:""}</div>
              <button disabled={!text.trim()} onClick={send} style={{background:text.trim()?C.gradRose:"rgba(212,82,106,0.15)",border:"none",borderRadius:16,padding:"10px 20px",cursor:text.trim()?"pointer":"not-allowed",fontFamily:LT,fontSize:14,fontWeight:700,color:text.trim()?"#fff":"rgba(212,82,106,0.4)",boxShadow:text.trim()?SHADOWS.md:"none",transition:"all 0.2s",display:"flex",alignItems:"center",gap:8}}>
                Send note ❤️
              </button>
            </div>
          </div>
        </div>

        {/* MASONRY FEED */}
        {notes.length===0
          ?<div style={{textAlign:"center",padding:"48px 22px",color:C.muted,fontFamily:LT}}>
            <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:72,height:72,borderRadius:"50%",background:C.gradRose,boxShadow:SHADOWS.lg,marginBottom:18}} className="hb-float"><Envelope size={32} color="#fff" weight="fill"/></div>
            <p style={{fontSize:15}}>No notes yet — send the first one.</p>
          </div>
          :<div style={{padding:"0 14px",columnCount:2,columnGap:12}}>
            {notes.map((note,i)=>{
              const fromMe=note.from===userKey;
              const isHidden=!fromMe&&!note[readKey];
              const grad=NOTE_GRADS[i%NOTE_GRADS.length];
              const rotation=(i%3===0?"-1.5deg":i%3===1?"1.2deg":"0deg");
              return (
                <div key={note.id} style={{breakInside:"avoid",marginBottom:14,transform:`rotate(${fromMe?"0deg":rotation})`,transition:"transform 0.2s"}} className={`s${Math.min(i+1,6)}`}>
                  {isHidden
                    ?<div className="card-hover" style={{background:grad,borderRadius:20,padding:"22px 18px",boxShadow:SHADOWS.lg,textAlign:"center"}}>
                      <Envelope size={28} color="rgba(255,255,255,0.8)" weight="fill" style={{marginBottom:10}}/>
                      <p style={{fontFamily:PF,fontSize:13,fontStyle:"italic",color:"rgba(255,255,255,0.8)",lineHeight:1.55,marginBottom:14}}>A note from {partner?.name}</p>
                      <button onClick={()=>reveal(note.id)} style={{background:"rgba(255,255,255,0.25)",border:"1px solid rgba(255,255,255,0.4)",borderRadius:14,padding:"8px 16px",cursor:"pointer",fontFamily:LT,fontSize:12,fontWeight:700,color:"#fff",backdropFilter:"blur(4px)"}}>Reveal ❤️</button>
                    </div>
                    :fromMe
                      ?<div className="card-hover" style={{background:"rgba(255,255,255,0.93)",borderRadius:20,padding:"16px 14px",boxShadow:SHADOWS.sm,border:"1px solid rgba(212,82,106,0.10)"}}>
                        <div style={{fontSize:10,color:C.muted,fontFamily:LT,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>You · {note.date}</div>
                        <p style={{fontFamily:PF,fontSize:14,fontStyle:"italic",color:C.text,lineHeight:1.6}}>{note.text}</p>
                      </div>
                      :<div className="card-hover" style={{background:grad,borderRadius:20,padding:"18px 14px",boxShadow:SHADOWS.lg}}>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:LT,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>{partner?.name} · {note.date}</div>
                        <p style={{fontFamily:PF,fontSize:14,fontStyle:"italic",color:"#fff",lineHeight:1.65}}>{note.text}</p>
                      </div>
                  }
                </div>
              );
            })}
          </div>
        }
      </div>
    </div>
  );
}
function Gratitude({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const fk=`grat_${todayKey()}`; const grat=roomData?.[fk];
  const [text,setText]=useState(grat?.[userKey]||""); const submitted=!!grat?.[userKey],partnerDone=!!grat?.[pk],both=submitted&&partnerDone;
  return (
    <ScreenWrap gradient={C.gradUs}><div style={{position:"relative",overflow:"hidden"}}><GradOrb size={280} top={-50} color1="rgba(212,146,42,0.22)" color2="rgba(240,200,120,0.08)"/>
    <div style={{padding:"22px 18px 48px",position:"relative",zIndex:1}}>
      <Hdr title="Daily Gratitude" sub={new Date().toLocaleDateString("en",{month:"long",day:"numeric"})} back={back} right={<div style={{width:40,height:40,borderRadius:14,background:C.gradGold,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.md}}><HandsPraying size={20} color="#fff" weight="fill"/></div>}/>
      {!submitted&&<div className="fade-rise"><div style={{textAlign:"center",marginBottom:28}}><div style={{position:"relative",display:"inline-block",marginBottom:20}}><div style={{position:"absolute",inset:-16,borderRadius:"50%",background:"rgba(212,146,42,0.12)",animation:"hbRing1 3s ease-out infinite"}}/><div style={{width:88,height:88,borderRadius:"50%",background:C.gradGold,display:"inline-flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.xl}}><HandsPraying size={42} color="#fff" weight="fill"/></div></div><p style={{fontFamily:PF,fontSize:22,fontStyle:"italic",color:C.text,lineHeight:1.65}}>What's one thing you love about {partner?.name} today?</p></div><Field textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Be specific — what did they do, say, or make you feel?"/><Btn variant="gold" disabled={!text.trim()} onClick={async()=>{ if(!text.trim()) return; await update({[`${fk}.${userKey}`]:text.trim()}); await addN("grat",`${me?.name} shared their gratitude`); }}>Send my gratitude</Btn></div>}
      {submitted&&both&&<div className="fade-rise"><Card elevated gradient="linear-gradient(135deg,rgba(107,143,113,0.10),rgba(144,196,152,0.08))" style={{textAlign:"center",marginBottom:20,border:`1px solid ${C.sageBd}`}}><CheckCircle size={36} color={C.sage} weight="fill" style={{marginBottom:8}}/><div style={{fontWeight:700,color:C.sage,fontFamily:LT,fontSize:15}}>You both shared today</div></Card>{[[userKey,me?.name,partner?.name,C.rose,"rgba(212,82,106,0.06)",C.roseBd],[pk,partner?.name,me?.name,C.gold,"rgba(212,146,42,0.06)",C.goldBd]].map(([key,from,to,color,soft,bd])=><Card key={key} elevated gradient={`linear-gradient(135deg,rgba(255,255,255,0.99),${soft})`} style={{marginBottom:14,border:`1px solid ${bd}`}}><div style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>{from} → {to}</div><p style={{fontFamily:PF,fontSize:18,fontStyle:"italic",color:C.text,lineHeight:1.65,margin:0}}>"{grat[key]}"</p></Card>)}<Btn variant="ghost" onClick={back}>← Back</Btn></div>}
      {submitted&&!partnerDone&&<div className="fade-rise"><Card elevated style={{marginBottom:16}}><div style={{fontSize:11,fontWeight:700,color:C.rose,marginBottom:8,fontFamily:LT,display:"flex",alignItems:"center",gap:5}}><CheckCircle size={14} color={C.rose} weight="fill"/>Your gratitude for today</div><p style={{fontFamily:PF,fontSize:18,fontStyle:"italic",color:C.text,lineHeight:1.65,margin:0}}>"{grat[userKey]}"</p></Card><Card style={{background:"rgba(212,146,42,0.06)",border:`1px solid ${C.goldBd}`,textAlign:"center"}}><div style={{fontSize:13,color:C.gold,fontFamily:LT,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Sparkle size={14} color={C.gold}/>Waiting for {partner?.name}...</div></Card></div>}
    </div></div></ScreenWrap>
  );
}

function BucketList({me,partner,userKey,roomData,update,addN,back}){
  const bucket=roomData?.bucket||[]; const [text,setText]=useState(""); const [loading,setLoading]=useState(false);
  const addItem=async()=>{ if(!text.trim()) return; const item={id:Date.now()+Math.random(),text:text.trim(),by:me?.name,done:false,date:new Date().toLocaleDateString("en",{month:"short",day:"numeric"})}; await update({bucket:[item,...bucket]}); await addN("bucket",`${me?.name} added to your bucket list`); setText(""); };
  const toggle=async id=>{ await update({bucket:bucket.map(i=>i.id===id?{...i,done:!i.done}:i)}); };
  const suggest=async()=>{
    setLoading(true);
    const shuffled=[...BUCKET_SUGGESTIONS].sort(()=>Math.random()-0.5);
    const used=(bucket||[]).map(i=>i.text);
    const fresh=shuffled.filter(s=>!used.includes(s)).slice(0,5);
    const items=fresh.map(t=>({id:Date.now()+Math.random(),text:t,by:"✦ Suggested",done:false,date:"suggested"}));
    await update({bucket:[...items,...bucket]});
    setLoading(false);
  };
  const done=bucket.filter(i=>i.done).length;
  return (
    <ScreenWrap gradient={C.gradUs}><div style={{position:"relative",overflow:"hidden"}}><GradOrb size={280} top={-50} color1="rgba(107,143,113,0.22)" color2="rgba(144,196,152,0.08)"/>
    <div style={{padding:"22px 18px 48px",position:"relative",zIndex:1}}>
      <Hdr title="Bucket List" sub={`${done} of ${bucket.length} done together`} back={back} right={<div style={{width:40,height:40,borderRadius:14,background:C.gradSage,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.md}}><ListChecks size={20} color="#fff" weight="fill"/></div>}/>
      <Card elevated style={{marginBottom:16}} className="s1"><Field label="Add a dream" placeholder="e.g. Watch the Northern Lights together..." value={text} onChange={e=>setText(e.target.value)}/><div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10}}><Btn disabled={!text.trim()} onClick={addItem}>Add</Btn><button onClick={suggest} disabled={loading} className="card-hover" style={{borderRadius:18,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.8)",cursor:loading?"not-allowed":"pointer",padding:"14px 16px",boxShadow:SHADOWS.sm,display:"flex",alignItems:"center",justifyContent:"center"}}>{loading?<div className="hb-spin"><Sparkle size={18} color={C.sage}/></div>:<Sparkle size={18} color={C.sage}/>}</button></div><div style={{fontSize:11,color:C.muted,marginTop:8,textAlign:"right",fontFamily:LT,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}><Sparkle size={10} color={C.muted}/>Sparkle = AI suggestions</div></Card>
      {bucket.length===0?<div style={{textAlign:"center",padding:"44px 0"}}><div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:80,height:80,borderRadius:"50%",background:C.gradSage,boxShadow:SHADOWS.lg,marginBottom:16}} className="hb-float"><ListChecks size={36} color="#fff" weight="fill"/></div><div style={{color:C.muted,fontSize:15,fontFamily:LT}}>Start dreaming together.</div></div>:(
      <div>{bucket.filter(i=>!i.done).length>0&&<div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>To do together</div>}
      {bucket.filter(i=>!i.done).map((item,i)=><Card key={item.id} style={{marginBottom:10,padding:"16px 18px"}} className={`s${Math.min(i+1,6)}`}><div style={{display:"flex",alignItems:"flex-start",gap:14}}><button onClick={()=>toggle(item.id)} style={{width:26,height:26,borderRadius:"50%",border:`2px solid ${C.border}`,background:"none",cursor:"pointer",flexShrink:0,marginTop:2,transition:"all 0.2s",display:"flex",alignItems:"center",justifyContent:"center"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.sage} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}/><div style={{flex:1}}><div style={{fontSize:15,color:C.text,lineHeight:1.45,fontFamily:LT}}>{item.text}</div><div style={{fontSize:11,color:C.muted,marginTop:5,fontFamily:LT}}>by {item.by} · {item.date}</div></div></div></Card>)}
      {bucket.filter(i=>i.done).length>0&&<div><div style={{fontSize:11,fontWeight:700,color:C.sage,textTransform:"uppercase",letterSpacing:"0.09em",margin:"20px 0 12px",fontFamily:LT,display:"flex",alignItems:"center",gap:5}}><CheckCircle size={12} color={C.sage} weight="fill"/>Done together ({done})</div>{bucket.filter(i=>i.done).map(item=><Card key={item.id} gradient="linear-gradient(135deg,rgba(107,143,113,0.08),rgba(144,196,152,0.05))" style={{marginBottom:9,padding:"14px 18px",border:`1px solid ${C.sageBd}`}}><div style={{display:"flex",alignItems:"center",gap:14}}><button onClick={()=>toggle(item.id)} style={{width:26,height:26,borderRadius:"50%",border:"none",background:C.gradSage,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.sm}}><CheckCircle size={16} color="#fff" weight="fill"/></button><div style={{fontSize:14,color:C.sage,textDecoration:"line-through",lineHeight:1.4,fontFamily:LT}}>{item.text}</div></div></Card>)}</div>}</div>)}
    </div></div></ScreenWrap>
  );
}

function MemoryJar({me,userKey,roomData,update,addN,back}){
  const memories=roomData?.memories||[];
  const [text,setText]=useState("");
  const [imgUrl,setImgUrl]=useState("");
  const [uploading,setUploading]=useState(false);
  const fileRef=useRef();

  const handlePhoto=async e=>{
    const file=e.target.files[0]; if(!file) return;
    setUploading(true);
    try{ const url=await uploadImage(file); setImgUrl(url); }
    catch(err){console.error(err);}
    setUploading(false);
  };

  const add=async()=>{
    if(!text.trim()&&!imgUrl) return;
    const m={
      id:Date.now()+Math.random(),
      userKey,
      name:me?.name,
      text:text.trim(),
      image:imgUrl||"",
      date:new Date().toLocaleDateString("en",{month:"short",day:"numeric"})
    };
    await update({memories:[m,...memories]});
    await addN("memory",`${me?.name} added a memory`);
    setText(""); setImgUrl("");
  };

  return (
    <ScreenWrap gradient="linear-gradient(180deg,#EAD6FF 0%,#F8F0FF 50%,#FFF6F3 100%)">
      <div style={{position:"relative",overflow:"hidden"}}>
        <GradOrb size={280} top={-50} color1="rgba(139,107,173,0.25)" color2="rgba(180,150,220,0.08)"/>
        <div style={{padding:"22px 18px 48px",position:"relative",zIndex:1}}>

          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:26}}>
            <BackBtn onClick={back}/>
            <div style={{flex:1}}>
              <h2 style={{fontFamily:PF,fontSize:22,fontWeight:400,fontStyle:"italic",color:C.text}}>Memory Jar</h2>
              <div style={{fontSize:12,color:C.muted,fontFamily:LT}}>Little moments, kept forever</div>
            </div>
            <div style={{width:40,height:40,borderRadius:14,background:"linear-gradient(135deg,#B0A0E0,#8B6BAD)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.md}}>
              <Jar size={20} color="#fff" weight="fill"/>
            </div>
          </div>

          {/* Add memory card */}
          <Card elevated style={{marginBottom:20}} className="s1">

            {/* Photo preview */}
            {imgUrl&&(
              <div style={{position:"relative",marginBottom:14}}>
                <img src={imgUrl} alt="memory" style={{width:"100%",height:180,objectFit:"cover",borderRadius:14,display:"block"}}/>
                <button onClick={()=>setImgUrl("")} style={{position:"absolute",top:8,right:8,background:"rgba(26,10,5,0.55)",border:"none",borderRadius:"50%",width:28,height:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
                  <X size={14} color="#fff"/>
                </button>
              </div>
            )}

            {/* Upload button */}
            <button onClick={()=>fileRef.current.click()} disabled={uploading} style={{display:"flex",alignItems:"center",gap:9,background:"rgba(139,107,173,0.08)",border:`1.5px dashed rgba(139,107,173,0.35)`,borderRadius:14,padding:"10px 16px",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:600,color:C.purple,marginBottom:14,width:"100%",transition:"all 0.2s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(139,107,173,0.14)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(139,107,173,0.08)"}>
              {uploading
                ?<><div className="hb-spin"><Sparkle size={16} color={C.purple}/></div> Uploading photo...</>
                :<><Camera size={16} color={C.purple} weight="fill"/>{imgUrl?"Change photo":"Add a photo (optional)"}</>
              }
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{display:"none"}}/>

            {/* Text field */}
            <Field
              textarea
              label={`What do you want to remember, ${me?.name}?`}
              value={text}
              onChange={e=>setText(e.target.value)}
              placeholder="A funny moment, a feeling, a wish... ✨"
            />

            <Btn
              disabled={!text.trim()&&!imgUrl}
              onClick={add}
              style={{background:"linear-gradient(135deg,#B0A0E0,#8B6BAD)"}}
            >
              Add to jar ✦
            </Btn>
          </Card>

          {/* Memory feed */}
          {memories.length===0
            ?<div style={{textAlign:"center",padding:"44px 0"}}>
              <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:80,height:80,borderRadius:"50%",background:"linear-gradient(135deg,#B0A0E0,#8B6BAD)",boxShadow:SHADOWS.lg,marginBottom:16}} className="hb-float">
                <Jar size={36} color="#fff" weight="fill"/>
              </div>
              <div style={{color:C.muted,fontSize:15,fontFamily:LT}}>Your jar is empty — fill it with moments.</div>
            </div>
            :<div style={{display:"flex",flexDirection:"column",gap:14}}>
              {memories.map((m,i)=>(
                <div key={m.id} className={`s${Math.min(i+1,6)}`}>
                  <Card elevated style={{padding:0,overflow:"hidden",border:`1px solid ${m.userKey==="A"?"rgba(212,82,106,0.15)":"rgba(212,146,42,0.15)"}`}}>

                    {/* Image if present */}
                    {m.image&&(
                      <div style={{position:"relative"}}>
                        <img src={m.image} alt="memory" style={{width:"100%",height:200,objectFit:"cover",display:"block"}}/>
                        <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(26,10,5,0.5) 0%,transparent 60%)"}}/>
                        {/* Name + date over image */}
                        <div style={{position:"absolute",bottom:10,left:14,right:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.8)",fontFamily:LT}}>{m.name}</div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontFamily:LT}}>{m.date}</div>
                        </div>
                      </div>
                    )}

                    {/* Text content */}
                    <div style={{padding:"14px 18px",borderLeft:`4px solid ${m.userKey==="A"?C.rose:C.gold}`}}>
                      {!m.image&&(
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,alignItems:"center"}}>
                          <div style={{fontSize:11,fontWeight:700,color:m.userKey==="A"?C.rose:C.gold,fontFamily:LT}}>{m.name}</div>
                          <div style={{fontSize:11,color:C.muted,fontFamily:LT}}>{m.date}</div>
                        </div>
                      )}
                      {m.text&&<div style={{fontSize:15,color:C.text,lineHeight:1.65,fontFamily:LT}}>{m.text}</div>}
                    </div>

                  </Card>
                </div>
              ))}
            </div>
          }

        </div>
      </div>
    </ScreenWrap>
  );
}
const DESIRE_PROMPTS_V2 = {
  confess: [
    "Confess something you've thought about doing with me that you've never said out loud",
    "Admit the last time you thought about me in a way that surprised even you",
    "Confess what you think about when you miss me physically",
    "Admit something you find irresistible about me that you've never told me",
    "Confess what you were really thinking the first time you saw me",
    "Admit the most honest thing you feel for me right now, unfiltered",
    "Confess something you want but haven't known how to ask for",
    "Admit what our last intimate moment felt like from your side",
    "Confess the moment you knew you were completely falling for me",
    "Admit something about how I make you feel that only happens with me",
    "Confess what you think about in the quiet moments before you fall asleep",
    "Admit one thing you love about being with me that you've never said aloud",
    "Confess the most vulnerable thought you've had about us",
    "Admit what you were feeling the last time we said goodbye",
    "Confess something about desire that you've never admitted to anyone",
    "Admit the thing about me that you find hardest to resist",
    "Confess what you'd want to happen the next time we're together",
    "Admit something you want me to know about how much you want this",
    "Confess the most honest version of how you feel right now",
    "Admit what you'd do if you could have one uninterrupted hour with me",
    "Confess a thought you had about me today that made you blush",
    "Admit what you would have done differently the last time we were together",
    "Confess what part of me you think about most when we're apart",
    "Admit a desire you've been sitting on for weeks",
    "Confess the last dream you had about me",
    "Admit what my voice does to you",
    "Confess what you'd whisper to me if I were right next to you",
    "Admit the thing you want me to do that you're too shy to ask for directly",
    "Confess what turns you on that you've never told anyone",
    "Admit how long you've wanted to tell me that",
    "Confess the thought you always push away but keeps coming back",
    "Admit what you imagine when you close your eyes and think of me",
    "Confess what you'd want me to say to you right now",
    "Admit the most selfish desire you have about me",
    "Confess what being wanted by me feels like",
    "Admit something bold about what you need from me",
    "Confess what you'd do to me if you had all night and no consequences",
    "Admit the last thing you thought about me before you fell asleep",
    "Confess how often you think about me in that way",
    "Admit what you want more of between us that you've never said",
  ],
  dare: [
    "Send a voice note of you saying exactly what you want from me tonight",
    "Send a message that you'd only ever be brave enough to send me",
    "Describe in a voice note what you want the first hour of seeing me again to look like",
    "Send me the most honest message about how much you want me",
    "Record a voice note saying one thing you've been holding back",
    "Send me a message that makes me feel completely wanted",
    "Describe in detail what your ideal night with me looks and feels like",
    "Send a voice note of you saying my name the way you say it when you miss me",
    "Send me a message that tells me exactly what you need right now",
    "Record yourself saying the most vulnerable thing you feel for me",
    "Send me a message I could read on a hard day to feel desired",
    "Describe what it feels like when we're close in a voice note",
    "Send me a message saying one bold thing you've been thinking",
    "Record a voice note being completely unfiltered about what you want",
    "Send me something that captures exactly how you feel about me tonight",
    "Describe our next time together in as much detail as you can",
    "Send a voice note saying everything you'd say if I was right beside you",
    "Send me a message saying one thing about physical connection you want more of",
    "Record yourself saying the most honest thing about desire",
    "Send me the message you'd want to receive from me right now",
    "Send a voice note of you saying one thing you've never had the courage to say",
    "Text me exactly what you want to do to me",
    "Send me a voice note of you being completely unguarded",
    "Describe where you'd take me if you had one night and no limits",
    "Send a voice note saying the thing that always stays in your head unsaid",
    "Text me one thing you want me to do to you",
    "Send a message as if nobody would ever read it except me",
    "Voice note: say what your body feels when you think of mine",
    "Send the most honest sentence about what you want from us",
    "Record yourself reading the boldest thing you've ever thought about me",
    "Text me what you'd want our morning to look like if I was there now",
    "Send a voice note of you saying I love you in the way you mean it most",
    "Describe the most intimate version of an evening between us",
    "Send me three words that describe what you want right now",
    "Voice note: talk about the last time you felt completely desired",
    "Text me something you've thought about every day this week",
    "Send me a voice note that you'd be embarrassed for anyone else to hear",
    "Describe what my touch does to you",
    "Send a message saying what you'd do if I walked in the door right now",
    "Record yourself saying one deeply honest thing about wanting me",
  ],
  question: [
    "What's the most honest thing you can say about how much you want me?",
    "What do you think about when the distance between us feels hardest?",
    "What's the most vulnerable you've ever felt with someone?",
    "What would you want the first moment of seeing me again to feel like?",
    "What's something about physical intimacy you've always wanted to explore?",
    "What does desire feel like in your body?",
    "What's the most honest version of what you need from a relationship?",
    "What's something about the way I love you that you didn't know you needed?",
    "What would you do if you had one uninterrupted hour with me?",
    "What does being completely wanted feel like?",
    "What's the most honest thought you have about us late at night?",
    "What's a version of us together that you think about and haven't told me?",
    "What makes you feel most like yourself when we're together?",
    "What do you feel in the moment before I kiss you?",
    "What's the thing about our intimacy you want more of?",
    "What would change between us if we said everything we were thinking?",
    "What does it feel like to be seen completely by someone?",
    "What's the most tender thing you feel for me right now?",
    "What's something about desire that only makes sense with you?",
    "What do you want me to know about how you feel when we're close?",
    "What's one thing about your body you wish I knew?",
    "What would you want me to whisper to you right now?",
    "What part of being with me do you replay most often?",
    "What's a fantasy you've been keeping to yourself?",
    "What do you need that you've never asked for?",
    "What does it feel like when I look at you?",
    "What's the thing I do that undoes you completely?",
    "What's a side of yourself that only comes out with me?",
    "What's one thing about our physical connection that surprised you?",
    "What would you want our last night together to feel like if we had no tomorrow?",
    "What's something about being with me that you think about when you're alone?",
    "What does it mean to you when I say I want you?",
    "What's the most intimate moment we've had?",
    "What do you want more of that you're afraid to ask for?",
    "What does your body feel like when I touch you?",
    "What's the most honest thing about how much you miss me?",
    "What would you want to feel with me that you haven't yet?",
    "What's a thought about us that you've never said out loud?",
    "What does wanting me feel like for you?",
    "What's one thing you could tell me right now that would change everything?",
  ],
  fantasy: [
    "Describe a fantasy you have about us that you've never said out loud",
    "Describe what your ideal intimate evening with me looks like in detail",
    "Describe a place you'd want us to be together that you think about",
    "Describe a scenario with me that you'd want to make real",
    "Describe what you imagine the first night of living together being like",
    "Describe a fantasy about us in a specific location",
    "Describe what you'd want to happen the moment I walk through the door",
    "Describe the most romantic version of a night between us",
    "Describe a fantasy about the two of us on a trip together",
    "Describe what you imagine our mornings together being like",
    "Describe a moment between us you want to create",
    "Describe your ideal version of a weekend alone with me",
    "Describe a fantasy about what our future home feels like",
    "Describe the most intimate version of a quiet evening with me",
    "Describe something you've imagined us doing that you haven't said",
    "Describe what you'd want a perfect spontaneous night with me to look like",
    "Describe a fantasy about being completely alone with me somewhere new",
    "Describe what you imagine the first time we wake up together with no plans",
    "Describe a version of us in five years that you dream about",
    "Describe what you'd want our most intimate conversation to sound like",
    "Describe the perfect setting for us — where, when, how it begins",
    "Describe a fantasy that starts with us doing something completely ordinary",
    "Describe what you'd want me to do to you if time stopped",
    "Describe the version of us you most want to exist",
    "Describe a fantasy that involves just one room and all the time in the world",
    "Describe what the best version of our physical connection looks like",
    "Describe what you'd want our first night together after a long time apart to feel like",
    "Describe the dream trip we'd take just to be alone together",
    "Describe a fantasy version of tomorrow morning with me",
    "Describe the one scenario you keep returning to when you think of us",
    "Describe what you'd want me to do without me asking",
    "Describe the most sensory version of being with me you can imagine",
    "Describe a fantasy where we have absolutely no inhibitions",
    "Describe what it would feel like to have me completely to yourself",
    "Describe our best night ever — the one that hasn't happened yet",
    "Describe a fantasy involving a specific place you've always wanted to take me",
    "Describe what you want the energy between us to feel like",
    "Describe a version of intimacy between us you've thought about but never said",
    "Describe the fantasy you'd most want to come true this year",
    "Describe what forever looks like in your most honest imagination",
  ],
};

function getDesirePromptV2(cat) {
  const pool = DESIRE_PROMPTS_V2[cat] || DESIRE_PROMPTS_V2.confess;
  return pool[Math.floor(Math.random() * pool.length)];
}


// ══════════════════════════════════════════════════════════════════
// DESIRE GAME COMPONENT — paste below the prompts above
// ══════════════════════════════════════════════════════════════════

function DesireGame({me, partner, userKey, roomData, update, addN, back}) {
  const pk = userKey === "A" ? "B" : "A";
  const fk = "desire"; // persistent key — not date-based, unlimited rounds
  const desire = roomData?.[fk];

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");
  const [category, setCategory] = useState("random");
  const [teaseText, setTeaseText] = useState("");
  const [localTeases, setLocalTeases] = useState([]); // optimistic local state

  const CATS = [
    {key:"confess",  Icon:ChatTeardrop, label:"Confess",  desc:"Admit something bold",        emoji:"🫦"},
    {key:"dare",     Icon:Fire,         label:"Dare",     desc:"Do something daring",          emoji:"🔥"},
    {key:"question", Icon:Sparkle,      label:"Question", desc:"Answer something intimate",    emoji:"💋"},
    {key:"fantasy",  Icon:Star,         label:"Fantasy",  desc:"Share a fantasy",              emoji:"🌙"},
  ];

  const REACTIONS = ["🍆","🍑","💦","🔥","😈","🫦","💋","🥵","😏","❤️‍🔥"];

  const phase = !desire?.prompt       ? "gen"
    : !desire?.responses?.[userKey]   ? "respond"
    : !desire?.responses?.[pk]        ? "wait"
    : !desire?.revealed               ? "reveal"
    : "result";

  const catInfo = CATS.find(c => c.key === desire?.category) || CATS[0];
  const CatIcon = catInfo.Icon;

  // Reset local teases when a new round starts
  useEffect(() => {
    setLocalTeases([]);
    setResponse("");
  }, [desire?.startedAt]);

  // Generate a new round
  const generate = async () => {
    setLoading(true);
    setLocalTeases([]);
    setResponse("");
    const cat = category === "random"
      ? ["confess","dare","question","fantasy"][Math.floor(Math.random() * 4)]
      : category;
    const prompt = getDesirePromptV2(cat);
    await update({[fk]: {
      prompt,
      category: cat,
      responses: {},
      revealed: false,
      teases: [],
      roundCount: (desire?.roundCount || 0) + 1,
      startedAt: Date.now(),
    }});
    setLoading(false);
  };

  const submitResponse = async () => {
    if (!response.trim()) return;
    await update({[`${fk}.responses.${userKey}`]: response.trim()});
    await addN("desire", `${me?.name} responded to Desire 🔥`);
  };

  // Optimistic tease — shows instantly, then syncs to Firestore
  const sendTease = async (emoji) => {
    const tease = {from: userKey, emoji, ts: Date.now()};
    setLocalTeases(prev => [...prev, tease]); // instant local update
    const current = desire?.teases || [];
    await update({[`${fk}.teases`]: [...current, tease].slice(-30)});
  };

  const sendTeaseText = async () => {
    if (!teaseText.trim()) return;
    const tease = {from: userKey, text: teaseText.trim(), ts: Date.now()};
    setLocalTeases(prev => [...prev, tease]); // instant local update
    const current = desire?.teases || [];
    await update({[`${fk}.teases`]: [...current, tease].slice(-30)});
    setTeaseText("");
  };

  const reveal = async () => {
    await update({[`${fk}.revealed`]: true});
  };

  const newRound = async () => {
    setResponse("");
    setCategory("random");
    setLocalTeases([]);
    await update({[fk]: null});
  };

  // Merge Firestore teases + local optimistic teases, deduplicated by ts
  const getMergedTeases = () => {
    const firestoreTeases = desire?.teases || [];
    const firestoreTs = new Set(firestoreTeases.map(t => t.ts));
    // Only include local teases not yet confirmed by Firestore
    const pendingLocal = localTeases.filter(t => !firestoreTs.has(t.ts));
    return [...firestoreTeases, ...pendingLocal].sort((a, b) => a.ts - b.ts);
  };

  // Tease live panel — used in respond and wait phases
  const TeaseLive = () => {
    const allTeases = getMergedTeases();
    const partnerTeases = allTeases.filter(t => t.from !== userKey);
    const latestPartnerTease = partnerTeases[partnerTeases.length - 1];
    const myRecentTeases = allTeases.filter(t => t.from === userKey).slice(-3);

    return (
      <div style={{marginTop: 20}}>

        {/* Partner's latest tease — shown prominently */}
        {latestPartnerTease && (
          <div className="fade-rise" style={{
            background: "rgba(212,82,106,0.12)",
            borderRadius: 16,
            padding: "14px 18px",
            marginBottom: 14,
            border: "1px solid rgba(212,82,106,0.25)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "linear-gradient(135deg,#8B2A1A,#C4522A)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, fontSize: 14, fontWeight: 700, color: "#FAF0E8", fontFamily: LT,
            }}>
              {partner?.name?.[0]}
            </div>
            <div style={{flex: 1}}>
              <div style={{fontSize: 10, color: "#E8A080", fontFamily: LT, fontWeight: 700, marginBottom: 4}}>
                {partner?.name}
              </div>
              {latestPartnerTease.emoji
                ? <div style={{fontSize: 28, lineHeight: 1}}>{latestPartnerTease.emoji}</div>
                : <div style={{fontSize: 14, color: "#FAF0E8", fontFamily: PF, fontStyle: "italic", lineHeight: 1.5}}>
                    "{latestPartnerTease.text}"
                  </div>
              }
            </div>
          </div>
        )}

        {/* My recent teases — shown dimly so they know it sent */}
        {myRecentTeases.length > 0 && (
          <div style={{display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, justifyContent: "flex-end"}}>
            {myRecentTeases.map((t, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.06)",
                borderRadius: 10,
                padding: t.emoji ? "6px 8px" : "6px 12px",
                fontSize: t.emoji ? 18 : 12,
                color: "rgba(250,240,232,0.5)",
                fontFamily: LT,
                fontStyle: t.text ? "italic" : "normal",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                {t.emoji || `"${t.text}"`}
              </div>
            ))}
          </div>
        )}

        {/* Emoji reaction bar */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          borderRadius: 18,
          padding: "14px 12px",
          border: "1px solid rgba(255,255,255,0.07)",
          marginBottom: 12,
        }}>
          <div style={{fontSize: 10, color: "rgba(250,240,232,0.35)", fontFamily: LT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10}}>
            React while they think...
          </div>
          <div style={{display: "flex", gap: 6, flexWrap: "wrap"}}>
            {REACTIONS.map(emoji => (
              <button
                key={emoji}
                onClick={() => sendTease(emoji)}
                style={{
                  fontSize: 22,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  width: 44,
                  height: 44,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s",
                  flexShrink: 0,
                }}
                onMouseEnter={e => {e.currentTarget.style.background="rgba(212,82,106,0.25)"; e.currentTarget.style.transform="scale(1.15)";}}
                onMouseLeave={e => {e.currentTarget.style.background="rgba(255,255,255,0.06)"; e.currentTarget.style.transform="scale(1)";}}
                onTouchStart={e => e.currentTarget.style.transform="scale(1.15)"}
                onTouchEnd={e => e.currentTarget.style.transform="scale(1)"}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Short text tease */}
        <div style={{display: "flex", gap: 10}}>
          <input
            type="text"
            value={teaseText}
            onChange={e => setTeaseText(e.target.value)}
            onKeyPress={e => e.key === "Enter" && sendTeaseText()}
            placeholder="Say something cheeky..."
            maxLength={60}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 14,
              padding: "12px 16px",
              fontFamily: LT,
              fontSize: 14,
              color: "#FAF0E8",
              outline: "none",
            }}
          />
          <button
            onClick={sendTeaseText}
            disabled={!teaseText.trim()}
            style={{
              width: 48, height: 48,
              borderRadius: 14,
              background: teaseText.trim() ? "linear-gradient(135deg,#8B2A1A,#C4522A)" : "rgba(255,255,255,0.06)",
              border: "none",
              cursor: teaseText.trim() ? "pointer" : "not-allowed",
              fontSize: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.2s",
            }}
          >
            💋
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{minHeight: "100vh", background: "linear-gradient(180deg,#1A0A05 0%,#2A0F08 40%,#1A0A05 100%)", paddingBottom: 96}}>
      <div style={{position: "relative", overflow: "hidden"}}>
        <div style={{position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(212,82,106,0.25) 0%,rgba(100,30,20,0.15) 50%,transparent 100%)", filter: "blur(50px)", pointerEvents: "none"}}/>

        {/* HEADER */}
        <div style={{padding: "22px 18px 0", position: "relative", zIndex: 1}}>
          <div style={{display: "flex", alignItems: "center", gap: 12, marginBottom: 26}}>
            <button onClick={back} style={{background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, cursor: "pointer", padding: "9px 11px", lineHeight: 1, display: "flex", alignItems: "center"}}>
              <ArrowLeft size={20} color="rgba(255,255,255,0.7)"/>
            </button>
            <div style={{flex: 1}}>
              <h2 style={{fontFamily: PF, fontSize: 22, fontWeight: 400, fontStyle: "italic", color: "#FAF0E8"}}>Desire</h2>
              <div style={{fontSize: 12, color: "rgba(250,240,232,0.5)", fontFamily: LT}}>Bold. Daring. Just the two of you.</div>
            </div>
            <div style={{display: "flex", alignItems: "center", gap: 8}}>
              {(desire?.roundCount || 0) > 0 && (
                <div style={{background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "rgba(250,240,232,0.45)", fontFamily: LT}}>
                  Round {desire.roundCount}
                </div>
              )}
              <div style={{background: "rgba(212,82,106,0.2)", border: "1px solid rgba(212,82,106,0.3)", borderRadius: 20, padding: "5px 13px", display: "flex", alignItems: "center", gap: 5}}>
                <Fire size={12} color="#E8A080" weight="fill"/>
                <span style={{fontSize: 11, fontWeight: 700, color: "#E8A080", fontFamily: LT}}>SPICY</span>
              </div>
            </div>
          </div>
        </div>

        {/* PHASE: GEN */}
        {phase === "gen" && (
          <div style={{padding: "0 18px", position: "relative", zIndex: 1}} className="fade-rise">
            <div style={{textAlign: "center", paddingTop: 12, marginBottom: 36}}>
              <div style={{position: "relative", display: "inline-block", marginBottom: 24}}>
                <div style={{position: "absolute", inset: -20, borderRadius: "50%", border: "1px solid rgba(212,82,106,0.3)", animation: "hbRing1 2.5s ease-out infinite"}}/>
                <div style={{position: "absolute", inset: -36, borderRadius: "50%", border: "1px solid rgba(212,82,106,0.15)", animation: "hbRing2 2.5s ease-out infinite 0.6s"}}/>
                <div style={{width: 100, height: 100, borderRadius: "50%", background: "linear-gradient(135deg,#8B2A1A,#2A0F08)", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 20px 60px rgba(212,82,106,0.4)"}}>
                  <Fire size={48} color="#E8A080" weight="fill"/>
                </div>
              </div>
              <h3 style={{fontFamily: PF, fontSize: 26, fontStyle: "italic", fontWeight: 400, color: "#FAF0E8", marginBottom: 10}}>Push each other's limits</h3>
              <p style={{color: "rgba(250,240,232,0.55)", fontSize: 15, lineHeight: 1.75, fontFamily: LT}}>Bold prompts. Honest answers.<br/>Just the two of you.</p>
            </div>

            <div style={{marginBottom: 24}}>
              <div style={{fontSize: 11, fontWeight: 700, color: "rgba(250,240,232,0.4)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 12, fontFamily: LT}}>Choose a category</div>
              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10}}>
                <button onClick={() => setCategory("random")} className="card-hover" style={{padding: "18px 12px", borderRadius: 20, border: `2px solid ${category === "random" ? "rgba(212,82,106,0.6)" : "rgba(255,255,255,0.10)"}`, background: category === "random" ? "rgba(212,82,106,0.15)" : "rgba(255,255,255,0.05)", cursor: "pointer", fontFamily: LT, textAlign: "center"}}>
                  <div style={{fontSize: 28, marginBottom: 8}}>🎲</div>
                  <div style={{fontSize: 13, fontWeight: 700, color: category === "random" ? "#E8A080" : "rgba(255,255,255,0.5)"}}>Surprise me</div>
                </button>
                {CATS.map(cat => {
                  const CI = cat.Icon;
                  return (
                    <button key={cat.key} onClick={() => setCategory(cat.key)} className="card-hover" style={{padding: "18px 12px", borderRadius: 20, border: `2px solid ${category === cat.key ? "rgba(212,82,106,0.6)" : "rgba(255,255,255,0.10)"}`, background: category === cat.key ? "rgba(212,82,106,0.15)" : "rgba(255,255,255,0.05)", cursor: "pointer", fontFamily: LT, textAlign: "center"}}>
                      <div style={{fontSize: 28, marginBottom: 8}}>{cat.emoji}</div>
                      <div style={{fontSize: 13, fontWeight: 700, color: category === cat.key ? "#E8A080" : "rgba(255,255,255,0.5)"}}>{cat.label}</div>
                      <div style={{fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3, fontFamily: LT}}>{cat.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {loading
              ? <div style={{textAlign: "center", padding: "36px 0"}}><div className="hb-spin" style={{display: "inline-block", marginBottom: 14}}><Fire size={32} color="#E8A080"/></div><div style={{fontSize: 14, color: "rgba(250,240,232,0.5)", fontFamily: LT}}>Generating your prompt...</div></div>
              : <button onClick={generate} className="card-hover" style={{display: "block", width: "100%", borderRadius: 18, padding: "15px 24px", fontFamily: LT, fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg,#8B2A1A,#C4522A)", color: "#FAF0E8", border: "none", cursor: "pointer", boxShadow: "0 8px 24px rgba(212,82,106,0.35)"}}>
                  Generate prompt 🔥
                </button>
            }
          </div>
        )}

        {/* PROMPT CARD — shown in all non-gen phases */}
        {phase !== "gen" && desire?.prompt && (
          <div style={{padding: "0 18px", position: "relative", zIndex: 1}}>
            <div style={{background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", borderRadius: 22, padding: 28, marginBottom: 20, textAlign: "center", border: "1px solid rgba(255,255,255,0.10)"}}>
              <div style={{display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#E8A080", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16, fontFamily: LT}}>
                <span style={{fontSize: 16}}>{catInfo.emoji}</span> {catInfo.label}
              </div>
              <p style={{fontFamily: PF, fontSize: 20, fontStyle: "italic", color: "#FAF0E8", lineHeight: 1.65, margin: 0}}>{desire.prompt}</p>
            </div>
          </div>
        )}

        {/* PHASE: RESPOND */}
        {phase === "respond" && (
          <div style={{padding: "0 18px", position: "relative", zIndex: 1}} className="fade-rise">
            <div style={{background: "rgba(255,255,255,0.96)", borderRadius: 20, padding: 22, marginBottom: 16, boxShadow: SHADOWS.xl}}>
              <Field
                textarea
                label={`Your response, ${me?.name}`}
                value={response}
                onChange={e => setResponse(e.target.value)}
                placeholder="Be honest. Be bold."
              />
              <button onClick={submitResponse} disabled={!response.trim()} className="card-hover" style={{display: "block", width: "100%", borderRadius: 18, padding: "15px 24px", fontFamily: LT, fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg,#8B2A1A,#C4522A)", color: "#FAF0E8", border: "none", cursor: response.trim() ? "pointer" : "not-allowed", opacity: response.trim() ? 1 : 0.45, boxShadow: "0 8px 24px rgba(212,82,106,0.35)"}}>
                Lock in my response →
              </button>
            </div>
            <p style={{textAlign: "center", fontSize: 12, color: "rgba(250,240,232,0.4)", fontFamily: LT, marginBottom: 0}}>Hidden until your partner responds</p>
            <TeaseLive/>
          </div>
        )}

        {/* PHASE: WAIT */}
        {phase === "wait" && (
          <div style={{padding: "0 18px", position: "relative", zIndex: 1}} className="fade-rise">
            <div style={{background: "rgba(255,255,255,0.96)", borderRadius: 20, padding: 22, marginBottom: 14, boxShadow: SHADOWS.xl}}>
              <div style={{fontSize: 11, fontWeight: 700, color: C.rose, marginBottom: 8, fontFamily: LT, display: "flex", alignItems: "center", gap: 5}}>
                <CheckCircle size={14} color={C.rose} weight="fill"/> Your response is locked in
              </div>
              <div style={{fontSize: 15, color: C.text, fontFamily: LT, lineHeight: 1.6}}>{desire?.responses?.[userKey]}</div>
            </div>
            <div style={{background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: 14, textAlign: "center", fontSize: 13, color: "rgba(250,240,232,0.5)", fontFamily: LT, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 0}}>
              <Sparkle size={14} color="rgba(250,240,232,0.5)"/> Waiting for {partner?.name}...
            </div>
            <TeaseLive/>
          </div>
        )}

        {/* PHASE: REVEAL */}
        {phase === "reveal" && (
          <div style={{padding: "0 18px", position: "relative", zIndex: 1, textAlign: "center"}} className="fade-rise">
            <div style={{paddingTop: 8, paddingBottom: 32}}>
              <div style={{position: "relative", display: "inline-block", marginBottom: 20}}>
                <div style={{position: "absolute", inset: -20, borderRadius: "50%", border: "1px solid rgba(212,82,106,0.3)", animation: "hbRing1 2.5s ease-out infinite"}}/>
                <div style={{width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg,#8B2A1A,#C4522A)", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 40px rgba(212,82,106,0.5)"}}>
                  <Fire size={40} color="#FAF0E8" weight="fill"/>
                </div>
              </div>
              <p style={{fontFamily: PF, fontSize: 22, fontStyle: "italic", color: "#FAF0E8", marginBottom: 8}}>Both of you have responded.</p>
              <p style={{fontSize: 14, color: "rgba(250,240,232,0.5)", fontFamily: LT, marginBottom: 24}}>Open this together. Read at the same time.</p>

              {/* Tease recap before reveal */}
              {getMergedTeases().length > 0 && (
                <div style={{marginBottom: 24, textAlign: "left"}}>
                  <div style={{fontSize: 11, color: "rgba(250,240,232,0.35)", fontFamily: LT, marginBottom: 10, textAlign: "center"}}>While you were thinking...</div>
                  <div style={{display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center"}}>
                    {getMergedTeases().map((t, i) => (
                      <div key={i} style={{background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: t.emoji ? "8px 10px" : "7px 12px", border: "1px solid rgba(255,255,255,0.08)"}}>
                        {t.emoji
                          ? <span style={{fontSize: 22}}>{t.emoji}</span>
                          : <span style={{fontSize: 12, color: "rgba(250,240,232,0.7)", fontFamily: LT, fontStyle: "italic"}}>"{t.text}"</span>
                        }
                        <span style={{fontSize: 9, color: "rgba(250,240,232,0.3)", marginLeft: 6, fontFamily: LT}}>
                          {t.from === userKey ? me?.name : partner?.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={reveal} className="card-hover" style={{display: "block", width: "100%", borderRadius: 18, padding: "15px 24px", fontFamily: LT, fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg,#8B2A1A,#C4522A)", color: "#FAF0E8", border: "none", cursor: "pointer", boxShadow: "0 12px 36px rgba(212,82,106,0.45)"}}>
                Reveal together 🔥
              </button>
            </div>
          </div>
        )}

        {/* PHASE: RESULT */}
        {phase === "result" && (
          <div style={{padding: "0 18px", position: "relative", zIndex: 1}} className="fade-rise">
            {[[userKey, me?.name, C.rose, C.roseSoft, C.roseBd], [pk, partner?.name, C.gold, C.goldSoft, C.goldBd]].map(([key, name, color, soft, bd]) => (
              <Card key={key} elevated gradient={`linear-gradient(135deg,rgba(255,255,255,0.99),${soft})`} style={{marginBottom: 14, border: `1px solid ${bd}`}}>
                <div style={{fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 12, fontFamily: LT}}>{name}</div>
                <p style={{fontFamily: PF, fontSize: 18, fontStyle: "italic", color: C.text, lineHeight: 1.65, margin: 0}}>
                  "{desire.responses?.[key] || <i style={{color: C.muted}}>Not answered yet</i>}"
                </p>
              </Card>
            ))}

            {/* React to the reveal */}
            <div style={{background: "rgba(255,255,255,0.06)", borderRadius: 18, padding: "14px 16px", marginBottom: 16, border: "1px solid rgba(255,255,255,0.08)"}}>
              <div style={{fontSize: 10, color: "rgba(250,240,232,0.35)", fontFamily: LT, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10}}>React to what they said</div>
              <div style={{display: "flex", gap: 6, flexWrap: "wrap"}}>
                {REACTIONS.map(emoji => (
                  <button key={emoji} onClick={() => sendTease(emoji)} style={{fontSize: 22, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, width: 42, height: 42, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s"}}
                    onMouseEnter={e => e.currentTarget.style.transform="scale(1.15)"}
                    onMouseLeave={e => e.currentTarget.style.transform="scale(1)"}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={newRound} className="card-hover" style={{display: "block", width: "100%", borderRadius: 18, padding: "15px 24px", fontFamily: LT, fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg,#8B2A1A,#C4522A)", color: "#FAF0E8", border: "none", cursor: "pointer", boxShadow: "0 8px 24px rgba(212,82,106,0.35)", marginBottom: 10}}>
              Next round 🔥
            </button>
            <Btn variant="ghost" onClick={back}>Back</Btn>
          </div>
        )}

      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// ARCADE GAMES — Tic Tac Toe, Wordle Duel, Pictionary
// ══════════════════════════════════════════════════════════════════

function calculateWinner(board) {
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (let line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

// ── TIC TAC TOE ────────────────────────────────────────────────────
function TicTacToe({ me, partner, userKey, roomData, update, addN, back }) {
  const pk = userKey === "A" ? "B" : "A";
  const today = todayKey();
  const gameKey = `tictactoe_${today}`;
  const game = roomData?.[gameKey] || { board: Array(9).fill(null), xNext: true, rounds: [], currentRound: 0, scores: { A: 0, B: 0 } };
  
  const isXNext = game.xNext;
  const isMyTurn = (isXNext && userKey === "A") || (!isXNext && userKey === "B");
  const boardWinner = calculateWinner(game.board);
  const isBestOf5 = game.currentRound >= 5;
  
  const handleClick = async (i) => {
    if (game.board[i] || boardWinner) return;
    const newBoard = [...game.board];
    newBoard[i] = isXNext ? "X" : "O";
    const newWinner = calculateWinner(newBoard);
    
    let updatedGame = { ...game, board: newBoard, xNext: !isXNext };
    
    if (newWinner || newBoard.every(cell => cell !== null)) {
      const roundWinner = newWinner === "X" ? "A" : newWinner === "O" ? "B" : null;
      updatedGame.rounds = [...(game.rounds || []), { winner: roundWinner }];
      updatedGame.currentRound = (game.currentRound || 0) + 1;
      
      if (roundWinner) {
        updatedGame.scores[roundWinner] = (updatedGame.scores[roundWinner] || 0) + 1;
        await addN("tictactoe", `${me?.name} won round ${updatedGame.currentRound} of Tic Tac Toe!`);
      }
      
      if (updatedGame.currentRound >= 5) {
        const sessionWinner = updatedGame.scores.A > updatedGame.scores.B ? "A" : "B";
await addN("tictactoe", `🏆 ${sessionWinner === userKey ? "You won" : "Partner won"} best of 5!`);
      } else {
        updatedGame.board = Array(9).fill(null);
        updatedGame.xNext = updatedGame.currentRound % 2 === 0;
      }
    }
    
    await update({ [gameKey]: updatedGame });
  };
  
  const cells = game.board.map((cell, i) => (
    <button
      key={i}
      onClick={() => handleClick(i)}
      style={{
        width: "100%",
        aspectRatio: "1",
        borderRadius: 16,
        border: `2px solid ${C.roseBd}`,
        background: cell ? "rgba(212,82,106,0.08)" : "rgba(255,255,255,0.85)",
        fontSize: 40,
        fontWeight: 700,
        color: cell === "X" ? C.rose : cell === "O" ? C.gold : "transparent",
        cursor: isMyTurn && !boardWinner ? "pointer" : "default",
        fontFamily: PF,
        boxShadow: SHADOWS.sm,
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        if (isMyTurn && !boardWinner && !game.board[i]) {
          e.currentTarget.style.background = "rgba(212,82,106,0.12)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = game.board[i] ? "rgba(212,82,106,0.08)" : "rgba(255,255,255,0.85)";
      }}
    >
      {cell}
    </button>
  ));

  return (
    <ScreenWrap gradient={C.gradPlay}>
      <div style={{ position: "relative", overflow: "hidden" }}>
        <GradOrb size={280} top={-50} color1="rgba(212,82,106,0.2)" color2="rgba(220,150,200,0.08)" />
        
        <div style={{ padding: "22px 18px 0", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <BackBtn onClick={back} />
            <div style={{ flex: 1 }}>
              <h2 style={{ fontFamily: PF, fontSize: 22, fontWeight: 400, fontStyle: "italic", color: C.text }}>Tic Tac Toe</h2>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: LT }}>Best of 5</div>
            </div>
          </div>

          {/* Scores */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[["A", me?.name, C.rose], ["B", partner?.name, C.gold]].map(([key, name, color]) => (
              <Card key={key} elevated style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontFamily: LT }}>
                  {name}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: key === userKey ? color : "rgba(26,10,5,0.3)", fontFamily: PF, marginBottom: 6 }}>
                  {game.scores?.[key] || 0}
                </div>
                <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: (game.scores?.[key] || 0) >= i ? color : "rgba(26,10,5,0.1)",
                      }}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* Board */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
            {cells}
          </div>

          {/* Status */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            {!boardWinner && game.board.every(cell => cell === null) ? (
              <div style={{ fontSize: 14, color: C.muted, fontFamily: LT }}>Round {game.currentRound + 1}/5 — {isMyTurn ? "Your turn" : `${partner?.name}'s turn`}</div>
            ) : boardWinner ? (
              <div style={{ fontSize: 16, fontWeight: 700, color: C.rose, fontFamily: LT, marginBottom: 16 }}>
                🎉 {boardWinner === "X" ? (userKey === "A" ? "You" : partner?.name) : (userKey === "B" ? "You" : partner?.name)} won this round!
              </div>
            ) : game.board.every(cell => cell !== null) ? (
              <div style={{ fontSize: 14, color: C.gold, fontFamily: LT }}>It's a draw!</div>
            ) : null}
          </div>

          {(boardWinner || game.board.every(cell => cell !== null)) && game.currentRound < 5 && (
            <Btn onClick={() => {}} style={{ background: C.gradRose, border: "none", color: "#fff" }}>
              Round {game.currentRound + 1} complete ✓
            </Btn>
          )}

          {game.currentRound >= 5 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.rose, marginBottom: 12, fontFamily: PF, fontStyle: "italic" }}>
                🏆 Game Over!
              </div>
              <div style={{ fontSize: 16, color: C.text, marginBottom: 20 }}>
                {game.scores.A > game.scores.B ? (userKey === "A" ? "You won!" : `${partner?.name} won!`) : "It's a tie!"}
              </div>
              <Btn onClick={back} variant="ghost">
                Back to Play
              </Btn>
            </div>
          )}
        </div>
      </div>
    </ScreenWrap>
  );
}

// ── WORDLE DUEL ────────────────────────────────────────────────────
const VALID_WORDLE_WORDS = new Set([
  "about","above","abuse","actor","acute","admit","adopt","adult","after","again","agent","agree","ahead","alarm","album","alert","alike","align","alive","alley","allow","alone","along","altar","alter","angel","anger","angle","angry","anime","ankle","annex","antic","apart","apple","apply","arena","argue","arise","armor","aroma","arose","array","arson","aside","asset","audio","audit","avoid","awake","award","aware","awful","bacon","badge","badly","bagel","baker","bands","bandy","basic","basin","basis","batch","beach","beard","beast","beats","began","begin","being","belle","belly","below","bench","bends","berry","berth","beset","bests","biker","binge","birds","birth","bison","biter","black","blade","blame","bland","blank","blare","blast","blaze","bleak","bleat","bleed","blend","bless","blind","blink","bliss","blitz","bloat","block","blond","blood","blown","blues","blunt","blush","board","boast","bonus","boost","booth","bossy","bound","boxer","brave","brawn","bread","break","bream","breed","brick","bride","brief","bring","brisk","broke","brook","broom","broth","brown","brush","buddy","build","built","bulge","burst","buyer","bylaw","cabal","cable","cadet","camel","candy","canon","caper","carry","catch","cause","cease","chain","chair","chalk","chaos","charm","chase","cheap","cheat","check","cheek","cheer","chess","chest","chief","child","chill","chips","choir","chord","chore","chose","civic","civil","clack","claim","clamp","clash","class","clast","clean","clear","clerk","click","cliff","climb","cling","clock","close","cloth","cloud","clown","coach","coast","cobra","comic","comma","coral","could","count","coupe","court","cover","craft","crane","crash","crazy","cream","creek","creep","crest","crime","crimp","crisp","cross","crowd","crown","cruel","crush","crust","curve","cycle","daily","dance","datum","debut","decoy","delay","delta","depth","derby","devil","dirty","disco","ditty","dizzy","dogma","doubt","dough","dowdy","dowry","draft","drain","drape","drawl","drawn","dread","dream","dress","dried","drift","drink","drive","drool","droop","drove","drown","dryer","dumpy","dusty","dwarf","dwell","dying","eager","eagle","early","earth","easel","eight","elect","elite","empty","enact","ended","enemy","enjoy","enter","entry","envoy","equal","error","essay","every","exact","exalt","exert","exile","exist","extra","fable","faced","faint","fairy","faith","false","fancy","fatal","fault","feast","fence","ferry","fetch","fever","fiber","fifth","fifty","fight","first","fixed","flame","flank","flare","flash","flask","flats","flaw","fleet","flesh","flick","flinch","float","flock","floor","floss","flour","fluid","flush","focal","foggy","force","forge","forth","found","frame","franc","fraud","freak","fresh","front","frost","froze","fruit","fully","funds","funny","fuzzy","gamer","ghost","given","gland","glare","glass","gloom","glory","gloss","glove","going","grace","grade","grain","grand","grant","grasp","grass","grate","gravy","graze","great","greed","greet","grief","grill","grind","groan","groin","grope","gross","group","grove","growl","gruel","gruff","guard","guess","guest","guide","guild","guile","guise","gulch","gusto","hairy","halve","handy","happy","harsh","hasty","haven","heart","heavy","hedge","hence","herbs","hilly","hinge","hippo","hoist","homer","honey","honor","horse","hotel","hound","house","human","husky","hyena","hyper","ideal","idiom","idiot","image","imply","infer","inner","input","inter","irony","issue","ivory","jaunt","jazzy","joust","judge","juice","juicy","jumpy","kayak","knack","kneel","knelt","knife","knock","knoll","known","label","lance","large","laser","latch","later","laugh","layer","leapt","learn","least","leave","ledge","legal","lemon","level","light","liner","liver","llama","local","lodge","lofty","logic","loose","lover","lower","lucid","lucky","lunar","lusty","lyric","magic","major","maker","manor","maple","march","marry","match","matte","maxim","media","mercy","merge","merit","metal","minor","mirth","model","mogul","moist","money","monks","month","moral","moron","mount","mourn","movie","multi","music","naive","nanny","nerve","never","night","noble","noise","norms","notch","noted","novel","nudge","nurse","nymph","obese","occur","ocean","offer","often","onset","order","other","otter","outer","oxide","ozone","paint","papal","paper","party","pasta","patch","pause","payee","peace","peach","pearl","pedal","petal","phone","photo","piano","piece","pilot","pinch","pirate","pitch","pixel","pizza","place","plain","plane","plank","plant","plate","plaza","plead","pluck","plumb","plume","plump","plunge","plunk","plush","point","polar","poppy","porch","posed","pouch","poult","pound","pouty","power","prank","press","price","prick","pride","prime","prince","print","prism","privy","prize","probe","prone","prong","proof","prose","proud","prowl","psalm","pubic","pulse","punch","pupil","purge","pushy","pygmy","queen","query","queue","quick","quiet","quirk","quota","quote","rabbi","radar","radix","rainy","rally","range","rapid","ratio","reach","realm","rebel","rebus","recut","reedy","refit","regal","reign","relax","renew","repay","repel","repot","rerun","resin","retch","revel","rider","ridge","rifle","right","risky","rival","rivet","river","robot","rocky","rouge","rough","round","roust","rover","rowdy","ruins","ruler","rural","rusty","sadly","saint","salsa","salty","sandy","sauce","saute","savor","savvy","scale","scald","scalp","scamp","scant","scare","scarf","scary","scene","scone","scoop","score","scorn","scout","scowl","scram","scrub","seize","sense","serve","setup","seven","shade","shaft","shaky","shame","shape","share","sharp","shawl","sheen","shelf","shell","shift","shiny","shoot","shore","short","shout","shove","shown","shrub","shrug","sight","silly","since","sixth","sixty","sized","skate","skier","skill","skimp","skirt","skull","skunk","slain","slang","slant","slash","sleek","sleep","sleet","slick","slide","sling","slink","slope","slosh","sloth","slump","slung","slunk","slurp","slush","small","smack","smart","smash","smear","smell","smirk","smoky","snack","snail","snake","snare","snark","sneak","snide","sniff","snore","snort","snout","snowy","snuck","snuff","solar","solve","sonic","sorry","south","space","spade","spare","spark","spawn","speak","spear","speck","speed","spell","spend","spill","spine","spite","spoil","spook","spoon","sport","spout","sprain","spray","spree","sprig","sprint","squad","squat","squid","stack","staff","stage","stain","stale","stall","stamp","stand","stank","stark","start","stash","state","stays","steak","steal","steam","steed","steel","steep","steer","stern","stick","stiff","still","stock","stomp","stone","stood","store","stork","storm","story","stout","stove","strap","straw","stray","strum","strut","stuck","study","stuff","stump","stung","stunk","stunt","style","suite","sulky","sunny","super","surge","swamp","swarm","swear","sweat","sweep","sweet","swept","swift","swill","swipe","swirl","sword","swore","sworn","syrup","taint","tally","tangy","tapir","tardy","taunt","tawny","teach","tease","teeth","tempo","tense","terse","theft","their","there","these","thick","thing","think","third","thorn","those","three","threw","throw","thrum","thud","thumb","thump","tiara","tidal","tiger","tight","timer","tipsy","tired","titan","title","toast","today","token","tonal","torch","total","totem","touch","tough","toxic","trace","track","trade","trail","train","tramp","traps","trash","trawl","treat","trend","trial","tribe","trick","tripe","trite","troll","tromp","troop","troth","trout","trove","truce","truck","truly","trump","trunk","truss","trust","truth","tulip","tumor","tuner","tunic","tusks","tutor","twang","tweak","tweed","twerp","twice","twill","twirl","twist","twixt","ulcer","ultra","umbra","uncle","under","unify","union","unity","until","upper","upset","urban","utter","valor","value","vapor","vault","vaunt","venom","verse","vicar","video","vigor","viola","viper","viral","virus","visor","visit","vista","vital","vivid","vocal","vodka","voila","voice","vouch","wacky","waltz","waste","watch","water","weary","weave","wedge","weird","whale","wharf","wheat","wheel","where","while","whiff","whine","whirl","whisk","white","whole","whose","wider","witch","woman","women","world","worry","worse","worst","worth","would","wound","wrath","wring","wrote","yacht","yearn","young","yours","youth","zebra","zesty","zilch","zippy","zonal"
]);

function WordleDuel({me, partner, userKey, roomData, update, addN, back}) {
  const pk = userKey === "A" ? "B" : "A";
  const today = todayKey();
  const gameKey = `wordle_${today}`;
  const dailyWord = getDailyWordle().toUpperCase();

  const game = roomData?.[gameKey] || {
    A: {guesses: [], status: "playing"},
    B: {guesses: [], status: "playing"},
    revealed: false,
  };

  const myGame = game[userKey] || {guesses: [], status: "playing"};
  const [currentGuess, setCurrentGuess] = useState("");
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");

  const MAX_GUESSES = 6;
  const WORD_LENGTH = 5;

  // Get tile state for a completed guess
  const getTileStates = (guess) => {
    const result = Array(WORD_LENGTH).fill("absent");
    const wordArr = dailyWord.split("");
    const guessArr = guess.split("");
    const used = Array(WORD_LENGTH).fill(false);

    // First pass — correct positions
    guessArr.forEach((l, i) => {
      if (l === wordArr[i]) {
        result[i] = "correct";
        used[i] = true;
      }
    });

    // Second pass — present but wrong position
    guessArr.forEach((l, i) => {
      if (result[i] === "correct") return;
      const j = wordArr.findIndex((w, wi) => w === l && !used[wi]);
      if (j !== -1) {
        result[i] = "present";
        used[j] = true;
      }
    });

    return result;
  };

  // Build keyboard state from all guesses
  const getKeyboardState = () => {
    const state = {};
    myGame.guesses.forEach(guess => {
      const states = getTileStates(guess);
      guess.split("").forEach((letter, i) => {
        const current = state[letter];
        const next = states[i];
        if (current === "correct") return;
        if (next === "correct" || current !== "correct") state[letter] = next;
      });
    });
    return state;
  };

  const keyboardState = getKeyboardState();

  const submitGuess = async () => {
    const g = currentGuess.toUpperCase();
    if (g.length !== WORD_LENGTH) {
      setError("Not enough letters");
      setShake(true);
      setTimeout(() => setShake(false), 600);
      return;
    }
    if (!VALID_WORDLE_WORDS.has(g.toLowerCase())) {
      setError("Not a valid word");
      setShake(true);
      setTimeout(() => { setShake(false); setError(""); }, 1200);
      return;
    }

    setError("");
    const newGuesses = [...myGame.guesses, g];
    const won = g === dailyWord;
    const lost = !won && newGuesses.length >= MAX_GUESSES;

    const updated = {
      ...game,
      [userKey]: {
        guesses: newGuesses,
        status: won ? "solved" : lost ? "lost" : "playing",
      },
    };

    if (won) await addN("wordle", `${me?.name} solved today's Wordle in ${newGuesses.length} guesses!`);

    const bothDone = updated[userKey].status !== "playing" && (updated[pk]?.status || "playing") !== "playing";
    if (bothDone) updated.revealed = true;

    await update({[gameKey]: updated});
    setCurrentGuess("");
  };

  const handleKey = (key) => {
    if (myGame.status !== "playing") return;
    if (key === "ENTER") { submitGuess(); return; }
    if (key === "⌫") { setCurrentGuess(c => c.slice(0, -1)); setError(""); return; }
    if (currentGuess.length < WORD_LENGTH && /^[A-Z]$/.test(key)) {
      setCurrentGuess(c => c + key);
      setError("");
    }
  };

  const TILE_COLORS = {
    correct: {bg:"#538d4e", border:"#538d4e", color:"#fff"},
    present: {bg:"#b59f3b", border:"#b59f3b", color:"#fff"},
    absent:  {bg:"#3a3a3c", border:"#3a3a3c", color:"#fff"},
    empty:   {bg:"transparent", border:"rgba(26,10,5,0.15)", color:C.text},
    tbd:     {bg:"transparent", border:"rgba(26,10,5,0.4)", color:C.text},
  };

  const KEY_COLORS = {
    correct: {bg:"#538d4e", color:"#fff"},
    present: {bg:"#b59f3b", color:"#fff"},
    absent:  {bg:"#3a3a3c", color:"#fff"},
    default: {bg:"rgba(26,10,5,0.08)", color:C.text},
  };

  const KEYBOARD_ROWS = [
    ["Q","W","E","R","T","Y","U","I","O","P"],
    ["A","S","D","F","G","H","J","K","L"],
    ["ENTER","Z","X","C","V","B","N","M","⌫"],
  ];

  // Build grid rows
  const rows = [];
  for (let i = 0; i < MAX_GUESSES; i++) {
    if (i < myGame.guesses.length) {
      // Completed guess
      const guess = myGame.guesses[i];
      const states = getTileStates(guess);
      rows.push({letters: guess.split(""), states, type: "done"});
    } else if (i === myGame.guesses.length && myGame.status === "playing") {
      // Current guess row
      const letters = currentGuess.split("").concat(Array(WORD_LENGTH).fill("")).slice(0, WORD_LENGTH);
      rows.push({letters, states: Array(WORD_LENGTH).fill("tbd"), type: "current", shake});
    } else {
      // Empty row
      rows.push({letters: Array(WORD_LENGTH).fill(""), states: Array(WORD_LENGTH).fill("empty"), type: "empty"});
    }
  }

  return (
    <ScreenWrap gradient={C.gradHome}>
      <div style={{position:"relative",overflow:"hidden"}}>
        <GradOrb size={280} top={-50}/>
        <div style={{padding:"22px 18px 0",position:"relative",zIndex:1}}>

          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
            <BackBtn onClick={back}/>
            <div style={{flex:1,textAlign:"center"}}>
              <h2 style={{fontFamily:PF,fontSize:22,fontWeight:400,fontStyle:"italic",color:C.text}}>Wordle Duel</h2>
              <div style={{fontSize:11,color:C.muted,fontFamily:LT}}>
                {new Date().toLocaleDateString("en",{weekday:"long",month:"long",day:"numeric"})}
              </div>
            </div>
            {/* Partner status badge */}
            <div style={{background:C.roseSoft,borderRadius:12,padding:"5px 10px",border:`1px solid ${C.roseBd}`}}>
              <div style={{fontSize:10,fontWeight:700,color:C.rose,fontFamily:LT,textAlign:"center"}}>
                {game[pk]?.status === "solved" ? "✓ Done" : game[pk]?.status === "lost" ? "✗ Lost" : `${game[pk]?.guesses?.length||0}/6`}
              </div>
              <div style={{fontSize:9,color:C.muted,fontFamily:LT,textAlign:"center"}}>{partner?.name}</div>
            </div>
          </div>

          {/* Error message */}
          {error&&(
            <div style={{textAlign:"center",marginBottom:8}}>
              <span style={{background:"rgba(26,10,5,0.85)",color:"#fff",fontFamily:LT,fontSize:13,fontWeight:700,padding:"6px 14px",borderRadius:8}}>{error}</span>
            </div>
          )}

          {/* Grid */}
          <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"center",marginBottom:20}}>
            {rows.map((row, ri) => (
              <div
                key={ri}
                style={{
                  display:"flex",gap:6,
                  animation: row.shake ? "shake 0.6s ease" : "none",
                }}
              >
                {row.letters.map((letter, li) => {
                  const state = row.type === "done" ? row.states[li] : row.type === "current" && letter ? "tbd" : "empty";
                  const tc = TILE_COLORS[state] || TILE_COLORS.empty;
                  return (
                    <div key={li} style={{
                      width: 52, height: 52,
                      border: `2px solid ${tc.border}`,
                      background: tc.bg,
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                      fontWeight: 700,
                      color: tc.color,
                      fontFamily: LT,
                      transition: "background 0.3s, border 0.3s",
                    }}>
                      {letter}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Status messages */}
          {myGame.status === "solved" && (
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:20,fontWeight:700,color:C.sage,fontFamily:PF,fontStyle:"italic",marginBottom:4}}>
                🎉 Solved in {myGame.guesses.length} {myGame.guesses.length===1?"guess":"guesses"}!
              </div>
              <div style={{fontSize:13,color:C.muted,fontFamily:LT}}>
                {game[pk]?.status==="playing"?`Waiting for ${partner?.name}...`:"Both done — see results below"}
              </div>
            </div>
          )}

          {myGame.status === "lost" && (
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:16,fontWeight:700,color:C.rose,fontFamily:LT,marginBottom:4}}>
                The word was <span style={{fontFamily:PF,fontStyle:"italic"}}>{dailyWord}</span>
              </div>
              <div style={{fontSize:13,color:C.muted,fontFamily:LT}}>
                {game[pk]?.status==="playing"?`Waiting for ${partner?.name}...`:""}
              </div>
            </div>
          )}

          {/* Results when both done */}
          {game.revealed && (
            <Card elevated style={{marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>Today's result</div>
              <div style={{display:"flex",justifyContent:"center",gap:32}}>
                {[[userKey,me?.name],[pk,partner?.name]].map(([k,name])=>(
                  <div key={k} style={{textAlign:"center"}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.muted,fontFamily:LT,marginBottom:4}}>{name}</div>
                    <div style={{fontSize:20,fontWeight:700,color:game[k]?.status==="solved"?C.sage:C.rose,fontFamily:PF}}>
                      {game[k]?.status==="solved"?`${game[k].guesses.length}/6`:"X/6"}
                    </div>
                  </div>
                ))}
              </div>
              {game[userKey]?.status==="solved"&&game[pk]?.status==="solved"&&(
                <div style={{fontSize:13,color:C.muted,fontFamily:LT,marginTop:10}}>
                  {game[userKey].guesses.length < game[pk].guesses.length
                    ? `You solved it faster! 🏆`
                    : game[userKey].guesses.length > game[pk].guesses.length
                    ? `${partner?.name} solved it faster! 🏆`
                    : "Tied! 🤝"}
                </div>
              )}
            </Card>
          )}

          {/* Keyboard */}
          {myGame.status === "playing" && (
            <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"center",paddingBottom:20}}>
              {KEYBOARD_ROWS.map((row, ri) => (
                <div key={ri} style={{display:"flex",gap:6}}>
                  {row.map(key => {
                    const ks = keyboardState[key];
                    const kc = ks ? KEY_COLORS[ks] : KEY_COLORS.default;
                    const isWide = key === "ENTER" || key === "⌫";
                    return (
                      <button
                        key={key}
                        onClick={() => handleKey(key)}
                        style={{
                          width: isWide ? 56 : 34,
                          height: 56,
                          borderRadius: 6,
                          border: "none",
                          background: kc.bg,
                          color: kc.color,
                          fontFamily: LT,
                          fontSize: isWide ? 11 : 14,
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "background 0.2s",
                          flexShrink: 0,
                        }}
                      >
                        {key}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </ScreenWrap>
  );
}

// ── PICTIONARY ─────────────────────────────────────────────────────
function Pictionary({me, partner, userKey, roomData, update, addN, back}) {
  const pk = userKey === "A" ? "B" : "A";
  const today = todayKey();
  const gameKey = `pictionary_${today}`;
  const game = roomData?.[gameKey] || null;
  const [lobbySettings, setLobbySettings] = useState({rounds: 0, drawTime: 60, hints: 0});
  const [inLobby, setInLobby] = useState(!game);
  const [guess, setGuess] = useState("");
  const [color, setColor] = useState("#1A0A05");
  const [brushSize, setBrushSize] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const strokeBuffer = useRef([]);
  const syncTimer = useRef(null);

  // When game updates in Firestore, redraw strokes on canvas
  useEffect(() => {
    if (!game?.strokes || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    game.strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
      stroke.points.forEach(p => ctx.lineTo(p.x * canvas.width, p.y * canvas.height));
      ctx.stroke();
    });
  }, [game?.strokes]);

  // Sync stroke buffer to Firestore every 200ms
  const syncStrokes = async () => {
    if (strokeBuffer.current.length === 0) return;
    const newStrokes = [...(game?.strokes || []), ...strokeBuffer.current];
    strokeBuffer.current = [];
    await update({[`${gameKey}.strokes`]: newStrokes});
  };

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  };

  const startDraw = (e) => {
    if (game?.currentDrawer !== userKey) return;
    e.preventDefault();
    drawing.current = true;
    const canvas = canvasRef.current;
    const pos = getPos(e, canvas);
    lastPos.current = {points: [pos], color: isEraser ? "#FFF6F3" : color, size: isEraser ? brushSize * 4 : brushSize};
  };

  const draw = (e) => {
    if (!drawing.current || !canvasRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    lastPos.current.points.push(pos);

    // Draw locally immediately for smooth feel
    const pts = lastPos.current.points;
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = lastPos.current.color;
      ctx.lineWidth = lastPos.current.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(pts[pts.length - 2].x * canvas.width, pts[pts.length - 2].y * canvas.height);
      ctx.lineTo(pts[pts.length - 1].x * canvas.width, pts[pts.length - 1].y * canvas.height);
      ctx.stroke();
    }

    // Batch sync every 200ms
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(syncStrokes, 200);
  };

  const endDraw = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;
    if (lastPos.current && lastPos.current.points.length > 0) {
      strokeBuffer.current.push(lastPos.current);
      syncStrokes();
    }
    lastPos.current = null;
  };

  const clearCanvas = async () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    await update({[`${gameKey}.strokes`]: []});
  };

  const submitGuess = async () => {
    if (!guess.trim()) return;
    const word = game?.words?.[game?.currentRound] || "";
    const correct = guess.trim().toLowerCase() === word.toLowerCase();
    const newGuess = {from: userKey, text: guess.trim(), correct, ts: Date.now()};
    const updatedGuesses = [...(game?.guesses || []), newGuess];
    await update({[`${gameKey}.guesses`]: updatedGuesses});
    if (correct) {
      await addN("pictionary", `${me?.name} guessed the word!`);
      // Move to next round
      const nextRound = (game?.currentRound || 0) + 1;
      if (nextRound >= game?.rounds) {
        await update({[`${gameKey}.status`]: "done"});
      } else {
        await update({
          [`${gameKey}.currentRound`]: nextRound,
          [`${gameKey}.currentDrawer`]: game?.currentDrawer === "A" ? "B" : "A",
          [`${gameKey}.strokes`]: [],
          [`${gameKey}.guesses`]: [],
        });
      }
    }
    setGuess("");
  };

  const startGame = async () => {
    if (lobbySettings.rounds === 0) return;
    const words = getPictionaryWords("couples", lobbySettings.rounds * 2);
    await update({
      [gameKey]: {
        rounds: lobbySettings.rounds,
        drawTime: lobbySettings.drawTime,
        hints: lobbySettings.hints,
        currentRound: 0,
        currentDrawer: Math.random() < 0.5 ? "A" : "B",
        words,
        strokes: [],
        guesses: [],
        scores: {A: 0, B: 0},
        status: "playing",
        startedAt: Date.now(),
      }
    });
    setInLobby(false);
  };

  const endGame = async () => {
    await update({[gameKey]: null});
    setInLobby(true);
  };

  const COLORS = ["#1A0A05","#D4526A","#D4922A","#6B8F71","#8B6BAD","#4A90D9","#fff"];

  // ── LOBBY ──
  if (inLobby || !game) {
    return (
      <ScreenWrap gradient={C.gradPlay}>
        <div style={{position:"relative",overflow:"hidden"}}>
          <GradOrb size={280} top={-50}/>
          <div style={{padding:"22px 18px 0",position:"relative",zIndex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
              <BackBtn onClick={back}/>
              <div style={{flex:1}}>
                <h2 style={{fontFamily:PF,fontSize:22,fontWeight:400,fontStyle:"italic",color:C.text}}>Pictionary</h2>
                <div style={{fontSize:12,color:C.muted,fontFamily:LT}}>Draw & guess together</div>
              </div>
            </div>

            <div style={{textAlign:"center",marginBottom:28}}>
              <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:72,height:72,borderRadius:"50%",background:C.gradRose,boxShadow:SHADOWS.xl,marginBottom:16}} className="hb-float">
                <Pen size={36} color="#fff" weight="fill"/>
              </div>
              <p style={{fontSize:14,color:C.muted,fontFamily:LT}}>Set up your game, then both tap Ready.</p>
            </div>

            <Card elevated style={{marginBottom:16}}>
              {/* Rounds */}
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>Rounds</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  {[2,3,5].map(r=>(
                    <button key={r} onClick={()=>setLobbySettings(s=>({...s,rounds:r}))} style={{padding:"14px 0",borderRadius:14,border:`2px solid ${lobbySettings.rounds===r?C.rose:C.border}`,background:lobbySettings.rounds===r?C.roseSoft:"transparent",cursor:"pointer",fontFamily:LT,fontSize:16,fontWeight:700,color:lobbySettings.rounds===r?C.rose:C.text,transition:"all 0.2s"}}>{r}</button>
                  ))}
                </div>
              </div>

              {/* Draw time */}
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>Draw time</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                  {[30,60,90,120].map(t=>(
                    <button key={t} onClick={()=>setLobbySettings(s=>({...s,drawTime:t}))} style={{padding:"12px 0",borderRadius:12,border:`2px solid ${lobbySettings.drawTime===t?C.rose:C.border}`,background:lobbySettings.drawTime===t?C.roseSoft:"transparent",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,color:lobbySettings.drawTime===t?C.rose:C.text}}>{t}s</button>
                  ))}
                </div>
              </div>

              {/* Hints */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>Hints (letters revealed)</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  {[0,1,2].map(h=>(
                    <button key={h} onClick={()=>setLobbySettings(s=>({...s,hints:h}))} style={{padding:"12px 0",borderRadius:12,border:`2px solid ${lobbySettings.hints===h?C.rose:C.border}`,background:lobbySettings.hints===h?C.roseSoft:"transparent",cursor:"pointer",fontFamily:LT,fontSize:14,fontWeight:700,color:lobbySettings.hints===h?C.rose:C.text}}>{h===0?"None":h}</button>
                  ))}
                </div>
              </div>
            </Card>

            <Btn
              disabled={lobbySettings.rounds===0}
              onClick={startGame}
              style={{background:C.gradRose,border:"none",color:"#fff"}}
            >
              Start game →
            </Btn>
          </div>
        </div>
      </ScreenWrap>
    );
  }

  // ── GAME OVER ──
  if (game.status === "done") {
    const myScore = game.scores?.[userKey] || 0;
    const partnerScore = game.scores?.[pk] || 0;
    return (
      <ScreenWrap gradient={C.gradPlay}>
        <div style={{padding:"22px 18px",position:"relative",zIndex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
            <BackBtn onClick={back}/>
          </div>
          <div style={{textAlign:"center",paddingTop:40}}>
            <div style={{fontSize:64,marginBottom:16}}>🎨</div>
            <h3 style={{fontFamily:PF,fontSize:28,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:24}}>Game over!</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:32}}>
              {[[userKey,me?.name,myScore,C.rose],[pk,partner?.name,partnerScore,C.gold]].map(([k,name,score,color])=>(
                <Card key={k} elevated style={{textAlign:"center"}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,fontFamily:LT,marginBottom:8}}>{name}</div>
                  <div style={{fontSize:40,fontWeight:700,color,fontFamily:PF}}>{score}</div>
                </Card>
              ))}
            </div>
            <Btn onClick={endGame} style={{background:C.gradRose,border:"none",color:"#fff"}}>Play again</Btn>
            <Btn variant="ghost" style={{marginTop:10}} onClick={back}>Back to Play</Btn>
          </div>
        </div>
      </ScreenWrap>
    );
  }

  // ── ACTIVE GAME ──
  const word = game.words?.[game.currentRound] || "";
  const isDrawer = game.currentDrawer === userKey;
  const recentGuesses = (game.guesses || []).slice(-5);

  // Build hint string
  const hintWord = word.split("").map((ch, i) => {
    if (ch === " ") return " ";
    if (i < lobbySettings.hints || (game.hints || 0) > i) return ch;
    return "_";
  }).join(" ");

  return (
    <ScreenWrap gradient={C.gradPlay}>
      <div style={{position:"relative",zIndex:1}}>
        {/* Header */}
        <div style={{padding:"22px 18px 12px"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
            <BackBtn onClick={()=>setInLobby(true)}/>
            <div style={{flex:1}}>
              <h2 style={{fontFamily:PF,fontSize:20,fontWeight:400,fontStyle:"italic",color:C.text}}>
                Round {(game.currentRound||0)+1}/{game.rounds}
              </h2>
              <div style={{fontSize:12,color:C.muted,fontFamily:LT}}>
                {isDrawer?"You're drawing":"Guess the word!"}
              </div>
            </div>
            {/* Scores */}
            <div style={{display:"flex",gap:8}}>
              {[["A",me?.name,C.rose],["B",partner?.name,C.gold]].map(([k,name,col])=>(
                <div key={k} style={{textAlign:"center",background:k===userKey?col+"20":"rgba(0,0,0,0.05)",borderRadius:10,padding:"4px 10px"}}>
                  <div style={{fontSize:16,fontWeight:700,color:col,fontFamily:PF}}>{game.scores?.[k]||0}</div>
                  <div style={{fontSize:9,color:C.muted,fontFamily:LT}}>{name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Word display */}
          <div style={{background:"rgba(255,255,255,0.9)",borderRadius:16,padding:"12px 18px",marginBottom:12,textAlign:"center"}}>
            {isDrawer
              ? <div style={{fontSize:22,fontWeight:700,color:C.rose,fontFamily:PF,letterSpacing:"0.05em"}}>{word}</div>
              : <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:PF,letterSpacing:"0.2em"}}>{hintWord}</div>
            }
            <div style={{fontSize:11,color:C.muted,fontFamily:LT,marginTop:4}}>
              {isDrawer?"Draw this word":"Guess the word"}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div style={{padding:"0 18px",marginBottom:12}}>
          <div style={{position:"relative",borderRadius:16,overflow:"hidden",boxShadow:SHADOWS.lg,background:"#FFF6F3",border:`2px solid ${C.border}`}}>
            <canvas
              ref={canvasRef}
              width={600}
              height={400}
              style={{width:"100%",height:"auto",display:"block",touchAction:"none",cursor:isDrawer?(isEraser?"crosshair":"crosshair"):"default"}}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            {!isDrawer&&(
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
                {(game.strokes||[]).length===0&&<div style={{fontSize:13,color:C.muted,fontFamily:LT}}>Waiting for {partner?.name} to draw...</div>}
              </div>
            )}
          </div>
        </div>

        {/* Drawing tools — only for drawer */}
        {isDrawer&&(
          <div style={{padding:"0 18px",marginBottom:12}}>
            <div style={{background:"rgba(255,255,255,0.95)",borderRadius:16,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",boxShadow:SHADOWS.sm}}>
              {/* Colors */}
              <div style={{display:"flex",gap:6}}>
                {COLORS.map(c=>(
                  <button key={c} onClick={()=>{setColor(c);setIsEraser(false);}} style={{width:26,height:26,borderRadius:"50%",background:c,border:`3px solid ${color===c&&!isEraser?"#1A0A05":"rgba(0,0,0,0.1)"}`,cursor:"pointer",flexShrink:0,boxShadow:c==="#fff"?`inset 0 0 0 1px ${C.border}`:""}}/>
                ))}
              </div>
              {/* Eraser */}
              <button onClick={()=>setIsEraser(e=>!e)} style={{padding:"5px 10px",borderRadius:10,border:`2px solid ${isEraser?C.rose:C.border}`,background:isEraser?C.roseSoft:"transparent",cursor:"pointer",fontFamily:LT,fontSize:12,fontWeight:700,color:isEraser?C.rose:C.muted}}>Eraser</button>
              {/* Brush size */}
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                {[2,4,8].map(s=>(
                  <button key={s} onClick={()=>setBrushSize(s)} style={{width:s+16,height:s+16,borderRadius:"50%",background:brushSize===s?"#1A0A05":"rgba(0,0,0,0.15)",border:`2px solid ${brushSize===s?"#1A0A05":"transparent"}`,cursor:"pointer"}}/>
                ))}
              </div>
              {/* Clear */}
              <button onClick={clearCanvas} style={{marginLeft:"auto",padding:"5px 10px",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",cursor:"pointer",fontFamily:LT,fontSize:12,color:C.muted}}>Clear</button>
            </div>
          </div>
        )}

        {/* Guesses + input */}
        <div style={{padding:"0 18px 80px"}}>
          {/* Recent guesses */}
          {recentGuesses.length>0&&(
            <div style={{marginBottom:10}}>
              {recentGuesses.map((g,i)=>(
                <div key={i} style={{fontSize:13,fontFamily:LT,color:g.correct?C.sage:g.from===userKey?C.rose:C.muted,marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:700}}>{g.from===userKey?me?.name:partner?.name}:</span>
                  <span>{g.text}</span>
                  {g.correct&&<span style={{color:C.sage}}>✓ Correct!</span>}
                </div>
              ))}
            </div>
          )}

          {/* Guess input — only for guesser */}
          {!isDrawer&&game.status==="playing"&&(
            <div style={{display:"flex",gap:10}}>
              <input
                type="text"
                value={guess}
                onChange={e=>setGuess(e.target.value)}
                onKeyPress={e=>e.key==="Enter"&&submitGuess()}
                placeholder="Type your guess..."
                style={{flex:1,padding:"12px 16px",borderRadius:14,border:`2px solid ${C.border}`,fontFamily:LT,fontSize:14,outline:"none"}}
              />
              <button onClick={submitGuess} style={{padding:"12px 18px",borderRadius:14,background:C.gradRose,border:"none",color:"#fff",fontFamily:LT,fontSize:14,fontWeight:700,cursor:"pointer"}}>Guess</button>
            </div>
          )}

          {isDrawer&&<div style={{textAlign:"center",fontSize:13,color:C.muted,fontFamily:LT,marginTop:8}}>Draw "{word}" for {partner?.name} to guess</div>}
        </div>
      </div>
    </ScreenWrap>
  );
}

// ── ROOT APP ───────────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState("loading");
  const inviteCode = new URLSearchParams(window.location.search).get("invite");
  const [user,     setUser    ] = useState(null);
  const [myUser,   setMyUser  ] = useState(null);
  const [roomId,   setRoomId  ] = useState(null);
  const [userKey,  setUserKey ] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [tab,      setTab     ] = useState("home");
  const [screen,   setScreen  ] = useState(null);
  const [showNotif,setShowNotif] = useState(false);
  const [showOnb,  setShowOnb ] = useState(false);
  const [partnerUser,setPartnerUser] = useState(null);

  useEffect(()=>{
  const unsub=onAuthStateChanged(auth, async u=>{
    if(!u){ setAppState("login"); return; }
    setUser(u);
    const snap=await getDoc(doc(db,"users",u.uid));
    if(!snap.exists()||!snap.data().roomId){
      if(!snap.exists()||!snap.data().onboardingDone) setShowOnb(true);
      setMyUser(snap.data()||{name:u.displayName||"",photo:u.photoURL||""});
      setAppState("profile-setup"); return;
    }
    const ud=snap.data();
    setMyUser(ud); setRoomId(ud.roomId); setUserKey(ud.userKey);
    requestNotifPermission(u.uid);
  });
  return unsub;
},[]);

  useEffect(()=>{
    if(!roomId) return;
    const unsub=onSnapshot(doc(db,"rooms",roomId), snap=>{
      if(!snap.exists()) return;
      const data=snap.data(); setRoomData(data);
      if(data.users?.A?.name&&data.users?.B?.name) setAppState("app");
      else if(userKey==="A"&&!data.users?.B?.name) setAppState("waiting");
      const today=todayStr(); const sk=data.streak||{count:0,lastDate:""};
      if(sk.lastDate!==today){ const y=new Date(); y.setDate(y.getDate()-1); const yd=y.toISOString().split("T")[0]; const ns=sk.lastDate===yd?{count:sk.count+1,lastDate:today}:{count:1,lastDate:today}; updateDoc(doc(db,"rooms",roomId),{streak:ns}); }
    });
    return unsub;
  },[roomId,userKey]);

  const pk=userKey==="A"?"B":"A";
  const partnerUid=roomData?.users?.[pk]?.uid;
  useEffect(()=>{
    if(!partnerUid) return;
    const unsub=onSnapshot(doc(db,"users",partnerUid), snap=>{ if(snap.exists()) setPartnerUser(snap.data()); });
    return unsub;
  },[partnerUid]);

  const update=useCallback((updates)=>roomUpdate(roomId,updates),[roomId]);
const PUSH_TITLES={
  heartbeat:"💓 Heartbeat",
  note:"💌 Love Note",
  qa:"💬 Daily Question",
  wyr:"🤔 Would You Rather",
  nhie:"👆 Never Have I Ever",
  tord:"🎭 Truth or Dare",
  compat:"📊 Compatibility",
  checkin:"💛 Check-In",
  desire:"🔥 Desire",
  grat:"🙏 Gratitude",
  bucket:"✨ Bucket List",
  memory:"🫙 Memory Jar",
  mood:"😊 Mood",
  watch:"🎬 Watch Party",
  outfit:"👗 Outfit Planner",
  date:"📅 Date Planner",
  lovelang:"💗 Love Language",
  tictactoe:"🎮 Tic Tac Toe",
  wordle:"🟩 Wordle Duel",
  pictionary:"🎨 Pictionary",
};
const addN=useCallback(async(type,message)=>{
  await addNotif(roomId,userKey,type,message);
  if(partnerUid) await sendPushToPartner(partnerUid, PUSH_TITLES[type]||"Heartbeat ♥", message);
},[roomId,userKey,partnerUid]);
  const me=roomData?.users?.[userKey];
  const partner=roomData?.users?.[pk];
  const readKey=userKey==="A"?"readA":"readB";
  const unread=(roomData?.notifications||[]).filter(n=>n.from!==userKey&&!n[readKey]).length;
  const notesBadge=(roomData?.notes||[]).filter(n=>n.from===pk&&!n[(userKey==="A"?"readA_note":"readB_note")]).length;

  const signOut=async()=>{ await fbSignOut(auth); setRoomId(null); setUserKey(null); setRoomData(null); setMyUser(null); setScreen(null); setTab("home"); setAppState("login"); };

  const shared={me,partner,myUser,partnerUser,userKey,roomData,update,addN};
  const go=s=>setScreen(s);
  const backHome=()=>setScreen(null);

  // Notification navigation handler
  const handleNotifNav=(dest,type)=>{
    if(dest==="play") setTab("play");
    else if(dest==="us") setTab("us");
    else if(dest==="home") setTab("home");
    else if(dest==="notes") { setTab("us"); setTimeout(()=>setScreen("notes"),100); }
    else if(dest==="memories") { setTab("us"); setTimeout(()=>setScreen("memories"),100); }
    setTab(dest==="notes"||dest==="memories"?"us":dest==="play"?"play":dest==="us"?"us":"home");
  };

  if(appState==="loading") return <div style={{display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:18,minHeight:"100vh",background:C.gradHero}}><style>{STYLES}</style><div className="hb-float"><div style={{width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,0.92)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:SHADOWS.xl}}><Heart size={40} color={C.rose} weight="fill"/></div></div><div style={{fontSize:15,color:"rgba(26,10,5,0.5)",fontFamily:LT}}>Loading...</div></div>;

  if(showOnb&&appState==="profile-setup") return <div style={{background:C.bg}}><style>{STYLES}</style><Onboarding onDone={()=>setShowOnb(false)}/></div>;
  if(appState==="login") return <div style={{background:C.bg}}><style>{STYLES}</style><Login onLogin={u=>{setUser(u);setAppState("profile-setup");}}/></div>;
  if(appState==="profile-setup") return <div style={{background:C.bg}}><style>{STYLES}</style><ProfileSetup uid={user?.uid} existingName={myUser?.name||user?.displayName||""} existingPhoto={myUser?.photo||user?.photoURL||""} onDone={async ud=>{ setMyUser(prev=>({...prev,...ud})); const snap=await getDoc(doc(db,"users",user.uid)); if(snap.exists()&&snap.data().roomId){ setRoomId(snap.data().roomId); setUserKey(snap.data().userKey); } else setAppState("room-setup"); }}/></div>;
  if(appState==="room-setup") return <div style={{background:C.bg}}><style>{STYLES}</style><RoomSetup uid={user?.uid} userData={{name:myUser?.name||"",photo:myUser?.photo||"",mood:"🥰"}}
  inviteCode={inviteCode} onDone={(rid,uk)=>{ setRoomId(rid); setUserKey(uk); }}/></div>;
  if(appState==="waiting") return <div style={{background:C.bg}}><style>{STYLES}</style><Waiting code={roomId} uid={user?.uid} onSignOut={signOut} onLeave={()=>{ setRoomId(null); setUserKey(null); setAppState("room-setup"); }}/></div>;

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:LT,fontSize:16,color:C.text}}>
      <style>{STYLES}</style>

      {/* Glassmorphism top bar */}
      <div style={{background:"rgba(255,246,243,0.78)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderBottom:"1px solid rgba(255,255,255,0.72)",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,boxShadow:"0 1px 0 rgba(255,255,255,0.65),0 4px 20px rgba(212,82,106,0.05)"}}>
        <div onClick={()=>{setScreen(null);setTab("home");}} style={{cursor:"pointer",fontFamily:PF,fontStyle:"italic",color:C.rose,fontSize:22,fontWeight:400,display:"flex",alignItems:"center",gap:8}}>
          <Heart size={18} color={C.rose} weight="fill"/>Heartbeat
        </div>
        <button onClick={()=>setShowNotif(true)} style={{background:"rgba(255,255,255,0.75)",border:`1px solid ${C.border}`,borderRadius:14,cursor:"pointer",padding:"8px 10px",display:"flex",alignItems:"center",position:"relative",backdropFilter:"blur(8px)",boxShadow:SHADOWS.sm,transition:"all 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.boxShadow=SHADOWS.md}
          onMouseLeave={e=>e.currentTarget.style.boxShadow=SHADOWS.sm}>
          <Bell size={20} color={unread>0?C.rose:C.muted} weight={unread>0?"fill":"regular"}/>
          {unread>0&&<div style={{position:"absolute",top:4,right:4,background:C.gradRose,color:"#fff",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,boxShadow:SHADOWS.sm}}>{unread}</div>}
        </button>
      </div>

      {showNotif&&<NotifPanel notifications={roomData?.notifications||[]} userKey={userKey} roomId={roomId} onClose={()=>setShowNotif(false)} onNavigate={handleNotifNav}/>}

      <div style={{maxWidth:480,margin:"0 auto"}}>
        {screen==="qa"       &&<QAScreen      {...shared} back={backHome}/>}
        {screen==="wyr"      &&<WYRScreen     {...shared} back={backHome}/>}
        {screen==="nhie"     &&<NHIE          {...shared} back={backHome}/>}
        {screen==="tord"     &&<TruthOrDare   {...shared} back={backHome}/>}
        {screen==="compat"   &&<CompatScreen  {...shared} back={backHome}/>}
        {screen==="checkin"   &&<RelationshipCheckIn {...shared} back={backHome}/>}
        {screen==="desire"   &&<DesireGame    {...shared} back={backHome}/>}
        {screen==="notes"    &&<LoveNotes     {...shared} back={backHome}/>}
        {screen==="grat"     &&<Gratitude     {...shared} back={backHome}/>}
        {screen==="bucket"   &&<BucketList    {...shared} back={backHome}/>}
        {screen==="memories" &&<MemoryJar     {...shared} back={backHome}/>}
        {screen==="dateplanner"  &&<DatePlannerScreen  {...shared} back={backHome}/>}
        {screen==="outfitplanner"&&<OutfitPlannerScreen {...shared} back={backHome}/>}
        {screen==="watchparty"   &&<WatchPartyScreen    {...shared} back={backHome}/>}
        {screen==="tictactoe" &&<TicTacToe {...shared} back={backHome}/>}
        {screen==="wordle" &&<WordleDuel {...shared} back={backHome}/>}
        {screen==="pictionary" &&<Pictionary {...shared} back={backHome}/>}
        {!screen&&<>
          {tab==="home"    &&<HomeTab    {...shared} roomId={roomId} go={go}/>}
          {tab==="play"    &&<PlayTab    {...shared} go={go}/>}
          {tab==="us"      &&<UsTab      {...shared} go={go}/>}
          {tab==="dates"   &&<DateTab    {...shared} go={go}/>}
          {tab==="profile" &&<ProfileTab {...shared} uid={user?.uid} roomId={roomId} onSignOut={signOut}/>}
        </>}
      </div>

      {!screen&&<TabBar tab={tab} setTab={t=>{setTab(t);setScreen(null);}} unread={unread} notesBadge={notesBadge}/>}
    </div>
  );
}
// Register service worker for PWA + push notifications
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/firebase-messaging-sw.js")
      .then(reg => console.log("SW registered:", reg.scope))
      .catch(err => console.error("SW failed:", err));
  });
}