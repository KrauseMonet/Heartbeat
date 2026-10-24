// ══════════════════════════════════════════════════════════════════
// INVESTOR DEMO — "Play to Match" dating flow (open with /?demo)
// Runs entirely in the browser with sample profiles. Nothing is saved.
// ══════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import { Heart, Lightning, X, SealCheck, MapPin, Info, ChatCircleDots, CalendarHeart, PaperPlaneRight, Sparkle, Scales, ChatTeardrop, ChartBar, ArrowRight, GameController, Users, Lock } from "@phosphor-icons/react";
import { PF, LT, C, SHADOWS, STYLES } from "../ui/theme.js";
import { Btn, Card, BackBtn, GradOrb, ScreenWrap } from "../ui/primitives.jsx";
import { getDateTemplate } from "../data/content.js";
import { profilesFor } from "./profiles.js";
import { buildRound, simulateOpponent, syncScore, opponentDecision, resolve } from "./sim.js";

const SPARK = "linear-gradient(135deg,#FF7A70 0%,#D4526A 100%)";
// index.css still has Vite template rules (centred #root, light headings in dark mode); keep the demo independent of them
const DEMO_CSS = `.hb-demo{text-align:left;color:${C.text}}.hb-demo h1,.hb-demo h2,.hb-demo h3{color:${C.text};letter-spacing:normal;margin-top:0}`;
const GAME_LABELS = [{ Icon: Scales, label: "Would You Rather" }, { Icon: ChatTeardrop, label: "Guess Me" }, { Icon: ChartBar, label: "Compatibility" }];
const pill = (bg, color, bd) => ({ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 20, background: bg, color, border: `1px solid ${bd}`, fontFamily: LT });
const label = { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10, fontFamily: LT };

// ── SMALL PIECES ───────────────────────────────────────────────────
function Note({ on, children }) {
  if (!on) return null;
  return (
    <div className="fade-in" style={{ display: "flex", gap: 10, alignItems: "flex-start", background: C.purpleSoft, border: `1px solid ${C.purpleBd}`, borderRadius: 16, padding: "12px 14px", margin: "0 0 16px", fontSize: 12.5, lineHeight: 1.55, color: C.purple, fontFamily: LT }}>
      <Info size={16} color={C.purple} weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

function Photo({ src, name, size, radius = "50%", style: s }) {
  const [failed, setFailed] = useState(false);
  const base = { width: size || "100%", height: size || "100%", borderRadius: radius, objectFit: "cover", display: "block", ...s };
  if (failed || !src) return <div style={{ ...base, background: C.gradRose, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: PF, fontStyle: "italic", fontSize: size ? size * 0.4 : 64 }}>{name?.[0]}</div>;
  return <img src={src} alt={name} onError={() => setFailed(true)} style={{ ...base, background: "#FFE8E0" }} />;
}

function TopBar({ notes, setNotes, onRestart }) {
  return (
    <div style={{ background: "rgba(255,246,243,0.82)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.72)", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 20 }}>
      <div onClick={onRestart} style={{ cursor: "pointer", fontFamily: PF, fontStyle: "italic", color: C.rose, fontSize: 21, display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
        <Heart size={17} color={C.rose} weight="fill" />Heartbeat
        <span style={{ ...pill(C.goldSoft, C.gold, C.goldBd), fontStyle: "normal", fontSize: 10, padding: "3px 8px" }}>DEMO</span>
      </div>
      <button onClick={() => setNotes(!notes)} style={{ ...pill(notes ? C.purpleSoft : "rgba(255,255,255,0.8)", notes ? C.purple : C.muted, notes ? C.purpleBd : C.border), cursor: "pointer" }}>
        <Info size={13} weight={notes ? "fill" : "regular"} /> Notes {notes ? "on" : "off"}
      </button>
    </div>
  );
}

function TabBar({ tab, setTab, badges }) {
  const tabs = [{ key: "discover", Icon: Users, label: "Discover" }, { key: "sparks", Icon: Lightning, label: "Sparks" }, { key: "matches", Icon: ChatCircleDots, label: "Matches" }];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 20, pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", margin: "0 12px 14px", width: "100%", maxWidth: 456, background: "rgba(255,255,255,0.86)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.9)", borderRadius: 26, boxShadow: SHADOWS.lg, display: "flex", padding: 6 }}>
        {tabs.map(t => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, border: "none", background: on ? C.roseSoft : "transparent", borderRadius: 20, padding: "9px 0 7px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}>
              <t.Icon size={21} color={on ? C.rose : C.muted} weight={on ? "fill" : "regular"} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: on ? C.rose : C.muted, fontFamily: LT }}>{t.label}</span>
              {badges[t.key] > 0 && <span style={{ position: "absolute", top: 4, right: "calc(50% - 20px)", background: SPARK, color: "#fff", borderRadius: 10, minWidth: 16, height: 16, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{badges[t.key]}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── INTRO ──────────────────────────────────────────────────────────
function Intro({ showMe, setShowMe, onStart }) {
  const steps = [
    { Icon: Users, t: "Browse real profiles", d: "All photos and prompts, like any dating app." },
    { Icon: Lightning, t: "Send a Spark, not a like", d: "An invite to play a 5-minute round together." },
    { Icon: GameController, t: "Play, then decide", d: "See how you vibe. Match only if it's mutual." },
  ];
  return (
    <ScreenWrap gradient={C.gradHero} pb={40}>
      <div style={{ position: "relative", overflow: "hidden", padding: "56px 24px 24px", textAlign: "center" }}>
        <GradOrb size={340} top={-60} />
        <div className="hb-float" style={{ display: "inline-flex", width: 84, height: 84, borderRadius: "50%", background: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center", boxShadow: SHADOWS.xl, marginBottom: 22, position: "relative" }}>
          <Heart size={42} color={C.rose} weight="fill" />
        </div>
        <h1 className="fade-rise" style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 38, color: C.text, lineHeight: 1.15, marginBottom: 12, position: "relative" }}>Don't swipe.<br />Play.</h1>
        <p className="s1" style={{ fontSize: 15.5, color: "rgba(26,10,5,0.62)", lineHeight: 1.7, fontFamily: LT, marginBottom: 30, position: "relative" }}>Heartbeat is a dating app where you play a quick game with someone before deciding to match.</p>
        <div style={{ textAlign: "left", position: "relative" }}>
          {steps.map((s, i) => (
            <div key={i} className={`s${i + 2}`} style={{ display: "flex", gap: 14, alignItems: "center", background: "rgba(255,255,255,0.78)", border: "1px solid rgba(255,255,255,0.92)", borderRadius: 20, padding: "14px 16px", marginBottom: 10, boxShadow: SHADOWS.sm }}>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: i === 1 ? SPARK : C.gradRose, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><s.Icon size={21} color="#fff" weight="fill" /></div>
              <div><div style={{ fontSize: 14.5, fontWeight: 700, color: C.text, fontFamily: LT }}>{s.t}</div><div style={{ fontSize: 12.5, color: C.muted, fontFamily: LT, marginTop: 2 }}>{s.d}</div></div>
            </div>
          ))}
          <div className="s5" style={{ ...label, marginTop: 22, textAlign: "center" }}>Show me</div>
          <div className="s5" style={{ display: "flex", gap: 8, marginBottom: 22 }}>
            {[["women", "Women"], ["men", "Men"], ["everyone", "Everyone"]].map(([k, l]) => (
              <button key={k} onClick={() => setShowMe(k)} style={{ flex: 1, padding: "11px 0", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: LT, fontSize: 13, fontWeight: 700, background: showMe === k ? C.gradRose : "rgba(255,255,255,0.85)", color: showMe === k ? "#fff" : C.muted, boxShadow: showMe === k ? SHADOWS.md : SHADOWS.sm }}>{l}</button>
            ))}
          </div>
          <div className="s6"><Btn onClick={onStart} style={{ background: SPARK }}>Start the demo →</Btn></div>
          <p style={{ fontSize: 11.5, color: "rgba(26,10,5,0.45)", textAlign: "center", marginTop: 14, fontFamily: LT }}>Investor demo · fictional sample profiles · nothing is saved</p>
        </div>
      </div>
    </ScreenWrap>
  );
}

// ── DISCOVER ───────────────────────────────────────────────────────
function PhotoCarousel({ profile }) {
  const [i, setI] = useState(0);
  const n = profile.photos.length;
  return (
    <div style={{ position: "relative", borderRadius: 24, overflow: "hidden", height: "min(112vw, 60vh, 540px)", minHeight: 300, boxShadow: SHADOWS.lg, background: "#FFE8E0" }}>
      <Photo key={profile.photos[i]} src={profile.photos[i]} name={profile.name} radius={0} />
      <div onClick={() => setI((i - 1 + n) % n)} style={{ position: "absolute", top: 0, left: 0, width: "40%", height: "75%", cursor: "pointer" }} />
      <div onClick={() => setI((i + 1) % n)} style={{ position: "absolute", top: 0, right: 0, width: "60%", height: "75%", cursor: "pointer" }} />
      <div style={{ position: "absolute", top: 10, left: 12, right: 12, display: "flex", gap: 5 }}>
        {profile.photos.map((_, j) => <div key={j} style={{ flex: 1, height: 3.5, borderRadius: 2, background: j === i ? "#fff" : "rgba(255,255,255,0.45)" }} />)}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "48px 18px 16px", background: "linear-gradient(180deg,transparent,rgba(26,10,5,0.62))", pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: PF, fontSize: 30, fontStyle: "italic", color: "#fff" }}>{profile.name}, {profile.age}</span>
          {profile.verified && <SealCheck size={22} color="#7FD1FF" weight="fill" />}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", fontFamily: LT, display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}><MapPin size={13} weight="fill" />{profile.area}, Bengaluru · {profile.job}</div>
      </div>
    </div>
  );
}

function Discover({ profile, remaining, notes, onSkip, onSpark, onRestart }) {
  if (!profile) return (
    <div className="fade-rise" style={{ textAlign: "center", padding: "70px 28px" }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>✨</div>
      <h3 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 24, marginBottom: 10 }}>You've seen everyone</h3>
      <p style={{ fontSize: 14, color: C.muted, fontFamily: LT, lineHeight: 1.7, marginBottom: 26 }}>That's the whole sample deck. Check your Sparks and Matches tabs, or start again.</p>
      <Btn variant="outline" onClick={onRestart}>Restart the demo</Btn>
    </div>
  );
  return (<>
    <div key={profile.id} className="fade-rise" style={{ padding: "16px 16px 130px" }}>
      <Note on={notes}>Photos and prompts are shown up front, like any dating app. The difference is the button below: instead of a like, you send a <b>Spark</b>, an invite to play.</Note>
      <PhotoCarousel profile={profile} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, margin: "14px 2px" }}>
        <span style={pill(C.roseSoft, C.rose, C.roseBd)}><Heart size={11} weight="fill" />{profile.loveLang}</span>
        {profile.favGames.map(g => <span key={g} style={pill(C.goldSoft, C.gold, C.goldBd)}><GameController size={11} weight="fill" />{g}</span>)}
      </div>
      {profile.prompts.map((p, i) => (
        <Card key={i} elevated style={{ padding: "16px 18px", marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: LT, marginBottom: 6 }}>{p.q}</div>
          <div style={{ fontFamily: PF, fontStyle: "italic", fontSize: 18, lineHeight: 1.45, color: C.text }}>{p.a}</div>
        </Card>
      ))}
      <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center", fontFamily: LT, marginTop: 4 }}>{remaining} more nearby</div>
    </div>
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 92, display: "flex", justifyContent: "center", gap: 16, zIndex: 15, pointerEvents: "none" }}>
        <button onClick={onSkip} aria-label="Skip" className="card-hover" style={{ pointerEvents: "auto", width: 60, height: 60, borderRadius: "50%", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.95)", boxShadow: SHADOWS.lg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={26} color={C.muted} weight="bold" /></button>
        <button onClick={onSpark} className="card-hover hb-slow" style={{ pointerEvents: "auto", height: 60, padding: "0 30px", borderRadius: 30, border: "none", background: SPARK, boxShadow: SHADOWS.xl, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "#fff", fontFamily: LT, fontSize: 16, fontWeight: 700 }}><Lightning size={22} weight="fill" />Spark</button>
    </div>
  </>);
}

// ── SPARK ROUND ────────────────────────────────────────────────────
function Accepting({ profile, roundNo, notes, onStart }) {
  const [accepted, setAccepted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAccepted(true), 1500); return () => clearTimeout(t); }, []);
  return (
    <div className="fade-rise" style={{ textAlign: "center", padding: "56px 24px" }}>
      <div style={{ position: "relative", display: "inline-block", marginBottom: 26 }}>
        {!accepted && <div style={{ position: "absolute", inset: -14, borderRadius: "50%", background: "rgba(255,122,112,0.22)", animation: "hbRing1 1.6s ease-out infinite" }} />}
        <Photo src={profile.photos[0]} name={profile.name} size={120} style={{ border: "4px solid #fff", boxShadow: SHADOWS.xl }} />
        {accepted && <div className="hb-heart-pop" style={{ position: "absolute", right: -4, bottom: 4, width: 40, height: 40, borderRadius: "50%", background: SPARK, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: SHADOWS.md }}><Lightning size={22} color="#fff" weight="fill" /></div>}
      </div>
      {roundNo > 1
        ? <h2 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 26, marginBottom: 10 }}>One more round!</h2>
        : <h2 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 26, marginBottom: 10 }}>{accepted ? `${profile.name} accepted your Spark!` : `Sparking ${profile.name}…`}</h2>}
      <p style={{ fontSize: 14.5, color: C.muted, fontFamily: LT, lineHeight: 1.7, marginBottom: 26 }}>{accepted || roundNo > 1 ? `Round ${roundNo}: 3 quick games, about 5 minutes. Play at your own pace. Answers stay hidden until you've both finished.` : "In the real app they get a push and can accept whenever they like."}</p>
      {(accepted || roundNo > 1) && <div className="fade-rise">
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {GAME_LABELS.map(g => <span key={g.label} style={pill("rgba(255,255,255,0.85)", C.text, C.border)}><g.Icon size={12} color={C.rose} weight="fill" />{g.label}</span>)}
        </div>
        <Note on={notes}>Both players play on their own time. The server only reveals answers once both are in, so nobody can peek at the other person's answers.</Note>
        <Btn onClick={onStart} style={{ background: SPARK }}>Start round {roundNo} →</Btn>
      </div>}
    </div>
  );
}

function RoundPlayer({ profile, round, roundNo, notes, onDone }) {
  const steps = [
    ...round.wyr.map((_, i) => ({ type: "wyr", i, game: 0 })),
    ...round.gm.flatMap((_, i) => [{ type: "gmSelf", i, game: 1 }, { type: "gmGuess", i, game: 1 }]),
    ...round.compat.map((_, i) => ({ type: "compat", i, game: 2 })),
  ];
  const [step, setStep] = useState(0);
  const [mine, setMine] = useState({ wyr: [], gmAnswer: [], gmGuess: [], compat: [] });
  const cur = steps[step];
  const answer = (field, v) => {
    const next = { ...mine, [field]: Object.assign([...mine[field]], { [cur.i]: v }) };
    setMine(next);
    if (step + 1 >= steps.length) onDone(next);
    else setStep(step + 1);
  };
  const theirsDone = Math.min(3, Math.floor((step / steps.length) * 3 + (profile.affinity > 0.6 ? 1 : 0)));
  const G = GAME_LABELS[cur.game];
  const optBtn = (key, text, on, color, onClick, i) => (
    <button key={key} onClick={onClick} className={`card-hover s${Math.min(i + 1, 6)}`} style={{ display: "block", width: "100%", textAlign: "left", background: on ? "rgba(212,82,106,0.08)" : "rgba(255,255,255,0.94)", border: `2px solid ${on ? color : "rgba(255,255,255,0.92)"}`, borderRadius: 20, padding: "17px 18px", marginBottom: 11, cursor: "pointer", boxShadow: SHADOWS.md, fontFamily: PF, fontStyle: "italic", fontSize: 17.5, lineHeight: 1.45, color: C.text }}>{text}</button>
  );
  return (
    <div style={{ padding: "18px 18px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Photo src={profile.photos[0]} name={profile.name} size={38} style={{ border: "2px solid #fff", boxShadow: SHADOWS.sm }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, fontFamily: LT }}>You & {profile.name} · Round {roundNo}</div>
          <div style={{ fontSize: 11.5, color: C.muted, fontFamily: LT }}>{profile.name}: {theirsDone}/3 games done</div>
        </div>
        <span style={pill(C.roseSoft, C.rose, C.roseBd)}><G.Icon size={12} weight="fill" />{cur.game + 1} of 3</span>
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 26 }}>
        {steps.map((_, j) => <div key={j} style={{ flex: 1, height: 4, borderRadius: 2, background: j < step ? C.rose : j === step ? "rgba(212,82,106,0.45)" : "rgba(212,82,106,0.12)" }} />)}
      </div>

      <div key={step} className="fade-rise">
        {cur.type === "wyr" && <>
          <div style={label}>{G.label}</div>
          <h3 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 24, marginBottom: 20 }}>Would you rather…</h3>
          {optBtn("a", round.wyr[cur.i].a, false, C.rose, () => answer("wyr", "a"), 0)}
          {optBtn("b", round.wyr[cur.i].b, false, C.gold, () => answer("wyr", "b"), 1)}
        </>}
        {cur.type === "gmSelf" && <>
          <div style={label}>Guess Me · about you</div>
          <h3 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 24, marginBottom: 20 }}>{round.gm[cur.i].q}</h3>
          {round.gm[cur.i].options.map((o, j) => optBtn(o, o, false, C.rose, () => answer("gmAnswer", j), j))}
        </>}
        {cur.type === "gmGuess" && <>
          <div style={label}>Guess Me · now guess {profile.name}'s</div>
          <h3 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 24, marginBottom: 8 }}>{round.gm[cur.i].q}</h3>
          <p style={{ fontSize: 13, color: C.muted, fontFamily: LT, marginBottom: 18 }}>Use their prompts and photos as clues.</p>
          {round.gm[cur.i].options.map((o, j) => optBtn(o, o, false, C.gold, () => answer("gmGuess", j), j))}
        </>}
        {cur.type === "compat" && <>
          <div style={label}>Compatibility · {cur.i + 1} of {round.compat.length}</div>
          <h3 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 23, marginBottom: 22, lineHeight: 1.35 }}>{round.compat[cur.i].q}</h3>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, fontFamily: LT, marginBottom: 10 }}><span>{round.compat[cur.i].low}</span><span style={{ textAlign: "right" }}>{round.compat[cur.i].high}</span></div>
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 2, 3, 4, 5].map(v => <button key={v} onClick={() => answer("compat", v)} className="card-hover" style={{ flex: 1, padding: "16px 0", borderRadius: 16, border: "none", background: "rgba(255,255,255,0.92)", cursor: "pointer", fontFamily: LT, fontSize: 17, fontWeight: 700, color: C.text, boxShadow: SHADOWS.md }}>{v}</button>)}
          </div>
        </>}
      </div>
      {step === 0 && <div style={{ marginTop: 18 }}><Note on={notes}>The games are the existing Heartbeat couples games, adapted for strangers. All content is hand-written and ships with the app, so there are no AI costs.</Note></div>}
    </div>
  );
}

function Waiting({ profile, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 1700); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fade-rise" style={{ textAlign: "center", padding: "90px 24px" }}>
      <div className="hb-spin" style={{ display: "inline-block", marginBottom: 18 }}><Sparkle size={40} color={C.rose} /></div>
      <h3 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 24, marginBottom: 8 }}>You're done!</h3>
      <p style={{ fontSize: 14, color: C.muted, fontFamily: LT }}>Waiting for {profile.name} to finish…</p>
    </div>
  );
}

function Reveal({ profile, round, mine, theirs, score, roundNo, notes, onDecide }) {
  const tone = score.sync >= 75 ? "Beautifully aligned" : score.sync >= 55 ? "A lovely mix" : "Opposites attract?";
  const metric = (l, v) => <div style={{ flex: 1, background: "rgba(255,255,255,0.8)", borderRadius: 14, padding: "10px 6px", textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: LT }}>{v}%</div><div style={{ fontSize: 10.5, color: C.muted, fontFamily: LT }}>{l}</div></div>;
  return (<>
    <div className="fade-rise" style={{ padding: "18px 18px 120px" }}>
      <Card elevated layer gradient="linear-gradient(135deg,rgba(255,228,220,0.99),rgba(255,248,244,0.96))" style={{ textAlign: "center", padding: "26px 20px 18px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ width: 62, height: 62, borderRadius: "50%", background: C.gradRose, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: LT, fontWeight: 700, border: "3px solid #fff", boxShadow: SHADOWS.md, zIndex: 1 }}>You</div>
          <Photo src={profile.photos[0]} name={profile.name} size={62} style={{ marginLeft: -14, border: "3px solid #fff", boxShadow: SHADOWS.md }} />
        </div>
        <div style={label}>Round {roundNo} · you and {profile.name} are</div>
        <div style={{ fontFamily: PF, fontSize: 60, color: C.rose, lineHeight: 1 }}>{score.sync}%</div>
        <div style={{ fontSize: 14, color: C.muted, fontFamily: LT, margin: "6px 0 16px" }}>in sync · {tone}</div>
        <div style={{ display: "flex", gap: 8 }}>{metric("Compatibility", score.compatScore)}{metric("Same choices", score.wyrPct)}{metric("Good guesses", score.guessPct)}</div>
      </Card>
      <Note on={notes}>The Sync score is simple arithmetic: 50% compatibility, 30% matching choices, 20% correct guesses. It's a conversation starter, not a verdict. Nobody gets auto-matched or auto-rejected.</Note>

      <div style={{ ...label, marginTop: 8 }}>Would you rather</div>
      {round.wyr.map((w, i) => {
        const same = mine.wyr[i] === theirs.wyr[i];
        return (
          <Card key={i} style={{ padding: "14px 16px", marginBottom: 9 }}>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: LT, marginBottom: 6 }}>{w.a} <i>or</i> {w.b}</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <span style={pill(C.roseSoft, C.rose, C.roseBd)}>You: {w[mine.wyr[i]]}</span>
              <span style={pill(C.goldSoft, C.gold, C.goldBd)}>{profile.name}: {w[theirs.wyr[i]]}</span>
              {same && <span style={pill(C.sageSoft, C.sage, C.sageBd)}>Same ✓</span>}
            </div>
          </Card>
        );
      })}

      <div style={{ ...label, marginTop: 16 }}>Guess me</div>
      {round.gm.map((g, i) => {
        const iGotIt = mine.gmGuess[i] === theirs.gm[i].answer, theyGotIt = theirs.gm[i].guess === mine.gmAnswer[i];
        return (
          <Card key={i} style={{ padding: "14px 16px", marginBottom: 9 }}>
            <div style={{ fontFamily: PF, fontStyle: "italic", fontSize: 16, marginBottom: 8 }}>{g.q}</div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: LT, lineHeight: 1.75 }}>
              <div>{profile.name} said <b>{g.options[theirs.gm[i].answer]}</b>. You guessed {g.options[mine.gmGuess[i]]} {iGotIt ? "✅" : "❌"}</div>
              <div>You said <b>{g.options[mine.gmAnswer[i]]}</b>. {profile.name} guessed {g.options[theirs.gm[i].guess]} {theyGotIt ? "✅" : "❌"}</div>
            </div>
          </Card>
        );
      })}

      <div style={{ ...label, marginTop: 16 }}>Compatibility</div>
      <Card style={{ padding: "8px 16px" }}>
        {round.compat.map((q, i) => (
          <div key={i} style={{ padding: "10px 0", borderBottom: i < round.compat.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 12.5, color: C.text, fontFamily: LT, marginBottom: 8 }}>{q.q}</div>
            <div style={{ position: "relative", height: 18 }}>
              <div style={{ position: "absolute", top: 8, left: 0, right: 0, height: 3, borderRadius: 2, background: "rgba(212,82,106,0.12)" }} />
              {[[mine.compat[i], C.rose, "You"], [theirs.compat[i], C.gold, profile.name[0]]].map(([v, col, t], k) => (
                <div key={k} style={{ position: "absolute", top: 0, left: `calc(${(v - 1) * 25}% - 9px)`, width: 18, height: 18, borderRadius: "50%", background: col, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: LT, border: "2px solid #fff", marginLeft: k && v === mine.compat[i] ? 10 : 0 }}>{t[0]}</div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.muted, fontFamily: LT, marginTop: 4 }}><span>{q.low}</span><span>{q.high}</span></div>
          </div>
        ))}
      </Card>
    </div>
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "14px 18px 22px", display: "flex", justifyContent: "center", background: "linear-gradient(180deg,rgba(255,246,243,0),rgba(255,246,243,0.96) 35%)", zIndex: 15 }}>
        <div style={{ width: "100%", maxWidth: 444 }}><Btn onClick={onDecide} style={{ background: SPARK }}>Decide privately →</Btn></div>
    </div>
  </>);
}

function DecideSheet({ profile, roundNo, onChoose, onClose }) {
  const opts = [
    { k: "match", Icon: Heart, t: "Match", d: "Open a chat if they feel the same", bg: SPARK, color: "#fff" },
    ...(roundNo < 3 ? [{ k: "more", Icon: GameController, t: "One more round", d: "Not sure yet? Play another set", bg: "rgba(255,255,255,0.95)", color: C.text }] : []),
    { k: "pass", Icon: X, t: "Pass", d: "Close it quietly. They're never told", bg: "transparent", color: C.muted },
  ];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(26,10,5,0.5)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
      <div onClick={e => e.stopPropagation()} className="slide-in" style={{ width: "100%", maxWidth: 480, background: C.bg, borderRadius: "28px 28px 0 0", padding: "26px 20px 30px", boxShadow: SHADOWS.xl }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <Photo src={profile.photos[0]} name={profile.name} size={64} style={{ margin: "0 auto 12px", border: "3px solid #fff", boxShadow: SHADOWS.md }} />
          <h3 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 23 }}>How do you feel about {profile.name}?</h3>
          <div style={{ fontSize: 12.5, color: C.muted, fontFamily: LT, marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}><Lock size={12} weight="fill" />{profile.name} only finds out if it's mutual</div>
        </div>
        {opts.map(o => (
          <button key={o.k} onClick={() => onChoose(o.k)} className="card-hover" style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", background: o.bg, border: o.k === "more" ? `1px solid ${C.border}` : "none", borderRadius: 20, padding: "15px 18px", marginBottom: 10, cursor: "pointer", boxShadow: o.k === "pass" ? "none" : SHADOWS.md, textAlign: "left" }}>
            <o.Icon size={24} color={o.color} weight={o.k === "pass" ? "bold" : "fill"} />
            <div><div style={{ fontSize: 15.5, fontWeight: 700, color: o.color, fontFamily: LT }}>{o.t}</div><div style={{ fontSize: 12, color: o.k === "match" ? "rgba(255,255,255,0.82)" : C.muted, fontFamily: LT }}>{o.d}</div></div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Outcome({ kind, profile, mineChoice, notes, onChat, onBack }) {
  if (kind === "matched") return (
    <ScreenWrap gradient={C.gradHero} pb={40}>
      <div className="fade-rise" style={{ textAlign: "center", padding: "70px 24px", position: "relative", overflow: "hidden" }}>
        <GradOrb size={360} top={-40} />
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 40, position: "relative" }}>
          <div style={{ width: 104, height: 104, borderRadius: "50%", background: C.gradRose, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: PF, fontStyle: "italic", fontSize: 26, border: "4px solid #fff", boxShadow: SHADOWS.xl, zIndex: 1 }}>You</div>
          <Photo src={profile.photos[0]} name={profile.name} size={104} style={{ marginLeft: -22, border: "4px solid #fff", boxShadow: SHADOWS.xl }} />
          <div className="hb-heart-pop" style={{ position: "absolute", top: 76, left: "50%", transform: "translateX(-50%)", width: 46, height: 46, borderRadius: "50%", background: SPARK, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: SHADOWS.lg, zIndex: 2 }}><Heart size={24} color="#fff" weight="fill" /></div>
        </div>
        <h1 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 38, marginBottom: 10, position: "relative" }}>It's a match!</h1>
        <p style={{ fontSize: 15, color: "rgba(26,10,5,0.6)", fontFamily: LT, lineHeight: 1.7, marginBottom: 28, position: "relative" }}>You and {profile.name} both chose to match. Your round results are pinned at the top of the chat, so you already have something to talk about.</p>
        <div style={{ position: "relative" }}><Btn onClick={onChat} style={{ background: SPARK }}>Start chatting →</Btn></div>
      </div>
    </ScreenWrap>
  );
  return (
    <div className="fade-rise" style={{ textAlign: "center", padding: "80px 26px" }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>🌙</div>
      <h2 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 26, marginBottom: 10 }}>{mineChoice === "pass" ? "Passed quietly" : "This one wasn't meant to be"}</h2>
      <p style={{ fontSize: 14.5, color: C.muted, fontFamily: LT, lineHeight: 1.7, marginBottom: 24 }}>{mineChoice === "pass" ? `${profile.name} will never know.` : `It wasn't mutual this time. On to the next one.`}</p>
      <Note on={notes}>In the real app a Pass is completely silent. Neither side sees who passed, which takes the sting out of rejection. The demo spells it out so you can see what happened.</Note>
      <Btn variant="outline" onClick={onBack}>Back to Discover</Btn>
    </div>
  );
}

// ── MATCHED: CHAT, FIRST DATE, OFFICIAL ────────────────────────────
function Chat({ match, notes, onBack, onSend, onDate, onOfficial }) {
  const [text, setText] = useState("");
  const endRef = useRef(null);
  const p = match.profile;
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [match.messages.length]);
  const send = () => { if (!text.trim()) return; onSend(text.trim()); setText(""); };
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 56px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.6)" }}>
        <BackBtn onClick={onBack} />
        <Photo src={p.photos[0]} name={p.name} size={40} style={{ border: "2px solid #fff" }} />
        <div style={{ flex: 1, fontSize: 15, fontWeight: 700, fontFamily: LT }}>{p.name}</div>
        <button onClick={onDate} aria-label="Plan a first date" style={{ border: "none", background: C.roseSoft, borderRadius: 12, padding: 8, cursor: "pointer" }}><CalendarHeart size={20} color={C.rose} weight="fill" /></button>
        <button onClick={onOfficial} style={{ ...pill(C.gradRose, "#fff", "transparent"), background: C.gradRose, cursor: "pointer", border: "none" }}><Heart size={12} weight="fill" />Official?</button>
      </div>
      <div style={{ flex: 1, padding: "16px 16px 8px" }}>
        <Card elevated gradient="linear-gradient(135deg,rgba(255,228,220,0.99),rgba(255,248,244,0.96))" style={{ padding: "14px 16px" }}>
          <div style={{ ...label, marginBottom: 6, color: C.rose }}>📌 From your Spark Round · {match.score.sync}% in sync</div>
          {match.highlights.map((h, i) => <div key={i} style={{ fontSize: 13, color: C.text, fontFamily: LT, lineHeight: 1.6 }}>• {h}</div>)}
        </Card>
        <Note on={notes}>The game results become the icebreaker, which fixes the "hey, how are you" dead-end of most dating chats. The calendar opens the first-date planner, and "Official?" moves the pair into the couples app.</Note>
        {match.messages.map((m, i) => (
          <div key={i} className="fade-in" style={{ display: "flex", justifyContent: m.from === "me" ? "flex-end" : "flex-start", marginBottom: 8 }}>
            <div style={{ maxWidth: "78%", padding: "10px 14px", borderRadius: 18, borderBottomRightRadius: m.from === "me" ? 6 : 18, borderBottomLeftRadius: m.from === "me" ? 18 : 6, background: m.from === "me" ? C.gradRose : "rgba(255,255,255,0.95)", color: m.from === "me" ? "#fff" : C.text, fontSize: 14, fontFamily: LT, lineHeight: 1.5, boxShadow: SHADOWS.sm }}>{m.text}</div>
          </div>
        ))}
        {match.typing && <div style={{ fontSize: 12, color: C.muted, fontFamily: LT, fontStyle: "italic", padding: "2px 6px" }}>{p.name} is typing…</div>}
        <div ref={endRef} />
      </div>
      <div style={{ position: "sticky", bottom: 0, padding: "10px 14px 16px", background: "rgba(255,246,243,0.95)", backdropFilter: "blur(12px)", display: "flex", gap: 8 }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={`Message ${p.name}`} style={{ flex: 1, border: `1.5px solid ${C.border}`, borderRadius: 22, padding: "12px 16px", fontSize: 14.5, outline: "none", background: "#fff" }} />
        <button onClick={send} aria-label="Send" style={{ width: 46, height: 46, borderRadius: "50%", border: "none", background: SPARK, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: SHADOWS.md }}><PaperPlaneRight size={20} color="#fff" weight="fill" /></button>
      </div>
    </div>
  );
}

function FirstDate({ profile, notes, onBack, onSend }) {
  const plan = getDateTemplate("inperson", profile.dateVibe);
  return (
    <div className="fade-rise" style={{ padding: "18px 18px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <BackBtn onClick={onBack} />
        <div><h2 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 22 }}>Plan a first date</h2><div style={{ fontSize: 12, color: C.muted, fontFamily: LT }}>Based on {profile.name}'s vibe · Bengaluru</div></div>
      </div>
      <Note on={notes}>This reuses the existing Date Planner, which now runs on hand-written templates. First-date suggestions stick to public places for safety.</Note>
      <Card elevated layer gradient="linear-gradient(135deg,#FF9A7A,#E85D26)" style={{ color: "#fff" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.8, fontFamily: LT, marginBottom: 6 }}>{profile.dateVibe} · in person</div>
        <div style={{ fontFamily: PF, fontStyle: "italic", fontSize: 25, marginBottom: 6 }}>{plan.title}</div>
        <div style={{ fontSize: 13.5, opacity: 0.9, fontFamily: LT, lineHeight: 1.6 }}>{plan.description}</div>
      </Card>
      {plan.stops.map((s, i) => (
        <Card key={i} style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, fontFamily: LT, marginBottom: 4 }}>{s.time}</div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: LT, marginBottom: 3 }}>{s.place}</div>
          <div style={{ fontSize: 12.5, color: C.muted, fontFamily: LT, marginBottom: 8 }}>{s.description}</div>
          <a href={`https://www.google.com/maps/search/${encodeURIComponent(`${s.mapsQuery} Bengaluru`)}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: C.rose, fontFamily: LT, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={13} weight="fill" />Find places nearby</a>
        </Card>
      ))}
      <Btn onClick={() => onSend(plan.title)} style={{ background: SPARK, marginTop: 8 }}>Send to {profile.name} →</Btn>
    </div>
  );
}

function Official({ profile, onRestart, onBack }) {
  const feats = [["💬", "Daily Q&A", "A question a day, then guess each other's answer"], ["💌", "Love notes", "A private feed just for the two of you"], ["🫙", "Memory jar", "Your Spark Round becomes memory #1"], ["🔥", "Streaks and heartbeats", "Send a heartbeat, keep the streak alive"], ["📅", "Date planner", "Ideas for every vibe, in person or virtual"], ["🎮", "Couple games", "Wordle Duel, Pictionary, Tic Tac Toe and more"]];
  return (
    <ScreenWrap gradient={C.gradUs} pb={40}>
      <div className="fade-rise" style={{ padding: "22px 18px 40px", position: "relative", overflow: "hidden" }}>
        <GradOrb size={300} top={-50} color1="rgba(212,146,42,0.22)" color2="rgba(240,200,120,0.08)" />
        <div style={{ position: "relative" }}>
          <BackBtn onClick={onBack} />
          <div style={{ textAlign: "center", margin: "18px 0 24px" }}>
            <div style={{ fontSize: 46, lineHeight: 1, marginBottom: 16 }}>💞</div>
            <h1 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 32, lineHeight: 1.2, marginBottom: 10 }}>You & {profile.name} are official</h1>
            <p style={{ fontSize: 14.5, color: C.muted, fontFamily: LT, lineHeight: 1.7 }}>When you both tap "We're official", Heartbeat turns into a couples app for the two of you. Most dating apps lose people once they find someone. Heartbeat keeps them.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
            {feats.map(([e, t, d]) => (
              <div key={t} style={{ background: "rgba(255,255,255,0.88)", border: "1px solid rgba(255,255,255,0.95)", borderRadius: 18, padding: "14px 13px", boxShadow: SHADOWS.sm }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{e}</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: LT, marginBottom: 3 }}>{t}</div>
                <div style={{ fontSize: 11.5, color: C.muted, fontFamily: LT, lineHeight: 1.45 }}>{d}</div>
              </div>
            ))}
          </div>
          <Card style={{ textAlign: "center", padding: "16px 18px" }}>
            <div style={{ fontSize: 13, color: C.text, fontFamily: LT, lineHeight: 1.6 }}>The couples app is already built and working. It's the existing Heartbeat product.</div>
          </Card>
          <Btn variant="outline" onClick={onRestart} style={{ marginTop: 6 }}>Restart the demo <ArrowRight size={14} style={{ verticalAlign: "-2px" }} /></Btn>
        </div>
      </div>
    </ScreenWrap>
  );
}

function ListScreen({ title, sub, empty, items, notes, note }) {
  return (
    <div className="fade-rise" style={{ padding: "22px 18px 120px" }}>
      <h2 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 400, fontSize: 26, marginBottom: 4 }}>{title}</h2>
      <div style={{ fontSize: 13, color: C.muted, fontFamily: LT, marginBottom: 18 }}>{sub}</div>
      <Note on={notes}>{note}</Note>
      {items.length === 0 && <Card style={{ textAlign: "center", color: C.muted, fontSize: 14, fontFamily: LT }}>{empty}</Card>}
      {items.map(it => (
        <Card key={it.key} onClick={it.onClick} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Photo src={it.photo} name={it.name} size={52} style={{ border: "2px solid #fff", boxShadow: SHADOWS.sm }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: LT }}>{it.name}</div>
              <div style={{ fontSize: 12.5, color: C.muted, fontFamily: LT, marginTop: 2 }}>{it.detail}</div>
            </div>
            {it.badge && <span style={pill(it.badge.bg, it.badge.color, it.badge.bd)}>{it.badge.text}</span>}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── ROOT ───────────────────────────────────────────────────────────
export default function DemoApp() {
  const [started, setStarted] = useState(false);
  const [showMe, setShowMe] = useState("everyone");
  const [notes, setNotes] = useState(true);
  const [tab, setTab] = useState("discover");
  const [queue, setQueue] = useState([]);
  const [spark, setSpark] = useState(null);   // the active Spark Round, if any
  const [history, setHistory] = useState([]); // closed sparks: {profile, status, sync}
  const [matches, setMatches] = useState([]);
  const [view, setView] = useState(null);     // {kind:"chat"|"date"|"official", id}
  const used = useRef({ wyr: new Set(), gm: new Set(), compat: new Set() });
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const restart = () => { setStarted(false); setTab("discover"); setSpark(null); setHistory([]); setMatches([]); setView(null); used.current = { wyr: new Set(), gm: new Set(), compat: new Set() }; window.scrollTo(0, 0); };
  const start = () => { setQueue(profilesFor(showMe)); setStarted(true); window.scrollTo(0, 0); };
  const top = () => window.scrollTo(0, 0);

  const sendSpark = () => {
    const profile = queue[0];
    setQueue(queue.slice(1));
    setSpark({ profile, roundNo: 1, round: buildRound(used.current), phase: "accepting" });
    top();
  };
  const patch = p => setSpark(s => ({ ...s, ...p }));
  const finishRound = mine => { patch({ phase: "waiting", mine }); top(); };
  const afterWaiting = () => setSpark(s => {
    const theirs = simulateOpponent(s.profile, s.round, s.mine);
    return { ...s, phase: "reveal", theirs, score: syncScore(s.round, s.mine, theirs) };
  });
  const choose = mineChoice => {
    const s = spark;
    const theirChoice = opponentDecision(s.profile, s.score.sync, s.roundNo);
    const outcome = resolve(mineChoice, theirChoice, s.roundNo);
    if (outcome === "next") { setSpark({ ...s, roundNo: s.roundNo + 1, round: buildRound(used.current), phase: "accepting", deciding: false }); top(); return; }
    setHistory(h => [{ profile: s.profile, status: outcome, sync: s.score.sync }, ...h]);
    if (outcome === "matched") {
      const highlights = s.round.wyr.filter((_, i) => s.mine.wyr[i] === s.theirs.wyr[i]).slice(0, 2).map(w => `You both picked: ${w[s.mine.wyr[s.round.wyr.indexOf(w)]]}`);
      if (highlights.length === 0) highlights.push("You chose differently on every dilemma. Plenty to debate!");
      // Their first message comes from what actually happened in the round
      const agreed = s.round.wyr.findIndex((_, i) => s.mine.wyr[i] === s.theirs.wyr[i]);
      const guessed = s.round.gm.findIndex((_, i) => s.theirs.gm[i].guess === s.mine.gmAnswer[i]);
      const opener = agreed >= 0 ? `Okay but you also picked "${s.round.wyr[agreed][s.mine.wyr[agreed]]}"?? 😄`
        : guessed >= 0 ? `I guessed your answer to "${s.round.gm[guessed].q}" right, admit it 👀`
        : `${s.score.sync}% in sync and we still disagreed on everything. I'm intrigued 😄`;
      setMatches(m => [{ profile: s.profile, score: s.score, highlights, messages: [{ from: "them", text: opener }], replyIdx: 0, typing: false }, ...m]);
    }
    setSpark({ ...s, phase: outcome, mineChoice, deciding: false });
    top();
  };
  const closeSpark = () => { setSpark(null); setTab("discover"); top(); };

  const updateMatch = (id, fn) => setMatches(ms => ms.map(m => m.profile.id === id ? fn(m) : m));
  const sendMessage = (id, text) => {
    updateMatch(id, m => ({ ...m, messages: [...m.messages, { from: "me", text }], typing: true }));
    timers.current.push(setTimeout(() => updateMatch(id, m => {
      const pool = [...m.profile.replies, "Haha okay you're fun 😄", "Tell me more!", "Same honestly", "Okay this is going well 😌"];
      return { ...m, typing: false, replyIdx: m.replyIdx + 1, messages: [...m.messages, { from: "them", text: pool[m.replyIdx % pool.length] }] };
    }), 1300));
  };

  if (!started) return <div className="hb-demo" style={{ background: C.bg, maxWidth: 480, margin: "0 auto" }}><style>{STYLES + DEMO_CSS}</style><Intro showMe={showMe} setShowMe={setShowMe} onStart={start} /></div>;

  const activeMatch = view && matches.find(m => m.profile.id === view.id);
  const inSpark = spark && spark.phase !== "matched_seen";
  let body;
  if (view?.kind === "chat" && activeMatch) body = <Chat match={activeMatch} notes={notes} onBack={() => { setView(null); setTab("matches"); }} onSend={t => sendMessage(activeMatch.profile.id, t)} onDate={() => setView({ kind: "date", id: view.id })} onOfficial={() => setView({ kind: "official", id: view.id })} />;
  else if (view?.kind === "date" && activeMatch) body = <FirstDate profile={activeMatch.profile} notes={notes} onBack={() => setView({ kind: "chat", id: view.id })} onSend={title => { updateMatch(view.id, m => ({ ...m, messages: [...m.messages, { from: "me", text: `📅 How about this: "${title}"?` }, { from: "them", text: "Yes!! Saturday works 🥰" }] })); setView({ kind: "chat", id: view.id }); }} />;
  else if (view?.kind === "official" && activeMatch) body = <Official profile={activeMatch.profile} onRestart={restart} onBack={() => setView({ kind: "chat", id: view.id })} />;
  else if (inSpark) {
    const s = spark;
    if (s.phase === "accepting") body = <Accepting key={`${s.profile.id}-${s.roundNo}`} profile={s.profile} roundNo={s.roundNo} notes={notes} onStart={() => { patch({ phase: "play" }); top(); }} />;
    else if (s.phase === "play") body = <RoundPlayer key={`${s.profile.id}-${s.roundNo}`} profile={s.profile} round={s.round} roundNo={s.roundNo} notes={notes} onDone={finishRound} />;
    else if (s.phase === "waiting") body = <Waiting profile={s.profile} onDone={afterWaiting} />;
    else if (s.phase === "reveal") body = <>
      <Reveal profile={s.profile} round={s.round} mine={s.mine} theirs={s.theirs} score={s.score} roundNo={s.roundNo} notes={notes} onDecide={() => patch({ deciding: true })} />
      {s.deciding && <DecideSheet profile={s.profile} roundNo={s.roundNo} onChoose={choose} onClose={() => patch({ deciding: false })} />}
    </>;
    else body = <Outcome kind={s.phase} profile={s.profile} mineChoice={s.mineChoice} notes={notes} onBack={closeSpark} onChat={() => { setSpark(null); setView({ kind: "chat", id: s.profile.id }); top(); }} />;
  }
  else if (tab === "sparks") body = <ListScreen title="Sparks" sub="Rounds you've played" empty="No Sparks yet. Send one from Discover." notes={notes}
    note="In the full app this inbox also holds incoming invites, rounds where it's your turn, and rounds waiting on the other person. Caps on Sparks sent and received stop anyone's inbox from flooding."
    items={history.map((h, i) => ({ key: `${h.profile.id}${i}`, name: h.profile.name, photo: h.profile.photos[0], detail: `${h.sync}% in sync`, badge: h.status === "matched" ? { text: "Matched", bg: C.sageSoft, color: C.sage, bd: C.sageBd } : { text: "Closed", bg: "rgba(255,255,255,0.8)", color: C.muted, bd: C.border } }))} />;
  else if (tab === "matches") body = <ListScreen title="Matches" sub="People who chose you back" empty="No matches yet. Play a round from Discover." notes={notes}
    note="Every match here played a round with you first. Chat opens with the game results pinned at the top."
    items={matches.map(m => ({ key: m.profile.id, name: m.profile.name, photo: m.profile.photos[0], detail: m.messages[m.messages.length - 1].text, onClick: () => { setView({ kind: "chat", id: m.profile.id }); top(); }, badge: { text: `${m.score.sync}%`, bg: C.roseSoft, color: C.rose, bd: C.roseBd } }))} />;
  else body = <Discover profile={queue[0]} remaining={Math.max(0, queue.length - 1)} notes={notes} onSkip={() => { setQueue(queue.slice(1)); top(); }} onSpark={sendSpark} onRestart={restart} />;

  const showTabs = !view && !inSpark;
  return (
    <div className="hb-demo" style={{ background: C.bg, minHeight: "100vh", fontFamily: LT, color: C.text }}>
      <style>{STYLES + DEMO_CSS}</style>
      <TopBar notes={notes} setNotes={setNotes} onRestart={restart} />
      <div style={{ maxWidth: 480, margin: "0 auto", position: "relative" }}>
        {inSpark && ["accepting", "play", "reveal"].includes(spark.phase) && (
          <div style={{ padding: "10px 18px 0" }}><button onClick={() => { setSpark(null); setTab("sparks"); }} style={{ border: "none", background: "transparent", color: C.muted, fontSize: 12.5, fontFamily: LT, cursor: "pointer" }}>← Leave round</button></div>
        )}
        {body}
      </div>
      {showTabs && <TabBar tab={tab} setTab={t => { setTab(t); top(); }} badges={{ matches: matches.length }} />}
    </div>
  );
}
