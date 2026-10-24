// ── SHOPPING LINKS ─────────────────────────────────────────────────
// Amazon links carry our Associates tag. Other stores pay commission through an affiliate
// network: set VITE_AFFILIATE_WRAP to the network's deep-link prefix (the store URL is
// appended, encoded) and those links start earning too. Unset, they're plain links.
export const AMAZON_TAG = "heartbeat054-21";
const AFFILIATE_WRAP = import.meta.env.VITE_AFFILIATE_WRAP || "";
const viaNetwork = url => AFFILIATE_WRAP ? AFFILIATE_WRAP + encodeURIComponent(url) : url;

export const PLATFORMS_INDIA = [
  {name:"Amazon",color:"#FF9900",bg:"rgba(255,153,0,0.10)",bd:"rgba(255,153,0,0.25)",getUrl:(query)=>`https://www.amazon.in/s?k=${encodeURIComponent(query)}&tag=${AMAZON_TAG}`,logo:"A"},
  {name:"Myntra",color:"#FF3F6C",bg:"rgba(255,63,108,0.08)",bd:"rgba(255,63,108,0.20)",getUrl:(query)=>viaNetwork(`https://www.myntra.com/${encodeURIComponent(query.split(" ").join("-"))}`),logo:"M"},
  {name:"Ajio",color:"#001845",bg:"rgba(0,24,69,0.06)",bd:"rgba(0,24,69,0.15)",getUrl:(query)=>viaNetwork(`https://www.ajio.com/search/?text=${encodeURIComponent(query)}`),logo:"Aj"},
  {name:"Nykaa",color:"#FC2779",bg:"rgba(252,39,121,0.08)",bd:"rgba(252,39,121,0.20)",getUrl:(query)=>viaNetwork(`https://www.nykaafashion.com/search?q=${encodeURIComponent(query)}`),logo:"N"},
];

export const PLATFORMS_INTL = [
  {name:"Amazon",color:"#FF9900",bg:"rgba(255,153,0,0.10)",bd:"rgba(255,153,0,0.25)",getUrl:(query)=>`https://www.amazon.com/s?k=${encodeURIComponent(query)}&tag=${AMAZON_TAG}`,logo:"A"},
  {name:"ASOS",color:"#2D2D2D",bg:"rgba(45,45,45,0.06)",bd:"rgba(45,45,45,0.15)",getUrl:(query)=>`https://www.asos.com/search/?q=${encodeURIComponent(query)}`,logo:"AS"},
  {name:"H&M",color:"#E50010",bg:"rgba(229,0,16,0.06)",bd:"rgba(229,0,16,0.15)",getUrl:(query)=>`https://www2.hm.com/en_gb/search-results.html?q=${encodeURIComponent(query)}`,logo:"H"},
  {name:"Zara",color:"#1A1A1A",bg:"rgba(26,26,26,0.06)",bd:"rgba(26,26,26,0.15)",getUrl:(query)=>`https://www.zara.com/us/en/search?searchTerm=${encodeURIComponent(query)}`,logo:"Z"},
];
