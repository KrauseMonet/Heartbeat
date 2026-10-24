# Heartbeat Dating — "Play to Match"

> See their photos, play a round together, see how you vibe, then decide.

This doc covers how Heartbeat becomes a dating app where the existing games decide
whether two people match. It's based on the current codebase (`src/App.jsx`,
`src/data/content.js`, `api/*`).

**Constraints**
- **No AI at runtime.** All game content is hand-written and ships with the app. There are no paid API calls. See §3.
- **India first.** One launch city, Razorpay/UPI, INR pricing, English plus Hinglish content. See §8.
- **All photos shown up front**, like other dating apps.
- **Web app first.** Android comes once the web app hits the exit criteria in §10.

---

## 1. The core idea

On most dating apps, a like means nothing. You swipe on photos and then struggle to start a conversation.
Heartbeat already has games built to make two people reveal how they think.
Here, **the game replaces the like**:

1. You browse full profiles: all photos and prompts.
2. Instead of "like", you send a **Spark**: an invite to play a short round.
3. If they accept, you both play a **Spark Round**: 3 quick games, async, about 5 minutes.
4. Answers are revealed side by side, with a **Sync score**.
5. Each person privately picks **Match**, **One more round**, or **Pass**.
6. A mutual Match unlocks chat. Pass is silent, so nobody gets rejected to their face.

Photos decide whether you're attracted to someone. The game decides whether you'd actually
get along, and gives you something real to talk about once chat opens.

### The full arc: Meet → Match → Date → Couple

```
 SINGLE                     MATCHED                   COUPLE (today's Heartbeat)
 Discover → Spark Round  →  Chat + arcade games   →   "We're official" → shared Room
           → Reveal/Decide   + first-date planner      (Notes, Memory Jar, Check-ins,
                                                       Desire, Streaks …)
```

Most dating apps lose users once they succeed. Heartbeat keeps them.

---

## 2. Which games fit which stage

| Existing game | Pre-match (Spark Round) | Post-match | Couple | Changes needed |
|---|---|---|---|---|
| **Would You Rather** | ✅ core | ✅ | ✅ | None. Already async, choose then reveal |
| **Daily Q&A → "Guess Me"** | ✅ core | ✅ | ✅ | **Multiple choice** so scoring needs no AI (§3.3) |
| **Compatibility** | ✅ core | ✅ | ✅ | 6 ratings, scored with the existing `100 - avgDiff*20` formula |
| **Never Have I Ever** | ✅ mild only | ✅ | ✅ | `getNHIESet(false)` only |
| **Love Language** | Profile field | — | ✅ | Picked during onboarding and shown on the card |
| **Wordle Duel** | ✅ optional round | ✅ | ✅ | Same word for both, compare guess counts |
| **Tic Tac Toe** | ⚠️ only if both online | ✅ | ✅ | Real-time |
| **Truth or Dare** | Truths only (non-spicy) | ✅ Truths + light dares | ✅ | No dares between strangers |
| **Pictionary** | ❌ | ✅ | ✅ | Free drawing between strangers invites abuse |
| **Desire** | ❌ never | ❌ | ✅ | Couple-only, 18+ and opt-in |
| Notes, Memory Jar, Bucket, Gratitude, Check-in | ❌ | ❌ | ✅ | Couple features |
| Date Planner | ❌ | ✅ "Plan our first date" | ✅ | Now template-based (`DATE_TEMPLATES`) |

### The Spark Round (default)

| Slot | Game | Why |
|---|---|---|
| 1 | Would You Rather × 3 | Fast and fun, an easy start |
| 2 | Guess Me × 2 | Each person answers a question about themselves, then guesses the other's answer. This creates curiosity |
| 3 | Compatibility × 6 | Gives a number people can talk about |

"One more round" switches to a different set: NHIE (mild), a Truth, or a Wordle Duel.
There are at most 3 rounds, then each person must choose Match or Pass.

### Sync score (pure arithmetic, no AI)

```
sync = 0.5 * compatScore            // existing formula, 0–100
     + 0.3 * wyrAgreement%          // same choice
     + 0.2 * guessAccuracy%         // exact multiple-choice match
```

Show it as a conversation starter ("78% in sync, you both picked the beach cabin"),
never as a verdict.

---

## 3. Content without AI

### 3.1 What's done (in this change)

- `VITE_ANTHROPIC_KEY` removed from the local `.env` and `api/claude.js` deleted
- Removed `callClaude`, `buildCoupleContext`, and the four "Generate personalised…" buttons (Q&A, WYR, NHIE, Truth or Dare)
- **Date Planner** now uses the existing `DATE_TEMPLATES`: 8 vibes, in person or virtual
- **Outfit Planner** now uses a new `OUTFIT_LOOKS` library (6 vibes × 2 looks, mixing Indian and western pieces).
  "Request a change" now sends the note to the partner instead of generating a new outfit
- Removed the AI lines from the premium feature lists (`UpgradeSheet` and `public/pricing.html`)

### 3.2 How much content is needed

Rotation today uses `dayOfYear % bankSize`. That works for a couple who plays once a day. Dating is
different. One active user might play about 3 Spark Rounds a day, which is roughly 3 WYR + 2 Guess Me + 6 Compat **per round**,
so around 30 items a day. Current banks:

| Bank | Today | Target for beta | Target at launch |
|---|---|---|---|
| Would You Rather | 60 | 300 | 600 |
| Guess Me (multiple choice, new) | 0 (140 open Q&A questions to convert) | 200 | 400 |
| Compatibility | 84 | 200 | 300 |
| NHIE (mild) | ~40 tame | 150 | 300 |
| Truths (light) | ~35 regular | 100 | 200 |
| Date templates | 16 | 32 (2 per vibe) | 48 + city-specific ideas for the launch city |
| Outfit looks | 12 | 30 | 60 |

Repeats are fine **between different people**, since it's interesting to compare. They get boring
for the **same person**, so rotation is tracked per user (§3.4).

### 3.3 Guess Me is multiple choice

```js
{ id: "gm_042", q: "Your ideal Sunday?", options: ["Sleep till noon", "Brunch with friends", "Long drive", "Netflix + chai"] }
```

You pick your own answer, then guess theirs. Scoring is an exact comparison, so free text never needs to be graded.
The existing open-ended Q&A stays for couples.

### 3.4 Rotation and storage

- Every item gets a **stable id** (`wyr_001`). Never reuse or renumber ids.
- Move banks out of the JS bundle into **versioned static JSON**: `public/content/v1/wyr.json` etc.
  The CDN serves them for free, the service worker caches them, and the server function imports the same files.
- When a Spark starts, the server picks items **neither player has seen recently**. It stores the last ~300 ids
  per type in `users/{uid}.seen` (a few KB) and resets when the bank runs out.
- Couples keep the daily rotation, but fixed so it doesn't restart every 1 January
  (use days since a fixed epoch rather than day of year).

### 3.5 Writing content without running costs

- Write in batches by theme: food, travel, family, money, career, weekends, cricket, Bollywood, monsoon, festivals.
- An **English and a Hinglish version** for each pack ("Chai ya coffee?"). Users choose in settings.
- It's fine to brainstorm drafts in a free chat assistant, then edit them yourself and commit them as JSON. The cost is one-time and there's no runtime API.
- Keep a `content/README.md` with tone rules: playful rather than crude, no exes, no "how many partners",
  no caste, religion, or salary questions in pre-match rounds.
- Later, add **community submissions**: users suggest questions into a `contentSuggestions` collection,
  you approve them by hand, and approved ones ship in the next JSON version.

---

## 4. User flows

### 4.1 Onboarding (new branch at the start)

```
Login (Google / email) ─► "What brings you here?"
          ├── "I'm single, let's play"  ─► Dating profile setup ─► Discover
          └── "I have a partner"         ─► existing RoomSetup / invite flow
```

Dating profile setup has six short steps:
1. **Basics**: first name, date of birth (hard 18+ gate), gender, interested in
2. **Photos**: **2–6 photos, and the first must clearly show your face.** Uploaded to Cloudinary and held for review before going live (§7)
3. **Where**: launch city and area. Stored as a coarse geohash, never exact coordinates
4. **Prompts**: pick 3 and answer them ("A perfect Sunday is…")
5. **Love language**: reuse `LOVE_LANGS`
6. **Preferences**: favorite games, content language (English or Hinglish), and who can Spark you (everyone or verified only)

### 4.2 Discover → Spark

- **Full profile cards, like other dating apps**: a photo carousel you tap through, name, age, area,
  all 3 prompts, love language, favorite games, and a verified badge.
- Buttons are **Spark ⚡** and **Skip**. There's no like button.
- On a Spark, the other person gets a push and sees the invite in their **Sparks inbox**. They can **Accept** or **Decline** (decline is silent).
- **Outbound limits**: free users get 10 new Sparks a day and 5 active rounds.
- **Inbound limits**: each person holds at most ~25 pending invites. Beyond that, invites wait in a queue.
  This matters a lot in India, where the gender ratio on dating apps is skewed and women's inboxes flood.
- **Expiry**: an unanswered invite expires after 72h. An unfinished round expires after 48h, with a nudge push at 24h.

### 4.3 Playing

- Async by default. Progress shows as "You ✓ · Them: 2/3 done".
- If both are online at once, a **"Play live"** button switches to real-time mode (Tic Tac Toe and Wordle race).

### 4.4 Reveal → Decide

- Once both finish, answers are revealed **side by side** with a Sync score card.
- The reveal unlocks their **game answers**. Photos and prompts were already visible.
- Decision sheet: **Match ❤️ / One more round 🎲 / Pass**.
  - Match + Match → **It's a match** → chat opens
  - Pass by either → closes quietly. The same pair can't Spark again for 30 days
  - Anything else → another round, unless 3 rounds are done, in which case they must pick Match or Pass
  - Neither person sees the other's choice unless both chose Match

### 4.5 Matched

- Chat, with the Spark Round results pinned at the top as a conversation starter.
- Post-match games and **"Plan our first date"** (template-based Date Planner, with public-place ideas in the launch city).
- **Unmatch**, **Block**, and **Report** in the chat header.
- **"We're official"**: when both tap it, a `rooms/{code}` is created and both move into today's couples app.

---

## 5. Screens

| Tab | Screen | Built from |
|---|---|---|
| **Discover** | Profile card with photo carousel, filters (age, area, verified) | New. Reuses `Card`, `Avatar`, gradients |
| **Sparks** | Inbox with 3 sections: *Invites*, *Your turn*, *Waiting* | Reuses the status chips from `PlayTab` |
| | Spark Round player | Existing `WYRScreen`, `QAScreen`, `CompatScreen` UIs on a new data source |
| | Reveal + Decide sheet | New sheet, styled like `UpgradeSheet` |
| **Matches** | Match list and chat | New |
| **Profile** | Dating profile, photos, prompts, settings, pause profile | Extends `ProfileTab` |

Visual language: keep what's there (Playfair italic, Lato, rose, gold, and sage gradients, glass cards),
plus a "spark" coral accent for the Spark button and match moments.

---

## 6. Architecture changes

### 6.1 Why the current model can't stay as it is

Everything lives in **one document, `rooms/{code}`**, which both people read and write from the client:
- **Answers leak before reveal.** A stranger could read the other person's answer in devtools before guessing.
- **Decisions leak.** If Match or Pass is readable, a Pass stops being silent.
- **No server authority.** Clients write scores and outcomes.
- **Unbounded document.** Every daily game adds `qa_YYYYMMDD`-style keys, which will hit the 1 MB limit.

### 6.2 Firestore collections

```
users/{uid}                       PRIVATE: email, dob, fcmToken, isPremium, mode, roomId?, settings,
                                  verification, seen:{wyr:[ids], gm:[ids], ...}, contentLang
profiles/{uid}                    PUBLIC: firstName, age, gender, interestedIn[], photos[] (approved only),
                                  prompts[], loveLang, area, geohash5, favGames[], verified, sparkPolicy,
                                  lastActive, paused, pendingInbound
sparks/{sparkId}                  players:[a,b], from, status, round, rounds:[{items:[ids], revealed}],
                                  progress:{a:2,b:3}, createdAt, expiresAt
sparks/{id}/private/{uid}         this player's answers + decision (only the owner can read or write)
matches/{matchId}                 users:[a,b], sparkId, createdAt, lastMessage, unread map
matches/{id}/messages/{msgId}     from, text, ts
users/{uid}/seenProfiles/{other}  skip/spark/pass + cooldownUntil
blocks/{uid}/blocked/{otherUid}
reports/{reportId}                reporter, target, context, reason, status
moderationQueue/{id}              photo/prompt/selfie awaiting review
rooms/{code}                      UNCHANGED, the couples app
```

### 6.3 Commit-and-reveal on the server

1. Client writes its answers to `sparks/{id}/private/{uid}` (owner-only by rules).
2. `POST /api/spark/submit`: the server (`firebase-admin`) checks both are complete, computes the Sync score, and copies the answers into `revealed`.
3. `POST /api/spark/decide`: the server resolves the outcome, creates the match, and sends pushes.

Every `/api/*` route verifies the Firebase ID token.

```
POST /api/spark/send        { toUid }          → limits, blocks, cooldown, recipient policy; picks unseen content
POST /api/spark/respond     { sparkId, accept }
POST /api/spark/submit      { sparkId }
POST /api/spark/decide      { sparkId, choice }
POST /api/match/official    { matchId }
POST /api/report            { targetUid, context, reason }
GET  /api/discover          ?cursor
POST /api/admin/moderate    { itemId, action }  (admin only)
```

### 6.4 Reusing the games: a `GameSession` adapter

```js
const { content, mine, theirs, revealed, submit } = useGameSession({ kind, gameType, id });
// kind === "room"  → rooms/{roomId}, same as today for couples
// kind === "spark" → sparks/{id} + private/{uid}, submit() goes through /api/spark/submit
```

### 6.5 Discovery

- **MVP (one city):** `/api/discover` queries `profiles` by city + `gender in interestedIn`, then filters age, seen,
  blocked, and paused on the server, ordered by `lastActive`. With one city, a geo index isn't needed yet.
- **Multi-city:** geohash ranges, then Typesense (self-hostable for free) if needed.

### 6.6 Splitting `App.jsx`

`App.jsx` has about 5,600 lines. Split it into `lib/`, `ui/`, `games/`, `session/`, `couple/`, and `dating/` before adding the dating mode.

---

## 7. Trust and safety without AI

| Risk | Approach (no paid APIs) |
|---|---|
| Underage users | DOB gate at signup. Reports of "looks underage" go to the top of the queue |
| Fake or inappropriate photos | **Manual review queue**: photos only go live after you approve them. Doable by hand during a one-city beta. A first photo without a face is rejected |
| Catfishing | **Selfie verification**: user takes a selfie copying a random pose shown on screen, and you compare it by hand. Verified ✓ badge |
| Abusive text | Keyword blocklist in English, Hindi, and Hinglish transliterations on prompts and chat. Matching messages are blocked or flagged |
| Scams and moving off-app too early | Detect phone numbers, URLs, UPI ids, and Instagram handles in the first ~10 messages, and show a safety tip instead |
| Harassment | Block and report on every card, Spark, and chat. A report from a match auto-hides the reporter from the reported user |
| Spam Sparks | Outbound and inbound caps, new accounts limited to 3 Sparks a day for the first 48h |
| Unsafe first dates | First-date templates only suggest public places. A "Share date plan with a friend" link |

Optional and nearly free later: Google Cloud Vision SafeSearch has a free monthly tier, which could pre-screen photos before human review.

**Admin page** (`/admin`, behind an `isAdmin` custom claim): the moderation queue, reports, ban, warn, and dismiss.

---

## 8. India-first launch

- **One city.** Dating apps only work when there are enough people nearby. Recommended: Bengaluru or Pune (high dating-app adoption, English plus Hinglish).
  Run a closed beta with an invite-code waitlist, and seed it through college and office communities.
- **Android-heavy audience.** Chrome on Android supports web push, so the PWA works well before a native app exists.
  Optimise for low-end phones: Cloudinary `f_auto,q_auto,w_720` images, lazy loading, a small bundle (split the 500 KB+ chunk).
- **Payments.** Razorpay only: UPI, cards, UPI Autopay for subscriptions. Park the Paddle routes until there's a global launch.
- **Pricing.** ₹149 a week, ₹499 a month, ₹1,299 for 3 months: below Bumble (₹799 a month) and Hinge (₹1,199), above Aisle and Happn's ₹99 weekly passes. Test prices by cohort once the beta has enough payers, as the incumbents do.
- **Login.** Google sign-in and email, which are free. Phone OTP costs money per SMS, so add it later if fake accounts become a problem.
- **Legal.** Update `terms.html` and `privacy.html` for dating: sensitive data such as orientation, consent, and deletion under the DPDP Act 2023.
  Name a **grievance officer** with a response timeline (IT Rules 2021). 18+ only. Get a lawyer to review before public launch.
- **Content.** Hinglish packs and Indian references (chai, cricket, monsoon, street food, festivals, family weddings). Avoid caste, religion, and salary questions pre-match.

---

## 9. Monetization: three streams, no AI

Heartbeat earns three ways. Subscriptions carry the business; ads and affiliate commission add to it without touching the core experience.

### 9.1 Heartbeat+ subscription (main revenue)

₹149 a week, ₹499 a month or ₹1,299 for 3 months, paid by UPI or card through Razorpay.

What others charge in India (App Store India, October 2026):

| App | Weekly | Monthly |
|---|---|---|
| Aisle | from ₹99 | not published |
| Happn | ₹99 | — |
| QuackQuack | — | ₹299–589 (price tests) |
| **Heartbeat+** | **₹149** | **₹499** |
| Bumble Premium | ₹279–399 | ₹799 |
| Hinge+ / HingeX | — | ₹1,199 / ₹1,499 |

| Free | Heartbeat+ |
|---|---|
| 10 Sparks/day, 5 active | 30 Sparks/day, 15 active |
| Default Spark Round | **Choose the games** you send (e.g. Wordle Duel instead of Compat) |
| — | **See who Sparked you** before accepting |
| — | **Rematch** a closed Spark once |
| Age and area filters | Verified-only, love-language, and favorite-games filters |
| Ads shown | **No ads** |
| — | Premium **themed packs**: travel, foodie, deep talk (hand-written) |

Premium carries over when a match becomes a couple room (`isPremium` already checks both the room and the user).

### 9.2 Ads (free users only)

- **Where ads appear:**
  - **Native sponsored cards** in Discover, at most one every few profiles, clearly labelled.
  - **Rewarded ads**: when someone runs out of free Sparks, they can watch a short ad for 3 more. Viewers choose to watch, and the reward is stated before the ad plays, as AdMob's rules require.
- **Where they never appear:** inside a Spark Round, the reveal, chat or the decision screen. Those moments are the product, and an ad there would cost trust.
- **Networks:** Google AdSense on the web now, AdMob once the Android app ships. Dating is allowed on both. Sexual content and "compensated dating" are not, and Heartbeat is responsible for what users post, so ad pages depend on the moderation in §7.
- **Expectations:** Indian ad rates are low (often quoted at 8–12x below the US). TrulyMadly earned ₹53 L from ads against ₹1.95 Cr from paid plans in FY18. Ads are a supporting stream, and "no ads" is itself a reason to buy Heartbeat+.

### 9.3 Affiliate commission (Outfit Planner)

- **Where it shows up:** the Outfit Planner suggests what to wear for a date, with shop links for each piece on Amazon, Myntra, AJIO and Nykaa.
  - **Dating:** after a match, inside "Plan our first date".
  - **Couples:** in the existing Outfit Planner.
- **Amazon:** already tagged with our Associates ID (`heartbeat054-21`). Fashion pays 7–7.5% in the official schedule, with a 24-hour cookie.
- **Myntra, AJIO and Nykaa Fashion:** these pay through affiliate networks (e.g. Cuelinks, where Myntra pays 3.75–7.5%). Set `VITE_AFFILIATE_WRAP` to the network's deep-link prefix and those links start earning. Code: `src/lib/shopping.js`.
- **Also worth joining:** Flipkart Affiliate (8% on fashion, direct) and Nykaa's own programme (8%).
- **Rules:**
  - **Disclosure:** every shopping card already says the links may earn a commission.
  - **Apps:** Amazon requires apps to be approved and forbids loading Amazon pages inside an in-app browser.
- **Next step:** track outbound clicks (an analytics event per click) so real conversion can replace the model's assumption.
- **Later:** the Date Planner can earn the same way through restaurant and event bookings (e.g. table reservations and tickets) once there's enough volume to sign partners.

### 9.4 What the model assumes (conservative)

| Stream | Key inputs | 18-month net revenue |
|---|---|---|
| Heartbeat+ | 5% of monthly active users pay; 60% on ₹499 monthly, 40% buying two ₹149 weekly passes a month (₹419 per payer), less 18% GST and 2% fees | ₹16.19 L |
| Ads | 60 native impressions at ₹15 per 1,000 + 4 rewarded views at ₹45 per 1,000, per free user per month | ₹0.96 L |
| Affiliate | 15% of users open outfit ideas, 1.5 clicks each, 0.8% buy, ₹1,100 orders, 4% commission | ₹0.08 L |

At the research's mid-case rates, month-18 ad revenue would be about ₹38k a month rather than ₹17k, and affiliate about ₹5k rather than ₹1.3k. Replace all of these with real AdSense, AdMob and network numbers after launch.

---

## 10. Phased roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Foundations** | ✅ AI removed. Add `firestore.rules`; auth on `/api/*`; split `App.jsx`; `useGameSession` for WYR, Q&A, Compat; move content to `public/content/*.json` with ids | Couples app works the same; rules deployed |
| **1. Content sprint** (runs alongside 1–3) | Guess Me multiple-choice bank; grow WYR, Compat, and NHIE toward the beta targets; Hinglish packs | Beta targets in §3.2 met |
| **2. Profiles** | Mode picker, dating profile, photo upload and review queue, 18+ gate, admin page | A user can create a profile and it goes live after approval |
| **3. Spark loop** | Discover (full photos), send and accept Sparks, Spark Round, server reveal, Decide, limits and expiry, pushes | Two accounts can go from discover to match with no client-side leaks |
| **4. Matches and safety** | Chat, unmatch, block, report, blocklist filter, contact-info detection, selfie verification, first-date planner | Ready for a closed beta |
| **5. Closed beta (one city)** | 200–500 invited users | Web exit criteria below |
| **6. Graduation and premium** | "We're official" → room; Heartbeat+ dating tier on Razorpay | — |
| **7. Android** | See below | Live on Play Store |

### When the web app is "good enough" for Android

Move to Android once the beta shows, for at least 4 weeks in a row:
- Round completion (both finished ÷ accepted) **≥ 60%**
- Mutual match rate that's stable or rising week over week
- **D7 retention ≥ 25%** for new users
- No P0 safety issues open, and the report queue cleared within 24h
- Fewer than 1% of sessions hitting a JS error (add free Sentry or Firebase Crashlytics for web)

### Android plan

1. **Trusted Web Activity first** (with Bubblewrap). This wraps the existing PWA as a Play Store app with almost no new code,
   and gets you onto the store quickly.
2. **Capacitor next**, if you need native features (camera for selfie verification, reliable FCM push, deep links).
   It reuses the same React code. A React Native rewrite is only worth it if performance becomes a real problem.
3. **Play Store requirements to prepare:** Data safety form, in-app **and** web account deletion (the existing
   `DeleteAccountButton` plus a web page), content rating questionnaire, privacy policy URL, and the current target API level.

---

## 11. Running costs (no AI)

| Service | Beta (≤500 users) | Notes |
|---|---|---|
| Firebase (Firestore, Auth, FCM) | Free to a few hundred ₹/month | Move to the Blaze plan with a budget alert. Discover reads are the main cost |
| Vercel | Check the plan | The Hobby tier is for non-commercial use. Once you take payments, budget for Pro or move the API to Cloudflare Workers' free tier |
| Cloudinary | Free tier | Watch storage as photos grow. Use transformations so you never serve originals |
| Razorpay | Per-transaction fee only | — |
| Domain and email | Small yearly cost | — |

## 12. Metrics

- Spark accept rate
- Round completion rate. If this is low, rounds are too long.
- Mutual match rate
- Conversations that pass 10 messages
- Days from match to a planned first date
- **Graduation rate** (matches → couple rooms)
- Inbound Spark load by gender, which shows whether the caps are working

## 13. Open decisions

1. **Launch city**: Bengaluru or Pune (or your own city, if you can seed it in person).
2. **Keep couples signups open?** Recommended: yes. They pay today and they're where matches end up.
3. **Content language default**: English with a Hinglish option, or Hinglish first?

---

## Appendix: remaining issues in the current code

- **Old Anthropic key.** `.env` was never pushed to GitHub, but older builds called Anthropic straight from the browser
  with `VITE_ANTHROPIC_KEY`, so any deployed bundle from that time exposed the key. Delete it in the Anthropic console.
- **No `firestore.rules` in the repo.** `joinRoom` writes `pendingJoinUid` before checking the room exists.
- **The room document keeps growing.** Move per-day game state to `rooms/{id}/games/{key}`.
- **Rotation repeats every year.** `getDailyQuestion` and `getDailyWYR` use day-of-year, so the sequence restarts every 1 January.
- **Lint.** ESLint already reported 76 problems in `App.jsx` and `content.js` before this change, mostly unused variables. This change brings it to 68.
