import { ArrowLeft, Sparkle } from "@phosphor-icons/react";
import { C, PF, LT, SHADOWS } from "./theme.js";

// ── PRIMITIVE COMPONENTS ───────────────────────────────────────────────────
export function Btn({children,variant="fill",style:s,disabled,onClick,small}){
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

export function Card({children,style:s,glass,elevated,gradient,onClick,layer}){
  return (
    <div onClick={onClick} className={onClick?"card-hover":""} style={{background:gradient||C.gradCard,backdropFilter:glass?"blur(20px)":"none",WebkitBackdropFilter:glass?"blur(20px)":"none",borderRadius:20,padding:22,border:glass?"1px solid rgba(255,255,255,0.6)":"1px solid rgba(255,255,255,0.92)",boxShadow:elevated?SHADOWS.lg:SHADOWS.md,marginBottom:14,position:"relative",overflow:layer?"hidden":"visible",cursor:onClick?"pointer":"default",...s}}>
      {layer&&<div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0) 100%)",pointerEvents:"none",borderRadius:20,zIndex:1}}/>}
      <div style={{position:"relative",zIndex:2}}>{children}</div>
    </div>
  );
}

export function BackBtn({onClick}){
  return (
    <button onClick={onClick} style={{background:"rgba(255,255,255,0.75)",border:"1px solid rgba(255,255,255,0.92)",borderRadius:14,cursor:"pointer",padding:"9px 11px",lineHeight:1,boxShadow:SHADOWS.sm,backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"center",transition:"all 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=SHADOWS.md}
      onMouseLeave={e=>e.currentTarget.style.boxShadow=SHADOWS.sm}>
      <ArrowLeft size={20} color={C.text}/>
    </button>
  );
}

export function Spinner({text="One moment..."}){
  return (
    <div style={{textAlign:"center",padding:"48px 0",color:C.muted}}>
      <div style={{display:"inline-block",marginBottom:14}} className="hb-spin"><Sparkle size={32} color={C.rose}/></div>
      <div style={{fontSize:14,fontFamily:LT}}>{text}</div>
    </div>
  );
}

export function Hdr({title,sub,back,right}){
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

export function GradOrb({size=320,top=-80,color1="rgba(255,150,130,0.35)",color2="rgba(255,200,180,0.12)"}){
  return <div style={{position:"absolute",top,left:"50%",transform:"translateX(-50%)",width:size,height:size,borderRadius:"50%",background:`radial-gradient(circle,${color1} 0%,${color2} 60%,transparent 100%)`,filter:"blur(40px)",pointerEvents:"none",zIndex:0}}/>;
}

export function ScreenWrap({gradient,children,pb}){
  return <div style={{minHeight:"100vh",background:gradient||C.gradHome,paddingBottom:pb||100}}>{children}</div>;
}
