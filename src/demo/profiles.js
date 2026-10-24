// ── DEMO PROFILES ─────────────────────────────────────────────────
// Fictional people for the investor demo. Avatars are DiceBear "Lorelei"
// illustrations (CC0), so no real person's photo is used.
// affinity (0–1) controls how often this profile's simulated answers line up with yours.

const avatar = (seed, bg, extra = "") =>
  `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}${extra}`;

const photos = seed => [
  avatar(seed, "ffd5dc"),
  avatar(seed, "ffdfbf", "&flip=true"),
  avatar(seed, "d1d4f9", "&scale=110"),
];

export const DEMO_PROFILES = [
  {
    id: "meera", name: "Meera", age: 26, gender: "woman", area: "Indiranagar", job: "Product designer",
    verified: true, loveLang: "Quality time", favGames: ["Would You Rather", "Wordle Duel"], affinity: 0.82, dateVibe: "cozy",
    photos: photos("Meera-hb"),
    prompts: [
      { q: "A perfect Sunday is…", a: "Filter coffee, a bookstore, and absolutely no plans." },
      { q: "I'll fall for you if…", a: "You can make me laugh in a voice note." },
      { q: "My most controversial opinion", a: "Pineapple on pizza is elite." },
    ],
    replies: ["Filter coffee is non-negotiable btw", "So… when are we testing that Wordle rivalry in person?"],
  },
  {
    id: "ananya", name: "Ananya", age: 27, gender: "woman", area: "Koramangala", job: "Doctor (resident)",
    verified: true, loveLang: "Acts of service", favGames: ["Compatibility", "Tic Tac Toe"], affinity: 0.58, dateVibe: "foodie",
    photos: photos("Ananya-hb"),
    prompts: [
      { q: "My love language is…", a: "Bringing me food after a 24-hour shift." },
      { q: "Green flag I look for", a: "Someone who's kind to waiters." },
      { q: "Weekend plans usually involve", a: "Sleeping, then a long street-food walk." },
    ],
    replies: ["Street food walk this weekend?", "Tell me your Maggi recipe and I'll judge it"],
  },
  {
    id: "zoya", name: "Zoya", age: 25, gender: "woman", area: "HSR Layout", job: "Startup marketer",
    verified: false, loveLang: "Words of affirmation", favGames: ["Never Have I Ever", "Would You Rather"], affinity: 0.4, dateVibe: "silly",
    photos: photos("Zoya-hb"),
    prompts: [
      { q: "I'm weirdly good at…", a: "Guessing the song in two seconds." },
      { q: "Two truths and a lie", a: "I've met SRK, I can't swim, I've run a marathon." },
      { q: "Let's debate", a: "Mountains are better than beaches." },
    ],
    replies: ["Mountains > beaches, fight me", "Karaoke night as a tiebreaker?"],
  },
  {
    id: "riya", name: "Riya", age: 29, gender: "woman", area: "Jayanagar", job: "Architect",
    verified: true, loveLang: "Quality time", favGames: ["Pictionary", "Compatibility"], affinity: 0.7, dateVibe: "cultural",
    photos: photos("Riya-hb"),
    prompts: [
      { q: "A perfect date is…", a: "An old-city heritage walk, then the best dosa in town." },
      { q: "I geek out about", a: "Buildings nobody else notices." },
      { q: "You should leave a comment if…", a: "You have opinions about Bengaluru's best bakery." },
    ],
    replies: ["Heritage walk this Saturday?", "Okay which bakery though, this matters"],
  },
  {
    id: "arjun", name: "Arjun", age: 28, gender: "man", area: "Whitefield", job: "Software engineer",
    verified: true, loveLang: "Quality time", favGames: ["Wordle Duel", "Tic Tac Toe"], affinity: 0.8, dateVibe: "adventurous",
    photos: photos("Arjun-hb"),
    prompts: [
      { q: "A perfect Sunday is…", a: "Nandi Hills at sunrise, then a very long nap." },
      { q: "I'll fall for you if…", a: "You beat me at Wordle. It hasn't happened yet." },
      { q: "My simple pleasures", a: "Rain, chai, and an old Kishore Kumar playlist." },
    ],
    replies: ["Nandi Hills sunrise, you in?", "Wordle rematch, loser buys chai"],
  },
  {
    id: "kabir", name: "Kabir", age: 27, gender: "man", area: "Indiranagar", job: "Chef",
    verified: true, loveLang: "Receiving gifts", favGames: ["Would You Rather", "Never Have I Ever"], affinity: 0.62, dateVibe: "foodie",
    photos: photos("Kabir-hb"),
    prompts: [
      { q: "The way to win me over is…", a: "Tell me the best thing you've ever eaten. In detail." },
      { q: "I'm overly competitive about", a: "Biryani. Hyderabadi, obviously." },
      { q: "Typical Sunday", a: "Farmers' market, then cooking for way too many friends." },
    ],
    replies: ["I'm making biryani this weekend, just saying", "Okay what's the best thing you've ever eaten?"],
  },
  {
    id: "rohan", name: "Rohan", age: 30, gender: "man", area: "Malleshwaram", job: "Teacher",
    verified: false, loveLang: "Words of affirmation", favGames: ["Compatibility", "Pictionary"], affinity: 0.45, dateVibe: "cozy",
    photos: photos("Rohan-hb"),
    prompts: [
      { q: "Green flag I look for", a: "You still read physical books." },
      { q: "I'm convinced that", a: "Every problem is smaller after a good meal." },
      { q: "My friends describe me as", a: "The one who remembers everyone's birthday." },
    ],
    replies: ["Okay, important question: what are you reading right now?", "I have a bookstore recommendation for you"],
  },
  {
    id: "vikram", name: "Vikram", age: 29, gender: "man", area: "Bellandur", job: "Product manager",
    verified: true, loveLang: "Acts of service", favGames: ["Would You Rather", "Wordle Duel"], affinity: 0.72, dateVibe: "romantic",
    photos: photos("Vikram-hb"),
    prompts: [
      { q: "My most irrational fear", a: "Running out of phone battery in a new city." },
      { q: "Together, we could", a: "Finally finish a 1000-piece jigsaw." },
      { q: "Best travel story", a: "Missed a train in Kerala, found the best beach of my life." },
    ],
    replies: ["Rooftop dinner sometime this week?", "How's your jigsaw patience level?"],
  },
];

export function profilesFor(showMe) {
  if (showMe === "women") return DEMO_PROFILES.filter(p => p.gender === "woman");
  if (showMe === "men") return DEMO_PROFILES.filter(p => p.gender === "man");
  return DEMO_PROFILES;
}
