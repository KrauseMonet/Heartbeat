import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, getDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";

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

// ── CLAUDE ─────────────────────────────────────────────────────────────────
const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
async function callClaude(system, msg) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:700, system, messages:[{role:"user",content:msg}] }),
  });
  const d = await r.json();
  return d.content[0].text.trim();
}

// ── UTILS ──────────────────────────────────────────────────────────────────
const genCode   = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const todayKey  = () => new Date().toISOString().split("T")[0].replace(/-/g, "");
const todayStr  = () => new Date().toISOString().split("T")[0];
const daysUntil = s  => { if (!s) return null; const d = Math.ceil((new Date(s)-Date.now())/86400000); return d>=0?d:null; };
const initials  = (n="?") => n.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
const greet     = () => { const h=new Date().getHours(); return h<12?"Good morning":h<17?"Good afternoon":"Good evening"; };
const timeAgo   = ts => { const m=Math.floor((Date.now()-ts)/60000); return m<1?"just now":m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`; };

// ── FIRESTORE OPS ──────────────────────────────────────────────────────────
async function createRoom(uid, name) {
  const code = genCode();
  await setDoc(doc(db,"rooms",code), {
    users: { A:{name,mood:"🥰",uid}, B:null },
    nextMeeting:null, notes:[], bucket:[], memories:[],
    notifications:[], streak:{count:1,lastDate:todayStr()},
  });
  await setDoc(doc(db,"users",uid), { name, roomId:code, userKey:"A" });
  return code;
}

async function joinRoom(uid, code, name) {
  const ref  = doc(db,"rooms",code.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Room not found. Double-check the code.");
  if (snap.data().users?.B?.name) throw new Error("This room already has two people.");
  await updateDoc(ref, { "users.B":{name,mood:"🥰",uid} });
  await setDoc(doc(db,"users",uid), { name, roomId:code.toUpperCase(), userKey:"B" });
  return code.toUpperCase();
}

async function roomUpdate(roomId, updates) {
  await updateDoc(doc(db,"rooms",roomId), updates);
}

async function addNotif(roomId, userKey, type, message) {
  const n = { id:Date.now()+Math.random(), from:userKey, type, message, ts:Date.now(), readA:userKey==="A", readB:userKey==="B" };
  const snap = await getDoc(doc(db,"rooms",roomId));
  const cur  = snap.data()?.notifications || [];
  await updateDoc(doc(db,"rooms",roomId), { notifications:[n,...cur].slice(0,40) });
}

async function markNotifsRead(roomId, userKey, notifications) {
  const key     = userKey==="A"?"readA":"readB";
  const updated = notifications.map(n=>({...n,[key]:true}));
  await updateDoc(doc(db,"rooms",roomId), { notifications:updated });
}

// ── DESIGN ─────────────────────────────────────────────────────────────────
const MOODS=[{e:"🥰",l:"Missing you"},{e:"😊",l:"Happy"},{e:"😌",l:"Calm"},{e:"🤩",l:"Excited"},{e:"😴",l:"Tired"},{e:"😔",l:"Low"},{e:"🤭",l:"Playful"},{e:"😤",l:"Stressed"}];
const NOTIF_ICONS={heartbeat:"♥",note:"💌",mood:"✨",qa:"🎯",wyr:"🤔",nhie:"🙋",tord:"🎭",grat:"🙏",memory:"🫙",bucket:"🌍",compat:"📊",lovelang:"💝"};
const C={bg:"#F9F3EB",surface:"#FFFFFF",text:"#1E140D",muted:"#8A7A70",border:"#EDE6DC",accent:"#B84C65",accentSoft:"#FDF0F3",accentBd:"#F0C8D4",amber:"#C97A2F",amberSoft:"#FEF4E8",amberBd:"#F0D4A8",sage:"#5A8A6A",sageSoft:"#EEF6F1",sageBd:"#C5DFD0",purple:"#7A6AA8",purpleSoft:"#F2F0F9",purpleBd:"#CFC9E8"};

// ── PRIMITIVES ─────────────────────────────────────────────────────────────
function Field({label,textarea,style:es,...p}){
  const [f,setF]=useState(false);
  const base={width:"100%",background:C.bg,border:`1.5px solid ${f?C.accent:C.border}`,borderRadius:12,padding:"13px 16px",fontFamily:"inherit",fontSize:15,color:C.text,outline:"none",transition:"border-color 0.2s",display:"block",...(textarea?{resize:"none"}:{}),...es};
  return <div style={{marginBottom:16}}>{label&&<div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>{label}</div>}{textarea?<textarea {...p} rows={3} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={base}/>:<input {...p} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={base}/>}</div>;
}
function Btn({children,variant="fill",style:s,disabled,onClick}){
  const v={fill:{background:C.accent,color:"#fff",border:"none"},outline:{background:"transparent",color:C.accent,border:`1.5px solid ${C.accent}`},ghost:{background:C.bg,color:C.text,border:`1.5px solid ${C.border}`},amber:{background:C.amber,color:"#fff",border:"none"},sage:{background:C.sage,color:"#fff",border:"none"},purple:{background:C.purple,color:"#fff",border:"none"}};
  return <button disabled={disabled} onClick={onClick} style={{display:"block",width:"100%",borderRadius:14,padding:"13px 20px",fontFamily:"inherit",fontSize:15,fontWeight:600,cursor:disabled?"not-allowed":"pointer",transition:"opacity 0.15s,transform 0.1s",opacity:disabled?0.4:1,...v[variant],...s}} onMouseEnter={e=>!disabled&&(e.currentTarget.style.opacity="0.85")} onMouseLeave={e=>(e.currentTarget.style.opacity=disabled?"0.4":"1")} onMouseDown={e=>!disabled&&(e.currentTarget.style.transform="scale(0.98)")} onMouseUp={e=>(e.currentTarget.style.transform="none")}>{children}</button>;
}
function Avatar({name,size=48,color=C.accent}){return <div style={{width:size,height:size,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.35,fontWeight:700,color:"#fff",flexShrink:0}}>{initials(name)}</div>;}
function BackBtn({onClick}){return <button onClick={onClick} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:C.muted,padding:"4px 8px 4px 0",lineHeight:1}}>←</button>;}
function Spinner({text="One moment..."}){return <div style={{textAlign:"center",padding:"36px 0",color:C.muted}}><div style={{fontSize:32,marginBottom:12,display:"inline-block",animation:"hbSpin 1s linear infinite"}}>✦</div><div style={{fontSize:14}}>{text}</div></div>;}
function Card({children,style:s,onClick}){return <div onClick={onClick} style={{background:C.surface,borderRadius:20,padding:20,boxShadow:"0 2px 16px rgba(30,20,13,0.07)",marginBottom:14,...s}}>{children}</div>;}
function Hdr({title,sub,back,right}){return <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}><BackBtn onClick={back}/><div style={{flex:1}}><h2 style={{fontFamily:"Georgia,serif",fontSize:22,fontWeight:400,fontStyle:"italic",color:C.text}}>{title}</h2>{sub&&<div style={{fontSize:12,color:C.muted}}>{sub}</div>}</div>{right}</div>;}
function ErrBox({msg}){return msg?<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:12,padding:12,marginBottom:14,fontSize:13,color:"#dc2626"}}>{msg}</div>:null;}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function Login({onLogin}){
  const [mode,setMode]=useState("signin");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [name,setName]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");

  const submit=async()=>{
    if(!email.trim()||!pass.trim()) return;
    if(mode==="signup"&&!name.trim()) return;
    setBusy(true); setErr("");
    try {
      let cred;
      if(mode==="signin"){
        cred=await signInWithEmailAndPassword(auth,email.trim(),pass);
      } else {
        cred=await createUserWithEmailAndPassword(auth,email.trim(),pass);
        await setDoc(doc(db,"users",cred.user.uid),{name:name.trim(),roomId:null,userKey:null});
      }
      onLogin(cred.user);
    } catch(e){
      const msgs={
        "auth/invalid-credential":"Wrong email or password.",
        "auth/user-not-found":"No account with that email. Create one?",
        "auth/wrong-password":"Wrong password.",
        "auth/email-already-in-use":"That email is already registered. Sign in instead.",
        "auth/weak-password":"Password must be at least 6 characters.",
        "auth/invalid-email":"Please enter a valid email address.",
      };
      setErr(msgs[e.code]||e.message);
    }
    setBusy(false);
  };

  return (
    <div style={{padding:"48px 24px 40px",minHeight:"100vh",background:C.bg}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{fontSize:64,marginBottom:14,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>♥</div>
        <h1 style={{fontFamily:"Georgia,serif",fontSize:36,fontWeight:400,fontStyle:"italic",color:C.text,margin:"0 0 10px"}}>Heartbeat</h1>
        <p style={{color:C.muted,fontSize:15,lineHeight:1.7}}>Close the distance, one moment at a time.</p>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:24,background:C.border,borderRadius:14,padding:4}}>
        {[["signin","Sign in"],["signup","Create account"]].map(([k,l])=>(
          <button key={k} onClick={()=>{setMode(k);setErr("");}} style={{padding:"11px 0",borderRadius:11,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:600,background:mode===k?C.surface:"transparent",color:mode===k?C.accent:C.muted,boxShadow:mode===k?"0 1px 6px rgba(30,20,13,0.1)":"none",transition:"all 0.2s"}}>{l}</button>
        ))}
      </div>

      {mode==="signup"&&<Field label="Your name" placeholder="e.g. Koustav" value={name} onChange={e=>setName(e.target.value)}/>}
      <Field label="Email" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
      <Field label="Password" type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)}/>
      <ErrBox msg={err}/>
      {busy?<Spinner text={mode==="signin"?"Signing in...":"Creating your account..."}/>:<Btn disabled={!email.trim()||!pass.trim()||(mode==="signup"&&!name.trim())} onClick={submit}>{mode==="signin"?"Sign in →":"Create account →"}</Btn>}
      <p style={{textAlign:"center",fontSize:12,color:C.muted,marginTop:20}}>Your data is private and only shared with your partner.</p>
    </div>
  );
}

// ── SETUP (after login, no room yet) ───────────────────────────────────────
function Setup({uid,onDone}){
  const [tab,setTab]=useState("create");
  const [name,setName]=useState("");
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");

  // Pre-fill name from auth
  useEffect(()=>{
    (async()=>{
      const snap=await getDoc(doc(db,"users",uid));
      if(snap.exists()&&snap.data().name) setName(snap.data().name);
    })();
  },[uid]);

  const create=async()=>{
    if(!name.trim()) return;
    setBusy(true); setErr("");
    try { const c=await createRoom(uid,name.trim()); onDone(c,"A"); }
    catch(e){ setErr(e.message); }
    setBusy(false);
  };

  const join=async()=>{
    if(!name.trim()||!code.trim()) return;
    setBusy(true); setErr("");
    try { await joinRoom(uid,code.trim(),name.trim()); onDone(code.trim().toUpperCase(),"B"); }
    catch(e){ setErr(e.message); }
    setBusy(false);
  };

  return (
    <div style={{padding:"48px 24px 40px",minHeight:"100vh",background:C.bg}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{fontSize:56,marginBottom:12,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>♥</div>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:400,fontStyle:"italic",color:C.text,margin:"0 0 8px"}}>Let's pair you up</h2>
        <p style={{color:C.muted,fontSize:14,lineHeight:1.7}}>Create a room and share the code, or enter your partner's code.</p>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:24,background:C.border,borderRadius:14,padding:4}}>
        {[["create","Create a room"],["join","Join a room"]].map(([k,l])=>(
          <button key={k} onClick={()=>{setTab(k);setErr("");}} style={{padding:"11px 0",borderRadius:11,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:600,background:tab===k?C.surface:"transparent",color:tab===k?C.accent:C.muted,boxShadow:tab===k?"0 1px 6px rgba(30,20,13,0.1)":"none",transition:"all 0.2s"}}>{l}</button>
        ))}
      </div>

      <Field label="Your name" placeholder="e.g. Koustav" value={name} onChange={e=>setName(e.target.value)}/>
      {tab==="join"&&<Field label="Partner's room code" placeholder="ABC123" value={code} onChange={e=>setCode(e.target.value)} style={{textTransform:"uppercase",letterSpacing:"0.15em",fontWeight:600,fontSize:18}}/>}
      <ErrBox msg={err}/>
      {busy?<Spinner text={tab==="create"?"Creating your room...":"Joining room..."}/>:<Btn disabled={!name.trim()||(tab==="join"&&!code.trim())} onClick={tab==="create"?create:join}>{tab==="create"?"Create room →":"Join room →"}</Btn>}
    </div>
  );
}

// ── WAITING ────────────────────────────────────────────────────────────────
function Waiting({ code, onSignOut, onLeave }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2200); };
  return (
    <div style={{ padding: "48px 24px", minHeight: "100vh", background: C.bg, textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 20, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>♥</div>
      <h2 style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 400, fontStyle: "italic", color: C.text, marginBottom: 10 }}>Room created!</h2>
      <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>Share this code with your partner so they can join.</p>
      <div onClick={copy} style={{ background: C.accentSoft, border: `2px solid ${C.accentBd}`, borderRadius: 20, padding: "28px 24px", marginBottom: 24, cursor: "pointer" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Your room code</div>
        <div style={{ fontSize: 48, fontWeight: 700, color: C.accent, letterSpacing: "0.2em", fontFamily: "Georgia, serif" }}>{code}</div>
        <div style={{ fontSize: 13, color: C.accent, marginTop: 12, fontWeight: 600 }}>{copied ? "✓ Copied!" : "Tap to copy"}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted, fontSize: 14, marginBottom: 40 }}>
        <div style={{ display: "inline-block", animation: "hbSpin 2s linear infinite" }}>✦</div>
        Waiting for your partner to join...
      </div>
      <button onClick={onLeave} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 20px", cursor: "pointer", fontSize: 13, color: C.muted, fontFamily: "inherit", marginBottom: 12, display: "block", width: "100%" }}>
        Join a different room instead →
      </button>
      <button onClick={onSignOut} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.muted, fontFamily: "inherit" }}>Sign out</button>
    </div>
  );
}

// ── NOTIFICATION PANEL ─────────────────────────────────────────────────────
function NotifPanel({notifications,userKey,roomId,onClose}){
  const readKey=userKey==="A"?"readA":"readB";
  const unread=notifications.filter(n=>n.from!==userKey&&!n[readKey]).length;

  useEffect(()=>{
    if(unread>0) markNotifsRead(roomId,userKey,notifications);
  },[]);

  const mine=notifications.filter(n=>n.from!==userKey);

  return (
    <div style={{position:"fixed",inset:0,zIndex:100,background:"rgba(30,20,13,0.45)",display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:"20px 20px 0 0",padding:"20px 18px 40px",maxHeight:"70vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <h3 style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:20,fontWeight:400,color:C.text}}>Notifications</h3>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:C.muted}}>✕</button>
        </div>
        {mine.length===0?(
          <div style={{textAlign:"center",padding:"32px 0",color:C.muted}}>
            <div style={{fontSize:40,marginBottom:12}}>🔔</div>
            <div style={{fontSize:14}}>Nothing yet — activity from your partner will show up here.</div>
          </div>
        ):mine.map(n=>(
          <div key={n.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"14px 0",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:24,flexShrink:0}}>{NOTIF_ICONS[n.type]||"♥"}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,color:C.text,lineHeight:1.5}}>{n.message}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>{timeAgo(n.ts)}</div>
            </div>
            {!n[readKey]&&<div style={{width:8,height:8,borderRadius:"50%",background:C.accent,flexShrink:0,marginTop:4}}/>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HOME ───────────────────────────────────────────────────────────────────
function Home({me,partner,roomData,roomId,userKey,update,go,addN,onSignOut}){
  const pk=userKey==="A"?"B":"A";
  const readKey=userKey==="A"?"readA":"readB";
  const unread=(roomData?.notifications||[]).filter(n=>n.from!==userKey&&!n[readKey]).length;
  const [beating,setBeating]=useState(false);
  const [beatMsg,setBeatMsg]=useState(false);
  const days=daysUntil(roomData?.nextMeeting);
  const bucketDone=(roomData?.bucket||[]).filter(i=>i.done).length;
  const notesBadge=(roomData?.notes||[]).filter(n=>n.from===pk&&!n[readKey+"_note"]).length;

  const sendHeart=async()=>{
    setBeating(true); setBeatMsg(true);
    setTimeout(()=>setBeating(false),600);
    setTimeout(()=>setBeatMsg(false),2800);
    await addN("heartbeat",`${me?.name} sent you a heartbeat ♥`);
  };
  const setMood=async emoji=>{
    await update({[`users.${userKey}.mood`]:emoji});
    await addN("mood",`${me?.name} is feeling ${emoji}`);
  };

  const navCards=[
    {icon:"🎯",title:"Daily Q&A",      sub:"Guess each other",       key:"qa"},
    {icon:"🤔",title:"Would You Rather",sub:"Pick together",          key:"wyr"},
    {icon:"🙋",title:"Never Have I Ever",sub:"Confess together",      key:"nhie"},
    {icon:"🎭",title:"Truth or Dare",  sub:"Pick your fate",          key:"tord"},
    {icon:"💌",title:"Love Notes",     sub:"Little letters",          key:"notes",badge:notesBadge},
    {icon:"🙏",title:"Gratitude",      sub:"Appreciate each other",   key:"grat"},
    {icon:"📊",title:"Compatibility",  sub:"How alike are you?",      key:"compat"},
    {icon:"💝",title:"Love Language",  sub:"Know each other better",  key:"lovelang"},
    {icon:"🌍",title:"Bucket List",    sub:`${bucketDone} done together`,key:"bucket"},
    {icon:"🫙",title:"Memory Jar",     sub:"Keep moments",            key:"memories"},
    {icon:"📅",title:"Update date",    sub:"Refresh countdown",       key:"settings"},
  ];

  return (
    <div style={{padding:"20px 18px 56px"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:13,color:C.muted}}>{greet()},</div>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:400,fontStyle:"italic",color:C.text,marginTop:2}}>{me?.name}</h2>
      </div>

      {/* Streak */}
      {roomData?.streak?.count>=2&&<div style={{background:C.amberSoft,border:`1px solid ${C.amberBd}`,borderRadius:14,padding:"11px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:22}}>🔥</span>
        <div><div style={{fontSize:15,fontWeight:700,color:C.amber}}>{roomData.streak.count}-day streak</div><div style={{fontSize:12,color:C.muted}}>Keep showing up for each other</div></div>
      </div>}

      {/* Notes banner */}
      {notesBadge>0&&<div onClick={()=>go("notes")} style={{background:C.accentSoft,border:`1px solid ${C.accentBd}`,borderRadius:14,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
        <span style={{fontSize:20}}>💌</span>
        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:C.accent}}>{notesBadge} unread note{notesBadge>1?"s":""} from {partner?.name}</div><div style={{fontSize:11,color:C.muted}}>Tap to read</div></div>
        <span style={{color:C.accent}}>→</span>
      </div>}

      {/* Partner card */}
      <Card>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Avatar name={partner?.name||"?"} color={C.amber} size={50}/>
          <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>Your person</div><div style={{fontSize:18,fontWeight:600,color:C.text,marginTop:2}}>{partner?.name||"Waiting..."}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:30}}>{partner?.mood||"🥰"}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{MOODS.find(m=>m.e===partner?.mood)?.l||"—"}</div></div>
        </div>
      </Card>

      {/* Countdown */}
      {days!==null&&<div style={{background:C.accentSoft,border:`1px solid ${C.accentBd}`,borderRadius:14,padding:"14px 18px",marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:24}}>⏳</span>
        <div><div style={{fontSize:20,fontWeight:700,color:C.accent}}>{days} {days===1?"day":"days"}</div><div style={{fontSize:12,color:C.muted}}>until you're together again</div></div>
      </div>}

      {/* Heartbeat */}
      <div style={{textAlign:"center",padding:"20px 0 16px"}}>
        <div style={{fontSize:13,color:C.muted,marginBottom:14}}>Let them know you're thinking of them</div>
        <button onClick={sendHeart} style={{width:84,height:84,borderRadius:"50%",border:"none",background:C.accent,cursor:"pointer",fontSize:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#fff",boxShadow:`0 6px 24px ${C.accent}44`,animation:beating?"hbBeat 0.5s ease-in-out":"none"}}>♥</button>
        {beatMsg?<div style={{marginTop:12,fontSize:14,color:C.accent,fontWeight:600}}>♥ Sent to {partner?.name}!</div>:<div style={{fontSize:13,color:C.muted,marginTop:10}}>Heartbeat</div>}
      </div>

      {/* Mood */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:9}}>Your vibe right now</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {MOODS.map(m=><button key={m.e} onClick={()=>setMood(m.e)} style={{padding:"6px 11px",borderRadius:20,fontSize:12,cursor:"pointer",fontFamily:"inherit",border:`1.5px solid ${me?.mood===m.e?C.accent:C.border}`,background:me?.mood===m.e?C.accentSoft:C.bg,color:C.text,transition:"all 0.15s"}}>{m.e} {m.l}</button>)}
        </div>
      </div>

      {/* Nav grid */}
      <div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Activities</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {navCards.map(n=>(
          <button key={n.key} onClick={()=>go(n.key)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"14px 13px",textAlign:"left",cursor:"pointer",fontFamily:"inherit",transition:"box-shadow 0.2s,transform 0.15s",position:"relative"}}
            onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 18px rgba(30,20,13,0.1)";e.currentTarget.style.transform="translateY(-2px)";}}
            onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="none";}}>
            {n.badge>0&&<div style={{position:"absolute",top:9,right:9,background:C.accent,color:"#fff",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>{n.badge}</div>}
            <div style={{fontSize:22,marginBottom:7}}>{n.icon}</div>
            <div style={{fontSize:13,fontWeight:600,color:C.text}}>{n.title}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{n.sub}</div>
          </button>
        ))}
      </div>

      <div style={{textAlign:"center",marginTop:28}}>
        <button onClick={onSignOut} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:C.muted,fontFamily:"inherit"}}>Sign out</button>
      </div>
    </div>
  );
}

// ── Q&A ────────────────────────────────────────────────────────────────────
function QAScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A";
  const fk=`qa_${todayKey()}`;
  const qa=roomData?.[fk];
  const [ans,setAns]=useState(qa?.answers?.[userKey]||"");
  const [guess,setGuess]=useState(qa?.guesses?.[userKey]||"");
  const [loading,setLoading]=useState(false);
  const phase=!qa?.question?"gen":!qa?.answers?.[userKey]?"answer":!qa?.guesses?.[userKey]?"guess":"result";
  const generate=async()=>{ setLoading(true); try{ const q=await callClaude("Generate one thoughtful fun daily question for a long-distance couple. Return ONLY the question, no quotes.","Fresh question."); await update({[fk]:{question:q,answers:{},guesses:{},date:todayStr()}}); }catch(e){console.error(e);} setLoading(false); };
  const submitAns=async()=>{ if(!ans.trim()) return; await update({[`${fk}.answers.${userKey}`]:ans.trim()}); await addN("qa",`${me?.name} answered today's question`); };
  const submitGuess=async()=>{ if(!guess.trim()) return; await update({[`${fk}.guesses.${userKey}`]:guess.trim()}); await addN("qa",`${me?.name} guessed your answer`); };
  const QCard=()=><Card><div style={{fontSize:11,fontWeight:600,color:C.accent,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Today's question</div><p style={{fontFamily:"Georgia,serif",fontSize:19,fontStyle:"italic",lineHeight:1.6,color:C.text,margin:0}}>"{qa.question}"</p></Card>;
  return (
    <div style={{padding:"22px 18px 48px"}}>
      <Hdr title="Daily Question" sub={new Date().toLocaleDateString("en",{weekday:"long",month:"long",day:"numeric"})} back={back}/>
      {phase==="gen"&&<div style={{textAlign:"center",paddingTop:20}}><div style={{fontSize:56,marginBottom:18,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>🎯</div><h3 style={{fontFamily:"Georgia,serif",fontSize:22,fontStyle:"italic",fontWeight:400,marginBottom:8,color:C.text}}>Today's question awaits</h3><p style={{color:C.muted,fontSize:15,lineHeight:1.7,marginBottom:32}}>A fresh question, just for you two.</p>{loading?<Spinner text="Crafting your question..."/>:<Btn onClick={generate}>Generate today's question ✦</Btn>}</div>}
      {phase==="answer"&&<div><QCard/><Field textarea label={`Your answer, ${me?.name}`} value={ans} onChange={e=>setAns(e.target.value)} placeholder="Be honest — your partner will try to guess this..."/><Btn disabled={!ans.trim()} onClick={submitAns}>Lock in my answer →</Btn></div>}
      {phase==="guess"&&<div><QCard/><div style={{background:C.accentSoft,border:`1px solid ${C.accentBd}`,borderRadius:14,padding:14,marginBottom:16}}><div style={{fontSize:11,fontWeight:600,color:C.accent,marginBottom:4}}>✓ Your answer is locked in</div><div style={{fontSize:15,color:C.text}}>{qa?.answers?.[userKey]}</div></div>{!qa?.answers?.[pk]&&<div style={{background:C.amberSoft,border:`1px solid ${C.amberBd}`,borderRadius:12,padding:12,marginBottom:14,fontSize:13,color:C.amber}}>⏳ {partner?.name} hasn't answered yet</div>}<Field textarea label={`What do you think ${partner?.name} said?`} value={guess} onChange={e=>setGuess(e.target.value)} placeholder={`Guess ${partner?.name}'s answer...`}/><Btn disabled={!guess.trim()} onClick={submitGuess}>Submit my guess →</Btn></div>}
      {phase==="result"&&<div><Card style={{marginBottom:18}}><p style={{fontFamily:"Georgia,serif",fontSize:17,fontStyle:"italic",lineHeight:1.6,color:C.text,margin:0}}>"{qa.question}"</p></Card>{[[userKey,me?.name,C.accent,C.accentSoft,C.accentBd,pk],[pk,partner?.name,C.amber,C.amberSoft,C.amberBd,userKey]].map(([key,name,color,soft,bd,gk])=><div key={key} style={{background:soft,border:`1px solid ${bd}`,borderRadius:16,padding:18,marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>{name}'s answers</div><div style={{marginBottom:10}}><div style={{fontSize:11,color:C.muted,marginBottom:2}}>Their answer:</div><div style={{fontSize:15,color:C.text,fontWeight:500}}>{qa?.answers?.[key]||<i style={{color:C.muted}}>Not answered yet</i>}</div></div><div><div style={{fontSize:11,color:C.muted,marginBottom:2}}>{key===userKey?`${partner?.name}'s guess:`:`${me?.name}'s guess:`}</div><div style={{fontSize:15,color:C.text,fontWeight:500}}>{qa?.guesses?.[gk]||<i style={{color:C.muted}}>Not guessed yet</i>}</div></div></div>)}<Btn variant="ghost" onClick={back}>← Back to home</Btn></div>}
    </div>
  );
}

// ── WYR ────────────────────────────────────────────────────────────────────
function WYRScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const fk=`wyr_${todayKey()}`; const wyr=roomData?.[fk]; const [loading,setLoading]=useState(false);
  const generate=async()=>{ setLoading(true); try{ const raw=await callClaude('Would You Rather for a couple. Return ONLY JSON: {"a":"option A","b":"option B"} — no backticks.',"Create dilemma."); const m=raw.match(/\{[\s\S]*?\}/); const p=JSON.parse(m?m[0]:raw); await update({[fk]:{a:p.a,b:p.b,choices:{}}}); }catch(e){console.error(e);} setLoading(false); };
  const choose=async opt=>{ if(wyr?.choices?.[userKey]) return; await update({[`${fk}.choices.${userKey}`]:opt}); await addN("wyr",`${me?.name} made their choice`); };
  const mine=wyr?.choices?.[userKey],theirs=wyr?.choices?.[pk],both=mine&&theirs,agree=both&&mine===theirs;
  const opts=[{key:"a",text:wyr?.a,color:C.accent,soft:C.accentSoft,bd:C.accentBd,label:"Option A"},{key:"b",text:wyr?.b,color:C.amber,soft:C.amberSoft,bd:C.amberBd,label:"Option B"}];
  return (
    <div style={{padding:"22px 18px 48px"}}>
      <Hdr title="Would You Rather" sub="Make choices, discover each other" back={back}/>
      {!wyr?.a?(<div style={{textAlign:"center",paddingTop:20}}><div style={{fontSize:56,marginBottom:18,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>🤔</div><p style={{color:C.muted,fontSize:15,lineHeight:1.7,marginBottom:32}}>No obvious right answer — just interesting choices.</p>{loading?<Spinner text="Crafting your dilemma..."/>:<Btn onClick={generate}>Generate today's dilemma ✦</Btn>}</div>):(<div><p style={{fontFamily:"Georgia,serif",fontSize:18,fontStyle:"italic",color:C.muted,textAlign:"center",marginBottom:20}}>Would you rather...</p>{opts.map(opt=>{ const chosen=mine===opt.key,pp=theirs===opt.key; return <button key={opt.key} onClick={()=>!mine&&choose(opt.key)} style={{display:"block",width:"100%",background:chosen?opt.soft:C.surface,border:`2px solid ${chosen?opt.color:C.border}`,borderRadius:18,padding:22,textAlign:"left",cursor:mine?"default":"pointer",fontFamily:"inherit",marginBottom:14,transition:"all 0.2s",boxShadow:chosen?`0 4px 18px ${opt.color}33`:"none"}}><div style={{fontSize:12,fontWeight:700,color:opt.color,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>{opt.label}</div><div style={{fontFamily:"Georgia,serif",fontSize:18,fontStyle:"italic",color:C.text,lineHeight:1.55}}>{opt.text}</div>{both&&<div style={{marginTop:10,display:"flex",gap:7,flexWrap:"wrap"}}>{chosen&&<span style={{fontSize:11,fontWeight:600,color:opt.color,background:opt.soft,padding:"3px 10px",borderRadius:20,border:`1px solid ${opt.bd}`}}>✓ {me?.name}</span>}{pp&&<span style={{fontSize:11,fontWeight:600,color:opt.color,background:opt.soft,padding:"3px 10px",borderRadius:20,border:`1px solid ${opt.bd}`}}>✓ {partner?.name}</span>}</div>}</button>; })}{!mine&&<p style={{textAlign:"center",fontSize:13,color:C.muted}}>Tap to choose — no changing your mind!</p>}{mine&&!theirs&&<div style={{background:C.amberSoft,border:`1px solid ${C.amberBd}`,borderRadius:12,padding:12,textAlign:"center",fontSize:13,color:C.amber}}>⏳ Waiting for {partner?.name}...</div>}{both&&<div style={{marginTop:8}}><div style={{background:agree?"#e8f5ec":C.accentSoft,border:`1px solid ${agree?"#b5dfc2":C.accentBd}`,borderRadius:14,padding:16,textAlign:"center",marginBottom:14}}><div style={{fontSize:28,marginBottom:6}}>{agree?"🎉":"✨"}</div><div style={{fontWeight:600,color:agree?"#3d7a52":C.accent,fontSize:14}}>{agree?"You both chose the same!":"You chose differently — great conversation starter!"}</div></div><Btn variant="outline" onClick={()=>update({[fk]:{a:"",b:"",choices:{}}})}>New dilemma →</Btn></div>}</div>)}
    </div>
  );
}

// ── NHIE ───────────────────────────────────────────────────────────────────
function NHIE({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const fk=`ninh_${todayKey()}`; const ninh=roomData?.[fk]; const [loading,setLoading]=useState(false);
  const generate=async()=>{ setLoading(true); try{ const raw=await callClaude('5 "Never Have I Ever" statements for a couple. Return ONLY a JSON array of 5 strings — no backticks.',"Generate."); const m=raw.match(/\[[\s\S]*?\]/); const arr=JSON.parse(m?m[0]:raw); await update({[fk]:{statements:arr.map(t=>({text:t,A:null,B:null}))}}); }catch(e){console.error(e);} setLoading(false); };
  const vote=async(i,choice)=>{ if(!ninh?.statements||ninh.statements[i][userKey]) return; const stmts=[...ninh.statements]; stmts[i]={...stmts[i],[userKey]:choice}; await update({[`${fk}.statements`]:stmts}); await addN("nhie",`${me?.name} voted on Never Have I Ever`); };
  const allDone=ninh?.statements?.every(s=>s.A&&s.B);
  return (
    <div style={{padding:"22px 18px 48px"}}>
      <Hdr title="Never Have I Ever" sub="Find out who's done what" back={back}/>
      {!ninh?.statements?(<div style={{textAlign:"center",paddingTop:20}}><div style={{fontSize:56,marginBottom:18,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>🙋</div><p style={{color:C.muted,fontSize:15,lineHeight:1.7,marginBottom:32}}>5 statements. Have or never?</p>{loading?<Spinner text="Generating statements..."/>:<Btn onClick={generate}>Generate statements ✦</Btn>}</div>):(
      <div>{ninh.statements.map((s,i)=><div key={i} style={{background:C.surface,borderRadius:16,padding:18,marginBottom:10,boxShadow:"0 1px 8px rgba(30,20,13,0.05)"}}><div style={{fontSize:11,fontWeight:600,color:C.muted,marginBottom:5}}>#{i+1}</div><p style={{fontSize:14,color:C.text,marginBottom:12,lineHeight:1.5}}>{s.text}</p>{!s[userKey]?(<div style={{display:"flex",gap:9}}><button onClick={()=>vote(i,"have")} style={{flex:1,padding:10,borderRadius:11,border:"1.5px solid #b5dfc2",background:"#e8f5ec",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600,color:"#3d7a52"}}>✓ I have</button><button onClick={()=>vote(i,"never")} style={{flex:1,padding:10,borderRadius:11,border:`1.5px solid ${C.accentBd}`,background:C.accentSoft,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600,color:C.accent}}>✗ Never</button></div>):(<div style={{display:"flex",flexWrap:"wrap",gap:7}}>{[[userKey,me?.name],[pk,partner?.name]].map(([key,name])=>s[key]?<span key={key} style={{fontSize:11,fontWeight:600,padding:"4px 11px",borderRadius:20,background:s[key]==="have"?"#e8f5ec":C.accentSoft,color:s[key]==="have"?"#3d7a52":C.accent,border:`1px solid ${s[key]==="have"?"#b5dfc2":C.accentBd}`}}>{name}: {s[key]==="have"?"✓ Have":"✗ Never"}</span>:<span key={key} style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>⏳ {name}...</span>)}</div>)}</div>)}
      {allDone&&<Btn variant="outline" style={{marginTop:6}} onClick={()=>update({[fk]:null})}>New round →</Btn>}</div>)}
    </div>
  );
}

// ── TRUTH OR DARE ──────────────────────────────────────────────────────────
function TruthOrDare({me,partner,userKey,roomData,update,addN,back}){
  const tord=roomData?.tord; const [loading,setLoading]=useState(false);
  const pick=async type=>{ setLoading(true); try{ const content=await callClaude(type==="truth"?"One 'Truth' question for a couple — personal, slightly vulnerable. Return ONLY the question.":"One 'Dare' for long-distance — they can do it alone and share via photo/text. Return ONLY the dare.",`Generate a ${type}.`); await update({tord:{type,content,done:false}}); await addN("tord",`${me?.name} picked a ${type}`); }catch(e){console.error(e);} setLoading(false); };
  return (
    <div style={{padding:"22px 18px 48px"}}>
      <Hdr title="Truth or Dare" sub="Pick your fate" back={back}/>
      {!tord?.type?(<div><div style={{textAlign:"center",paddingTop:8,marginBottom:24}}><div style={{fontSize:56,marginBottom:12,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>🎭</div><p style={{color:C.muted,fontSize:15,lineHeight:1.7}}>What will it be?</p></div>{loading?<Spinner text="Rolling the dice..."/>:(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><button onClick={()=>pick("truth")} style={{background:C.accentSoft,border:`2px solid ${C.accentBd}`,borderRadius:18,padding:"26px 14px",cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.03)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}><div style={{fontSize:34,marginBottom:8}}>💬</div><div style={{fontSize:18,fontWeight:700,color:C.accent,fontFamily:"Georgia,serif",fontStyle:"italic"}}>Truth</div></button><button onClick={()=>pick("dare")} style={{background:C.amberSoft,border:`2px solid ${C.amberBd}`,borderRadius:18,padding:"26px 14px",cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.03)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}><div style={{fontSize:34,marginBottom:8}}>⚡</div><div style={{fontSize:18,fontWeight:700,color:C.amber,fontFamily:"Georgia,serif",fontStyle:"italic"}}>Dare</div></button></div>)}</div>):(
      <div><div style={{background:tord.type==="truth"?C.accentSoft:C.amberSoft,border:`2px solid ${tord.type==="truth"?C.accentBd:C.amberBd}`,borderRadius:20,padding:26,marginBottom:18,textAlign:"center"}}><div style={{fontSize:12,fontWeight:700,color:tord.type==="truth"?C.accent:C.amber,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:14}}>{tord.type==="truth"?"💬 Truth":"⚡ Dare"}</div><p style={{fontFamily:"Georgia,serif",fontSize:19,fontStyle:"italic",color:C.text,lineHeight:1.6,margin:0}}>{tord.content}</p></div>{!tord.done?(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}><Btn onClick={async()=>await update({tord:{...tord,done:true}})}>✓ Done!</Btn><Btn variant="ghost" onClick={async()=>await update({tord:null})}>Skip →</Btn></div>):(<div><div style={{background:"#e8f5ec",border:"1px solid #b5dfc2",borderRadius:14,padding:14,textAlign:"center",marginBottom:14}}><div style={{fontSize:26,marginBottom:4}}>🎉</div><div style={{fontWeight:600,color:"#3d7a52"}}>Challenge completed!</div></div><Btn variant="outline" onClick={async()=>await update({tord:null})}>Pick another →</Btn></div>)}</div>
      )}
    </div>
  );
}

// ── LOVE NOTES ─────────────────────────────────────────────────────────────
function LoveNotes({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A";
  const readKey=userKey==="A"?"readA_note":"readB_note";
  const notes=roomData?.notes||[];
  const [text,setText]=useState("");
  const unread=notes.filter(n=>n.from===pk&&!n[readKey]).length;
  const send=async()=>{ if(!text.trim()) return; const note={id:Date.now()+Math.random(),from:userKey,text:text.trim(),date:new Date().toLocaleDateString("en",{month:"short",day:"numeric"}),readA_note:userKey==="A",readB_note:userKey==="B"}; await update({notes:[note,...notes]}); await addN("note",`${me?.name} sent you a love note 💌`); setText(""); };
  const reveal=async id=>{ const updated=notes.map(n=>n.id===id?{...n,[readKey]:true}:n); await update({notes:updated}); };
  return (
    <div style={{padding:"22px 18px 48px"}}>
      <Hdr title="Love Notes" sub="Little letters, big feelings" back={back} right={unread>0?<div style={{background:C.accentSoft,border:`1px solid ${C.accentBd}`,borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:600,color:C.accent}}>💌 {unread}</div>:null}/>
      <Card><Field textarea label={`Write to ${partner?.name}`} value={text} onChange={e=>setText(e.target.value)} placeholder="Say something sweet, funny, or from the heart..."/><Btn disabled={!text.trim()} onClick={send}>Send note 💌</Btn></Card>
      {notes.length===0?<div style={{textAlign:"center",padding:"36px 0"}}><div style={{fontSize:48,marginBottom:12,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>💌</div><div style={{color:C.muted,fontSize:15}}>No notes yet — send the first one.</div></div>:notes.map(note=>{ const fromMe=note.from===userKey; const isHidden=!fromMe&&!note[readKey]; return <div key={note.id} style={{background:fromMe?C.bg:C.surface,borderRadius:14,padding:16,marginBottom:10,border:`1px solid ${fromMe?C.border:C.accentBd}`}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><div style={{fontSize:11,fontWeight:600,color:fromMe?C.muted:C.accent}}>{fromMe?"From you":`From ${partner?.name}`}</div><div style={{fontSize:11,color:C.muted}}>{note.date}</div></div>{isHidden?<div style={{textAlign:"center",padding:"12px 0"}}><div style={{fontSize:22,marginBottom:6}}>💌</div><div style={{fontSize:13,color:C.muted,marginBottom:12}}>A note from {partner?.name}</div><Btn onClick={()=>reveal(note.id)} style={{maxWidth:140,margin:"0 auto",padding:9,fontSize:13}}>Reveal ♥</Btn></div>:<div style={{fontSize:15,color:C.text,lineHeight:1.65}}>{note.text}</div>}</div>; })}
    </div>
  );
}

// ── GRATITUDE ──────────────────────────────────────────────────────────────
function Gratitude({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const fk=`grat_${todayKey()}`; const grat=roomData?.[fk];
  const [text,setText]=useState(grat?.[userKey]||"");
  const submitted=!!grat?.[userKey]; const partnerDone=!!grat?.[pk]; const both=submitted&&partnerDone;
  const submit=async()=>{ if(!text.trim()) return; await update({[`${fk}.${userKey}`]:text.trim()}); await addN("grat",`${me?.name} shared their gratitude 🙏`); };
  return (
    <div style={{padding:"22px 18px 48px"}}>
      <Hdr title="Daily Gratitude" sub={new Date().toLocaleDateString("en",{month:"long",day:"numeric"})} back={back}/>
      {!submitted&&<div><div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:48,marginBottom:10,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>🙏</div><p style={{fontFamily:"Georgia,serif",fontSize:19,fontStyle:"italic",color:C.text,lineHeight:1.6}}>What's one thing you love about {partner?.name} today?</p></div><Field textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Be specific — what did they do, say, or make you feel?"/><Btn disabled={!text.trim()} onClick={submit}>Send my gratitude 🙏</Btn></div>}
      {submitted&&both&&<div><div style={{background:"#e8f5ec",border:"1px solid #b5dfc2",borderRadius:14,padding:16,textAlign:"center",marginBottom:18}}><div style={{fontSize:26,marginBottom:6}}>🌸</div><div style={{fontWeight:600,color:"#3d7a52"}}>You both shared today</div></div>{[[userKey,me?.name,partner?.name,C.accent,C.accentSoft,C.accentBd],[pk,partner?.name,me?.name,C.amber,C.amberSoft,C.amberBd]].map(([key,from,to,color,soft,bd])=><div key={key} style={{background:soft,border:`1px solid ${bd}`,borderRadius:14,padding:18,marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>{from} → {to}</div><p style={{fontFamily:"Georgia,serif",fontSize:17,fontStyle:"italic",color:C.text,lineHeight:1.6,margin:0}}>"{grat[key]}"</p></div>)}<Btn variant="ghost" onClick={back}>← Back</Btn></div>}
      {submitted&&!partnerDone&&<div><div style={{background:C.accentSoft,border:`1px solid ${C.accentBd}`,borderRadius:14,padding:18,marginBottom:16}}><div style={{fontSize:11,fontWeight:600,color:C.accent,marginBottom:6}}>✓ Your gratitude for today</div><p style={{fontFamily:"Georgia,serif",fontSize:17,fontStyle:"italic",color:C.text,lineHeight:1.6,margin:0}}>"{grat[userKey]}"</p></div><div style={{background:C.amberSoft,border:`1px solid ${C.amberBd}`,borderRadius:12,padding:12,textAlign:"center",fontSize:13,color:C.amber}}>⏳ Waiting for {partner?.name}...</div></div>}
    </div>
  );
}

// ── COMPATIBILITY ──────────────────────────────────────────────────────────
function CompatScreen({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const fk=`compat_${todayKey()}`; const compat=roomData?.[fk]; const [loading,setLoading]=useState(false);
  const generate=async()=>{ setLoading(true); try{ const raw=await callClaude('6 preference questions for a compatibility quiz. Each has a 1-5 scale. Return ONLY JSON array: [{"q":"question","low":"label for 1","high":"label for 5"},...] — no backticks.',"Generate 6 questions."); const m=raw.match(/\[[\s\S]*?\]/); const qs=JSON.parse(m?m[0]:raw); await update({[fk]:{questions:qs,ratings:{A:{},B:{}}}}); }catch(e){console.error(e);} setLoading(false); };
  const rate=async(i,val)=>{ if(compat?.ratings?.[userKey]?.[i]!==undefined) return; await update({[`${fk}.ratings.${userKey}.${i}`]:val}); await addN("compat",`${me?.name} rated question ${i+1}`); };
  const myR=compat?.ratings?.[userKey]||{},theirR=compat?.ratings?.[pk]||{};
  const myDone=compat?.questions&&Object.keys(myR).length===compat.questions.length;
  const theirDone=compat?.questions&&Object.keys(theirR).length===compat.questions.length;
  const both=myDone&&theirDone;
  const score=both?Math.round(100-compat.questions.reduce((acc,_,i)=>acc+Math.abs((myR[i]||3)-(theirR[i]||3)),0)/compat.questions.length*20):null;
  const scoreColor=score>=80?"#3d7a52":score>=60?C.amber:C.accent;
  return (
    <div style={{padding:"22px 18px 48px"}}>
      <Hdr title="Compatibility Meter" sub="See how alike you really are" back={back}/>
      {!compat?.questions?(<div style={{textAlign:"center",paddingTop:20}}><div style={{fontSize:56,marginBottom:18,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>📊</div><p style={{color:C.muted,fontSize:15,lineHeight:1.7,marginBottom:32}}>6 questions. Rate your preferences. See your match.</p>{loading?<Spinner text="Generating questions..."/>:<Btn variant="sage" onClick={generate}>Start the quiz ✦</Btn>}</div>):(
      <div>{both&&<div style={{background:C.sageSoft,border:`1px solid ${C.sageBd}`,borderRadius:18,padding:22,textAlign:"center",marginBottom:20}}><div style={{fontSize:11,fontWeight:600,color:C.sage,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Your compatibility score</div><div style={{fontSize:52,fontWeight:700,color:scoreColor,fontFamily:"Georgia,serif",marginBottom:6}}>{score}%</div><div style={{fontSize:14,color:C.muted}}>{score>=80?"You two are beautifully aligned ✨":score>=60?"Lovely mix of similarities and differences 🌸":"Opposites attract — plenty to explore 🎉"}</div></div>}
      {compat.questions.map((q,i)=>{ const my=myR[i],their=theirR[i],answered=my!==undefined; return <div key={i} style={{background:C.surface,borderRadius:16,padding:18,marginBottom:10,boxShadow:"0 1px 8px rgba(30,20,13,0.05)"}}><div style={{fontSize:11,fontWeight:600,color:C.muted,marginBottom:4}}>Q{i+1}</div><div style={{fontSize:14,color:C.text,marginBottom:12,lineHeight:1.45,fontWeight:500}}>{q.q}</div><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:8}}><span>1 — {q.low}</span><span>{q.high} — 5</span></div><div style={{display:"flex",gap:8,marginBottom:8}}>{[1,2,3,4,5].map(v=><button key={v} onClick={()=>!answered&&rate(i,v)} style={{flex:1,padding:"10px 0",borderRadius:10,border:`1.5px solid ${my===v?C.sage:C.border}`,background:my===v?C.sageSoft:C.bg,cursor:answered?"default":"pointer",fontFamily:"inherit",fontSize:14,fontWeight:my===v?700:400,color:my===v?C.sage:C.text,transition:"all 0.15s"}}>{v}</button>)}</div>{both&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:C.accentSoft,color:C.accent,border:`1px solid ${C.accentBd}`}}>{me?.name}: {my}</span><span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:C.amberSoft,color:C.amber,border:`1px solid ${C.amberBd}`}}>{partner?.name}: {their}</span>{Math.abs(my-their)<=1&&<span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"#e8f5ec",color:"#3d7a52",border:"1px solid #b5dfc2"}}>✓ Aligned</span>}</div>}{!answered&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>Tap a number to rate</div>}</div>; })}
      {both&&<Btn variant="ghost" style={{marginTop:6}} onClick={()=>update({[fk]:null})}>Retake →</Btn>}
      {!both&&myDone&&<div style={{background:C.amberSoft,border:`1px solid ${C.amberBd}`,borderRadius:12,padding:12,textAlign:"center",fontSize:13,color:C.amber,marginTop:6}}>⏳ Waiting for {partner?.name} to finish...</div>}</div>)}
    </div>
  );
}

// ── LOVE LANGUAGE ──────────────────────────────────────────────────────────
const LOVE_LANGS=[{key:"words",icon:"💬",title:"Words of Affirmation",desc:"Compliments, 'I love you', encouraging messages"},{key:"time",icon:"⏰",title:"Quality Time",desc:"Undivided attention, meaningful conversations"},{key:"gifts",icon:"🎁",title:"Receiving Gifts",desc:"Thoughtful surprises, remembering what matters"},{key:"acts",icon:"🤝",title:"Acts of Service",desc:"Doing things that ease their load"},{key:"touch",icon:"🤗",title:"Physical Touch",desc:"Hugs, closeness, physical presence"}];
function LoveLang({me,partner,userKey,roomData,update,addN,back}){
  const pk=userKey==="A"?"B":"A"; const ll=roomData?.lovelang; const mine=ll?.[userKey]; const theirs=ll?.[pk]; const both=mine&&theirs; const match=both&&mine===theirs;
  const pick=async key=>{ await update({[`lovelang.${userKey}`]:key}); await addN("lovelang",`${me?.name} chose their love language 💝`); };
  return (
    <div style={{padding:"22px 18px 48px"}}>
      <Hdr title="Love Language" sub="How do you feel loved?" back={back}/>
      {!mine?(<div><div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:48,marginBottom:10,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>💝</div><p style={{fontFamily:"Georgia,serif",fontSize:18,fontStyle:"italic",color:C.text,lineHeight:1.6}}>Which speaks to your heart most?</p></div><div style={{fontSize:11,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>{me?.name} — pick your primary love language</div>{LOVE_LANGS.map(l=><button key={l.key} onClick={()=>pick(l.key)} style={{display:"block",width:"100%",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:16,padding:"16px 18px",textAlign:"left",cursor:"pointer",fontFamily:"inherit",marginBottom:10,transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.background=C.accentSoft;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.surface;}}><div style={{display:"flex",alignItems:"center",gap:14}}><div style={{fontSize:28}}>{l.icon}</div><div><div style={{fontSize:15,fontWeight:600,color:C.text}}>{l.title}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{l.desc}</div></div></div></button>)}</div>):(
      <div>{!theirs&&<div style={{background:C.amberSoft,border:`1px solid ${C.amberBd}`,borderRadius:12,padding:12,textAlign:"center",fontSize:13,color:C.amber,marginBottom:16}}>⏳ Waiting for {partner?.name} to pick...</div>}{both&&<div style={{background:match?"#e8f5ec":C.purpleSoft,border:`1px solid ${match?"#b5dfc2":C.purpleBd}`,borderRadius:16,padding:20,textAlign:"center",marginBottom:20}}><div style={{fontSize:28,marginBottom:8}}>{match?"🎉":"💡"}</div><div style={{fontWeight:600,fontSize:15,color:match?"#3d7a52":C.purple}}>{match?"You share the same love language!":"Different languages — knowing this helps you love better."}</div></div>}{LOVE_LANGS.map(l=>{ const isMe=mine===l.key,isTheirs=theirs===l.key; if(!isMe&&!isTheirs) return null; return <div key={l.key} style={{background:C.surface,borderRadius:16,padding:18,marginBottom:10,border:`1.5px solid ${isMe&&isTheirs?C.sage:isMe?C.accentBd:C.amberBd}`,boxShadow:"0 1px 8px rgba(30,20,13,0.05)"}}><div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{fontSize:28}}>{l.icon}</div><div style={{flex:1}}><div style={{fontSize:15,fontWeight:600,color:C.text}}>{l.title}</div><div style={{fontSize:12,color:C.muted}}>{l.desc}</div></div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{isMe&&<span style={{fontSize:11,fontWeight:600,padding:"3px 11px",borderRadius:20,background:C.accentSoft,color:C.accent,border:`1px solid ${C.accentBd}`}}>♥ {me?.name}</span>}{isTheirs&&<span style={{fontSize:11,fontWeight:600,padding:"3px 11px",borderRadius:20,background:C.amberSoft,color:C.amber,border:`1px solid ${C.amberBd}`}}>♥ {partner?.name}</span>}</div></div>; })}<Btn variant="ghost" style={{marginTop:6}} onClick={()=>update({"lovelang":null})}>Retake →</Btn></div>
      )}
    </div>
  );
}

// ── BUCKET LIST ────────────────────────────────────────────────────────────
function BucketList({me,partner,userKey,roomData,update,addN,back}){
  const bucket=roomData?.bucket||[]; const [text,setText]=useState(""); const [loading,setLoading]=useState(false);
  const addItem=async()=>{ if(!text.trim()) return; const item={id:Date.now()+Math.random(),text:text.trim(),by:me?.name,done:false,date:new Date().toLocaleDateString("en",{month:"short",day:"numeric"})}; await update({bucket:[item,...bucket]}); await addN("bucket",`${me?.name} added to your bucket list 🌍`); setText(""); };
  const toggle=async id=>{ await update({bucket:bucket.map(i=>i.id===id?{...i,done:!i.done}:i)}); };
  const suggest=async()=>{ setLoading(true); try{ const raw=await callClaude('5 romantic bucket list ideas for a long-distance couple. Return ONLY a JSON array of 5 short strings, no backticks.',"Generate 5 ideas."); const m=raw.match(/\[[\s\S]*?\]/); const arr=JSON.parse(m?m[0]:raw); const items=arr.map(t=>({id:Date.now()+Math.random(),text:t,by:"AI ✦",done:false,date:"suggested"})); await update({bucket:[...items,...bucket]}); }catch(e){console.error(e);} setLoading(false); };
  const done=bucket.filter(i=>i.done).length;
  return (
    <div style={{padding:"22px 18px 56px"}}>
      <Hdr title="Bucket List" sub={`${done} of ${bucket.length} done together`} back={back}/>
      <Card><Field label="Add a dream" placeholder="e.g. Watch the Northern Lights together..." value={text} onChange={e=>setText(e.target.value)}/><div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10}}><Btn disabled={!text.trim()} onClick={addItem}>Add ✦</Btn><Btn variant="ghost" style={{width:"auto",padding:"13px 16px"}} onClick={suggest} disabled={loading}>{loading?"…":"💡"}</Btn></div><div style={{fontSize:11,color:C.muted,marginTop:8,textAlign:"right"}}>💡 = AI suggestions</div></Card>
      {bucket.length===0?<div style={{textAlign:"center",padding:"36px 0"}}><div style={{fontSize:52,marginBottom:12,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>🌍</div><div style={{color:C.muted,fontSize:15}}>Start dreaming together — add your first item.</div></div>:(
      <div>{bucket.filter(i=>!i.done).length>0&&<div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>To do together</div>}
      {bucket.filter(i=>!i.done).map(item=><div key={item.id} style={{background:C.surface,borderRadius:14,padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"flex-start",gap:12,boxShadow:"0 1px 6px rgba(30,20,13,0.05)"}}><button onClick={()=>toggle(item.id)} style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${C.border}`,background:"none",cursor:"pointer",flexShrink:0,marginTop:2,transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.sage} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}/><div style={{flex:1}}><div style={{fontSize:15,color:C.text,lineHeight:1.45}}>{item.text}</div><div style={{fontSize:11,color:C.muted,marginTop:4}}>by {item.by} · {item.date}</div></div></div>)}
      {bucket.filter(i=>i.done).length>0&&<div><div style={{fontSize:11,fontWeight:600,color:C.sage,textTransform:"uppercase",letterSpacing:"0.07em",margin:"18px 0 10px"}}>✓ Done together ({done})</div>{bucket.filter(i=>i.done).map(item=><div key={item.id} style={{background:C.sageSoft,borderRadius:14,padding:"12px 16px",marginBottom:7,display:"flex",alignItems:"flex-start",gap:12,border:`1px solid ${C.sageBd}`}}><button onClick={()=>toggle(item.id)} style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${C.sage}`,background:C.sage,cursor:"pointer",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff"}}>✓</button><div style={{flex:1}}><div style={{fontSize:14,color:C.sage,textDecoration:"line-through",lineHeight:1.4}}>{item.text}</div></div></div>)}</div>}
      </div>)}
    </div>
  );
}

// ── MEMORY JAR ─────────────────────────────────────────────────────────────
function MemoryJar({me,userKey,roomData,update,addN,back}){
  const memories=roomData?.memories||[]; const [text,setText]=useState("");
  const add=async()=>{ if(!text.trim()) return; const m={id:Date.now()+Math.random(),userKey,name:me?.name,text:text.trim(),date:new Date().toLocaleDateString("en",{month:"short",day:"numeric"})}; await update({memories:[m,...memories]}); await addN("memory",`${me?.name} added a memory 🫙`); setText(""); };
  return (
    <div style={{padding:"22px 18px 48px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}><BackBtn onClick={back}/><div style={{flex:1}}><h2 style={{fontFamily:"Georgia,serif",fontSize:22,fontWeight:400,fontStyle:"italic",color:C.text}}>Memory Jar</h2><div style={{fontSize:12,color:C.muted}}>Little moments, kept forever</div></div><div style={{fontSize:28}}>🫙</div></div>
      <Card><Field textarea label={`Drop a memory, ${me?.name}`} value={text} onChange={e=>setText(e.target.value)} placeholder="A funny moment, a feeling, a wish... ✨"/><Btn disabled={!text.trim()} onClick={add}>Add to jar ✦</Btn></Card>
      {memories.length===0?<div style={{textAlign:"center",padding:"40px 0"}}><div style={{fontSize:48,marginBottom:12,display:"inline-block",animation:"hbFloat 3.2s ease-in-out infinite"}}>🫙</div><div style={{color:C.muted,fontSize:15}}>Your jar is empty — fill it with moments.</div></div>:memories.map(m=><div key={m.id} style={{background:C.surface,borderRadius:14,padding:16,marginBottom:10,boxShadow:"0 1px 6px rgba(30,20,13,0.05)",borderLeft:`3px solid ${m.userKey==="A"?C.accent:C.amber}`}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div style={{fontSize:11,fontWeight:600,color:m.userKey==="A"?C.accent:C.amber}}>{m.name}</div><div style={{fontSize:11,color:C.muted}}>{m.date}</div></div><div style={{fontSize:15,color:C.text,lineHeight:1.6}}>{m.text}</div></div>)}
    </div>
  );
}

// ── SETTINGS ───────────────────────────────────────────────────────────────
function Settings({roomData,update,back}){
  const [date,setDate]=useState(roomData?.nextMeeting||"");
  return (
    <div style={{padding:"22px 18px 48px"}}>
      <Hdr title="Next Meeting" sub="Update your countdown" back={back}/>
      <Card><p style={{color:C.muted,fontSize:15,marginBottom:18,lineHeight:1.7}}>Set when you'll next be together — powers the countdown on home.</p><Field label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)}/><Btn onClick={()=>{ update({nextMeeting:date||null}); back(); }}>Save →</Btn>{roomData?.nextMeeting&&<Btn variant="ghost" style={{marginTop:10}} onClick={()=>{ update({nextMeeting:null}); back(); }}>Clear date</Btn>}</Card>
    </div>
  );
}

// ── ROOT APP ───────────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState("loading"); // loading | login | setup | waiting | app
  const [user,     setUser    ] = useState(null);   // Firebase auth user
  const [roomId,   setRoomId  ] = useState(null);
  const [userKey,  setUserKey ] = useState(null);   // "A" or "B"
  const [roomData, setRoomData] = useState(null);   // live Firestore data
  const [screen,   setScreen  ] = useState("home");
  const [showNotif,setShowNotif] = useState(false);

  // ── Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setAppState("login"); return; }
      setUser(u);
      const snap = await getDoc(doc(db, "users", u.uid));
      if (!snap.exists() || !snap.data().roomId) {
        setAppState("setup"); return;
      }
      const { roomId: rid, userKey: uk } = snap.data();
      setRoomId(rid); setUserKey(uk);
      setAppState("connecting");
    });
    return unsub;
  }, []);

  // ── Room listener
  useEffect(() => {
    if (!roomId) return;
    const unsub = onSnapshot(doc(db, "rooms", roomId), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      setRoomData(data);
      // If A created room and B just joined, move to app
      if (data.users?.A?.name && data.users?.B?.name) {
        setAppState("app");
      } else if (userKey === "A" && !data.users?.B?.name) {
        setAppState("waiting");
      }
      // Update streak
      const today = todayStr();
      const sk = data.streak || { count: 0, lastDate: "" };
      if (sk.lastDate !== today) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        const yd = y.toISOString().split("T")[0];
        const ns = sk.lastDate === yd ? { count: sk.count + 1, lastDate: today } : { count: 1, lastDate: today };
        updateDoc(doc(db, "rooms", roomId), { streak: ns });
      }
    });
    return unsub;
  }, [roomId, userKey]);

  const update = useCallback((updates) => roomUpdate(roomId, updates), [roomId]);
  const addN   = useCallback((type, message) => addNotif(roomId, userKey, type, message), [roomId, userKey]);

  const me      = roomData?.users?.[userKey];
  const partner = roomData?.users?.[userKey === "A" ? "B" : "A"];
  const readKey = userKey === "A" ? "readA" : "readB";
  const unread  = (roomData?.notifications || []).filter(n => n.from !== userKey && !n[readKey]).length;

  const signOut = async () => { await fbSignOut(auth); setRoomId(null); setUserKey(null); setRoomData(null); setScreen("home"); setAppState("login"); };

  const shared = { me, partner, userKey, roomData, update, addN };

  // ── Render
  const ANIMS = `
    @keyframes hbBeat   { 0%,100%{transform:scale(1)} 30%{transform:scale(1.25)} 65%{transform:scale(1.08)} }
    @keyframes hbFadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
    @keyframes hbFloat  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    @keyframes hbSpin   { to{transform:rotate(360deg)} }
  `;

  if (appState === "loading" || appState === "connecting") return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, minHeight:"100vh", background:C.bg }}>
      <style>{ANIMS}</style>
      <div style={{ fontSize:60, animation:"hbFloat 3.2s ease-in-out infinite" }}>♥</div>
      <div style={{ fontSize:14, color:C.muted }}>Loading...</div>
    </div>
  );

  if (appState === "login")   return <div style={{ background:C.bg, minHeight:"100vh" }}><style>{ANIMS}</style><Login onLogin={u => { setUser(u); setAppState("setup"); }}/></div>;
  if (appState === "setup")   return <div style={{ background:C.bg, minHeight:"100vh" }}><style>{ANIMS}</style><Setup uid={user?.uid} onDone={(rid, uk) => { setRoomId(rid); setUserKey(uk); }}/></div>;
if (appState === "waiting") return (
  <div style={{ background: C.bg, minHeight: "100vh" }}>
    <style>{ANIMS}</style>
    <Waiting code={roomId} onSignOut={signOut} onLeave={async () => {
      await setDoc(doc(db, "users", user.uid), { name: "", roomId: null, userKey: null });
      await updateDoc(doc(db, "rooms", roomId), { "users.A": null });
      setRoomId(null); setUserKey(null); setRoomData(null);
      setAppState("setup");
    }} />
  </div>
);
  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif", fontSize:16, color:C.text }}>
      <style>{ANIMS}</style>

      {/* Top nav */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"11px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10 }}>
        <div onClick={()=>setScreen("home")} style={{ cursor:"pointer", fontFamily:"Georgia,serif", fontStyle:"italic", color:C.accent, fontSize:19, fontWeight:400 }}>♥ Heartbeat</div>
        <button onClick={()=>setShowNotif(true)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color:C.muted, position:"relative", padding:"4px 8px" }}>
          🔔
          {unread > 0 && <div style={{ position:"absolute", top:2, right:4, background:C.accent, color:"#fff", borderRadius:"50%", width:17, height:17, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700 }}>{unread}</div>}
        </button>
      </div>

      {/* Notification panel */}
      {showNotif && <NotifPanel notifications={roomData?.notifications||[]} userKey={userKey} roomId={roomId} onClose={()=>setShowNotif(false)}/>}

      {/* Screens */}
      <div style={{ maxWidth:480, margin:"0 auto" }}>
        {screen==="home"     && <Home      {...shared} go={setScreen} onSignOut={signOut}/>}
        {screen==="qa"       && <QAScreen  {...shared} back={()=>setScreen("home")}/>}
        {screen==="wyr"      && <WYRScreen {...shared} back={()=>setScreen("home")}/>}
        {screen==="nhie"     && <NHIE      {...shared} back={()=>setScreen("home")}/>}
        {screen==="tord"     && <TruthOrDare{...shared} back={()=>setScreen("home")}/>}
        {screen==="notes"    && <LoveNotes {...shared} back={()=>setScreen("home")}/>}
        {screen==="grat"     && <Gratitude {...shared} back={()=>setScreen("home")}/>}
        {screen==="compat"   && <CompatScreen{...shared} back={()=>setScreen("home")}/>}
        {screen==="lovelang" && <LoveLang  {...shared} back={()=>setScreen("home")}/>}
        {screen==="bucket"   && <BucketList{...shared} back={()=>setScreen("home")}/>}
        {screen==="memories" && <MemoryJar {...shared} back={()=>setScreen("home")}/>}
        {screen==="settings" && <Settings  roomData={roomData} update={update} back={()=>setScreen("home")}/>}
      </div>
    </div>
  );
}
