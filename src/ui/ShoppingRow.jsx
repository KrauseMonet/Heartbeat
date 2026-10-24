import { C, LT, SHADOWS } from "./theme.js";
import { PLATFORMS_INDIA, PLATFORMS_INTL } from "../lib/shopping.js";

export function ShoppingRow({piece,timezone}){
  const isIndia=timezone==="Asia/Kolkata"||timezone==="Asia/Colombo"||timezone==="Asia/Dhaka";
  const platforms=isIndia?PLATFORMS_INDIA:PLATFORMS_INTL;
  const query=piece.split(/\s+or\s+|,\s*/i)[0]; // "Ivory silk shirt or kurta" searches better as "Ivory silk shirt"
  return (
    <div style={{marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:LT,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
        <span style={{color:C.purple}}>✦</span> {piece}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {platforms.map(p=>(
          <a key={p.name} href={p.getUrl(query)} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:6,background:p.bg,border:`1px solid ${p.bd}`,borderRadius:20,padding:"6px 12px",textDecoration:"none",fontSize:12,fontWeight:700,color:p.color,fontFamily:LT,transition:"all 0.2s",whiteSpace:"nowrap"}}
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
