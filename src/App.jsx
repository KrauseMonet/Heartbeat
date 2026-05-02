import { useState, useEffect, useCallback } from "react";

// ── STORAGE (localStorage — works in any browser) ─────────────────────────
function load(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error(e); }
}

// ── CLAUDE API ────────────────────────────────────────────────────────────
// In your .env file add:  VITE_ANTHROPIC_KEY=sk-ant-...
const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

async function callClaude(system, msg) {
  if (!API_KEY) {
    alert("Add VITE_ANTHROPIC_KEY=sk-ant-... to your .env file and restart the dev server.");
    throw new Error("No API key");
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: msg }],
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${r.status}`);
  }
  const d = await r.json();
  return d.content[0].text.trim();
}

// ── UTILS ─────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split("T")[0];
const daysUntil = (s) => {
  if (!s) return null;
  const d = Math.ceil((new Date(s) - Date.now()) / 86400000);
  return d >= 0 ? d : null;
};
const initials = (n = "?") => n.trim().split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

const MOODS = [
  { e: "🥰", l: "Missing you" }, { e: "😊", l: "Happy" }, { e: "😌", l: "Calm" }, { e: "🤩", l: "Excited" },
  { e: "😴", l: "Tired" }, { e: "😔", l: "Low" }, { e: "🤭", l: "Playful" }, { e: "😤", l: "Stressed" },
];

const C = {
  bg: "#F9F3EB", surface: "#FFFFFF", text: "#1E140D", muted: "#8A7A70", border: "#EDE6DC",
  accent: "#B84C65", accentSoft: "#FDF0F3", accentBd: "#F0C8D4",
  amber: "#C97A2F", amberSoft: "#FEF4E8", amberBd: "#F0D4A8",
  sage: "#5A8A6A", sageSoft: "#EEF6F1", sageBd: "#C5DFD0",
  purple: "#7A6AA8", purpleSoft: "#F2F0F9", purpleBd: "#CFC9E8",
};

// ── PRIMITIVES ────────────────────────────────────────────────────────────
function Field({ label, textarea, style: es, ...p }) {
  const [f, setF] = useState(false);
  const base = { width: "100%", background: C.bg, border: `1.5px solid ${f ? C.accent : C.border}`, borderRadius: 12, padding: "13px 16px", fontFamily: "inherit", fontSize: 15, color: C.text, outline: "none", transition: "border-color 0.2s", display: "block", ...(textarea ? { resize: "none" } : {}), ...es };
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>}
      {textarea ? <textarea {...p} rows={3} onFocus={() => setF(true)} onBlur={() => setF(false)} style={base} /> : <input {...p} onFocus={() => setF(true)} onBlur={() => setF(false)} style={base} />}
    </div>
  );
}

function Btn({ children, variant = "fill", style: s, disabled, onClick }) {
  const v = { fill: { background: C.accent, color: "#fff", border: "none" }, outline: { background: "transparent", color: C.accent, border: `1.5px solid ${C.accent}` }, ghost: { background: C.bg, color: C.text, border: `1.5px solid ${C.border}` }, amber: { background: C.amber, color: "#fff", border: "none" }, sage: { background: C.sage, color: "#fff", border: "none" }, purple: { background: C.purple, color: "#fff", border: "none" } };
  return (
    <button disabled={disabled} onClick={onClick} style={{ display: "block", width: "100%", borderRadius: 14, padding: "13px 20px", fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", transition: "opacity 0.15s, transform 0.1s", opacity: disabled ? 0.4 : 1, ...v[variant], ...s }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.opacity = "0.85")}
      onMouseLeave={e => (e.currentTarget.style.opacity = disabled ? "0.4" : "1")}
      onMouseDown={e => !disabled && (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={e => (e.currentTarget.style.transform = "none")}
    >{children}</button>
  );
}

function Avatar({ name, size = 48, color = C.accent }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{initials(name)}</div>;
}
function BackBtn({ onClick }) { return <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: C.muted, padding: "4px 8px 4px 0", lineHeight: 1 }}>←</button>; }
function Spinner({ text = "One moment..." }) { return <div style={{ textAlign: "center", padding: "36px 0", color: C.muted }}><div style={{ fontSize: 32, marginBottom: 12, display: "inline-block", animation: "hbSpin 1s linear infinite" }}>✦</div><div style={{ fontSize: 14 }}>{text}</div></div>; }
function Card({ children, style: s, onClick }) { return <div onClick={onClick} style={{ background: C.surface, borderRadius: 20, padding: 20, boxShadow: "0 2px 16px rgba(30,20,13,0.07)", marginBottom: 14, ...s }}>{children}</div>; }
function Hdr({ title, sub, back, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
      <BackBtn onClick={back} />
      <div style={{ flex: 1 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 400, fontStyle: "italic", color: C.text }}>{title}</h2>
        {sub && <div style={{ fontSize: 12, color: C.muted }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ── SETUP ─────────────────────────────────────────────────────────────────
function Setup({ onDone }) {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [date, setDate] = useState("");
  return (
    <div style={{ padding: "48px 24px 40px", minHeight: "100vh" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 60, marginBottom: 14, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>♥</div>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 36, fontWeight: 400, fontStyle: "italic", color: C.text, margin: "0 0 10px" }}>Heartbeat</h1>
        <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.7 }}>Close the distance, one moment at a time.</p>
      </div>
      <Field label="Your name" placeholder="e.g. Koustav" value={a} onChange={e => setA(e.target.value)} />
      <Field label="Partner's name" placeholder="e.g. Priya" value={b} onChange={e => setB(e.target.value)} />
      <Field label="Next time you'll meet (optional)" type="date" value={date} onChange={e => setDate(e.target.value)} />
      <div style={{ height: 8 }} />
      <Btn disabled={!a.trim() || !b.trim()} onClick={() => { if (!a.trim() || !b.trim()) return; onDone({ users: { A: { name: a.trim(), mood: "🥰" }, B: { name: b.trim(), mood: "🥰" } }, nextMeeting: date || null }); }}>
        Start our journey →
      </Btn>
      <p style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 16, lineHeight: 1.8 }}>
        Use <strong>Switch</strong> at the top to simulate both partners while testing.
      </p>
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────
function Home({ me, partner, couple, updateCouple, user, go, notes, streak, bucket }) {
  const pk = user === "A" ? "B" : "A";
  const readKey = user === "A" ? "readA" : "readB";
  const unread = notes.filter(n => n.from === pk && !n[readKey]).length;
  const bucketDone = bucket.filter(i => i.done).length;
  const [beating, setBeating] = useState(false);
  const [beatMsg, setBeatMsg] = useState(false);
  const days = daysUntil(couple?.nextMeeting);

  const sendHeart = () => { setBeating(true); setBeatMsg(true); setTimeout(() => setBeating(false), 600); setTimeout(() => setBeatMsg(false), 2800); };
  const setMood = (emoji) => { const c2 = { ...couple, users: { ...couple.users, [user]: { ...me, mood: emoji } } }; updateCouple(c2); };

  const navCards = [
    { icon: "🎯", title: "Daily Q&A", sub: "Guess each other", key: "qa" },
    { icon: "🤔", title: "Would You Rather", sub: "Pick together", key: "wyr" },
    { icon: "🙋", title: "Never Have I Ever", sub: "Confess together", key: "nhie" },
    { icon: "🎭", title: "Truth or Dare", sub: "Pick your fate", key: "tord" },
    { icon: "💌", title: "Love Notes", sub: "Little letters", key: "notes", badge: unread },
    { icon: "🙏", title: "Gratitude", sub: "Appreciate each other", key: "grat" },
    { icon: "📊", title: "Compatibility", sub: "How alike are you?", key: "compat" },
    { icon: "💝", title: "Love Language", sub: "Know each other better", key: "lovelang" },
    { icon: "🌍", title: "Bucket List", sub: `${bucketDone} done together`, key: "bucket" },
    { icon: "🫙", title: "Memory Jar", sub: "Keep moments", key: "memories" },
    { icon: "📅", title: "Update date", sub: "Refresh countdown", key: "settings" },
  ];

  return (
    <div style={{ padding: "20px 18px 56px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: C.muted }}>{greet()},</div>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 400, fontStyle: "italic", color: C.text, marginTop: 2 }}>{me?.name}</h2>
      </div>

      {streak?.count >= 2 && (
        <div style={{ background: C.amberSoft, border: `1px solid ${C.amberBd}`, borderRadius: 14, padding: "11px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <div><div style={{ fontSize: 15, fontWeight: 700, color: C.amber }}>{streak.count}-day streak</div><div style={{ fontSize: 12, color: C.muted }}>Keep showing up for each other</div></div>
        </div>
      )}

      {unread > 0 && (
        <div onClick={() => go("notes")} style={{ background: C.accentSoft, border: `1px solid ${C.accentBd}`, borderRadius: 14, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <span style={{ fontSize: 20 }}>💌</span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: C.accent }}>{unread} unread note{unread > 1 ? "s" : ""} from {partner?.name}</div><div style={{ fontSize: 11, color: C.muted }}>Tap to read</div></div>
          <span style={{ color: C.accent }}>→</span>
        </div>
      )}

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={partner?.name || "P"} color={C.amber} size={50} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Your person</div><div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginTop: 2 }}>{partner?.name}</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 30 }}>{partner?.mood || "🥰"}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{MOODS.find(m => m.e === partner?.mood)?.l || "—"}</div></div>
        </div>
      </Card>

      {days !== null && (
        <div style={{ background: C.accentSoft, border: `1px solid ${C.accentBd}`, borderRadius: 14, padding: "14px 18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>⏳</span>
          <div><div style={{ fontSize: 20, fontWeight: 700, color: C.accent }}>{days} {days === 1 ? "day" : "days"}</div><div style={{ fontSize: 12, color: C.muted }}>until you're together again</div></div>
        </div>
      )}

      <div style={{ textAlign: "center", padding: "20px 0 16px" }}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Let them know you're thinking of them</div>
        <button onClick={sendHeart} style={{ width: 84, height: 84, borderRadius: "50%", border: "none", background: C.accent, cursor: "pointer", fontSize: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: `0 6px 24px ${C.accent}44`, animation: beating ? "hbBeat 0.5s ease-in-out" : "none" }}>♥</button>
        {beatMsg ? <div style={{ marginTop: 12, fontSize: 14, color: C.accent, fontWeight: 600 }}>♥ Sent to {partner?.name}!</div> : <div style={{ fontSize: 13, color: C.muted, marginTop: 10 }}>Heartbeat</div>}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 9 }}>Your vibe right now</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MOODS.map(m => <button key={m.e} onClick={() => setMood(m.e)} style={{ padding: "6px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${me?.mood === m.e ? C.accent : C.border}`, background: me?.mood === m.e ? C.accentSoft : C.bg, color: C.text, transition: "all 0.15s" }}>{m.e} {m.l}</button>)}
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Activities</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {navCards.map(n => (
          <button key={n.key} onClick={() => go(n.key)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 13px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", transition: "box-shadow 0.2s, transform 0.15s", position: "relative" }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 18px rgba(30,20,13,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
            {n.badge > 0 && <div style={{ position: "absolute", top: 9, right: 9, background: C.accent, color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{n.badge}</div>}
            <div style={{ fontSize: 22, marginBottom: 7 }}>{n.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{n.title}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{n.sub}</div>
          </button>
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 28 }}>
        <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.muted, fontFamily: "inherit" }}>Start fresh ↺</button>
      </div>
    </div>
  );
}

// ── Q&A ───────────────────────────────────────────────────────────────────
function QAScreen({ me, partner, user, qa, updateQa, back }) {
  const pk = user === "A" ? "B" : "A";
  const [ans, setAns] = useState(qa?.answers?.[user] || "");
  const [guess, setGuess] = useState(qa?.guesses?.[user] || "");
  const [loading, setLoading] = useState(false);
  const phase = !qa?.question ? "gen" : !qa?.answers?.[user] ? "answer" : !qa?.guesses?.[user] ? "guess" : "result";
  const generate = async () => { setLoading(true); try { const q = await callClaude("Generate one thoughtful fun daily question for a long-distance couple. Return ONLY the question, no quotes.", "Fresh question."); updateQa({ question: q, answers: {}, guesses: {}, date: todayStr() }); } catch (e) { console.error(e); } setLoading(false); };
  const QCard = () => <Card><div style={{ fontSize: 11, fontWeight: 600, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Today's question</div><p style={{ fontFamily: "Georgia, serif", fontSize: 19, fontStyle: "italic", lineHeight: 1.6, color: C.text, margin: 0 }}>"{qa.question}"</p></Card>;
  return (
    <div style={{ padding: "22px 18px 48px" }}>
      <Hdr title="Daily Question" sub={new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })} back={back} />
      {phase === "gen" && <div style={{ textAlign: "center", paddingTop: 20 }}><div style={{ fontSize: 56, marginBottom: 18, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>🎯</div><h3 style={{ fontFamily: "Georgia, serif", fontSize: 22, fontStyle: "italic", fontWeight: 400, marginBottom: 8, color: C.text }}>Today's question awaits</h3><p style={{ color: C.muted, fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>A fresh question, just for you two.</p>{loading ? <Spinner text="Crafting your question..." /> : <Btn onClick={generate}>Generate today's question ✦</Btn>}</div>}
      {phase === "answer" && <div><QCard /><Field textarea label={`Your answer, ${me?.name}`} value={ans} onChange={e => setAns(e.target.value)} placeholder="Be honest — your partner will try to guess this..." /><Btn disabled={!ans.trim()} onClick={() => { if (!ans.trim()) return; updateQa({ ...qa, answers: { ...(qa?.answers || {}), [user]: ans.trim() } }); }}>Lock in my answer →</Btn></div>}
      {phase === "guess" && <div><QCard /><div style={{ background: C.accentSoft, border: `1px solid ${C.accentBd}`, borderRadius: 14, padding: 14, marginBottom: 16 }}><div style={{ fontSize: 11, fontWeight: 600, color: C.accent, marginBottom: 4 }}>✓ Your answer is locked in</div><div style={{ fontSize: 15, color: C.text }}>{qa?.answers?.[user]}</div></div>{!qa?.answers?.[pk] && <div style={{ background: C.amberSoft, border: `1px solid ${C.amberBd}`, borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, color: C.amber }}>⏳ {partner?.name} hasn't answered yet</div>}<Field textarea label={`What do you think ${partner?.name} said?`} value={guess} onChange={e => setGuess(e.target.value)} placeholder={`Guess ${partner?.name}'s answer...`} /><Btn disabled={!guess.trim()} onClick={() => { if (!guess.trim()) return; updateQa({ ...qa, guesses: { ...(qa?.guesses || {}), [user]: guess.trim() } }); }}>Submit my guess →</Btn></div>}
      {phase === "result" && <div><Card style={{ marginBottom: 18 }}><p style={{ fontFamily: "Georgia, serif", fontSize: 17, fontStyle: "italic", lineHeight: 1.6, color: C.text, margin: 0 }}>"{qa.question}"</p></Card>{[[user, me?.name, C.accent, C.accentSoft, C.accentBd, pk], [pk, partner?.name, C.amber, C.amberSoft, C.amberBd, user]].map(([key, name, color, soft, bd, gk]) => <div key={key} style={{ background: soft, border: `1px solid ${bd}`, borderRadius: 16, padding: 18, marginBottom: 12 }}><div style={{ fontSize: 11, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>{name}'s answers</div><div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Their answer:</div><div style={{ fontSize: 15, color: C.text, fontWeight: 500 }}>{qa?.answers?.[key] || <i style={{ color: C.muted }}>Not answered yet</i>}</div></div><div><div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{key === user ? `${partner?.name}'s guess:` : `${me?.name}'s guess:`}</div><div style={{ fontSize: 15, color: C.text, fontWeight: 500 }}>{qa?.guesses?.[gk] || <i style={{ color: C.muted }}>Not guessed yet</i>}</div></div></div>)}<Btn variant="ghost" onClick={back}>← Back to home</Btn></div>}
    </div>
  );
}

// ── WYR ───────────────────────────────────────────────────────────────────
function WYRScreen({ me, partner, user, wyr, updateWyr, back }) {
  const pk = user === "A" ? "B" : "A"; const [loading, setLoading] = useState(false);
  const generate = async () => { setLoading(true); try { const raw = await callClaude('Would You Rather for a couple. Return ONLY JSON: {"a":"option A","b":"option B"} — no backticks.', "Create dilemma."); const m = raw.match(/\{[\s\S]*?\}/); const p = JSON.parse(m ? m[0] : raw); updateWyr({ a: p.a, b: p.b, choices: {} }); } catch (e) { console.error(e); } setLoading(false); };
  const choose = (opt) => { if (wyr?.choices?.[user]) return; updateWyr({ ...wyr, choices: { ...(wyr?.choices || {}), [user]: opt } }); };
  const mine = wyr?.choices?.[user], theirs = wyr?.choices?.[pk], both = mine && theirs, agree = both && mine === theirs;
  const opts = [{ key: "a", text: wyr?.a, color: C.accent, soft: C.accentSoft, bd: C.accentBd, label: "Option A" }, { key: "b", text: wyr?.b, color: C.amber, soft: C.amberSoft, bd: C.amberBd, label: "Option B" }];
  return (
    <div style={{ padding: "22px 18px 48px" }}>
      <Hdr title="Would You Rather" sub="Make choices, discover each other" back={back} />
      {!wyr?.a ? (<div style={{ textAlign: "center", paddingTop: 20 }}><div style={{ fontSize: 56, marginBottom: 18, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>🤔</div><p style={{ color: C.muted, fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>No obvious right answer.</p>{loading ? <Spinner text="Crafting your dilemma..." /> : <Btn onClick={generate}>Generate today's dilemma ✦</Btn>}</div>) : (
        <div><p style={{ fontFamily: "Georgia, serif", fontSize: 18, fontStyle: "italic", color: C.muted, textAlign: "center", marginBottom: 20 }}>Would you rather...</p>
          {opts.map(opt => { const chosen = mine === opt.key, pp = theirs === opt.key; return <button key={opt.key} onClick={() => !mine && choose(opt.key)} style={{ display: "block", width: "100%", background: chosen ? opt.soft : C.surface, border: `2px solid ${chosen ? opt.color : C.border}`, borderRadius: 18, padding: 22, textAlign: "left", cursor: mine ? "default" : "pointer", fontFamily: "inherit", marginBottom: 14, transition: "all 0.2s", boxShadow: chosen ? `0 4px 18px ${opt.color}33` : "none" }}><div style={{ fontSize: 12, fontWeight: 700, color: opt.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{opt.label}</div><div style={{ fontFamily: "Georgia, serif", fontSize: 18, fontStyle: "italic", color: C.text, lineHeight: 1.55 }}>{opt.text}</div>{both && <div style={{ marginTop: 10, display: "flex", gap: 7, flexWrap: "wrap" }}>{chosen && <span style={{ fontSize: 11, fontWeight: 600, color: opt.color, background: opt.soft, padding: "3px 10px", borderRadius: 20, border: `1px solid ${opt.bd}` }}>✓ {me?.name}</span>}{pp && <span style={{ fontSize: 11, fontWeight: 600, color: opt.color, background: opt.soft, padding: "3px 10px", borderRadius: 20, border: `1px solid ${opt.bd}` }}>✓ {partner?.name}</span>}</div>}</button>; })}
          {!mine && <p style={{ textAlign: "center", fontSize: 13, color: C.muted }}>Tap to choose — no changing your mind!</p>}
          {mine && !theirs && <div style={{ background: C.amberSoft, border: `1px solid ${C.amberBd}`, borderRadius: 12, padding: 12, textAlign: "center", fontSize: 13, color: C.amber }}>⏳ Waiting for {partner?.name}...</div>}
          {both && <div style={{ marginTop: 8 }}><div style={{ background: agree ? "#e8f5ec" : C.accentSoft, border: `1px solid ${agree ? "#b5dfc2" : C.accentBd}`, borderRadius: 14, padding: 16, textAlign: "center", marginBottom: 14 }}><div style={{ fontSize: 28, marginBottom: 6 }}>{agree ? "🎉" : "✨"}</div><div style={{ fontWeight: 600, color: agree ? "#3d7a52" : C.accent, fontSize: 14 }}>{agree ? "You both chose the same!" : "You chose differently — great conversation starter!"}</div></div><Btn variant="outline" onClick={() => updateWyr({ a: "", b: "", choices: {} })}>New dilemma →</Btn></div>}
        </div>
      )}
    </div>
  );
}

// ── NHIE ──────────────────────────────────────────────────────────────────
function NHIE({ me, partner, user, ninh, updateNinh, back }) {
  const pk = user === "A" ? "B" : "A"; const [loading, setLoading] = useState(false);
  const generate = async () => { setLoading(true); try { const raw = await callClaude('5 "Never Have I Ever" statements for a couple. Return ONLY a JSON array of 5 strings — no backticks.', "Generate."); const m = raw.match(/\[[\s\S]*?\]/); const arr = JSON.parse(m ? m[0] : raw); updateNinh({ statements: arr.map(t => ({ text: t, A: null, B: null })) }); } catch (e) { console.error(e); } setLoading(false); };
  const vote = (i, choice) => { if (ninh.statements[i][user]) return; const stmts = [...ninh.statements]; stmts[i] = { ...stmts[i], [user]: choice }; updateNinh({ ...ninh, statements: stmts }); };
  const allDone = ninh?.statements?.every(s => s.A && s.B);
  return (
    <div style={{ padding: "22px 18px 48px" }}>
      <Hdr title="Never Have I Ever" sub="Find out who's done what" back={back} />
      {!ninh?.statements ? (<div style={{ textAlign: "center", paddingTop: 20 }}><div style={{ fontSize: 56, marginBottom: 18, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>🙋</div><p style={{ color: C.muted, fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>5 statements. Have or never?</p>{loading ? <Spinner text="Generating statements..." /> : <Btn onClick={generate}>Generate statements ✦</Btn>}</div>) : (
        <div>
          {ninh.statements.map((s, i) => (
            <div key={i} style={{ background: C.surface, borderRadius: 16, padding: 18, marginBottom: 10, boxShadow: "0 1px 8px rgba(30,20,13,0.05)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 5 }}>#{i + 1}</div>
              <p style={{ fontSize: 14, color: C.text, marginBottom: 12, lineHeight: 1.5 }}>{s.text}</p>
              {!s[user] ? (<div style={{ display: "flex", gap: 9 }}><button onClick={() => vote(i, "have")} style={{ flex: 1, padding: 10, borderRadius: 11, border: "1.5px solid #b5dfc2", background: "#e8f5ec", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#3d7a52" }}>✓ I have</button><button onClick={() => vote(i, "never")} style={{ flex: 1, padding: 10, borderRadius: 11, border: `1.5px solid ${C.accentBd}`, background: C.accentSoft, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: C.accent }}>✗ Never</button></div>) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{[[user, me?.name], [pk, partner?.name]].map(([key, name]) => s[key] ? <span key={key} style={{ fontSize: 11, fontWeight: 600, padding: "4px 11px", borderRadius: 20, background: s[key] === "have" ? "#e8f5ec" : C.accentSoft, color: s[key] === "have" ? "#3d7a52" : C.accent, border: `1px solid ${s[key] === "have" ? "#b5dfc2" : C.accentBd}` }}>{name}: {s[key] === "have" ? "✓ Have" : "✗ Never"}</span> : <span key={key} style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>⏳ {name}...</span>)}</div>
              )}
            </div>
          ))}
          {allDone && <Btn variant="outline" style={{ marginTop: 6 }} onClick={() => updateNinh(null)}>New round →</Btn>}
        </div>
      )}
    </div>
  );
}

// ── TRUTH OR DARE ─────────────────────────────────────────────────────────
function TruthOrDare({ me, partner, user, tord, updateTord, back }) {
  const [loading, setLoading] = useState(false);
  const pick = async (type) => { setLoading(true); try { const content = await callClaude(type === "truth" ? "One 'Truth' question for a couple — personal, slightly vulnerable. Return ONLY the question." : "One 'Dare' for a long-distance relationship — they can do it alone and share via photo/text. Return ONLY the dare.", `Generate a ${type}.`); updateTord({ type, content, done: false }); } catch (e) { console.error(e); } setLoading(false); };
  return (
    <div style={{ padding: "22px 18px 48px" }}>
      <Hdr title="Truth or Dare" sub="Pick your fate" back={back} />
      {!tord?.type ? (
        <div><div style={{ textAlign: "center", paddingTop: 8, marginBottom: 24 }}><div style={{ fontSize: 56, marginBottom: 12, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>🎭</div><p style={{ color: C.muted, fontSize: 15, lineHeight: 1.7 }}>What will it be?</p></div>
          {loading ? <Spinner text="Rolling the dice..." /> : (<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <button onClick={() => pick("truth")} style={{ background: C.accentSoft, border: `2px solid ${C.accentBd}`, borderRadius: 18, padding: "26px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "center", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"} onMouseLeave={e => e.currentTarget.style.transform = "none"}><div style={{ fontSize: 34, marginBottom: 8 }}>💬</div><div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontFamily: "Georgia, serif", fontStyle: "italic" }}>Truth</div><div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Answer honestly</div></button>
            <button onClick={() => pick("dare")} style={{ background: C.amberSoft, border: `2px solid ${C.amberBd}`, borderRadius: 18, padding: "26px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "center", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"} onMouseLeave={e => e.currentTarget.style.transform = "none"}><div style={{ fontSize: 34, marginBottom: 8 }}>⚡</div><div style={{ fontSize: 18, fontWeight: 700, color: C.amber, fontFamily: "Georgia, serif", fontStyle: "italic" }}>Dare</div><div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Accept the challenge</div></button>
          </div>)}
        </div>
      ) : (
        <div><div style={{ background: tord.type === "truth" ? C.accentSoft : C.amberSoft, border: `2px solid ${tord.type === "truth" ? C.accentBd : C.amberBd}`, borderRadius: 20, padding: 26, marginBottom: 18, textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 700, color: tord.type === "truth" ? C.accent : C.amber, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>{tord.type === "truth" ? "💬 Truth" : "⚡ Dare"}</div><p style={{ fontFamily: "Georgia, serif", fontSize: 19, fontStyle: "italic", color: C.text, lineHeight: 1.6, margin: 0 }}>{tord.content}</p></div>
          {!tord.done ? (<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}><Btn onClick={() => updateTord({ ...tord, done: true })}>✓ Done!</Btn><Btn variant="ghost" onClick={() => updateTord(null)}>Skip →</Btn></div>) : (<div><div style={{ background: "#e8f5ec", border: "1px solid #b5dfc2", borderRadius: 14, padding: 14, textAlign: "center", marginBottom: 14 }}><div style={{ fontSize: 26, marginBottom: 4 }}>🎉</div><div style={{ fontWeight: 600, color: "#3d7a52" }}>Challenge completed!</div></div><Btn variant="outline" onClick={() => updateTord(null)}>Pick another →</Btn></div>)}
        </div>
      )}
    </div>
  );
}

// ── LOVE NOTES ────────────────────────────────────────────────────────────
function LoveNotes({ me, partner, user, notes, updateNotes, back }) {
  const pk = user === "A" ? "B" : "A"; const readKey = user === "A" ? "readA" : "readB"; const [text, setText] = useState("");
  const send = () => { if (!text.trim()) return; const note = { id: Date.now(), from: user, text: text.trim(), date: new Date().toLocaleDateString("en", { month: "short", day: "numeric" }), readA: user === "A", readB: user === "B" }; updateNotes([note, ...notes]); setText(""); };
  const reveal = (id) => updateNotes(notes.map(n => n.id === id ? { ...n, [readKey]: true } : n));
  const unread = notes.filter(n => n.from === pk && !n[readKey]).length;
  return (
    <div style={{ padding: "22px 18px 48px" }}>
      <Hdr title="Love Notes" sub="Little letters, big feelings" back={back} right={unread > 0 ? <div style={{ background: C.accentSoft, border: `1px solid ${C.accentBd}`, borderRadius: 20, padding: "4px 11px", fontSize: 11, fontWeight: 600, color: C.accent }}>💌 {unread}</div> : null} />
      <Card><Field textarea label={`Write to ${partner?.name}`} value={text} onChange={e => setText(e.target.value)} placeholder="Say something sweet, funny, or from the heart..." /><Btn disabled={!text.trim()} onClick={send}>Send note 💌</Btn></Card>
      {notes.length === 0 ? <div style={{ textAlign: "center", padding: "36px 0" }}><div style={{ fontSize: 48, marginBottom: 12, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>💌</div><div style={{ color: C.muted, fontSize: 15 }}>No notes yet — send the first one.</div></div> : notes.map(note => {
        const fromMe = note.from === user; const isHidden = !fromMe && !note[readKey];
        return <div key={note.id} style={{ background: fromMe ? C.bg : C.surface, borderRadius: 14, padding: 16, marginBottom: 10, border: `1px solid ${fromMe ? C.border : C.accentBd}` }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><div style={{ fontSize: 11, fontWeight: 600, color: fromMe ? C.muted : C.accent }}>{fromMe ? "From you" : `From ${partner?.name}`}</div><div style={{ fontSize: 11, color: C.muted }}>{note.date}</div></div>{isHidden ? <div style={{ textAlign: "center", padding: "12px 0" }}><div style={{ fontSize: 22, marginBottom: 6 }}>💌</div><div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>A note from {partner?.name}</div><Btn onClick={() => reveal(note.id)} style={{ maxWidth: 140, margin: "0 auto", padding: 9, fontSize: 13 }}>Reveal ♥</Btn></div> : <div style={{ fontSize: 15, color: C.text, lineHeight: 1.65 }}>{note.text}</div>}</div>;
      })}
    </div>
  );
}

// ── GRATITUDE ─────────────────────────────────────────────────────────────
function Gratitude({ me, partner, user, grat, updateGrat, back }) {
  const pk = user === "A" ? "B" : "A"; const [text, setText] = useState(grat?.[user] || "");
  const submitted = !!grat?.[user]; const partnerDone = !!grat?.[pk]; const both = submitted && partnerDone;
  return (
    <div style={{ padding: "22px 18px 48px" }}>
      <Hdr title="Daily Gratitude" sub={new Date().toLocaleDateString("en", { month: "long", day: "numeric" })} back={back} />
      {!submitted && <div><div style={{ textAlign: "center", marginBottom: 24 }}><div style={{ fontSize: 48, marginBottom: 10, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>🙏</div><p style={{ fontFamily: "Georgia, serif", fontSize: 19, fontStyle: "italic", color: C.text, lineHeight: 1.6 }}>What's one thing you love about {partner?.name} today?</p></div><Field textarea value={text} onChange={e => setText(e.target.value)} placeholder="Be specific — what did they do, say, or make you feel?" /><Btn disabled={!text.trim()} onClick={() => { if (!text.trim()) return; updateGrat({ ...(grat || {}), [user]: text.trim() }); }}>Send my gratitude 🙏</Btn></div>}
      {submitted && both && <div><div style={{ background: "#e8f5ec", border: "1px solid #b5dfc2", borderRadius: 14, padding: 16, textAlign: "center", marginBottom: 18 }}><div style={{ fontSize: 26, marginBottom: 6 }}>🌸</div><div style={{ fontWeight: 600, color: "#3d7a52" }}>You both shared today</div></div>{[[user, me?.name, partner?.name, C.accent, C.accentSoft, C.accentBd], [pk, partner?.name, me?.name, C.amber, C.amberSoft, C.amberBd]].map(([key, from, to, color, soft, bd]) => <div key={key} style={{ background: soft, border: `1px solid ${bd}`, borderRadius: 14, padding: 18, marginBottom: 12 }}><div style={{ fontSize: 11, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{from} → {to}</div><p style={{ fontFamily: "Georgia, serif", fontSize: 17, fontStyle: "italic", color: C.text, lineHeight: 1.6, margin: 0 }}>"{grat[key]}"</p></div>)}<Btn variant="ghost" onClick={back}>← Back</Btn></div>}
      {submitted && !partnerDone && <div><div style={{ background: C.accentSoft, border: `1px solid ${C.accentBd}`, borderRadius: 14, padding: 18, marginBottom: 16 }}><div style={{ fontSize: 11, fontWeight: 600, color: C.accent, marginBottom: 6 }}>✓ Your gratitude for today</div><p style={{ fontFamily: "Georgia, serif", fontSize: 17, fontStyle: "italic", color: C.text, lineHeight: 1.6, margin: 0 }}>"{grat[user]}"</p></div><div style={{ background: C.amberSoft, border: `1px solid ${C.amberBd}`, borderRadius: 12, padding: 12, textAlign: "center", fontSize: 13, color: C.amber }}>⏳ Waiting for {partner?.name}...</div></div>}
    </div>
  );
}

// ── COMPATIBILITY ─────────────────────────────────────────────────────────
function CompatScreen({ me, partner, user, compat, updateCompat, back }) {
  const pk = user === "A" ? "B" : "A"; const [loading, setLoading] = useState(false);
  const generate = async () => { setLoading(true); try { const raw = await callClaude('6 preference questions for a compatibility quiz. Each has a 1-5 scale. Return ONLY JSON array: [{"q":"question","low":"label for 1","high":"label for 5"},...] — no backticks.', "Generate 6 questions."); const m = raw.match(/\[[\s\S]*?\]/); const qs = JSON.parse(m ? m[0] : raw); updateCompat({ questions: qs, ratings: { A: {}, B: {} } }); } catch (e) { console.error(e); } setLoading(false); };
  const rate = (i, val) => { if (compat.ratings[user][i] !== undefined) return; const r2 = { ...compat.ratings, [user]: { ...compat.ratings[user], [i]: val } }; updateCompat({ ...compat, ratings: r2 }); };
  const myR = compat?.ratings?.[user] || {}, theirR = compat?.ratings?.[pk] || {};
  const myDone = compat?.questions && Object.keys(myR).length === compat.questions.length;
  const theirDone = compat?.questions && Object.keys(theirR).length === compat.questions.length;
  const both = myDone && theirDone;
  const score = both ? Math.round(100 - compat.questions.reduce((acc, _, i) => acc + Math.abs((myR[i] || 3) - (theirR[i] || 3)), 0) / compat.questions.length * 20) : null;
  const scoreColor = score >= 80 ? "#3d7a52" : score >= 60 ? C.amber : C.accent;
  return (
    <div style={{ padding: "22px 18px 48px" }}>
      <Hdr title="Compatibility Meter" sub="See how alike you really are" back={back} />
      {!compat?.questions ? (<div style={{ textAlign: "center", paddingTop: 20 }}><div style={{ fontSize: 56, marginBottom: 18, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>📊</div><h3 style={{ fontFamily: "Georgia, serif", fontSize: 22, fontStyle: "italic", fontWeight: 400, marginBottom: 8, color: C.text }}>How compatible are you?</h3><p style={{ color: C.muted, fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>6 questions. Rate your preferences. See your match.</p>{loading ? <Spinner text="Generating questions..." /> : <Btn variant="sage" onClick={generate}>Start the quiz ✦</Btn>}</div>) : (
        <div>
          {both && <div style={{ background: C.sageSoft, border: `1px solid ${C.sageBd}`, borderRadius: 18, padding: 22, textAlign: "center", marginBottom: 20 }}><div style={{ fontSize: 11, fontWeight: 600, color: C.sage, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Your compatibility score</div><div style={{ fontSize: 52, fontWeight: 700, color: scoreColor, fontFamily: "Georgia, serif", marginBottom: 6 }}>{score}%</div><div style={{ fontSize: 14, color: C.muted }}>{score >= 80 ? "You two are beautifully aligned ✨" : score >= 60 ? "Lovely mix of similarities and differences 🌸" : "Opposites attract — plenty to explore 🎉"}</div></div>}
          {compat.questions.map((q, i) => { const my = myR[i]; const their = theirR[i]; const answered = my !== undefined; return <div key={i} style={{ background: C.surface, borderRadius: 16, padding: 18, marginBottom: 10, boxShadow: "0 1px 8px rgba(30,20,13,0.05)" }}><div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>Q{i + 1}</div><div style={{ fontSize: 14, color: C.text, marginBottom: 12, lineHeight: 1.45, fontWeight: 500 }}>{q.q}</div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 8 }}><span>1 — {q.low}</span><span>{q.high} — 5</span></div><div style={{ display: "flex", gap: 8, marginBottom: 8 }}>{[1, 2, 3, 4, 5].map(v => <button key={v} onClick={() => !answered && rate(i, v)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${my === v ? C.sage : C.border}`, background: my === v ? C.sageSoft : C.bg, cursor: answered ? "default" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: my === v ? 700 : 400, color: my === v ? C.sage : C.text, transition: "all 0.15s" }}>{v}</button>)}</div>{both && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: C.accentSoft, color: C.accent, border: `1px solid ${C.accentBd}` }}>{me?.name}: {my}</span><span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: C.amberSoft, color: C.amber, border: `1px solid ${C.amberBd}` }}>{partner?.name}: {their}</span>{Math.abs(my - their) <= 1 && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#e8f5ec", color: "#3d7a52", border: "1px solid #b5dfc2" }}>✓ Aligned</span>}</div>}{!answered && <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>Tap a number to rate</div>}</div>; })}
          {both && <Btn variant="ghost" style={{ marginTop: 6 }} onClick={() => updateCompat(null)}>Retake →</Btn>}
          {!both && myDone && <div style={{ background: C.amberSoft, border: `1px solid ${C.amberBd}`, borderRadius: 12, padding: 12, textAlign: "center", fontSize: 13, color: C.amber, marginTop: 6 }}>⏳ Waiting for {partner?.name} to finish...</div>}
        </div>
      )}
    </div>
  );
}

// ── LOVE LANGUAGE ─────────────────────────────────────────────────────────
const LOVE_LANGS = [
  { key: "words", icon: "💬", title: "Words of Affirmation", desc: "Compliments, 'I love you', encouraging messages" },
  { key: "time",  icon: "⏰", title: "Quality Time",         desc: "Undivided attention, meaningful conversations" },
  { key: "gifts", icon: "🎁", title: "Receiving Gifts",      desc: "Thoughtful surprises, remembering what matters" },
  { key: "acts",  icon: "🤝", title: "Acts of Service",      desc: "Doing things that ease their load" },
  { key: "touch", icon: "🤗", title: "Physical Touch",       desc: "Hugs, closeness, physical presence" },
];
function LoveLang({ me, partner, user, ll, updateLl, back }) {
  const pk = user === "A" ? "B" : "A"; const mine = ll?.[user]; const theirs = ll?.[pk]; const both = mine && theirs; const match = both && mine === theirs;
  return (
    <div style={{ padding: "22px 18px 48px" }}>
      <Hdr title="Love Language" sub="How do you feel loved?" back={back} />
      {!mine ? (<div><div style={{ textAlign: "center", marginBottom: 24 }}><div style={{ fontSize: 48, marginBottom: 10, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>💝</div><p style={{ fontFamily: "Georgia, serif", fontSize: 18, fontStyle: "italic", color: C.text, lineHeight: 1.6 }}>Which speaks to your heart most?</p></div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>{me?.name} — pick your primary love language</div>{LOVE_LANGS.map(l => <button key={l.key} onClick={() => updateLl({ ...(ll || {}), [user]: l.key })} style={{ display: "block", width: "100%", background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", marginBottom: 10, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.accentSoft; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; }}><div style={{ display: "flex", alignItems: "center", gap: 14 }}><div style={{ fontSize: 28 }}>{l.icon}</div><div><div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{l.title}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{l.desc}</div></div></div></button>)}</div>) : (
        <div>{!theirs && <div style={{ background: C.amberSoft, border: `1px solid ${C.amberBd}`, borderRadius: 12, padding: 12, textAlign: "center", fontSize: 13, color: C.amber, marginBottom: 16 }}>⏳ Waiting for {partner?.name} to pick...</div>}{both && <div style={{ background: match ? "#e8f5ec" : C.purpleSoft, border: `1px solid ${match ? "#b5dfc2" : C.purpleBd}`, borderRadius: 16, padding: 20, textAlign: "center", marginBottom: 20 }}><div style={{ fontSize: 28, marginBottom: 8 }}>{match ? "🎉" : "💡"}</div><div style={{ fontWeight: 600, fontSize: 15, color: match ? "#3d7a52" : C.purple }}>{match ? "You share the same love language!" : "Different languages — knowing this helps you love better."}</div></div>}{LOVE_LANGS.map(l => { const isMe = mine === l.key; const isTheirs = theirs === l.key; if (!isMe && !isTheirs) return null; return <div key={l.key} style={{ background: C.surface, borderRadius: 16, padding: 18, marginBottom: 10, border: `1.5px solid ${isMe && isTheirs ? C.sage : isMe ? C.accentBd : C.amberBd}`, boxShadow: "0 1px 8px rgba(30,20,13,0.05)" }}><div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}><div style={{ fontSize: 28 }}>{l.icon}</div><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{l.title}</div><div style={{ fontSize: 12, color: C.muted }}>{l.desc}</div></div></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{isMe && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 11px", borderRadius: 20, background: C.accentSoft, color: C.accent, border: `1px solid ${C.accentBd}` }}>♥ {me?.name}</span>}{isTheirs && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 11px", borderRadius: 20, background: C.amberSoft, color: C.amber, border: `1px solid ${C.amberBd}` }}>♥ {partner?.name}</span>}</div></div>; })}<Btn variant="ghost" style={{ marginTop: 6 }} onClick={() => updateLl(null)}>Retake →</Btn></div>
      )}
    </div>
  );
}

// ── BUCKET LIST ───────────────────────────────────────────────────────────
function BucketList({ me, partner, user, bucket, updateBucket, back }) {
  const [text, setText] = useState(""); const [loading, setLoading] = useState(false);
  const addItem = () => { if (!text.trim()) return; const item = { id: Date.now(), text: text.trim(), by: me?.name, done: false, date: new Date().toLocaleDateString("en", { month: "short", day: "numeric" }) }; updateBucket([item, ...bucket]); setText(""); };
  const toggle = (id) => updateBucket(bucket.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const suggest = async () => { setLoading(true); try { const raw = await callClaude('5 romantic bucket list ideas for a long-distance couple. Return ONLY a JSON array of 5 short strings, no backticks.', "Generate 5 ideas."); const m = raw.match(/\[[\s\S]*?\]/); const arr = JSON.parse(m ? m[0] : raw); const items = arr.map(t => ({ id: Date.now() + Math.random(), text: t, by: "AI ✦", done: false, date: "suggested" })); updateBucket([...items, ...bucket]); } catch (e) { console.error(e); } setLoading(false); };
  const done = bucket.filter(i => i.done).length;
  return (
    <div style={{ padding: "22px 18px 56px" }}>
      <Hdr title="Bucket List" sub={`${done} of ${bucket.length} done together`} back={back} />
      <Card><Field label="Add a dream" placeholder="e.g. Watch the Northern Lights together..." value={text} onChange={e => setText(e.target.value)} /><div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}><Btn disabled={!text.trim()} onClick={addItem}>Add ✦</Btn><Btn variant="ghost" style={{ width: "auto", padding: "13px 16px" }} onClick={suggest} disabled={loading}>{loading ? "…" : "💡"}</Btn></div><div style={{ fontSize: 11, color: C.muted, marginTop: 8, textAlign: "right" }}>💡 = AI suggestions</div></Card>
      {bucket.length === 0 ? <div style={{ textAlign: "center", padding: "36px 0" }}><div style={{ fontSize: 52, marginBottom: 12, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>🌍</div><div style={{ color: C.muted, fontSize: 15 }}>Start dreaming together — add your first item.</div></div> : (
        <div>
          {bucket.filter(i => !i.done).length > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>To do together</div>}
          {bucket.filter(i => !i.done).map(item => <div key={item.id} style={{ background: C.surface, borderRadius: 14, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 12, boxShadow: "0 1px 6px rgba(30,20,13,0.05)" }}><button onClick={() => toggle(item.id)} style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${C.border}`, background: "none", cursor: "pointer", flexShrink: 0, marginTop: 2, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = C.sage} onMouseLeave={e => e.currentTarget.style.borderColor = C.border} /><div style={{ flex: 1 }}><div style={{ fontSize: 15, color: C.text, lineHeight: 1.45 }}>{item.text}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>by {item.by} · {item.date}</div></div></div>)}
          {bucket.filter(i => i.done).length > 0 && <div><div style={{ fontSize: 11, fontWeight: 600, color: C.sage, textTransform: "uppercase", letterSpacing: "0.07em", margin: "18px 0 10px" }}>✓ Done together ({done})</div>{bucket.filter(i => i.done).map(item => <div key={item.id} style={{ background: C.sageSoft, borderRadius: 14, padding: "12px 16px", marginBottom: 7, display: "flex", alignItems: "flex-start", gap: 12, border: `1px solid ${C.sageBd}` }}><button onClick={() => toggle(item.id)} style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${C.sage}`, background: C.sage, cursor: "pointer", flexShrink: 0, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff" }}>✓</button><div style={{ flex: 1 }}><div style={{ fontSize: 14, color: C.sage, textDecoration: "line-through", lineHeight: 1.4 }}>{item.text}</div></div></div>)}</div>}
        </div>
      )}
    </div>
  );
}

// ── MEMORY JAR ────────────────────────────────────────────────────────────
function MemoryJar({ me, user, memories, setMemories, back }) {
  const [text, setText] = useState("");
  const add = () => { if (!text.trim()) return; const m = { id: Date.now(), user, name: me?.name, text: text.trim(), date: new Date().toLocaleDateString("en", { month: "short", day: "numeric" }) }; const next = [m, ...memories]; setMemories(next); save("memories", next); setText(""); };
  return (
    <div style={{ padding: "22px 18px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}><BackBtn onClick={back} /><div style={{ flex: 1 }}><h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 400, fontStyle: "italic", color: C.text }}>Memory Jar</h2><div style={{ fontSize: 12, color: C.muted }}>Little moments, kept forever</div></div><div style={{ fontSize: 28 }}>🫙</div></div>
      <Card><Field textarea label={`Drop a memory, ${me?.name}`} value={text} onChange={e => setText(e.target.value)} placeholder="A funny moment, a feeling, a wish... ✨" /><Btn disabled={!text.trim()} onClick={add}>Add to jar ✦</Btn></Card>
      {memories.length === 0 ? <div style={{ textAlign: "center", padding: "40px 0" }}><div style={{ fontSize: 48, marginBottom: 12, display: "inline-block", animation: "hbFloat 3.2s ease-in-out infinite" }}>🫙</div><div style={{ color: C.muted, fontSize: 15 }}>Your jar is empty — fill it with moments.</div></div> : memories.map(m => <div key={m.id} style={{ background: C.surface, borderRadius: 14, padding: 16, marginBottom: 10, boxShadow: "0 1px 6px rgba(30,20,13,0.05)", borderLeft: `3px solid ${m.user === "A" ? C.accent : C.amber}` }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><div style={{ fontSize: 11, fontWeight: 600, color: m.user === "A" ? C.accent : C.amber }}>{m.name}</div><div style={{ fontSize: 11, color: C.muted }}>{m.date}</div></div><div style={{ fontSize: 15, color: C.text, lineHeight: 1.6 }}>{m.text}</div></div>)}
    </div>
  );
}

// ── SETTINGS ──────────────────────────────────────────────────────────────
function Settings({ couple, updateCouple, back }) {
  const [date, setDate] = useState(couple?.nextMeeting || "");
  return (
    <div style={{ padding: "22px 18px 48px" }}>
      <Hdr title="Next Meeting" sub="Update your countdown" back={back} />
      <Card><p style={{ color: C.muted, fontSize: 15, marginBottom: 18, lineHeight: 1.7 }}>Set when you'll next be together — powers the countdown on home.</p><Field label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} /><Btn onClick={() => { updateCouple({ ...couple, nextMeeting: date || null }); back(); }}>Save →</Btn>{couple?.nextMeeting && <Btn variant="ghost" style={{ marginTop: 10 }} onClick={() => { updateCouple({ ...couple, nextMeeting: null }); back(); }}>Clear date</Btn>}</Card>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,   setScreen  ] = useState("loading");
  const [user,     setUser    ] = useState("A");
  const [couple,   setCouple  ] = useState(null);
  const [qa,       setQa      ] = useState(null);
  const [memories, setMemories] = useState([]);
  const [wyr,      setWyr     ] = useState(null);
  const [ninh,     setNinh    ] = useState(null);
  const [tord,     setTord    ] = useState(null);
  const [notes,    setNotes   ] = useState([]);
  const [grat,     setGrat    ] = useState(null);
  const [streak,   setStreak  ] = useState(null);
  const [compat,   setCompat  ] = useState(null);
  const [ll,       setLl      ] = useState(null);
  const [bucket,   setBucket  ] = useState([]);

  useEffect(() => {
    const today = todayStr();
    const c   = load("couple");
    const q   = load(`qa-${today}`);
    const m   = load("memories");
    const w   = load(`wyr-${today}`);
    const n   = load(`ninh-${today}`);
    const t   = load("tord");
    const nt  = load("notes");
    const g   = load(`grat-${today}`);
    const sk  = load("streak");
    const cm  = load(`compat-${today}`);
    const llv = load("lovelang");
    const bk  = load("bucket");

    let ns;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yd = y.toISOString().split("T")[0];
    if (!sk)                        ns = { count: 1, lastDate: today };
    else if (sk.lastDate === today) ns = sk;
    else ns = sk.lastDate === yd ? { count: sk.count + 1, lastDate: today } : { count: 1, lastDate: today };
    save("streak", ns);

    setCouple(c); setQa(q); setMemories(m || []); setWyr(w?.a ? w : null);
    setNinh(n?.statements ? n : null); setTord(t?.type ? t : null);
    setNotes(nt || []); setGrat(g); setStreak(ns);
    setCompat(cm?.questions ? cm : null); setLl(llv); setBucket(bk || []);
    setScreen(c ? "home" : "setup");
  }, []);

  const updateCouple = useCallback((d)   => { setCouple(d);  save("couple", d); }, []);
  const updateQa     = useCallback((d)   => { setQa(d);      save(`qa-${todayStr()}`, d); }, []);
  const updateWyr    = useCallback((d)   => { setWyr(d?.a ? d : null); save(`wyr-${todayStr()}`, d || {}); }, []);
  const updateNinh   = useCallback((d)   => { setNinh(d?.statements ? d : null); save(`ninh-${todayStr()}`, d || {}); }, []);
  const updateTord   = useCallback((d)   => { setTord(d?.type ? d : null); save("tord", d || {}); }, []);
  const updateNotes  = useCallback((arr) => { setNotes(arr); save("notes", arr); }, []);
  const updateGrat   = useCallback((d)   => { setGrat(d);    save(`grat-${todayStr()}`, d); }, []);
  const updateCompat = useCallback((d)   => { setCompat(d?.questions ? d : null); save(`compat-${todayStr()}`, d || {}); }, []);
  const updateLl     = useCallback((d)   => { setLl(d);      save("lovelang", d); }, []);
  const updateBucket = useCallback((arr) => { setBucket(arr); save("bucket", arr); }, []);

  const me      = couple?.users?.[user];
  const partner = couple?.users?.[user === "A" ? "B" : "A"];
  const shared  = { me, partner, user };

  if (screen === "loading") return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, minHeight: "100vh", background: C.bg }}>
      <div style={{ fontSize: 60, animation: "hbFloat 3.2s ease-in-out infinite" }}>♥</div>
      <div style={{ fontSize: 14, color: C.muted }}>Loading...</div>
    </div>
  );

  if (screen === "setup") return <div style={{ background: C.bg, minHeight: "100vh" }}><Setup onDone={(d) => { updateCouple(d); setScreen("home"); }} /></div>;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", fontSize: 16, color: C.text }}>
      <style>{`
        @keyframes hbBeat   { 0%,100%{transform:scale(1)} 30%{transform:scale(1.25)} 65%{transform:scale(1.08)} }
        @keyframes hbFadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes hbFloat  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes hbSpin   { to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "11px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div onClick={() => setScreen("home")} style={{ cursor: "pointer", fontFamily: "Georgia, serif", fontStyle: "italic", color: C.accent, fontSize: 19, fontWeight: 400 }}>♥ Heartbeat</div>
        <button onClick={() => setUser(u => u === "A" ? "B" : "A")} style={{ background: C.accentSoft, border: `1px solid ${C.accentBd}`, borderRadius: 20, padding: "6px 13px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.accent, fontFamily: "inherit" }}>
          {me?.name} · Switch →
        </button>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {screen === "home"     && <Home        {...shared} couple={couple} updateCouple={updateCouple} go={setScreen} notes={notes} streak={streak} bucket={bucket} />}
        {screen === "qa"       && <QAScreen    {...shared} qa={qa} updateQa={updateQa} back={() => setScreen("home")} />}
        {screen === "wyr"      && <WYRScreen   {...shared} wyr={wyr} updateWyr={updateWyr} back={() => setScreen("home")} />}
        {screen === "nhie"     && <NHIE        {...shared} ninh={ninh} updateNinh={updateNinh} back={() => setScreen("home")} />}
        {screen === "tord"     && <TruthOrDare {...shared} tord={tord} updateTord={updateTord} back={() => setScreen("home")} />}
        {screen === "notes"    && <LoveNotes   {...shared} notes={notes} updateNotes={updateNotes} back={() => setScreen("home")} />}
        {screen === "grat"     && <Gratitude   {...shared} grat={grat} updateGrat={updateGrat} back={() => setScreen("home")} />}
        {screen === "compat"   && <CompatScreen{...shared} compat={compat} updateCompat={updateCompat} back={() => setScreen("home")} />}
        {screen === "lovelang" && <LoveLang    {...shared} ll={ll} updateLl={updateLl} back={() => setScreen("home")} />}
        {screen === "bucket"   && <BucketList  {...shared} bucket={bucket} updateBucket={updateBucket} back={() => setScreen("home")} />}
        {screen === "memories" && <MemoryJar   {...shared} memories={memories} setMemories={setMemories} back={() => setScreen("home")} />}
        {screen === "settings" && <Settings    couple={couple} updateCouple={updateCouple} back={() => setScreen("home")} />}
      </div>
    </div>
  );
}
