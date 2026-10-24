# Heartbeat: investor prep

Everything for an angel round, in one place.

| Item | Where |
|---|---|
| Pitch deck (15 slides, speaker notes included) | https://claude.ai/artifact/3UgaGjufdwWJDSwmd4euV6 (private until you share it) |
| Live demo | `[your-domain]/?demo` once this branch is deployed. Locally: `npm run dev`, then open `http://localhost:5173/?demo` |
| Financial model | [Heartbeat_Financial_Model.xlsx](Heartbeat_Financial_Model.xlsx) |
| Product plan | [../DATING_PLAN.md](../DATING_PLAN.md) |
| Market research and sources | [MARKET_RESEARCH.md](MARKET_RESEARCH.md) |

## Fill these in before sending anything

- [ ] Your name, a two-line background, email and phone (cover, team and closing slides)
- [ ] The demo URL (demo and closing slides)
- [ ] Round instrument and terms, e.g. iSAFE or CCPS, plus a valuation cap (ask slide). Get a CA or lawyer to advise.
- [ ] One or two advisors (team slide). This is the single biggest improvement to a solo-founder deck.
- [ ] Waitlist numbers, if you have any by then (progress slide). Real demand beats every other slide.

## Questions investors will ask

**Why would people play a game with a stranger instead of swiping?**
A like carries no information, so most chats die after "hi". A five-minute round gives both people a real signal and something to talk about. Hinge's growth shows people reward more signal: paying users grew 17% in Q4 2025 while Match Group's total fell 5%. The closed beta is designed to test this directly. The key number is the share of accepted rounds both people finish, with a target of at least 60%.

**Isn't it slower than swiping?**
Yes, on purpose. Rounds are asynchronous and take about five minutes, so nobody has to be online at the same time. Fewer, better matches is the product. Daily Spark limits also stop the spray-and-pray behaviour that floods women's inboxes.

**What stops Tinder or Hinge from copying it?**
A feature is easy to copy. A brand and a habit built around play are harder. Two things matter most:
- **The couples app:** it's already built. No swipe app is designed to keep users after they match.
- **The content library:** 600+ hand-written questions, with English and Hinglish packs planned. It takes time and taste to build, and it improves with usage data.

**How do you handle the gender ratio and women's safety?**
Women are about 26% of users on Indian platforms (Redseer, 2025). The design responds directly:
- **Limits:** caps on incoming Sparks.
- **Silent passes:** nobody learns they were passed.
- **Photo review:** every photo is checked before it goes live.
- **Selfie verification.**
- **Chat warnings:** phone numbers, UPI IDs and Instagram handles are flagged in early chats.
- **Women invited first** during the beta.

A dedicated community and safety lead is the second hire.

**Why India, and why Bengaluru first?**
- **India:** a large market growing 12–14% a year (Redseer), and Hinge's #2 market by downloads.
- **Bengaluru:** young, English plus Hinglish speaking, and an early adopter of dating apps.
- **One city:** dating apps depend on having enough people nearby, so concentrating in one city is the only way to make the experience good early.

**How do you make money?**
Three streams, all without AI costs:
1. **Heartbeat+ subscription (the core).** ₹149 a week or ₹499 a month (₹1,299 for 3 months), paid by UPI through Razorpay, which already works in the couples app. The model assumes 5% of monthly active users pay, the low end of Redseer's 5–15% range.
2. **Ads, for free users only.** Labelled sponsored cards in Discover, and an optional "watch an ad for 3 more Sparks". There are never ads inside rounds, reveals or chats. "No ads" is also a Heartbeat+ perk.
3. **Affiliate commission.** The Outfit Planner suggests what to wear on a date, with shop links to Amazon (already tagged with our Associates ID), Myntra, AJIO and Nykaa. Fashion commissions run about 4–8% after network cuts.

Over 18 months the conservative model has Heartbeat+ at ₹16.2 L, ads at ₹1.0 L and affiliate at ₹0.08 L. Indian ad rates are low, so subscriptions do the heavy lifting and the other two add margin. Each grows with users, and both get better once the Android app opens up AdMob and in-app shopping.

**Why ₹499 a month?**
It's priced against what Indians already pay for dating apps (App Store India, October 2026):
- **Below the premium apps:** Bumble Premium is ₹799 a month and Hinge+ ₹1,199.
- **Above the budget end:** QuackQuack tests ₹299–589.
- **Weekly entry point:** ₹149 a week sits between Aisle and Happn's ₹99 and Bumble's ₹279–399.

The model still assumes only 5% of monthly users pay, the low end of the 5–15% Redseer reports at market prices. Prices will be tested by cohort in the beta.

**Won't ads make it feel cheap?**
Only free users see them. They never appear during a game or a conversation, and rewarded ads only play when someone chooses to watch one. TrulyMadly and Aisle both run ads in India alongside paid plans.

**Why no AI?**
- **Cost:** AI would add a running cost to every round.
- **Quality:** curated questions are more consistent.
- **Safety:** nothing generated reaches strangers unchecked.

AI could come back later for things like moderation once revenue covers it, but the product doesn't depend on it.

**You're a solo founder. What's the risk?**
The risk is real. The answer is what's already shipped alone: the couples app, payments and the dating demo. The round funds a full-stack developer from month 1 and a safety lead from month 4. The plan is to add advisors before the round closes.

**Aren't the couples app and the dating app two products?**
They share one codebase, one set of games and one brand. Dating is the acquisition engine, and couples is the retention engine. Couples signups stay open because they pay today.

**What are the biggest risks?**
- **Liquidity:** not enough people nearby. The fix is one city, a waitlist and invite-only growth.
- **Round completion:** people may not finish rounds. The fix is short async rounds, nudges and a 48-hour expiry.
- **Content running out:** the fix is per-user tracking of what each person has seen, plus a content writer.
- **Moderation load:** the fix is a manual review queue at beta scale and a safety hire.
- **Regulation:** the work needed is DPDP Act consent and deletion, a grievance officer under the IT Rules 2021, and an 18+ gate. These are budgeted in legal.

**How long does ₹75 lakh last, and what's next?**
About 18 months. The model leaves about ₹22 lakh at month 18. The goal is a seed round once the beta shows round completion of at least 60%, week-1 retention of at least 25%, and at least 5% of users paying.

## Data room checklist

**Company**
- [ ] Certificate of incorporation, PAN, GST registration (if applicable)
- [ ] Cap table, before and after the round
- [ ] Founder agreement, and **IP assignment of all Heartbeat code and brand to the company**. Investors will check this.
- [ ] Bank account in the company's name

**Product**
- [ ] Deck, demo link and product plan
- [ ] Privacy policy and terms updated for dating (`public/privacy.html`, `public/terms.html`)
- [ ] **Trademark search for "Heartbeat"** in the dating and app classes. It's a common name, so check before investing in the brand.

**Numbers**
- [ ] Financial model
- [ ] Waitlist or usage numbers, with dates

**Security**
- [ ] Confirm old API keys are revoked (the deleted Anthropic key, and the Razorpay secret if it was ever shared)
