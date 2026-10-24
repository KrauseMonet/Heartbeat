// ── DESIGN TOKENS ──────────────────────────────────────────────────────────
export const PF = "'Playfair Display', Georgia, serif";
export const LT = "'Lato', system-ui, sans-serif";

export const C = {
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

export const SHADOWS = {
  sm:"0 2px 8px rgba(212,82,106,0.08),0 1px 3px rgba(212,82,106,0.05)",
  md:"0 8px 24px rgba(212,82,106,0.10),0 2px 8px rgba(212,82,106,0.06)",
  lg:"0 20px 48px rgba(212,82,106,0.14),0 8px 20px rgba(212,82,106,0.08)",
  xl:"0 32px 64px rgba(212,82,106,0.18),0 12px 28px rgba(212,82,106,0.10)",
};

export const STYLES = `
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
  @keyframes hbPartnerPulse{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(212,146,42,0.7)}50%{transform:scale(1.18);box-shadow:0 0 0 28px rgba(212,146,42,0)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(212,146,42,0)}}
  @keyframes hbGoldGlow{0%,100%{box-shadow:0 10px 32px rgba(212,146,42,0.55),0 0 0 0 rgba(212,146,42,0.4)}50%{box-shadow:0 10px 48px rgba(212,146,42,0.9),0 0 0 20px rgba(212,146,42,0)}}
  @keyframes hbHeartPop{0%{transform:scale(1)}20%{transform:scale(1.35)}40%{transform:scale(0.9)}60%{transform:scale(1.15)}80%{transform:scale(0.97)}100%{transform:scale(1)}}
  .hb-partner-pulse{animation:hbPartnerPulse 0.7s ease-out!important;}
  .hb-gold-glow{animation:hbGoldGlow 1.8s ease-in-out infinite;}
  .hb-heart-pop{animation:hbHeartPop 0.5s cubic-bezier(0.22,1,0.36,1)!important;}

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
