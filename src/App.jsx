import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, getDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut as fbSignOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

// ── FIREBASE ───────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:      import.meta.env.VITE_FIREBASE_APP_ID,
};
const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);
const auth  = getAuth(fbApp);
const googleProvider = new GoogleAuthProvider();

// ── CLAUDE ─────────────────────────────────────────────────────────────────
async function callClaude(system, msg) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{ "Content-Type":"application/json", "x-api-key":import.meta.env.VITE_ANTHROPIC_KEY, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
    body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:700, system, messages:[{role:"user",content:msg}] }),
  });
  const d = await r.json(); return d.content[0].text.trim();
}

// ── CLOUDINARY ─────────────────────────────────────────────────────────────
async function uploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, { method:"POST", body:fd });
  const d = await r.json(); return d.secure_url;
}

// ── FIRESTORE OPS ──────────────────────────────────────────────────────────
const genCode  = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const todayKey = () => new Date().toISOString().split("T")[0].replace(/-/g,"");
const todayStr = () => new Date().toISOString().split("T")[0];

async function createRoom(uid, userData) {
  const code = genCode();
  await setDoc(doc(db,"rooms",code), {
    users:{ A:{...userData, uid}, B:null },
    coupleName:"", anniversary:"", howWeMet:{A:"",B:""}, couplePhoto:"", distance:"",
    nextMeeting:null, notes:[], bucket:[], memories:[], notifications:[],
    streak:{count:1,lastDate:todayStr()}, lastHeartbeat:null,
  });
  await updateDoc(doc(db,"users",uid), { roomId:code, userKey:"A", onboardingDone:true });
  return code;
}

async function joinRoom(uid, code, userData) {
  const ref  = doc(db,"rooms",code.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Room not found. Check the code.");
  if (snap.data().users?.B?.name) throw new Error("This room already has two people.");
  await updateDoc(ref, { "users.B":{...userData, uid} });
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
const isBirthday   = bd => { if(!bd) return false; const t=new Date(), b=new Date(bd); return t.getMonth()===b.getMonth()&&t.getDate()===b.getDate(); };

const TIMEZONES = [
  {label:"IST — India",        value:"Asia/Kolkata"},
  {label:"GMT — UK",           value:"Europe/London"},
  {label:"EST — US East",      value:"America/New_York"},
  {label:"CST — US Central",   value:"America/Chicago"},
  {label:"PST — US West",      value:"America/Los_Angeles"},
  {label:"CET — Europe",       value:"Europe/Paris"},
  {label:"GST — Gulf",         value:"Asia/Dubai"},
  {label:"SGT — Singapore",    value:"Asia/Singapore"},
  {label:"AEST — Australia",   value:"Australia/Sydney"},
  {label:"JST — Japan",        value:"Asia/Tokyo"},
];

const MOODS=[{e:"🥰",l:"Missing you"},{e:"😊",l:"Happy"},{e:"😌",l:"Calm"},{e:"🤩",l:"Excited"},{e:"😴",l:"Tired"},{e:"😔",l:"Low"},{e:"🤭",l:"Playful"},{e:"😤",l:"Stressed"}];
const LOVE_LANGS=[{key:"words",icon:"💬",title:"Words of Affirmation",desc:"Compliments & kind words"},{key:"time",icon:"⏰",title:"Quality Time",desc:"Undivided attention"},{key:"gifts",icon:"🎁",title:"Receiving Gifts",desc:"Thoughtful surprises"},{key:"acts",icon:"🤝",title:"Acts of Service",desc:"Doing things that help"},{key:"touch",icon:"🤗",title:"Physical Touch",desc:"Closeness & presence"}];
const NOTIF_ICONS={heartbeat:"♥",note:"💌",mood:"✨",qa:"🎯",wyr:"🤔",nhie:"🙋",tord:"🎭",grat:"🙏",memory:"🫙",bucket:"🌍",compat:"📊",lovelang:"💝"};

// ── DESIGN ─────────────────────────────────────────────────────────────────
const C = {
  bg:"#F5ECD7", surface:"#FDFAF4", border:"#E8D5B0", text:"#1A0A05", muted:"#8A6A50",
  accent:"#C4522A", accentSoft:"#FAE8DF", accentBd:"#E8C4B0",
  gold:"#D4922A",   goldSoft:"#FDF3E0",   goldBd:"#E8D4A0",
  sage:"#6B8F71",   sageSoft:"#EEF4EF",   sageBd:"#C0D4C4",
  purple:"#7A5FA8", purpleSoft:"#F0EEF8", purpleBd:"#C8C0E0",
};

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Lato:wght@300;400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; font-family: 'Lato', system-ui, sans-serif; }
  @keyframes hbBeat     { 0%,100%{transform:scale(1)} 30%{transform:scale(1.22)} 65%{transform:scale(1.06)} }
  @keyframes hbFadeUp   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
  @keyframes hbFloat    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
  @keyframes hbSpin     { to{transform:rotate(360deg)} }
  @keyframes hbSlowPulse{ 0%,100%{box-shadow:0 0 0 0 rgba(196,82,42,0.35)} 60%{box-shadow:0 0 0 14px rgba(196,82,42,0)} }
  @keyframes hbFastPulse{ 0%,100%{box-shadow:0 0 0 0 rgba(196,82,42,0.55);transform:scale(1)} 50%{box-shadow:0 0 0 18px rgba(196,82,42,0);transform:scale(1.12)} }
  @keyframes hbPulse    { 0%,100%{opacity:1} 50%{opacity:0.5} }
  @keyframes hbSlide    { from{transform:translateX(30px);opacity:0} to{transform:none;opacity:1} }
  .hb-fade  { animation: hbFadeUp   0.4s ease-out both; }
  .hb-float { animation: hbFloat    3.5s ease-in-out infinite; }
  .hb-beat  { animation: hbBeat     0.5s ease-in-out; }
  .hb-spin  { animation: hbSpin     1.2s linear infinite; }
  .hb-slow  { animation: hbSlowPulse 2.2s ease-in-out infinite; }
  .hb-fast  { animation: hbFastPulse 0.45s ease-in-out infinite; }
`;

// ── PRIMITIVES ─────────────────────────────────────────────────────────────
const PF = "'Playfair Display', Georgia, serif";
const LT = "'Lato', system-ui, sans-serif";

function Field({label,textarea,select,children,style:es,...p}){
  const [f,setF]=useState(false);
  const base={width:"100%",background:C.bg,border:`1.5px solid ${f?C.accent:C.border}`,borderRadius:14,padding:"13px 16px",fontFamily:LT,fontSize:15,color:C.text,outline:"none",transition:"border-color 0.25s",display:"block",...(textarea?{resize:"none"}:{}),...es};
  return <div style={{marginBottom:18}}>
    {label&&<div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:7,fontFamily:LT}}>{label}</div>}
    {select?<select {...p} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{...base,cursor:"pointer"}}>{children}</select>
    :textarea?<textarea {...p} rows={3} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={base}/>
    :<input {...p} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={base}/>}
  </div>;
}

function Btn({children,variant="fill",style:s,disabled,onClick,small}){
  const v={
    fill:   {background:C.accent,color:"#fff",border:"none"},
    google: {background:C.surface,color:C.text,border:`1.5px solid ${C.border}`},
    outline:{background:"transparent",color:C.accent,border:`1.5px solid ${C.accent}`},
    ghost:  {background:"transparent",color:C.muted,border:`1.5px solid ${C.border}`},
    gold:   {background:C.gold,color:"#fff",border:"none"},
  };
  return <button disabled={disabled} onClick={onClick} style={{display:"block",width:"100%",borderRadius:16,padding:small?"10px 18px":"14px 22px",fontFamily:LT,fontSize:small?13:15,fontWeight:700,letterSpacing:"0.06em",cursor:disabled?"not-allowed":"pointer",transition:"all 0.2s",opacity:disabled?0.4:1,...v[variant],...s}}
    onMouseEnter={e=>!disabled&&(e.currentTarget.style.opacity="0.85")} onMouseLeave={e=>(e.currentTarget.style.opacity=disabled?"0.4":"1")}
    onMouseDown={e=>!disabled&&(e.currentTarget.style.transform="scale(0.97)")} onMouseUp={e=>(e.currentTarget.style.transform="none")}
  >{children}</button>;
}

function Avatar({name,photo,size=48,color=C.accent}){
  return photo
    ? <img src={photo} alt={name} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,border:`2px solid ${C.goldBd}`}}/>
    : <div style={{width:size,height:size,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.34,fontWeight:700,color:"#fff",flexShrink:0,border:`2px solid ${C.goldBd}`,fontFamily:LT}}>{initials(name)}</div>;
}

function BackBtn({onClick}){ return <button onClick={onClick} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:C.muted,padding:"4px 10px 4px 0",lineHeight:1,fontFamily:LT}}>←</button>; }
function Spinner({text="One moment..."}){ return <div style={{textAlign:"center",padding:"40px 0",color:C.muted}}><div style={{fontSize:32,marginBottom:14}} className="hb-spin">✦</div><div style={{fontSize:14,fontFamily:LT}}>{text}</div></div>; }
function Card({children,style:s,onClick}){ return <div onClick={onClick} style={{background:C.surface,borderRadius:22,padding:20,border:`1px solid ${C.border}`,marginBottom:14,...s}}>{children}</div>; }
function ErrBox({msg}){ return msg?<div style={{background:"#FEF0EE",border:`1px solid ${C.accentBd}`,borderRadius:14,padding:"12px 16px",marginBottom:14,fontSize:13,color:C.accent,fontFamily:LT}}>{msg}</div>:null; }

function Hdr({title,sub,back,right}){
  return <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
    <BackBtn onClick={back}/>
    <div style={{flex:1}}>
      <h2 style={{fontFamily:PF,fontSize:22,fontWeight:400,fontStyle:"italic",color:C.text}}>{title}</h2>
      {sub&&<div style={{fontSize:12,color:C.muted,fontFamily:LT}}>{sub}</div>}
    </div>
    {right}
  </div>;
}

function PhotoUpload({current,onUpload,size=80}){
  const [loading,setLoading]=useState(false);
  const ref=useRef();
  const handle=async e=>{
    const file=e.target.files[0]; if(!file) return;
    setLoading(true);
    try{ const url=await uploadImage(file); onUpload(url); }catch(err){console.error(err);}
    setLoading(false);
  };
  return <div style={{position:"relative",width:size,height:size,cursor:"pointer"}} onClick={()=>ref.current.click()}>
    {current?<img src={current} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",border:`3px solid ${C.goldBd}`}}/>
    :<div style={{width:size,height:size,borderRadius:"50%",background:C.accentSoft,border:`2px dashed ${C.accentBd}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}>
      <span style={{fontSize:22}}>📷</span>
      <span style={{fontSize:10,color:C.muted,fontFamily:LT}}>Add photo</span>
    </div>}
    {loading&&<div style={{position:"absolute",inset:0,borderRadius:"50%",background:"rgba(245,236,215,0.8)",display:"flex",alignItems:"center",justifyContent:"center"}}><div className="hb-spin" style={{fontSize:20}}>✦</div></div>}
    <input ref={ref} type="file" accept="image/*" onChange={handle} style={{display:"none"}}/>
  </div>;
}

// ── ONBOARDING CAROUSEL ────────────────────────────────────────────────────
function Onboarding({onDone}){
  const [slide,setSlide]=useState(0);
  const slides=[
    {
      svg:<svg viewBox="0 0 200 160" style={{width:220,height:176}}><defs><radialGradient id="g1" cx="50%" cy="50%"><stop offset="0%" stopColor="#FAE8DF"/><stop offset="100%" stopColor="#F5ECD7"/></radialGradient></defs><ellipse cx="100" cy="130" rx="60" ry="12" fill="#E8D5B0" opacity="0.4"/><path d="M100 120 C60 90 30 70 30 48 C30 28 50 18 70 28 C82 34 92 44 100 54 C108 44 118 34 130 28 C150 18 170 28 170 48 C170 70 140 90 100 120Z" fill="none" stroke={C.accent} strokeWidth="3" strokeLinejoin="round"/><path d="M60 75 L75 75 L80 60 L88 90 L95 70 L102 80 L108 72 L115 75 L140 75" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="100" cy="120" r="4" fill={C.accent} opacity="0.6"/></svg>,
      title:"Feel each other's presence",
      body:"A single tap sends a heartbeat. No words needed — just a pulse that says \"I'm thinking of you.\"",
    },
    {
      svg:<svg viewBox="0 0 200 160" style={{width:220,height:176}}><ellipse cx="100" cy="140" rx="70" ry="10" fill="#E8D5B0" opacity="0.3"/><rect x="25" y="40" width="70" height="80" rx="14" fill="none" stroke={C.accent} strokeWidth="2.5"/><rect x="105" y="30" width="70" height="80" rx="14" fill="none" stroke={C.gold} strokeWidth="2.5"/><circle cx="60" cy="65" r="4" fill={C.accent}/><circle cx="60" cy="80" r="4" fill={C.accent}/><circle cx="60" cy="95" r="4" fill={C.accent}/><circle cx="140" cy="55" r="4" fill={C.gold}/><circle cx="140" cy="70" r="4" fill={C.gold}/><circle cx="140" cy="85" r="4" fill={C.gold}/><path d="M95 80 L105 75" stroke={C.muted} strokeWidth="1.5" strokeDasharray="3,3"/><path d="M95 90 L105 80" stroke={C.muted} strokeWidth="1.5" strokeDasharray="3,3"/></svg>,
      title:"Play and discover each other",
      body:"Daily questions, games and challenges that bring you closer — even from opposite sides of the world.",
    },
    {
      svg:<svg viewBox="0 0 200 160" style={{width:220,height:176}}><ellipse cx="100" cy="140" rx="50" ry="8" fill="#E8D5B0" opacity="0.4"/><path d="M70 40 C70 35 75 30 100 30 C125 30 130 35 130 40 L135 120 C135 128 128 135 100 135 C72 135 65 128 65 120 Z" fill="none" stroke={C.accent} strokeWidth="2.5"/><line x1="68" y1="55" x2="132" y2="55" stroke={C.accentBd} strokeWidth="1.5"/><circle cx="85" cy="75" r="5" fill={C.accent} opacity="0.7"/><circle cx="100" cy="90" r="5" fill={C.gold} opacity="0.7"/><circle cx="115" cy="78" r="5" fill={C.accent} opacity="0.5"/><circle cx="90" cy="105" r="4" fill={C.gold} opacity="0.6"/><circle cx="110" cy="108" r="4" fill={C.accent} opacity="0.4"/><path d="M100 30 L100 15 M100 15 C95 10 90 8 88 10" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round"/></svg>,
      title:"Build your story together",
      body:"Every memory, note, and milestone — saved in your private shared space. Your relationship, documented.",
    },
  ];
  const s=slides[slide];
  return <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",padding:"60px 32px 48px",textAlign:"center"}}>
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:32}} className="hb-fade">
      <div className="hb-float">{s.svg}</div>
      <div>
        <h2 style={{fontFamily:PF,fontSize:28,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:14,lineHeight:1.3}}>{s.title}</h2>
        <p style={{fontSize:16,color:C.muted,lineHeight:1.75,fontFamily:LT,maxWidth:300}}>{s.body}</p>
      </div>
    </div>
    <div style={{width:"100%"}}>
      <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:32}}>
        {slides.map((_,i)=><div key={i} style={{width:i===slide?24:8,height:8,borderRadius:4,background:i===slide?C.accent:C.border,transition:"all 0.3s"}}/>)}
      </div>
      {slide<slides.length-1
        ? <Btn onClick={()=>setSlide(s=>s+1)}>Next →</Btn>
        : <Btn onClick={onDone}>Get started →</Btn>
      }
      {slide>0&&<button onClick={()=>setSlide(s=>s-1)} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:14,fontFamily:LT,marginTop:16,display:"block",width:"100%"}}>← Back</button>}
      {slide===0&&<button onClick={onDone} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:13,fontFamily:LT,marginTop:16,display:"block",width:"100%"}}>Skip</button>}
    </div>
  </div>;
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function Login({onLogin}){
  const [mode,setMode]=useState("signin");
  const [email,setEmail]=useState(""); const [pass,setPass]=useState(""); const [name,setName]=useState("");
  const [busy,setBusy]=useState(false); const [err,setErr]=useState("");

  const submit=async()=>{
    if(!email.trim()||!pass.trim()) return;
    if(mode==="signup"&&!name.trim()) return;
    setBusy(true); setErr("");
    try {
      let cred;
      if(mode==="signin"){ cred=await signInWithEmailAndPassword(auth,email.trim(),pass); }
      else { cred=await createUserWithEmailAndPassword(auth,email.trim(),pass); await setDoc(doc(db,"users",cred.user.uid),{name:name.trim(),photo:"",status:"",timezone:"",birthday:"",favoriteEmoji:"♥",roomId:null,userKey:null,onboardingDone:false}); }
      onLogin(cred.user);
    } catch(e){
      const msgs={"auth/invalid-credential":"Wrong email or password.","auth/user-not-found":"No account found. Create one?","auth/wrong-password":"Wrong password.","auth/email-already-in-use":"Email already registered. Sign in instead.","auth/weak-password":"Password needs at least 6 characters.","auth/invalid-email":"Please enter a valid email."};
      setErr(msgs[e.code]||e.message);
    }
    setBusy(false);
  };

  const googleLogin=async()=>{
    setBusy(true); setErr("");
    try {
      const result=await signInWithPopup(auth,googleProvider);
      const u=result.user;
      const snap=await getDoc(doc(db,"users",u.uid));
      if(!snap.exists()) await setDoc(doc(db,"users",u.uid),{name:u.displayName||"",photo:u.photoURL||"",status:"",timezone:"",birthday:"",favoriteEmoji:"♥",roomId:null,userKey:null,onboardingDone:false});
      onLogin(u);
    } catch(e){ setErr(e.message); }
    setBusy(false);
  };

  return <div style={{minHeight:"100vh",background:C.bg,padding:"0 0 40px"}}>
    {/* Hero */}
    <div style={{background:`linear-gradient(160deg, ${C.accentSoft} 0%, ${C.goldSoft} 100%)`,padding:"56px 32px 48px",textAlign:"center",borderBottom:`1px solid ${C.border}`}}>
      <div style={{fontSize:52,marginBottom:16}} className="hb-float">♥</div>
      <h1 style={{fontFamily:PF,fontSize:42,fontWeight:400,fontStyle:"italic",color:C.accent,marginBottom:12}}>Heartbeat</h1>
      <p style={{fontFamily:LT,fontSize:16,color:C.muted,lineHeight:1.7,maxWidth:280,margin:"0 auto"}}>Close the distance.<br/>Feel each other's presence<br/>across any miles.</p>
      <div style={{display:"flex",justifyContent:"center",gap:24,marginTop:24}}>
        {[["♥","Daily moments"],["🎮","Play together"],["🫙","Build memories"]].map(([e,l])=>(
          <div key={l} style={{textAlign:"center"}}>
            <div style={{fontSize:18,marginBottom:4}}>{e}</div>
            <div style={{fontSize:10,color:C.muted,fontFamily:LT,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Form */}
    <div style={{padding:"32px 24px 0"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:24,background:C.border,borderRadius:16,padding:4}}>
        {[["signin","Sign in"],["signup","Create account"]].map(([k,l])=>(
          <button key={k} onClick={()=>{setMode(k);setErr("");}} style={{padding:"11px 0",borderRadius:13,border:"none",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,background:mode===k?C.surface:"transparent",color:mode===k?C.accent:C.muted,transition:"all 0.2s"}}>{l}</button>
        ))}
      </div>

      <Btn variant="google" onClick={googleLogin} style={{marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
        <svg width="18" height="18" viewBox="0 0 18 18"><path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4"/><path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z" fill="#34A853"/><path d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z" fill="#FBBC05"/><path d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z" fill="#EA4335"/></svg>
        Continue with Google
      </Btn>

      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <div style={{flex:1,height:1,background:C.border}}/>
        <span style={{fontSize:12,color:C.muted,fontFamily:LT}}>or</span>
        <div style={{flex:1,height:1,background:C.border}}/>
      </div>

      {mode==="signup"&&<Field label="Your name" placeholder="e.g. Koustav" value={name} onChange={e=>setName(e.target.value)}/>}
      <Field label="Email" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
      <Field label="Password" type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)}/>
      <ErrBox msg={err}/>
      {busy?<Spinner text={mode==="signin"?"Signing in...":"Creating your account..."}/>:<Btn disabled={!email.trim()||!pass.trim()||(mode==="signup"&&!name.trim())} onClick={submit}>{mode==="signin"?"Sign in →":"Create account →"}</Btn>}
    </div>
  </div>;
}

// ── PROFILE SETUP ──────────────────────────────────────────────────────────
function ProfileSetup({uid,existingName,existingPhoto,onDone}){
  const [step,setStep]=useState(0);
  const [name,setName]=useState(existingName||"");
  const [photo,setPhoto]=useState(existingPhoto||"");
  const [birthday,setBirthday]=useState("");
  const [timezone,setTimezone]=useState("");
  const [status,setStatus]=useState("");
  const [emoji,setEmoji]=useState("♥");
  const [busy,setBusy]=useState(false);

  const EMOJIS=["♥","🌙","⭐","🌸","🦋","🌊","☀️","🌿","🎵","✨"];

  const save=async()=>{
    setBusy(true);
    await updateDoc(doc(db,"users",uid),{name:name.trim(),photo,birthday,timezone,status:status.trim(),favoriteEmoji:emoji});
    onDone({name:name.trim(),photo,birthday,timezone,status:status.trim(),favoriteEmoji:emoji});
    setBusy(false);
  };

  const steps=[
    // Step 0 — name + photo
    <div key={0} className="hb-fade">
      <div style={{textAlign:"center",marginBottom:32}}>
        <PhotoUpload current={photo} onUpload={setPhoto} size={100}/>
        <p style={{fontSize:12,color:C.muted,fontFamily:LT,marginTop:10}}>Tap to add a photo</p>
      </div>
      <Field label="Your name" placeholder="What should your partner call you?" value={name} onChange={e=>setName(e.target.value)}/>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Your emoji</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {EMOJIS.map(e=><button key={e} onClick={()=>setEmoji(e)} style={{width:40,height:40,borderRadius:12,border:`2px solid ${emoji===e?C.accent:C.border}`,background:emoji===e?C.accentSoft:"transparent",fontSize:20,cursor:"pointer"}}>{e}</button>)}
        </div>
      </div>
      <Btn disabled={!name.trim()} onClick={()=>setStep(1)}>Next →</Btn>
    </div>,

    // Step 1 — birthday + timezone
    <div key={1} className="hb-fade">
      <Field label="Your birthday" type="date" value={birthday} onChange={e=>setBirthday(e.target.value)}/>
      <Field label="Your timezone" select value={timezone} onChange={e=>setTimezone(e.target.value)}>
        <option value="">Select timezone</option>
        {TIMEZONES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
      </Field>
      <Btn onClick={()=>setStep(2)}>Next →</Btn>
      <Btn variant="ghost" style={{marginTop:10}} onClick={()=>setStep(2)}>Skip</Btn>
    </div>,

    // Step 2 — status
    <div key={2} className="hb-fade">
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:48,marginBottom:12}} className="hb-float">💬</div>
        <p style={{fontFamily:PF,fontSize:20,fontStyle:"italic",color:C.text,lineHeight:1.6}}>What's on your mind right now?</p>
        <p style={{fontSize:13,color:C.muted,fontFamily:LT,marginTop:8}}>Your partner sees this on their home screen</p>
      </div>
      <Field label="Status message" placeholder="e.g. Missing you today..." value={status} onChange={e=>setStatus(e.target.value)}/>
      {busy?<Spinner text="Setting up your profile..."/>:<Btn onClick={save}>Let's go →</Btn>}
      <Btn variant="ghost" style={{marginTop:10}} onClick={save}>Skip for now</Btn>
    </div>,
  ];

  const stepTitles=["About you","A few details","Your status"];
  return <div style={{minHeight:"100vh",background:C.bg,padding:"0 0 48px"}}>
    <div style={{background:C.accentSoft,borderBottom:`1px solid ${C.accentBd}`,padding:"32px 24px 24px",textAlign:"center"}}>
      <h2 style={{fontFamily:PF,fontSize:28,fontStyle:"italic",fontWeight:400,color:C.accent}}>Set up your profile</h2>
      <p style={{fontSize:13,color:C.muted,fontFamily:LT,marginTop:6}}>{step+1} of 3 — {stepTitles[step]}</p>
      <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:16}}>
        {[0,1,2].map(i=><div key={i} style={{width:i<=step?32:10,height:6,borderRadius:3,background:i<=step?C.accent:C.border,transition:"all 0.3s"}}/>)}
      </div>
    </div>
    <div style={{padding:"32px 24px 0"}}>{steps[step]}</div>
  </div>;
}

// ── ROOM SETUP ─────────────────────────────────────────────────────────────
function RoomSetup({uid,userData,onDone}){
  const [tab,setTab]=useState("create");
  const [code,setCode]=useState("");
  const [anniversary,setAnniversary]=useState("");
  const [coupleName,setCoupleName]=useState("");
  const [distance,setDistance]=useState("");
  const [busy,setBusy]=useState(false); const [err,setErr]=useState("");

  const create=async()=>{
    if(!anniversary.trim()){setErr("Anniversary date is required."); return;}
    setBusy(true); setErr("");
    try {
      const c=await createRoom(uid,userData);
      await updateDoc(doc(db,"rooms",c),{anniversary,coupleName:coupleName.trim(),distance:distance.trim()});
      onDone(c,"A");
    } catch(e){ setErr(e.message); }
    setBusy(false);
  };

  const join=async()=>{
    if(!code.trim()){setErr("Please enter the room code."); return;}
    setBusy(true); setErr("");
    try { await joinRoom(uid,code.trim(),userData); onDone(code.trim().toUpperCase(),"B"); }
    catch(e){ setErr(e.message); }
    setBusy(false);
  };

  return <div style={{minHeight:"100vh",background:C.bg,padding:"48px 24px 40px"}}>
    <div style={{textAlign:"center",marginBottom:36}}>
      <div style={{fontSize:52,marginBottom:14}} className="hb-float">♥</div>
      <h2 style={{fontFamily:PF,fontSize:30,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:8}}>Connect with your person</h2>
      <p style={{fontSize:15,color:C.muted,fontFamily:LT,lineHeight:1.7}}>Create a room and share the code, or enter your partner's code.</p>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:28,background:C.border,borderRadius:16,padding:4}}>
      {[["create","Create a room"],["join","Join a room"]].map(([k,l])=>(
        <button key={k} onClick={()=>{setTab(k);setErr("");}} style={{padding:"12px 0",borderRadius:13,border:"none",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,background:tab===k?C.surface:"transparent",color:tab===k?C.accent:C.muted,transition:"all 0.2s"}}>{l}</button>
      ))}
    </div>

    {tab==="create"&&<div className="hb-fade">
      <Field label="Anniversary date *" type="date" value={anniversary} onChange={e=>setAnniversary(e.target.value)}/>
      <Field label="Your couple name (optional)" placeholder="e.g. Koustav & Ankita" value={coupleName} onChange={e=>setCoupleName(e.target.value)}/>
      <Field label="Distance between you (optional)" placeholder="e.g. Bangalore ↔ London" value={distance} onChange={e=>setDistance(e.target.value)}/>
    </div>}

    {tab==="join"&&<div className="hb-fade">
      <Field label="Partner's room code" placeholder="ABC123" value={code} onChange={e=>setCode(e.target.value)} style={{textTransform:"uppercase",letterSpacing:"0.15em",fontWeight:700,fontSize:20}}/>
    </div>}

    <ErrBox msg={err}/>
    {busy?<Spinner text={tab==="create"?"Creating your room...":"Joining room..."}/>:<Btn onClick={tab==="create"?create:join}>{tab==="create"?"Create room →":"Join room →"}</Btn>}
  </div>;
}

// ── WAITING ────────────────────────────────────────────────────────────────
function Waiting({code,onSignOut,onLeave,uid}){
  const [copied,setCopied]=useState(false);
  const copy=()=>{ navigator.clipboard.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),2200); };
  return <div style={{minHeight:"100vh",background:C.bg,padding:"56px 24px",textAlign:"center"}}>
    <div style={{fontSize:56,marginBottom:20}} className="hb-float">♥</div>
    <h2 style={{fontFamily:PF,fontSize:28,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:12}}>Room created!</h2>
    <p style={{color:C.muted,fontSize:15,lineHeight:1.75,marginBottom:36,fontFamily:LT}}>Share this code with your partner.<br/>They enter it when setting up their account.</p>
    <div onClick={copy} style={{background:C.accentSoft,border:`2px solid ${C.accentBd}`,borderRadius:24,padding:"32px 24px",marginBottom:28,cursor:"pointer"}}>
      <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:14,fontFamily:LT}}>Your room code</div>
      <div style={{fontSize:52,fontWeight:700,color:C.accent,letterSpacing:"0.22em",fontFamily:PF}}>{code}</div>
      <div style={{fontSize:13,color:C.accent,marginTop:14,fontWeight:700,fontFamily:LT}}>{copied?"✓ Copied!":"Tap to copy"}</div>
    </div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,color:C.muted,fontSize:14,marginBottom:48,fontFamily:LT}}>
      <div className="hb-spin" style={{display:"inline-block"}}>✦</div>
      Waiting for your partner to join...
    </div>
    <Btn variant="ghost" style={{marginBottom:12}} onClick={async()=>{
      await updateDoc(doc(db,"users",uid),{roomId:null,userKey:null,onboardingDone:true});
      onLeave();
    }}>Join a different room instead →</Btn>
    <button onClick={onSignOut} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:C.muted,fontFamily:LT}}>Sign out</button>
  </div>;
}

// ── NOTIF PANEL ────────────────────────────────────────────────────────────
function NotifPanel({notifications,userKey,roomId,onClose}){
  const readKey=userKey==="A"?"readA":"readB";
  const mine=notifications.filter(n=>n.from!==userKey);
  useEffect(()=>{ if(mine.some(n=>!n[readKey])) markNotifsRead(roomId,userKey,notifications); },[]);
  return <div style={{position:"fixed",inset:0,zIndex:100,background:"rgba(26,10,5,0.5)",display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:"24px 24px 0 0",padding:"24px 20px 48px",maxHeight:"70vh",overflowY:"auto",border:`1px solid ${C.border}`}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <h3 style={{fontFamily:PF,fontStyle:"italic",fontSize:22,fontWeight:400,color:C.text}}>Notifications</h3>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:C.muted}}>✕</button>
      </div>
      {mine.length===0
        ?<div style={{textAlign:"center",padding:"32px 0",color:C.muted,fontFamily:LT}}><div style={{fontSize:40,marginBottom:12}}>🔔</div><div style={{fontSize:14}}>Nothing yet — activity from your partner shows up here.</div></div>
        :mine.map(n=><div key={n.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"14px 0",borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:24,flexShrink:0}}>{NOTIF_ICONS[n.type]||"♥"}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,color:C.text,lineHeight:1.5,fontFamily:LT}}>{n.message}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:4,fontFamily:LT}}>{timeAgo(n.ts)}</div>
          </div>
          {!n[readKey]&&<div style={{width:8,height:8,borderRadius:"50%",background:C.accent,flexShrink:0,marginTop:4}}/>}
        </div>)
      }
    </div>
  </div>;
}

// ── HOME TAB ───────────────────────────────────────────────────────────────
function HomeTab({me,partner,myUser,partnerUser,roomData,roomId,userKey,update,addN,go}){
  const pk=userKey==="A"?"B":"A";
  const [myBeating,setMyBeating]=useState(false);
  const [partnerMsg,setPartnerMsg]=useState(false);
  const days=daysUntil(roomData?.nextMeeting);
  const together=togetherDays(roomData?.anniversary);
  const myBirthday=isBirthday(myUser?.birthday);
  const partnerBirthday=isBirthday(partnerUser?.birthday);

  // Real-time heartbeat sync
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

  return <div style={{padding:"24px 18px 100px"}} className="hb-fade">
    {/* Birthday banner */}
    {(myBirthday||partnerBirthday)&&<div style={{background:`linear-gradient(135deg,${C.goldSoft},${C.accentSoft})`,border:`1px solid ${C.goldBd}`,borderRadius:18,padding:"16px 20px",marginBottom:16,textAlign:"center"}}>
      <div style={{fontSize:28,marginBottom:6}}>🎂</div>
      <div style={{fontFamily:PF,fontSize:17,fontStyle:"italic",color:C.gold}}>{myBirthday?`Happy birthday, ${me?.name}! 🎉`:`Happy birthday, ${partner?.name}! 🎉`}</div>
    </div>}

    {/* Greeting */}
    <div style={{marginBottom:24}}>
      <div style={{fontSize:13,color:C.muted,fontFamily:LT}}>{greet()},</div>
      <h2 style={{fontFamily:PF,fontSize:30,fontWeight:400,fontStyle:"italic",color:C.text,marginTop:2}}>{me?.name} {myUser?.favoriteEmoji||"♥"}</h2>
    </div>

    {/* Couple hero */}
    <Card style={{marginBottom:16,padding:"24px 20px"}}>
      <div style={{display:"flex",alignItems:"center",gap:0}}>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <Avatar name={me?.name||""} photo={myUser?.photo} size={60} color={C.accent}/>
          <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:LT}}>{me?.name}</div>
          {myUser?.timezone&&<div style={{fontSize:11,color:C.muted,fontFamily:LT}}>{getTimeInZone(myUser.timezone)}</div>}
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
          <div style={{fontFamily:PF,fontSize:11,fontStyle:"italic",color:C.muted,textAlign:"center",lineHeight:1.4}}>{roomData?.coupleName||`${me?.name} & ${partner?.name}`}</div>
          <div style={{color:C.accent,fontSize:22}}>♥</div>
          {together!==null&&<div style={{fontSize:11,color:C.muted,fontFamily:LT,textAlign:"center"}}>{together} days together</div>}
          {roomData?.streak?.count>=2&&<div style={{fontSize:11,color:C.gold,fontFamily:LT}}>🔥 {roomData.streak.count}-day streak</div>}
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <Avatar name={partner?.name||"?"} photo={partnerUser?.photo} size={60} color={C.gold}/>
          <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:LT}}>{partner?.name||"Waiting..."}</div>
          {partnerUser?.timezone&&<div style={{fontSize:11,color:C.muted,fontFamily:LT}}>{getTimeInZone(partnerUser.timezone)}</div>}
        </div>
      </div>
    </Card>

    {/* Partner status */}
    {partner&&<Card style={{marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{fontSize:32}}>{partner?.mood||"🥰"}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:12,color:C.muted,fontFamily:LT,marginBottom:3}}>{partner?.name} feels</div>
          <div style={{fontSize:15,fontWeight:600,color:C.text,fontFamily:LT}}>{MOODS.find(m=>m.e===partner?.mood)?.l||"—"}</div>
          {partnerUser?.status&&<div style={{fontSize:13,color:C.muted,fontFamily:PF,fontStyle:"italic",marginTop:4}}>"{partnerUser.status}"</div>}
        </div>
      </div>
    </Card>}

    {/* Countdown */}
    {days!==null&&<div style={{background:C.accentSoft,border:`1px solid ${C.accentBd}`,borderRadius:18,padding:"16px 20px",marginBottom:14,display:"flex",alignItems:"center",gap:14}}>
      <span style={{fontSize:26}}>⏳</span>
      <div>
        <div style={{fontSize:22,fontWeight:700,color:C.accent,fontFamily:PF}}>{days} {days===1?"day":"days"}</div>
        <div style={{fontSize:12,color:C.muted,fontFamily:LT}}>until you're together again</div>
      </div>
    </div>}

    {/* Heartbeat */}
    <div style={{textAlign:"center",padding:"24px 0 20px"}}>
      <div style={{fontSize:13,color:C.muted,marginBottom:16,fontFamily:LT}}>
        {partnerMsg?`${partner?.name} is thinking of you ♥`:"Let them know you're thinking of them"}
      </div>
      <button onClick={sendHeart} className={myBeating?"hb-beat":(partnerMsg?"hb-fast":"hb-slow")} style={{width:90,height:90,borderRadius:"50%",border:"none",background:partnerMsg?C.gold:C.accent,cursor:"pointer",fontSize:44,display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#fff",transition:"background 0.4s"}}>♥</button>
      <div style={{fontSize:13,color:partnerMsg?C.gold:C.muted,marginTop:14,fontFamily:LT,fontWeight:partnerMsg?700:400,transition:"all 0.3s"}}>
        {partnerMsg?`♥ ${partner?.name} is thinking of you`:  "Heartbeat"}
      </div>
    </div>

    {/* My mood */}
    <div style={{marginBottom:20}}>
      <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Your vibe right now</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
        {MOODS.map(m=><button key={m.e} onClick={()=>setMood(m.e)} style={{padding:"7px 12px",borderRadius:20,fontSize:12,cursor:"pointer",fontFamily:LT,border:`1.5px solid ${me?.mood===m.e?C.accent:C.border}`,background:me?.mood===m.e?C.accentSoft:C.surface,color:C.text,transition:"all 0.18s"}}>{m.e} {m.l}</button>)}
      </div>
    </div>
  </div>;
}

// ── PLAY TAB ───────────────────────────────────────────────────────────────
function PlayTab({me,partner,userKey,roomData,update,addN,go}){
  const pk=userKey==="A"?"B":"A";
  const today=todayKey();

  const getStatus=key=>{
    const d=roomData?.[`${key}_${today}`];
    if(!d) return "start";
    if(key==="qa"){
      if(!d.question) return "start";
      if(!d.answers?.[userKey]) return "your-turn";
      if(!d.guesses?.[userKey]) return "your-turn";
      if(!d.answers?.[pk]||!d.guesses?.[pk]) return "waiting";
      return "done";
    }
    if(key==="wyr"||key==="compat"){
      if(!d.a&&!d.questions) return "start";
      if(!d.choices?.[userKey]&&!d.ratings?.[userKey]) return "your-turn";
      if(!d.choices?.[pk]&&!d.ratings?.[pk]) return "waiting";
      return "done";
    }
    if(key==="ninh"){
      if(!d.statements) return "start";
      if(d.statements.some(s=>!s[userKey])) return "your-turn";
      if(d.statements.some(s=>!s[pk])) return "waiting";
      return "done";
    }
    return "start";
  };

  const statusBadge=status=>{
    const map={start:{bg:C.goldSoft,color:C.gold,bd:C.goldBd,label:"Start"},  "your-turn":{bg:C.accentSoft,color:C.accent,bd:C.accentBd,label:"Your turn"},"waiting":{bg:C.surface,color:C.muted,bd:C.border,label:`Waiting for ${partner?.name||"partner"}`},done:{bg:C.sageSoft,color:C.sage,bd:C.sageBd,label:"✓ Done today"}};
    const m=map[status]||map.start;
    return <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:m.bg,color:m.color,border:`1px solid ${m.bd}`,fontFamily:LT,letterSpacing:"0.04em"}}>{m.label}</span>;
  };

  const games=[
    {icon:"🎯",title:"Daily Q&A",desc:"Guess each other's answers",key:"qa"},
    {icon:"🤔",title:"Would You Rather",desc:"Pick your side",key:"wyr"},
    {icon:"🙋",title:"Never Have I Ever",desc:"Confess together",key:"nhie"},
    {icon:"🎭",title:"Truth or Dare",desc:"Pick your fate",key:"tord"},
    {icon:"📊",title:"Compatibility",desc:"How alike are you?",key:"compat"},
    {icon:"💝",title:"Love Language",desc:"Know each other better",key:"lovelang"},
    {icon:"🔥",title:"Desire",desc:"Bold & daring prompts",key:"desire"},
  ];

  return <div style={{padding:"24px 18px 100px"}} className="hb-fade">
    <h2 style={{fontFamily:PF,fontSize:26,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:6}}>Play</h2>
    <p style={{fontSize:13,color:C.muted,fontFamily:LT,marginBottom:24}}>Games and activities that bring you closer.</p>
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {games.map(g=>{
        const status=["qa","wyr","ninh","compat"].includes(g.key)?getStatus(g.key):"start";
        return <button key={g.key} onClick={()=>go(g.key)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:"18px 18px",display:"flex",alignItems:"center",gap:16,cursor:"pointer",fontFamily:LT,textAlign:"left",transition:"all 0.2s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accentBd;e.currentTarget.style.background=C.accentSoft;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.surface;}}>
          <div style={{fontSize:32,flexShrink:0}}>{g.icon}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:3}}>{g.title}</div>
            <div style={{fontSize:12,color:C.muted}}>{g.desc}</div>
          </div>
          {["qa","wyr","ninh","compat"].includes(g.key)&&statusBadge(status)}
          <div style={{color:C.muted,fontSize:16}}>→</div>
        </button>;
      })}
    </div>
  </div>;
}

// ── US TAB ─────────────────────────────────────────────────────────────────
function UsTab({me,partner,userKey,roomData,update,addN,go}){
  const pk=userKey==="A"?"B":"A";
  const readKey=userKey==="A"?"readA":"readB";
  const unreadNotes=(roomData?.notes||[]).filter(n=>n.from===pk&&!n[readKey+"_note"]).length;
  const bucketDone=(roomData?.bucket||[]).filter(i=>i.done).length;
  const today=todayKey();
  const grat=roomData?.[`grat_${today}`];
  const gratDone=!!(grat?.[userKey]&&grat?.[pk]);
  const gratMine=!!grat?.[userKey];

  const sections=[
    {icon:"💌",title:"Love Notes",desc:unreadNotes>0?`${unreadNotes} unread from ${partner?.name}`:"Write something beautiful",key:"notes",badge:unreadNotes,color:C.accent},
    {icon:"🙏",title:"Gratitude",desc:gratDone?"Both shared today ✓":gratMine?"Waiting for "+partner?.name:"Share what you love about them",key:"grat",color:C.gold,done:gratDone},
    {icon:"🌍",title:"Bucket List",desc:`${bucketDone} of ${(roomData?.bucket||[]).length} done together`,key:"bucket",color:C.sage},
    {icon:"🫙",title:"Memory Jar",desc:`${(roomData?.memories||[]).length} memories saved`,key:"memories",color:C.purple},
  ];

  return <div style={{padding:"24px 18px 100px"}} className="hb-fade">
    <h2 style={{fontFamily:PF,fontSize:26,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:6}}>Us</h2>
    <p style={{fontSize:13,color:C.muted,fontFamily:LT,marginBottom:24}}>Your shared space. Everything you build together.</p>
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {sections.map(s=><button key={s.key} onClick={()=>go(s.key)} style={{background:C.surface,border:`1px solid ${s.done?C.sageBd:C.border}`,borderRadius:20,padding:"18px 18px",display:"flex",alignItems:"center",gap:16,cursor:"pointer",fontFamily:LT,textAlign:"left",transition:"all 0.2s",background:s.done?C.sageSoft:C.surface}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accentBd;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=s.done?C.sageBd:C.border;}}>
        <div style={{fontSize:32,flexShrink:0}}>{s.icon}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:3}}>{s.title}</div>
          <div style={{fontSize:12,color:C.muted}}>{s.desc}</div>
        </div>
        {s.badge>0&&<div style={{background:C.accent,color:"#fff",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{s.badge}</div>}
        {s.done&&<div style={{color:C.sage,fontSize:18}}>✓</div>}
        {!s.done&&<div style={{color:C.muted,fontSize:16}}>→</div>}
      </button>)}
    </div>
  </div>;
}

// ── PROFILE TAB ────────────────────────────────────────────────────────────
function ProfileTab({me,partner,myUser,partnerUser,uid,userKey,roomData,update,onSignOut}){
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(myUser?.name||me?.name||"");
  const [photo,setPhoto]=useState(myUser?.photo||"");
  const [status,setStatus]=useState(myUser?.status||"");
  const [timezone,setTimezone]=useState(myUser?.timezone||"");
  const [birthday,setBirthday]=useState(myUser?.birthday||"");
  const [emoji,setEmoji]=useState(myUser?.favoriteEmoji||"♥");
  const [coupleName,setCoupleName]=useState(roomData?.coupleName||"");
  const [anniversary,setAnniversary]=useState(roomData?.anniversary||"");
  const [distance,setDistance]=useState(roomData?.distance||"");
  const [howWeMet,setHowWeMet]=useState(roomData?.howWeMet?.[userKey]||"");
  const [couplePhoto,setCouplePhoto]=useState(roomData?.couplePhoto||"");
  const [busy,setBusy]=useState(false);
  const EMOJIS=["♥","🌙","⭐","🌸","🦋","🌊","☀️","🌿","🎵","✨"];

  const save=async()=>{
    setBusy(true);
    await updateDoc(doc(db,"users",uid),{name:name.trim(),photo,status:status.trim(),timezone,birthday,favoriteEmoji:emoji});
    await update({[`users.${userKey}.name`]:name.trim(),[`users.${userKey}.mood`]:me?.mood||"🥰",coupleName:coupleName.trim(),anniversary,distance:distance.trim(),[`howWeMet.${userKey}`]:howWeMet.trim(),couplePhoto});
    setEditing(false); setBusy(false);
  };

  const together=togetherDays(roomData?.anniversary);

  return <div style={{padding:"24px 18px 100px"}} className="hb-fade">
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
      <h2 style={{fontFamily:PF,fontSize:26,fontStyle:"italic",fontWeight:400,color:C.text}}>Profile</h2>
      <button onClick={()=>setEditing(!editing)} style={{background:editing?C.accentSoft:"transparent",border:`1px solid ${editing?C.accentBd:C.border}`,borderRadius:20,padding:"7px 16px",cursor:"pointer",fontSize:13,fontWeight:700,color:editing?C.accent:C.muted,fontFamily:LT}}>{editing?"Cancel":"Edit"}</button>
    </div>

    {/* Your profile */}
    <Card style={{marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:16,fontFamily:LT}}>You</div>
      {editing?(
        <div>
          <div style={{display:"flex",justifyContent:"center",marginBottom:20}}><PhotoUpload current={photo} onUpload={setPhoto} size={90}/></div>
          <Field label="Display name" value={name} onChange={e=>setName(e.target.value)}/>
          <Field label="Status message" placeholder="What's on your mind?" value={status} onChange={e=>setStatus(e.target.value)}/>
          <Field label="Birthday" type="date" value={birthday} onChange={e=>setBirthday(e.target.value)}/>
          <Field label="Timezone" select value={timezone} onChange={e=>setTimezone(e.target.value)}>
            <option value="">Select timezone</option>
            {TIMEZONES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </Field>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Favourite emoji</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {EMOJIS.map(e=><button key={e} onClick={()=>setEmoji(e)} style={{width:38,height:38,borderRadius:10,border:`2px solid ${emoji===e?C.accent:C.border}`,background:emoji===e?C.accentSoft:"transparent",fontSize:18,cursor:"pointer"}}>{e}</button>)}
            </div>
          </div>
        </div>
      ):(
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <Avatar name={me?.name||""} photo={myUser?.photo} size={64} color={C.accent}/>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:LT}}>{me?.name} {myUser?.favoriteEmoji}</div>
            {myUser?.status&&<div style={{fontSize:13,color:C.muted,fontFamily:PF,fontStyle:"italic",marginTop:4}}>"{myUser.status}"</div>}
            {myUser?.timezone&&<div style={{fontSize:12,color:C.muted,fontFamily:LT,marginTop:4}}>{TIMEZONES.find(t=>t.value===myUser.timezone)?.label||myUser.timezone}</div>}
            {myUser?.birthday&&<div style={{fontSize:12,color:C.muted,fontFamily:LT,marginTop:2}}>🎂 {new Date(myUser.birthday).toLocaleDateString("en",{month:"long",day:"numeric"})}</div>}
          </div>
        </div>
      )}
    </Card>

    {/* Partner profile */}
    <Card style={{marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:16,fontFamily:LT}}>Your person</div>
      <div style={{display:"flex",alignItems:"center",gap:16}}>
        <Avatar name={partner?.name||"?"} photo={partnerUser?.photo} size={64} color={C.gold}/>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:LT}}>{partner?.name||"Waiting..."} {partnerUser?.favoriteEmoji}</div>
          {partnerUser?.status&&<div style={{fontSize:13,color:C.muted,fontFamily:PF,fontStyle:"italic",marginTop:4}}>"{partnerUser.status}"</div>}
          {partnerUser?.timezone&&<div style={{fontSize:12,color:C.muted,fontFamily:LT,marginTop:4}}>{TIMEZONES.find(t=>t.value===partnerUser?.timezone)?.label||partnerUser?.timezone}</div>}
          {partnerUser?.loveLanguage&&<div style={{fontSize:12,color:C.muted,fontFamily:LT,marginTop:2}}>{LOVE_LANGS.find(l=>l.key===partnerUser.loveLanguage)?.icon} {LOVE_LANGS.find(l=>l.key===partnerUser.loveLanguage)?.title}</div>}
        </div>
      </div>
    </Card>

    {/* Couple section */}
    <Card style={{marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:16,fontFamily:LT}}>Your relationship</div>
      {editing?(
        <div>
          {roomData?.couplePhoto&&<img src={roomData.couplePhoto} style={{width:"100%",borderRadius:16,marginBottom:16,objectFit:"cover",height:160}} alt="couple"/>}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:8,fontFamily:LT}}>Couple photo</div>
            <PhotoUpload current={couplePhoto} onUpload={setCouplePhoto} size={70}/>
          </div>
          <Field label="Couple name" placeholder="e.g. Koustav & Ankita" value={coupleName} onChange={e=>setCoupleName(e.target.value)}/>
          <Field label="Anniversary date *" type="date" value={anniversary} onChange={e=>setAnniversary(e.target.value)}/>
          <Field label="Distance between you" placeholder="e.g. Bangalore ↔ London" value={distance} onChange={e=>setDistance(e.target.value)}/>
          <Field label="How you met (your side)" textarea placeholder="One line about how you two found each other..." value={howWeMet} onChange={e=>setHowWeMet(e.target.value)}/>
        </div>
      ):(
        <div>
          {roomData?.couplePhoto&&<img src={roomData.couplePhoto} style={{width:"100%",borderRadius:16,marginBottom:16,objectFit:"cover",height:160}} alt="couple"/>}
          <div style={{fontFamily:PF,fontSize:20,fontStyle:"italic",color:C.accent,marginBottom:12}}>{roomData?.coupleName||`${me?.name} & ${partner?.name}`}</div>
          {together!==null&&<div style={{fontSize:14,color:C.text,fontFamily:LT,marginBottom:8}}>♥ Together {together} days{roomData?.anniversary?` since ${new Date(roomData.anniversary).toLocaleDateString("en",{month:"long",day:"numeric",year:"numeric"})}`:""}</div>}
          {roomData?.distance&&<div style={{fontSize:13,color:C.muted,fontFamily:LT,marginBottom:8}}>📍 {roomData.distance}</div>}
          {roomData?.howWeMet?.A&&<div style={{fontSize:13,color:C.muted,fontFamily:PF,fontStyle:"italic",marginTop:8}}>"{roomData.howWeMet.A}"</div>}
          {roomData?.howWeMet?.B&&<div style={{fontSize:13,color:C.muted,fontFamily:PF,fontStyle:"italic",marginTop:4}}>"{roomData.howWeMet.B}"</div>}
        </div>
      )}
    </Card>

    {editing&&(busy?<Spinner text="Saving..."/>:<Btn onClick={save} style={{marginBottom:12}}>Save changes ✦</Btn>)}

    {/* Settings */}
    <Card>
      <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:14,fontFamily:LT}}>Settings</div>
      <button onClick={onSignOut} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 18px",cursor:"pointer",fontSize:14,color:C.muted,fontFamily:LT,width:"100%",textAlign:"left"}}>Sign out</button>
    </Card>
  </div>;
}

// ── GAME SCREENS ───────────────────────────────────────────────────────────
function QAScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const fk=`qa_${todayKey()}`; const qa=roomData?.[fk];
  const [ans,setAns]=useState(qa?.answers?.[userKey]||""); const [guess,setGuess]=useState(qa?.guesses?.[userKey]||""); const [loading,setLoading]=useState(false);
  const phase=!qa?.question?"gen":!qa?.answers?.[userKey]?"answer":!qa?.guesses?.[userKey]?"guess":"result";
  const generate=async()=>{ setLoading(true); try{ const q=await callClaude("Generate one thoughtful fun daily question for a long-distance couple. Return ONLY the question, no quotes.","Fresh question."); await update({[fk]:{question:q,answers:{},guesses:{},date:todayStr()}}); }catch(e){console.error(e);} setLoading(false); };
  const QCard=()=><Card style={{marginBottom:18}}><div style={{fontSize:11,fontWeight:700,color:C.accent,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Today's question</div><p style={{fontFamily:PF,fontSize:20,fontStyle:"italic",lineHeight:1.65,color:C.text,margin:0}}>"{qa.question}"</p></Card>;
  return <div style={{padding:"22px 18px 48px"}} className="hb-fade">
    <Hdr title="Daily Question" sub={new Date().toLocaleDateString("en",{weekday:"long",month:"long",day:"numeric"})} back={back}/>
    {phase==="gen"&&<div style={{textAlign:"center",paddingTop:20}}><div style={{fontSize:56,marginBottom:18}} className="hb-float">🎯</div><h3 style={{fontFamily:PF,fontSize:24,fontStyle:"italic",fontWeight:400,marginBottom:10,color:C.text}}>Today's question awaits</h3><p style={{color:C.muted,fontSize:15,lineHeight:1.7,marginBottom:32,fontFamily:LT}}>A fresh question, crafted just for you two.</p>{loading?<Spinner text="Crafting your question..."/>:<Btn onClick={generate}>Generate today's question ✦</Btn>}</div>}
    {phase==="answer"&&<div><QCard/><Field textarea label={`Your answer, ${me?.name}`} value={ans} onChange={e=>setAns(e.target.value)} placeholder="Be honest — your partner will try to guess this..."/><Btn disabled={!ans.trim()} onClick={async()=>{if(!ans.trim())return;await update({[`${fk}.answers.${userKey}`]:ans.trim()});await addN("qa",`${me?.name} answered today's question`);}}>Lock in my answer →</Btn></div>}
    {phase==="guess"&&<div><QCard/><div style={{background:C.accentSoft,border:`1px solid ${C.accentBd}`,borderRadius:16,padding:16,marginBottom:18}}><div style={{fontSize:11,fontWeight:700,color:C.accent,marginBottom:6,fontFamily:LT}}>✓ Your answer is locked in</div><div style={{fontSize:15,color:C.text,fontFamily:LT}}>{qa?.answers?.[userKey]}</div></div>{!qa?.answers?.[pk]&&<div style={{background:C.goldSoft,border:`1px solid ${C.goldBd}`,borderRadius:14,padding:12,marginBottom:16,fontSize:13,color:C.gold,fontFamily:LT}}>⏳ {partner?.name} hasn't answered yet</div>}<Field textarea label={`What do you think ${partner?.name} said?`} value={guess} onChange={e=>setGuess(e.target.value)} placeholder={`Guess ${partner?.name}'s answer...`}/><Btn disabled={!guess.trim()} onClick={async()=>{if(!guess.trim())return;await update({[`${fk}.guesses.${userKey}`]:guess.trim()});await addN("qa",`${me?.name} guessed your answer`);}}>Submit my guess →</Btn></div>}
    {phase==="result"&&<div><Card style={{marginBottom:18}}><p style={{fontFamily:PF,fontSize:18,fontStyle:"italic",lineHeight:1.6,color:C.text,margin:0}}>"{qa.question}"</p></Card>{[[userKey,me?.name,C.accent,C.accentSoft,C.accentBd,pk],[pk,partner?.name,C.gold,C.goldSoft,C.goldBd,userKey]].map(([key,name,color,soft,bd,gk])=><div key={key} style={{background:soft,border:`1px solid ${bd}`,borderRadius:18,padding:20,marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>{name}'s answers</div><div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,marginBottom:4,fontFamily:LT}}>Their answer:</div><div style={{fontSize:15,color:C.text,fontFamily:LT}}>{qa?.answers?.[key]||<i style={{color:C.muted}}>Not answered yet</i>}</div></div><div><div style={{fontSize:11,color:C.muted,marginBottom:4,fontFamily:LT}}>{key===userKey?`${partner?.name}'s guess:`:`${me?.name}'s guess:`}</div><div style={{fontSize:15,color:C.text,fontFamily:LT}}>{qa?.guesses?.[gk]||<i style={{color:C.muted}}>Not guessed yet</i>}</div></div></div>)}<Btn variant="ghost" onClick={back}>← Back</Btn></div>}
  </div>;
}

function WYRScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const fk=`wyr_${todayKey()}`; const wyr=roomData?.[fk]; const [loading,setLoading]=useState(false);
  const generate=async()=>{ setLoading(true); try{ const raw=await callClaude('Would You Rather for a couple. Return ONLY JSON: {"a":"option A","b":"option B"} — no backticks. Under 12 words each. Make it genuinely hard.',"Create dilemma."); const m=raw.match(/\{[\s\S]*?\}/); const p=JSON.parse(m?m[0]:raw); await update({[fk]:{a:p.a,b:p.b,choices:{}}}); }catch(e){console.error(e);} setLoading(false); };
  const choose=async opt=>{ if(wyr?.choices?.[userKey]) return; await update({[`${fk}.choices.${userKey}`]:opt}); await addN("wyr",`${me?.name} made their choice`); };
  const mine=wyr?.choices?.[userKey],theirs=wyr?.choices?.[pk],both=mine&&theirs,agree=both&&mine===theirs;
  const opts=[{key:"a",text:wyr?.a,color:C.accent,soft:C.accentSoft,bd:C.accentBd,label:"Option A"},{key:"b",text:wyr?.b,color:C.gold,soft:C.goldSoft,bd:C.goldBd,label:"Option B"}];
  return <div style={{padding:"22px 18px 48px"}} className="hb-fade">
    <Hdr title="Would You Rather" sub="Make choices, discover each other" back={back}/>
    {!wyr?.a?(<div style={{textAlign:"center",paddingTop:20}}><div style={{fontSize:56,marginBottom:18}} className="hb-float">🤔</div><p style={{color:C.muted,fontSize:15,lineHeight:1.7,marginBottom:32,fontFamily:LT}}>No obvious right answer — just interesting choices.</p>{loading?<Spinner text="Crafting your dilemma..."/>:<Btn onClick={generate}>Generate today's dilemma ✦</Btn>}</div>):(<div><p style={{fontFamily:PF,fontSize:20,fontStyle:"italic",color:C.muted,textAlign:"center",marginBottom:22}}>Would you rather...</p>{opts.map(opt=>{ const chosen=mine===opt.key,pp=theirs===opt.key; return <button key={opt.key} onClick={()=>!mine&&choose(opt.key)} style={{display:"block",width:"100%",background:chosen?opt.soft:C.surface,border:`2px solid ${chosen?opt.color:C.border}`,borderRadius:20,padding:24,textAlign:"left",cursor:mine?"default":"pointer",fontFamily:LT,marginBottom:14,transition:"all 0.25s",boxShadow:chosen?`0 4px 20px ${opt.color}22`:"none"}}><div style={{fontSize:11,fontWeight:700,color:opt.color,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10}}>{opt.label}</div><div style={{fontFamily:PF,fontSize:19,fontStyle:"italic",color:C.text,lineHeight:1.55}}>{opt.text}</div>{both&&<div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap"}}>{chosen&&<span style={{fontSize:11,fontWeight:700,color:opt.color,background:opt.soft,padding:"3px 10px",borderRadius:20,border:`1px solid ${opt.bd}`}}>✓ {me?.name}</span>}{pp&&<span style={{fontSize:11,fontWeight:700,color:opt.color,background:opt.soft,padding:"3px 10px",borderRadius:20,border:`1px solid ${opt.bd}`}}>✓ {partner?.name}</span>}</div>}</button>; })}{!mine&&<p style={{textAlign:"center",fontSize:13,color:C.muted,fontFamily:LT}}>Tap to choose — no changing your mind!</p>}{mine&&!theirs&&<div style={{background:C.goldSoft,border:`1px solid ${C.goldBd}`,borderRadius:14,padding:12,textAlign:"center",fontSize:13,color:C.gold,fontFamily:LT}}>⏳ Waiting for {partner?.name}...</div>}{both&&<div style={{marginTop:8}}><div style={{background:agree?"#E8F5EC":C.accentSoft,border:`1px solid ${agree?"#B5DFC2":C.accentBd}`,borderRadius:16,padding:18,textAlign:"center",marginBottom:14}}><div style={{fontSize:28,marginBottom:8}}>{agree?"🎉":"✨"}</div><div style={{fontWeight:700,color:agree?"#3d7a52":C.accent,fontSize:14,fontFamily:LT}}>{agree?"You both chose the same!":"You chose differently — great conversation starter!"}</div></div><Btn variant="outline" onClick={()=>update({[fk]:{a:"",b:"",choices:{}}})}>New dilemma →</Btn></div>}</div>)}
  </div>;
}

function NHIE({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const fk=`ninh_${todayKey()}`; const ninh=roomData?.[fk]; const [loading,setLoading]=useState(false);
  const generate=async()=>{ setLoading(true); try{ const raw=await callClaude('5 "Never Have I Ever" statements for a couple. Return ONLY a JSON array of 5 strings — no backticks.',"Generate."); const m=raw.match(/\[[\s\S]*?\]/); const arr=JSON.parse(m?m[0]:raw); await update({[fk]:{statements:arr.map(t=>({text:t,A:null,B:null}))}}); }catch(e){console.error(e);} setLoading(false); };
  const vote=async(i,choice)=>{ if(!ninh?.statements||ninh.statements[i][userKey]) return; const stmts=[...ninh.statements]; stmts[i]={...stmts[i],[userKey]:choice}; await update({[`${fk}.statements`]:stmts}); await addN("nhie",`${me?.name} voted on Never Have I Ever`); };
  return <div style={{padding:"22px 18px 48px"}} className="hb-fade">
    <Hdr title="Never Have I Ever" sub="Find out who's done what" back={back}/>
    {!ninh?.statements?(<div style={{textAlign:"center",paddingTop:20}}><div style={{fontSize:56,marginBottom:18}} className="hb-float">🙋</div><p style={{color:C.muted,fontSize:15,lineHeight:1.7,marginBottom:32,fontFamily:LT}}>5 statements. Have or never?</p>{loading?<Spinner text="Generating statements..."/>:<Btn onClick={generate}>Generate statements ✦</Btn>}</div>):(
    <div>{ninh.statements.map((s,i)=><Card key={i}><div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,fontFamily:LT}}>#{i+1}</div><p style={{fontSize:14,color:C.text,marginBottom:14,lineHeight:1.55,fontFamily:LT}}>{s.text}</p>{!s[userKey]?(<div style={{display:"flex",gap:10}}><button onClick={()=>vote(i,"have")} style={{flex:1,padding:11,borderRadius:13,border:"1.5px solid #B5DFC2",background:"#E8F5EC",cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,color:"#3d7a52"}}>✓ I have</button><button onClick={()=>vote(i,"never")} style={{flex:1,padding:11,borderRadius:13,border:`1.5px solid ${C.accentBd}`,background:C.accentSoft,cursor:"pointer",fontFamily:LT,fontSize:13,fontWeight:700,color:C.accent}}>✗ Never</button></div>):(<div style={{display:"flex",flexWrap:"wrap",gap:7}}>{[[userKey,me?.name],[pk,partner?.name]].map(([key,name])=>s[key]?<span key={key} style={{fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:20,background:s[key]==="have"?"#E8F5EC":C.accentSoft,color:s[key]==="have"?"#3d7a52":C.accent,border:`1px solid ${s[key]==="have"?"#B5DFC2":C.accentBd}`,fontFamily:LT}}>{name}: {s[key]==="have"?"✓ Have":"✗ Never"}</span>:<span key={key} style={{fontSize:11,color:C.muted,fontStyle:"italic",fontFamily:LT}}>⏳ {name}...</span>)}</div>)}</Card>)}
    {ninh.statements.every(s=>s.A&&s.B)&&<Btn variant="outline" onClick={()=>update({[fk]:null})}>New round →</Btn>}</div>)}
  </div>;
}
function DesireGame({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A";
  const fk=`desire_${todayKey()}`;
  const desire=roomData?.[fk];
  const [loading,setLoading]=useState(false);
  const [response,setResponse]=useState(desire?.responses?.[userKey]||"");
  const [category,setCategory]=useState("random");

  const CATS=[
    {key:"confess",icon:"💭",label:"Confess",   desc:"Admit something bold"},
    {key:"dare",   icon:"🔥",label:"Dare",      desc:"Do something daring"},
    {key:"question",icon:"💋",label:"Question", desc:"Answer something intimate"},
    {key:"fantasy",icon:"✨",label:"Fantasy",   desc:"Share a fantasy"},
  ];

  const generate=async()=>{
    setLoading(true);
    try {
      const cat=category==="random"?CATS[Math.floor(Math.random()*CATS.length)].key:category;
      const prompts={
        confess:"Generate one bold confession prompt for a couple in a committed long-distance relationship. Push them to admit something intimate or vulnerable they haven't said before. Return ONLY the prompt, no preamble.",
        dare:"Generate one spicy dare for a person in a long-distance relationship. Must be something they can do alone and share with their partner via text, photo or voice note — intimate and bold but doable remotely. Return ONLY the dare, nothing else.",
        question:"Generate one bold intimate question for a couple that reveals desires or deep feelings. Push beyond surface level but keep it about their relationship. Return ONLY the question.",
        fantasy:"Generate one prompt for a couple to share a fantasy with each other — imaginative, sensual and specific to long-distance lovers. Return ONLY the prompt.",
      };
      const result=await callClaude(
        "You generate bold adult content for consenting couples in committed long-distance relationships. Content is intimate and daring but always respectful, never degrading. Focus on emotional and sensual connection.",
        prompts[cat]
      );
      await update({[fk]:{prompt:result,category:cat,responses:{},revealed:false}});
    } catch(e){console.error(e);}
    setLoading(false);
  };

  const submitResponse=async()=>{
    if(!response.trim()) return;
    await update({[`${fk}.responses.${userKey}`]:response.trim()});
    await addN("desire",`${me?.name} responded to Desire 🔥`);
  };

  const reveal=async()=>{ await update({[`${fk}.revealed`]:true}); };

  const bothResponded=desire?.responses?.[userKey]&&desire?.responses?.[pk];
  const phase=!desire?.prompt?"gen":!desire?.responses?.[userKey]?"respond":!desire?.responses?.[pk]?"wait":!desire?.revealed?"reveal":"result";
  const catInfo=CATS.find(c=>c.key===desire?.category)||CATS[0];

  // Dark card style for the prompt
  const DarkCard=({children})=><div style={{background:"#1A0A05",borderRadius:22,padding:28,marginBottom:22,textAlign:"center"}}>{children}</div>;

  return (
    <div style={{padding:"22px 18px 100px"}} className="hb-fade">
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
        <BackBtn onClick={back}/>
        <div style={{flex:1}}>
          <h2 style={{fontFamily:PF,fontSize:22,fontWeight:400,fontStyle:"italic",color:C.text}}>Desire</h2>
          <div style={{fontSize:12,color:C.muted,fontFamily:LT}}>Bold. Daring. Just the two of you.</div>
        </div>
        <div style={{background:"#1A0A05",borderRadius:20,padding:"5px 13px"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#E8A080",fontFamily:LT,letterSpacing:"0.05em"}}>🔥 SPICY</span>
        </div>
      </div>

      {/* GEN phase */}
      {phase==="gen"&&<div className="hb-fade">
        <div style={{textAlign:"center",paddingTop:12,marginBottom:32}}>
          <div style={{fontSize:64,marginBottom:18}} className="hb-float">🔥</div>
          <h3 style={{fontFamily:PF,fontSize:26,fontStyle:"italic",fontWeight:400,color:C.text,marginBottom:10}}>Push each other's limits</h3>
          <p style={{color:C.muted,fontSize:15,lineHeight:1.75,fontFamily:LT}}>Bold prompts. Honest answers.<br/>Just the two of you.</p>
        </div>

        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>Choose a category</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <button onClick={()=>setCategory("random")} style={{padding:"16px 12px",borderRadius:18,border:`2px solid ${category==="random"?"#1A0A05":C.border}`,background:category==="random"?"#1A0A05":C.surface,cursor:"pointer",fontFamily:LT,textAlign:"center",transition:"all 0.2s"}}>
              <div style={{fontSize:26,marginBottom:7}}>🎲</div>
              <div style={{fontSize:13,fontWeight:700,color:category==="random"?"#E8A080":C.text}}>Surprise me</div>
              <div style={{fontSize:11,color:category==="random"?"#A07060":"#8A6A50",marginTop:3,fontFamily:LT}}>Any category</div>
            </button>
            {CATS.map(cat=>(
              <button key={cat.key} onClick={()=>setCategory(cat.key)} style={{padding:"16px 12px",borderRadius:18,border:`2px solid ${category===cat.key?"#1A0A05":C.border}`,background:category===cat.key?"#1A0A05":C.surface,cursor:"pointer",fontFamily:LT,textAlign:"center",transition:"all 0.2s"}}
                onMouseEnter={e=>{if(category!==cat.key){e.currentTarget.style.borderColor=C.accentBd;e.currentTarget.style.background=C.accentSoft;}}}
                onMouseLeave={e=>{if(category!==cat.key){e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.surface;}}}>
                <div style={{fontSize:26,marginBottom:7}}>{cat.icon}</div>
                <div style={{fontSize:13,fontWeight:700,color:category===cat.key?"#E8A080":C.text}}>{cat.label}</div>
                <div style={{fontSize:11,color:category===cat.key?"#A07060":C.muted,marginTop:3,fontFamily:LT}}>{cat.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {loading?<Spinner text="Generating your prompt..."/>:<Btn onClick={generate} style={{background:"#1A0A05",color:"#FAF0E8",border:"none",letterSpacing:"0.08em"}}>Generate prompt 🔥</Btn>}
      </div>}

      {/* RESPOND phase */}
      {phase==="respond"&&<div className="hb-fade">
        <DarkCard>
          <div style={{fontSize:11,fontWeight:700,color:"#E8A080",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:14,fontFamily:LT}}>{catInfo.icon} {catInfo.label}</div>
          <p style={{fontFamily:PF,fontSize:20,fontStyle:"italic",color:"#FAF0E8",lineHeight:1.65,margin:0}}>{desire.prompt}</p>
        </DarkCard>
        <Field textarea label={`Your response, ${me?.name}`} value={response} onChange={e=>setResponse(e.target.value)} placeholder="Be honest. Be bold." es={{minHeight:120}}/>
        <Btn disabled={!response.trim()} onClick={submitResponse} style={{background:"#1A0A05",color:"#FAF0E8",border:"none"}}>Lock in my response →</Btn>
        <p style={{textAlign:"center",fontSize:12,color:C.muted,marginTop:12,fontFamily:LT}}>Hidden until your partner responds</p>
      </div>}

      {/* WAIT phase */}
      {phase==="wait"&&<div className="hb-fade">
        <DarkCard>
          <p style={{fontFamily:PF,fontSize:20,fontStyle:"italic",color:"#FAF0E8",lineHeight:1.65,margin:0}}>{desire.prompt}</p>
        </DarkCard>
        <div style={{background:C.accentSoft,border:`1px solid ${C.accentBd}`,borderRadius:16,padding:18,marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:C.accent,marginBottom:8,fontFamily:LT}}>✓ Your response is locked in</div>
          <div style={{fontSize:15,color:C.text,fontFamily:LT,lineHeight:1.6}}>{desire?.responses?.[userKey]}</div>
        </div>
        <div style={{background:C.goldSoft,border:`1px solid ${C.goldBd}`,borderRadius:14,padding:14,textAlign:"center",fontSize:13,color:C.gold,fontFamily:LT}}>
          ⏳ Waiting for {partner?.name} to respond...
        </div>
      </div>}

      {/* REVEAL phase */}
      {phase==="reveal"&&<div className="hb-fade">
        <DarkCard>
          <p style={{fontFamily:PF,fontSize:19,fontStyle:"italic",color:"#FAF0E8",lineHeight:1.65,margin:0}}>{desire.prompt}</p>
        </DarkCard>
        <div style={{textAlign:"center",padding:"16px 0 28px"}}>
          <div style={{fontSize:52,marginBottom:16}} className="hb-float">🔥</div>
          <p style={{fontFamily:PF,fontSize:21,fontStyle:"italic",color:C.text,marginBottom:8}}>Both of you have responded.</p>
          <p style={{fontSize:14,color:C.muted,fontFamily:LT,marginBottom:28,lineHeight:1.65}}>Open this together.<br/>Read each other's answers at the same time.</p>
          <Btn onClick={reveal} style={{background:"#1A0A05",color:"#FAF0E8",border:"none",letterSpacing:"0.08em"}}>Reveal together 🔥</Btn>
        </div>
      </div>}

      {/* RESULT phase */}
      {phase==="result"&&<div className="hb-fade">
        <DarkCard>
          <div style={{fontSize:11,fontWeight:700,color:"#E8A080",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,fontFamily:LT}}>{catInfo.icon} {catInfo.label}</div>
          <p style={{fontFamily:PF,fontSize:18,fontStyle:"italic",color:"#FAF0E8",lineHeight:1.6,margin:0}}>{desire.prompt}</p>
        </DarkCard>
        {[[userKey,me?.name,C.accent,C.accentSoft,C.accentBd],[pk,partner?.name,C.gold,C.goldSoft,C.goldBd]].map(([key,name,color,soft,bd])=>(
          <div key={key} style={{background:soft,border:`1px solid ${bd}`,borderRadius:18,padding:22,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>{name}</div>
            <p style={{fontFamily:PF,fontSize:18,fontStyle:"italic",color:C.text,lineHeight:1.65,margin:0}}>"{desire.responses?.[key]||<i style={{color:C.muted}}>Not answered yet</i>}"</p>
          </div>
        ))}
        <Btn onClick={()=>update({[fk]:null})} style={{background:"#1A0A05",color:"#FAF0E8",border:"none",marginBottom:10}}>New prompt 🔥</Btn>
        <Btn variant="ghost" onClick={back}>← Back</Btn>
      </div>}
    </div>
  );
}

function TruthOrDare({me,partner,userKey,roomData,update,addN,back}){
  const tord=roomData?.tord;
  const [loading,setLoading]=useState(false);
  const [spicy,setSpicy]=useState(false);

  const pick=async type=>{
    setLoading(true);
    try {
      const content=await callClaude(
        spicy
          ? "You generate bold, spicy content for consenting couples in a committed long-distance relationship. Content is daring and intimate. Never degrading — always within the context of a loving relationship."
          : "You generate fun content for couples in a long-distance relationship.",
        spicy
          ? type==="truth"
            ? "Generate one bold spicy 'Truth' question for a couple — intimate, revealing, slightly daring. Push beyond the surface. Return ONLY the question."
            : "Generate one spicy 'Dare' for someone in a long-distance relationship — intimate, daring, but doable alone and shareable via photo/text/voice note. Return ONLY the dare."
          : type==="truth"
            ? "One 'Truth' question for a couple — personal, slightly vulnerable. Return ONLY the question."
            : "One 'Dare' for long-distance — they can do it alone and share via photo/text. Return ONLY the dare."
      );
      await update({tord:{type,content,done:false,spicy}});
      await addN("tord",`${me?.name} picked a ${type}${spicy?" 🔥":""}`);
    } catch(e){console.error(e);}
    setLoading(false);
  };

  return (
    <div style={{padding:"22px 18px 48px"}} className="hb-fade">
      <Hdr title="Truth or Dare" sub="Pick your fate" back={back}
        right={
          <button onClick={()=>setSpicy(s=>!s)} style={{
            background:spicy?"#1A0A05":C.surface,
            border:`1.5px solid ${spicy?"#1A0A05":C.border}`,
            borderRadius:20,padding:"6px 14px",cursor:"pointer",fontFamily:LT,
            fontSize:12,fontWeight:700,color:spicy?"#E8A080":C.muted,transition:"all 0.25s"
          }}>
            {spicy?"🔥 Spicy":"🔥 Spicy off"}
          </button>
        }
      />

      {spicy&&<div style={{background:"#1A0A05",borderRadius:14,padding:"11px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18}}>🔥</span>
        <span style={{fontSize:13,color:"#E8A080",fontFamily:LT,fontWeight:600}}>Spicy mode on — content is bolder and more intimate</span>
      </div>}

      {!tord?.type?(
        <div>
          <div style={{textAlign:"center",paddingTop:8,marginBottom:28}}>
            <div style={{fontSize:56,marginBottom:14}} className="hb-float">🎭</div>
            <p style={{color:C.muted,fontSize:15,lineHeight:1.7,fontFamily:LT}}>What will it be?</p>
          </div>
          {loading?<Spinner text="Rolling the dice..."/>:(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <button onClick={()=>pick("truth")} style={{
                background:spicy?"#1A0A05":C.accentSoft,
                border:`2px solid ${spicy?"#3A1A0A":C.accentBd}`,
                borderRadius:20,padding:"28px 14px",cursor:"pointer",fontFamily:LT,textAlign:"center",transition:"all 0.2s"
              }} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.03)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                <div style={{fontSize:36,marginBottom:10}}>💬</div>
                <div style={{fontSize:17,fontWeight:700,color:spicy?"#E8A080":C.accent,fontFamily:PF,fontStyle:"italic"}}>Truth</div>
                <div style={{fontSize:11,color:spicy?"#A07060":C.muted,marginTop:5}}>Answer honestly</div>
              </button>
              <button onClick={()=>pick("dare")} style={{
                background:spicy?"#1A0A05":C.goldSoft,
                border:`2px solid ${spicy?"#3A1A0A":C.goldBd}`,
                borderRadius:20,padding:"28px 14px",cursor:"pointer",fontFamily:LT,textAlign:"center",transition:"all 0.2s"
              }} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.03)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                <div style={{fontSize:36,marginBottom:10}}>⚡</div>
                <div style={{fontSize:17,fontWeight:700,color:spicy?"#E8A080":C.gold,fontFamily:PF,fontStyle:"italic"}}>Dare</div>
                <div style={{fontSize:11,color:spicy?"#A07060":C.muted,marginTop:5}}>Accept the challenge</div>
              </button>
            </div>
          )}
        </div>
      ):(
        <div>
          <div style={{
            background:tord.spicy?"#1A0A05":tord.type==="truth"?C.accentSoft:C.goldSoft,
            border:`2px solid ${tord.spicy?"#3A1A0A":tord.type==="truth"?C.accentBd:C.goldBd}`,
            borderRadius:22,padding:26,marginBottom:20,textAlign:"center"
          }}>
            <div style={{fontSize:12,fontWeight:700,color:tord.spicy?"#E8A080":tord.type==="truth"?C.accent:C.gold,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:14,fontFamily:LT}}>
              {tord.type==="truth"?"💬 Truth":"⚡ Dare"}{tord.spicy?" 🔥":""}
            </div>
            <p style={{fontFamily:PF,fontSize:19,fontStyle:"italic",color:tord.spicy?"#FAF0E8":C.text,lineHeight:1.65,margin:0}}>{tord.content}</p>
          </div>
          {!tord.done?(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Btn onClick={async()=>await update({tord:{...tord,done:true}})}>✓ Done!</Btn>
              <Btn variant="ghost" onClick={async()=>await update({tord:null})}>Skip →</Btn>
            </div>
          ):(
            <div>
              <div style={{background:"#E8F5EC",border:"1px solid #B5DFC2",borderRadius:16,padding:16,textAlign:"center",marginBottom:16}}>
                <div style={{fontSize:28,marginBottom:6}}>🎉</div>
                <div style={{fontWeight:700,color:"#3d7a52",fontFamily:LT}}>Challenge completed!</div>
              </div>
              <Btn variant="outline" onClick={async()=>await update({tord:null})}>Pick another →</Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function CompatScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const fk=`compat_${todayKey()}`; const compat=roomData?.[fk]; const [loading,setLoading]=useState(false);
  const generate=async()=>{ setLoading(true); try{ const raw=await callClaude('6 preference questions for a compatibility quiz. Each has a 1-5 scale. Return ONLY JSON array: [{"q":"question","low":"label for 1","high":"label for 5"},...] — no backticks.',"Generate."); const m=raw.match(/\[[\s\S]*?\]/); const qs=JSON.parse(m?m[0]:raw); await update({[fk]:{questions:qs,ratings:{A:{},B:{}}}}); }catch(e){console.error(e);} setLoading(false); };
  const rate=async(i,val)=>{ if(compat?.ratings?.[userKey]?.[i]!==undefined) return; await update({[`${fk}.ratings.${userKey}.${i}`]:val}); await addN("compat",`${me?.name} rated question ${i+1}`); };
  const myR=compat?.ratings?.[userKey]||{},theirR=compat?.ratings?.[pk]||{};
  const myDone=compat?.questions&&Object.keys(myR).length===compat.questions.length;
  const theirDone=compat?.questions&&Object.keys(theirR).length===compat.questions.length;
  const both=myDone&&theirDone;
  const score=both?Math.round(100-compat.questions.reduce((acc,_,i)=>acc+Math.abs((myR[i]||3)-(theirR[i]||3)),0)/compat.questions.length*20):null;
  return <div style={{padding:"22px 18px 48px"}} className="hb-fade">
    <Hdr title="Compatibility" sub="See how alike you really are" back={back}/>
    {!compat?.questions?(<div style={{textAlign:"center",paddingTop:20}}><div style={{fontSize:56,marginBottom:18}} className="hb-float">📊</div><p style={{color:C.muted,fontSize:15,lineHeight:1.7,marginBottom:32,fontFamily:LT}}>6 questions. Rate your preferences. See your match.</p>{loading?<Spinner text="Generating questions..."/>:<Btn variant="gold" onClick={generate}>Start the quiz ✦</Btn>}</div>):(
    <div>{both&&<Card style={{textAlign:"center",marginBottom:20,background:C.goldSoft,border:`1px solid ${C.goldBd}`}}><div style={{fontSize:11,fontWeight:700,color:C.gold,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>Your compatibility</div><div style={{fontSize:52,fontWeight:700,color:score>=80?"#3d7a52":score>=60?C.gold:C.accent,fontFamily:PF,marginBottom:8}}>{score}%</div><div style={{fontSize:14,color:C.muted,fontFamily:LT}}>{score>=80?"Beautifully aligned ✨":score>=60?"Lovely mix of similarities 🌸":"Opposites attract 🎉"}</div></Card>}
    {compat.questions.map((q,i)=>{ const my=myR[i],their=theirR[i],answered=my!==undefined; return <Card key={i}><div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:5,fontFamily:LT}}>Q{i+1}</div><div style={{fontSize:14,color:C.text,marginBottom:12,lineHeight:1.45,fontWeight:700,fontFamily:LT}}>{q.q}</div><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:9,fontFamily:LT}}><span>{q.low}</span><span>{q.high}</span></div><div style={{display:"flex",gap:8,marginBottom:10}}>{[1,2,3,4,5].map(v=><button key={v} onClick={()=>!answered&&rate(i,v)} style={{flex:1,padding:"10px 0",borderRadius:12,border:`1.5px solid ${my===v?C.accent:C.border}`,background:my===v?C.accentSoft:C.surface,cursor:answered?"default":"pointer",fontFamily:LT,fontSize:14,fontWeight:my===v?700:400,color:my===v?C.accent:C.text,transition:"all 0.15s"}}>{v}</button>)}</div>{both&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:C.accentSoft,color:C.accent,border:`1px solid ${C.accentBd}`,fontFamily:LT}}>{me?.name}: {my}</span><span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:C.goldSoft,color:C.gold,border:`1px solid ${C.goldBd}`,fontFamily:LT}}>{partner?.name}: {their}</span>{Math.abs(my-their)<=1&&<span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"#E8F5EC",color:"#3d7a52",border:"1px solid #B5DFC2",fontFamily:LT}}>✓ Aligned</span>}</div>}{!answered&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic",fontFamily:LT}}>Tap a number to rate</div>}</Card>; })}
    {both&&<Btn variant="ghost" style={{marginTop:6}} onClick={()=>update({[fk]:null})}>Retake →</Btn>}
    {!both&&myDone&&<div style={{background:C.goldSoft,border:`1px solid ${C.goldBd}`,borderRadius:14,padding:12,textAlign:"center",fontSize:13,color:C.gold,fontFamily:LT,marginTop:6}}>⏳ Waiting for {partner?.name} to finish...</div>}</div>)}
  </div>;
}

function LoveLangScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const ll=roomData?.lovelang; const mine=ll?.[userKey]; const theirs=ll?.[pk]; const both=mine&&theirs; const match=both&&mine===theirs;
  const pick=async key=>{ await update({[`lovelang.${userKey}`]:key}); await addN("lovelang",`${me?.name} chose their love language 💝`); };
  return <div style={{padding:"22px 18px 48px"}} className="hb-fade">
    <Hdr title="Love Language" sub="How do you feel loved?" back={back}/>
    {!mine?(<div><div style={{textAlign:"center",marginBottom:28}}><div style={{fontSize:48,marginBottom:12}} className="hb-float">💝</div><p style={{fontFamily:PF,fontSize:20,fontStyle:"italic",color:C.text,lineHeight:1.6}}>Which speaks to your heart most?</p></div>{LOVE_LANGS.map(l=><button key={l.key} onClick={()=>pick(l.key)} style={{display:"block",width:"100%",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:18,padding:"18px 20px",textAlign:"left",cursor:"pointer",fontFamily:LT,marginBottom:11,transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.background=C.accentSoft;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.surface;}}><div style={{display:"flex",alignItems:"center",gap:16}}><div style={{fontSize:28}}>{l.icon}</div><div><div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:LT}}>{l.title}</div><div style={{fontSize:12,color:C.muted,marginTop:3,fontFamily:LT}}>{l.desc}</div></div></div></button>)}</div>):(
    <div>{!theirs&&<div style={{background:C.goldSoft,border:`1px solid ${C.goldBd}`,borderRadius:14,padding:12,textAlign:"center",fontSize:13,color:C.gold,marginBottom:18,fontFamily:LT}}>⏳ Waiting for {partner?.name} to pick...</div>}{both&&<Card style={{marginBottom:20,background:match?"#E8F5EC":C.purpleSoft,border:`1px solid ${match?"#B5DFC2":C.purpleBd}`,textAlign:"center"}}><div style={{fontSize:28,marginBottom:10}}>{match?"🎉":"💡"}</div><div style={{fontWeight:700,fontSize:15,color:match?"#3d7a52":C.purple,fontFamily:LT}}>{match?"You share the same love language!":"Different languages — knowing this helps you love better."}</div></Card>}{LOVE_LANGS.map(l=>{ const isMe=mine===l.key,isTheirs=theirs===l.key; if(!isMe&&!isTheirs) return null; return <Card key={l.key} style={{border:`1.5px solid ${isMe&&isTheirs?C.sage:isMe?C.accentBd:C.goldBd}`}}><div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{fontSize:28}}>{l.icon}</div><div style={{flex:1}}><div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:LT}}>{l.title}</div><div style={{fontSize:12,color:C.muted,fontFamily:LT}}>{l.desc}</div></div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{isMe&&<span style={{fontSize:11,fontWeight:700,padding:"3px 12px",borderRadius:20,background:C.accentSoft,color:C.accent,border:`1px solid ${C.accentBd}`,fontFamily:LT}}>♥ {me?.name}</span>}{isTheirs&&<span style={{fontSize:11,fontWeight:700,padding:"3px 12px",borderRadius:20,background:C.goldSoft,color:C.gold,border:`1px solid ${C.goldBd}`,fontFamily:LT}}>♥ {partner?.name}</span>}</div></Card>; })}<Btn variant="ghost" style={{marginTop:6}} onClick={()=>update({"lovelang":null})}>Retake →</Btn></div>
    )}
  </div>;
}

// ── CONTENT SCREENS ────────────────────────────────────────────────────────
function LoveNotes({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const readKey=userKey==="A"?"readA_note":"readB_note"; const notes=roomData?.notes||[]; const [text,setText]=useState("");
  const unread=notes.filter(n=>n.from===pk&&!n[readKey]).length;
  const send=async()=>{ if(!text.trim()) return; const note={id:Date.now()+Math.random(),from:userKey,text:text.trim(),date:new Date().toLocaleDateString("en",{month:"short",day:"numeric"}),readA_note:userKey==="A",readB_note:userKey==="B"}; await update({notes:[note,...notes]}); await addN("note",`${me?.name} sent you a love note 💌`); setText(""); };
  const reveal=async id=>{ await update({notes:notes.map(n=>n.id===id?{...n,[readKey]:true}:n)}); };
  return <div style={{padding:"22px 18px 48px"}} className="hb-fade">
    <Hdr title="Love Notes" sub="Little letters, big feelings" back={back} right={unread>0?<div style={{background:C.accentSoft,border:`1px solid ${C.accentBd}`,borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700,color:C.accent,fontFamily:LT}}>💌 {unread}</div>:null}/>
    <Card><Field textarea label={`Write to ${partner?.name}`} value={text} onChange={e=>setText(e.target.value)} placeholder="Say something sweet, funny, or from the heart..."/><Btn disabled={!text.trim()} onClick={send}>Send note 💌</Btn></Card>
    {notes.length===0?<div style={{textAlign:"center",padding:"40px 0"}}><div style={{fontSize:48,marginBottom:14}} className="hb-float">💌</div><div style={{color:C.muted,fontSize:15,fontFamily:LT}}>No notes yet — send the first one.</div></div>:notes.map(note=>{ const fromMe=note.from===userKey,isHidden=!fromMe&&!note[readKey]; return <div key={note.id} style={{background:fromMe?C.bg:C.surface,borderRadius:18,padding:18,marginBottom:12,border:`1px solid ${fromMe?C.border:C.accentBd}`}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontSize:11,fontWeight:700,color:fromMe?C.muted:C.accent,fontFamily:LT}}>{fromMe?"From you":`From ${partner?.name}`}</div><div style={{fontSize:11,color:C.muted,fontFamily:LT}}>{note.date}</div></div>{isHidden?<div style={{textAlign:"center",padding:"14px 0"}}><div style={{fontSize:24,marginBottom:8}}>💌</div><div style={{fontSize:13,color:C.muted,marginBottom:14,fontFamily:LT}}>A note from {partner?.name}</div><Btn onClick={()=>reveal(note.id)} style={{maxWidth:160,margin:"0 auto",padding:10,fontSize:13}}>Reveal ♥</Btn></div>:<div style={{fontSize:15,color:C.text,lineHeight:1.7,fontFamily:LT}}>{note.text}</div>}</div>; })}
  </div>;
}

function Gratitude({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const fk=`grat_${todayKey()}`; const grat=roomData?.[fk];
  const [text,setText]=useState(grat?.[userKey]||"");
  const submitted=!!grat?.[userKey],partnerDone=!!grat?.[pk],both=submitted&&partnerDone;
  return <div style={{padding:"22px 18px 48px"}} className="hb-fade">
    <Hdr title="Daily Gratitude" sub={new Date().toLocaleDateString("en",{month:"long",day:"numeric"})} back={back}/>
    {!submitted&&<div><div style={{textAlign:"center",marginBottom:26}}><div style={{fontSize:48,marginBottom:12}} className="hb-float">🙏</div><p style={{fontFamily:PF,fontSize:20,fontStyle:"italic",color:C.text,lineHeight:1.65}}>What's one thing you love about {partner?.name} today?</p></div><Field textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Be specific — what did they do, say, or make you feel?"/><Btn disabled={!text.trim()} onClick={async()=>{ if(!text.trim()) return; await update({[`${fk}.${userKey}`]:text.trim()}); await addN("grat",`${me?.name} shared their gratitude 🙏`); }}>Send my gratitude 🙏</Btn></div>}
    {submitted&&both&&<div><Card style={{background:"#E8F5EC",border:"1px solid #B5DFC2",textAlign:"center",marginBottom:20}}><div style={{fontSize:28,marginBottom:8}}>🌸</div><div style={{fontWeight:700,color:"#3d7a52",fontFamily:LT}}>You both shared today</div></Card>{[[userKey,me?.name,partner?.name,C.accent,C.accentSoft,C.accentBd],[pk,partner?.name,me?.name,C.gold,C.goldSoft,C.goldBd]].map(([key,from,to,color,soft,bd])=><Card key={key} style={{background:soft,border:`1px solid ${bd}`,marginBottom:12}}><div style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:10,fontFamily:LT}}>{from} → {to}</div><p style={{fontFamily:PF,fontSize:18,fontStyle:"italic",color:C.text,lineHeight:1.65,margin:0}}>"{grat[key]}"</p></Card>)}<Btn variant="ghost" onClick={back}>← Back</Btn></div>}
    {submitted&&!partnerDone&&<div><Card style={{background:C.accentSoft,border:`1px solid ${C.accentBd}`}}><div style={{fontSize:11,fontWeight:700,color:C.accent,marginBottom:8,fontFamily:LT}}>✓ Your gratitude for today</div><p style={{fontFamily:PF,fontSize:18,fontStyle:"italic",color:C.text,lineHeight:1.65,margin:0}}>"{grat[userKey]}"</p></Card><div style={{background:C.goldSoft,border:`1px solid ${C.goldBd}`,borderRadius:14,padding:14,textAlign:"center",fontSize:13,color:C.gold,fontFamily:LT}}>⏳ Waiting for {partner?.name}...</div></div>}
  </div>;
}

function BucketList({me,partner,userKey,roomData,update,addN,back}){
  const bucket=roomData?.bucket||[]; const [text,setText]=useState(""); const [loading,setLoading]=useState(false);
  const addItem=async()=>{ if(!text.trim()) return; const item={id:Date.now()+Math.random(),text:text.trim(),by:me?.name,done:false,date:new Date().toLocaleDateString("en",{month:"short",day:"numeric"})}; await update({bucket:[item,...bucket]}); await addN("bucket",`${me?.name} added to your bucket list 🌍`); setText(""); };
  const toggle=async id=>{ await update({bucket:bucket.map(i=>i.id===id?{...i,done:!i.done}:i)}); };
  const suggest=async()=>{ setLoading(true); try{ const raw=await callClaude('5 romantic bucket list ideas for a long-distance couple. Return ONLY a JSON array of 5 short strings, no backticks.',"Generate."); const m=raw.match(/\[[\s\S]*?\]/); const arr=JSON.parse(m?m[0]:raw); const items=arr.map(t=>({id:Date.now()+Math.random(),text:t,by:"AI ✦",done:false,date:"suggested"})); await update({bucket:[...items,...bucket]}); }catch(e){console.error(e);} setLoading(false); };
  const done=bucket.filter(i=>i.done).length;
  return <div style={{padding:"22px 18px 100px"}} className="hb-fade">
    <Hdr title="Bucket List" sub={`${done} of ${bucket.length} done together`} back={back}/>
    <Card><Field label="Add a dream" placeholder="e.g. Watch the Northern Lights together..." value={text} onChange={e=>setText(e.target.value)}/><div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10}}><Btn disabled={!text.trim()} onClick={addItem}>Add ✦</Btn><Btn variant="ghost" style={{width:"auto",padding:"13px 16px"}} onClick={suggest} disabled={loading}>{loading?"…":"💡"}</Btn></div><div style={{fontSize:11,color:C.muted,marginTop:8,textAlign:"right",fontFamily:LT}}>💡 = AI suggestions</div></Card>
    {bucket.length===0?<div style={{textAlign:"center",padding:"40px 0"}}><div style={{fontSize:48,marginBottom:12}} className="hb-float">🌍</div><div style={{color:C.muted,fontSize:15,fontFamily:LT}}>Start dreaming together.</div></div>:(
    <div>{bucket.filter(i=>!i.done).length>0&&<div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:12,fontFamily:LT}}>To do together</div>}
    {bucket.filter(i=>!i.done).map(item=><div key={item.id} style={{background:C.surface,borderRadius:16,padding:"14px 18px",marginBottom:9,display:"flex",alignItems:"flex-start",gap:14,border:`1px solid ${C.border}`}}><button onClick={()=>toggle(item.id)} style={{width:24,height:24,borderRadius:"50%",border:`2px solid ${C.border}`,background:"none",cursor:"pointer",flexShrink:0,marginTop:2,transition:"border-color 0.2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.sage} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}/><div style={{flex:1}}><div style={{fontSize:15,color:C.text,lineHeight:1.45,fontFamily:LT}}>{item.text}</div><div style={{fontSize:11,color:C.muted,marginTop:4,fontFamily:LT}}>by {item.by} · {item.date}</div></div></div>)}
    {bucket.filter(i=>i.done).length>0&&<div><div style={{fontSize:11,fontWeight:700,color:C.sage,textTransform:"uppercase",letterSpacing:"0.09em",margin:"20px 0 12px",fontFamily:LT}}>✓ Done together ({done})</div>{bucket.filter(i=>i.done).map(item=><div key={item.id} style={{background:C.sageSoft,borderRadius:16,padding:"12px 18px",marginBottom:8,display:"flex",alignItems:"flex-start",gap:14,border:`1px solid ${C.sageBd}`}}><button onClick={()=>toggle(item.id)} style={{width:24,height:24,borderRadius:"50%",border:`2px solid ${C.sage}`,background:C.sage,cursor:"pointer",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#fff"}}>✓</button><div style={{flex:1}}><div style={{fontSize:14,color:C.sage,textDecoration:"line-through",lineHeight:1.4,fontFamily:LT}}>{item.text}</div></div></div>)}</div>}</div>)}
  </div>;
}

function MemoryJar({me,userKey,roomData,update,addN,back}){
  const memories=roomData?.memories||[]; const [text,setText]=useState("");
  const add=async()=>{ if(!text.trim()) return; const m={id:Date.now()+Math.random(),userKey,name:me?.name,text:text.trim(),date:new Date().toLocaleDateString("en",{month:"short",day:"numeric"})}; await update({memories:[m,...memories]}); await addN("memory",`${me?.name} added a memory 🫙`); setText(""); };
  return <div style={{padding:"22px 18px 100px"}} className="hb-fade">
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}><BackBtn onClick={back}/><div style={{flex:1}}><h2 style={{fontFamily:PF,fontSize:22,fontWeight:400,fontStyle:"italic",color:C.text}}>Memory Jar</h2><div style={{fontSize:12,color:C.muted,fontFamily:LT}}>Little moments, kept forever</div></div><div style={{fontSize:28}}>🫙</div></div>
    <Card><Field textarea label={`Drop a memory, ${me?.name}`} value={text} onChange={e=>setText(e.target.value)} placeholder="A funny moment, a feeling, a wish... ✨"/><Btn disabled={!text.trim()} onClick={add}>Add to jar ✦</Btn></Card>
    {memories.length===0?<div style={{textAlign:"center",padding:"40px 0"}}><div style={{fontSize:48,marginBottom:12}} className="hb-float">🫙</div><div style={{color:C.muted,fontSize:15,fontFamily:LT}}>Your jar is empty — fill it with moments.</div></div>:memories.map(m=><div key={m.id} style={{background:C.surface,borderRadius:16,padding:18,marginBottom:11,border:`1px solid ${C.border}`,borderLeft:`4px solid ${m.userKey==="A"?C.accent:C.gold}`}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><div style={{fontSize:11,fontWeight:700,color:m.userKey==="A"?C.accent:C.gold,fontFamily:LT}}>{m.name}</div><div style={{fontSize:11,color:C.muted,fontFamily:LT}}>{m.date}</div></div><div style={{fontSize:15,color:C.text,lineHeight:1.65,fontFamily:LT}}>{m.text}</div></div>)}
  </div>;
}

// ── TAB BAR ────────────────────────────────────────────────────────────────
function TabBar({tab,setTab,unread,notesBadge}){
  const tabs=[
    {key:"home",   icon:"♥",  label:"Home"},
    {key:"play",   icon:"🎮", label:"Play"},
    {key:"us",     icon:"🌿", label:"Us",  badge:notesBadge},
    {key:"profile",icon:"👤", label:"Profile"},
  ];
  return (
    <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"#1A0A05",border:"none",borderRadius:32,padding:"8px 8px",display:"flex",gap:4,boxShadow:"0 6px 28px rgba(26,10,5,0.28)",zIndex:20,width:"calc(100% - 40px)",maxWidth:440}}>
      {tabs.map(t=>(
        <button key={t.key} onClick={()=>setTab(t.key)} style={{flex:1,padding:"10px 0",borderRadius:26,border:"none",background:tab===t.key?C.accent:"transparent",cursor:"pointer",fontFamily:LT,display:"flex",flexDirection:"column",alignItems:"center",gap:4,transition:"all 0.25s",position:"relative"}}
          onMouseEnter={e=>{if(tab!==t.key) e.currentTarget.style.background="rgba(255,255,255,0.08)";}}
          onMouseLeave={e=>{if(tab!==t.key) e.currentTarget.style.background="transparent";}}>
          {t.badge>0&&<div style={{position:"absolute",top:6,right:"18%",background:"#E53935",color:"#fff",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700}}>{t.badge}</div>}
          <span style={{fontSize:tab===t.key?22:19,transition:"all 0.2s"}}>{t.icon}</span>
          <span style={{fontSize:10,fontWeight:700,color:tab===t.key?"#fff":"#A07860",letterSpacing:"0.04em",fontFamily:LT}}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── ROOT APP ───────────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState("loading");
  const [user,     setUser    ] = useState(null);
  const [myUser,   setMyUser  ] = useState(null);
  const [roomId,   setRoomId  ] = useState(null);
  const [userKey,  setUserKey ] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [tab,      setTab     ] = useState("home");
  const [screen,   setScreen  ] = useState(null);
  const [showNotif,setShowNotif] = useState(false);
  const [showOnb,  setShowOnb ] = useState(false);

  // Auth listener
  useEffect(()=>{
    const unsub=onAuthStateChanged(auth, async u=>{
      if(!u){ setAppState("login"); return; }
      setUser(u);
      const snap=await getDoc(doc(db,"users",u.uid));
      if(!snap.exists()||!snap.data().roomId){
        if(!snap.exists()||!snap.data().onboardingDone){ setShowOnb(true); }
        setMyUser(snap.data()||{name:u.displayName||"",photo:u.photoURL||""});
        setAppState("profile-setup"); return;
      }
      const ud=snap.data();
      setMyUser(ud);
      setRoomId(ud.roomId); setUserKey(ud.userKey);
    });
    return unsub;
  },[]);

  // Room listener
  useEffect(()=>{
    if(!roomId) return;
    const unsub=onSnapshot(doc(db,"rooms",roomId), snap=>{
      if(!snap.exists()) return;
      const data=snap.data(); setRoomData(data);
      if(data.users?.A?.name&&data.users?.B?.name) setAppState("app");
      else if(userKey==="A"&&!data.users?.B?.name) setAppState("waiting");
      // Update streak
      const today=todayStr(); const sk=data.streak||{count:0,lastDate:""};
      if(sk.lastDate!==today){
        const y=new Date(); y.setDate(y.getDate()-1); const yd=y.toISOString().split("T")[0];
        const ns=sk.lastDate===yd?{count:sk.count+1,lastDate:today}:{count:1,lastDate:today};
        updateDoc(doc(db,"rooms",roomId),{streak:ns});
      }
    });
    return unsub;
  },[roomId,userKey]);

  // Listen to partner user doc for profile changes
  const pk=userKey==="A"?"B":"A";
  const partnerUid=roomData?.users?.[pk]?.uid;
  const [partnerUser,setPartnerUser]=useState(null);
  useEffect(()=>{
    if(!partnerUid) return;
    const unsub=onSnapshot(doc(db,"users",partnerUid), snap=>{ if(snap.exists()) setPartnerUser(snap.data()); });
    return unsub;
  },[partnerUid]);

  const update = useCallback((updates)=>roomUpdate(roomId,updates),[roomId]);
  const addN   = useCallback((type,message)=>addNotif(roomId,userKey,type,message),[roomId,userKey]);

  const me      = roomData?.users?.[userKey];
  const partner = roomData?.users?.[pk];
  const readKey = userKey==="A"?"readA":"readB";
  const unread  = (roomData?.notifications||[]).filter(n=>n.from!==userKey&&!n[readKey]).length;
  const notesBadge=(roomData?.notes||[]).filter(n=>n.from===pk&&!n[(userKey==="A"?"readA_note":"readB_note")]).length;

  const signOut=async()=>{ await fbSignOut(auth); setRoomId(null); setUserKey(null); setRoomData(null); setMyUser(null); setScreen(null); setTab("home"); setAppState("login"); };

  const shared={me,partner,myUser,partnerUser,userKey,roomData,update,addN};

  const goScreen=s=>setScreen(s);
  const backHome=()=>setScreen(null);

  if(appState==="loading") return <div style={{display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:18,minHeight:"100vh",background:C.bg}}><style>{STYLES}</style><div style={{fontSize:64}} className="hb-float">♥</div><div style={{fontSize:15,color:C.muted,fontFamily:"'Lato',system-ui,sans-serif"}}>Loading...</div></div>;

  if(showOnb&&appState==="profile-setup") return <div style={{background:C.bg,minHeight:"100vh"}}><style>{STYLES}</style><Onboarding onDone={()=>setShowOnb(false)}/></div>;

  if(appState==="login") return <div style={{background:C.bg,minHeight:"100vh"}}><style>{STYLES}</style><Login onLogin={u=>{setUser(u); setAppState("profile-setup");}}/></div>;

  if(appState==="profile-setup") return <div style={{background:C.bg,minHeight:"100vh"}}><style>{STYLES}</style>
    <ProfileSetup uid={user?.uid} existingName={myUser?.name||user?.displayName||""} existingPhoto={myUser?.photo||user?.photoURL||""} onDone={async ud=>{
      setMyUser(prev=>({...prev,...ud}));
      const snap=await getDoc(doc(db,"users",user.uid));
      if(snap.exists()&&snap.data().roomId){ setRoomId(snap.data().roomId); setUserKey(snap.data().userKey); }
      else setAppState("room-setup");
    }}/>
  </div>;

  if(appState==="room-setup") return <div style={{background:C.bg,minHeight:"100vh"}}><style>{STYLES}</style>
    <RoomSetup uid={user?.uid} userData={{name:myUser?.name||"",photo:myUser?.photo||"",mood:"🥰"}} onDone={(rid,uk)=>{ setRoomId(rid); setUserKey(uk); }}/>
  </div>;

  if(appState==="waiting") return <div style={{background:C.bg,minHeight:"100vh"}}><style>{STYLES}</style>
    <Waiting code={roomId} uid={user?.uid} onSignOut={signOut} onLeave={()=>{ setRoomId(null); setUserKey(null); setAppState("room-setup"); }}/>
  </div>;

  return <div style={{background:C.bg,minHeight:"100vh",fontFamily:LT,fontSize:16,color:C.text}}>
    <style>{STYLES}</style>

    {/* Top bar */}
    <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
      <div onClick={()=>{setScreen(null);setTab("home");}} style={{cursor:"pointer",fontFamily:PF,fontStyle:"italic",color:C.accent,fontSize:21,fontWeight:400}}>♥ Heartbeat</div>
      <button onClick={()=>setShowNotif(true)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:C.muted,position:"relative",padding:"4px 8px"}}>
        🔔
        {unread>0&&<div style={{position:"absolute",top:2,right:2,background:C.accent,color:"#fff",borderRadius:"50%",width:17,height:17,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>{unread}</div>}
      </button>
    </div>

    {showNotif&&<NotifPanel notifications={roomData?.notifications||[]} userKey={userKey} roomId={roomId} onClose={()=>setShowNotif(false)}/>}

    <div style={{maxWidth:480,margin:"0 auto"}}>
      {/* Feature screens */}
      {screen==="qa"       &&<QAScreen       {...shared} back={backHome}/>}
      {screen==="wyr"      &&<WYRScreen      {...shared} back={backHome}/>}
      {screen==="nhie"     &&<NHIE           {...shared} back={backHome}/>}
      {screen==="tord"     &&<TruthOrDare    {...shared} back={backHome}/>}
      {screen==="compat"   &&<CompatScreen   {...shared} back={backHome}/>}
      {screen==="lovelang" &&<LoveLangScreen {...shared} back={backHome}/>}
      {screen==="desire" &&<DesireGame {...shared} back={backHome}/>}
      {screen==="notes"    &&<LoveNotes      {...shared} back={backHome}/>}
      {screen==="grat"     &&<Gratitude      {...shared} back={backHome}/>}
      {screen==="bucket"   &&<BucketList     {...shared} back={backHome}/>}
      {screen==="memories" &&<MemoryJar      {...shared} back={backHome}/>}

      {/* Tabs (only show when no feature screen) */}
      {!screen&&<>
        {tab==="home"    &&<HomeTab    {...shared} go={goScreen}/>}
        {tab==="play"    &&<PlayTab    {...shared} go={goScreen}/>}
        {tab==="us"      &&<UsTab      {...shared} go={goScreen}/>}
        {tab==="profile" &&<ProfileTab {...shared} uid={user?.uid} roomId={roomId} onSignOut={signOut}/>}
      </>}
    </div>

    {/* Floating tab bar — only when no feature screen */}
    {!screen&&<TabBar tab={tab} setTab={t=>{setTab(t);setScreen(null);}} unread={unread} notesBadge={notesBadge}/>}
  </div>;
}
