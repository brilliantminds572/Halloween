#!/usr/bin/env node
// Generates dist/index.html (+ sitemap.xml, robots.txt) from config/site.json and config/products.json.
// No dependencies. Runs on Vercel via `npm run build`.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const env = process.env;

function loadJson(rel) {
  try {
    return JSON.parse(readFileSync(join(root, rel), "utf8"));
  } catch (e) {
    console.error(`\n✖ Could not read ${rel}: ${e.message}\n  Check for a missing comma, quote or bracket.\n`);
    process.exit(1);
  }
}

const site = loadJson("config/site.json");
const catalog = loadJson("config/products.json");
const warnings = [];
const warn = (m) => warnings.push(m);

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const emph = (s) => esc(s).replace(/\*(.+?)\*/g, "<em>$1</em>"); // *word* -> accent color
const jsonLd = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

/* ---------- resolved settings (env vars override JSON) ---------- */
const tag = env.AMAZON_TAG || site.amazon?.tag || "";
const domain = env.AMAZON_DOMAIN || site.amazon?.domain || "www.amazon.com";
const gaId = env.GA_ID || site.analytics?.gaId || "";
const pinTag = env.PINTEREST_TAG_ID || site.analytics?.pinterestTagId || "";
let siteUrl =
  env.SITE_URL ||
  site.seo?.siteUrl ||
  (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
siteUrl = siteUrl.replace(/\/+$/, "");

if (!tag || /YOURTAG/i.test(tag)) {
  warn("Amazon tag is still the placeholder. Set amazon.tag in config/site.json or the AMAZON_TAG env var, or you will NOT earn commission.");
}
if (!siteUrl) warn("No site URL set (seo.siteUrl or SITE_URL). Canonical, sitemap and og:image need it for best SEO.");

const t = {
  bg: "#120b1f", bg2: "#1c1230", card: "#231838", line: "#33224f", ink: "#f6f1ff", mute: "#b9aad6",
  accent: "#ff7a1a", accent2: "#ffa24d", highlight: "#7CFF6B", onAccent: "#1a0d00", buy: "#ffd814", buyText: "#111111",
  ...(site.theme || {}),
};

/* ---------- Amazon compliance: the standard sentence must be present ---------- */
const REQUIRED = "As an Amazon Associate I earn from qualifying purchases";
function withDisclosure(text, label) {
  const s = (text || "").trim();
  if (s.includes(REQUIRED)) return s;
  warn(`${label} was missing Amazon's required sentence, so it was added automatically.`);
  return `${REQUIRED}. ${s}`.trim();
}
const discShort = withDisclosure(site.disclosure?.short, "disclosure.short");
const discLong = withDisclosure(site.disclosure?.long, "disclosure.long");

/* ---------- product links ---------- */
function productLink(p) {
  const base = `https://${domain}`;
  const url = (p.url || "").trim();
  if (url) return { href: url, kind: "url" };
  const asin = (p.asin || "").trim().toUpperCase();
  if (asin) {
    if (/^[A-Z0-9]{10}$/.test(asin)) {
      return { href: `${base}/dp/${asin}?tag=${encodeURIComponent(tag)}`, kind: "asin" };
    }
    warn(`"${p.name}": ASIN "${p.asin}" is not 10 letters/digits, falling back to search link.`);
  }
  return {
    href: `${base}/s?k=${encodeURIComponent(p.query || p.name)}&tag=${encodeURIComponent(tag)}`,
    kind: "search",
  };
}

const palette = ["#3b1d63", "#4a2a0a", "#0f3b2a", "#5a2a00", "#2a1450", "#1b2a4a", "#4a1a2a", "#3a3a1a"];
const stats = { products: 0, asin: 0, url: 0, search: 0 };
const listItems = [];
let colorIdx = 0;

const categories = (catalog.categories || [])
  .map((c) => ({ ...c, products: (c.products || []).filter((p) => !p.hidden) }))
  .filter((c) => c.products.length);

function card(cat, p) {
  const id = "p-" + slug(p.name);
  const { href, kind } = productLink(p);
  stats.products++; stats[kind]++;
  listItems.push({ name: p.name, id });
  const color = p.color || palette[colorIdx++ % palette.length];
  const art = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.imageAlt || p.name)}" loading="lazy" decoding="async" width="300" height="300">`
    : `<span class="emoji" aria-hidden="true">${esc(p.emoji || cat.emoji || "🎃")}</span>`;
  const badge = p.badge ? `<span class="tag">${esc(p.badge)}</span>` : "";
  const btn = p.button || site.amazon?.buttonText || "Check price on Amazon";
  return `
    <article class="card" id="${id}">
      <div class="art" style="background:linear-gradient(135deg,${esc(color)},var(--bg2))">${badge}${art}</div>
      <div class="body">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description)}</p>
        <a class="buy" href="${esc(href)}" rel="sponsored nofollow noopener" target="_blank" data-name="${esc(p.name)}" data-cat="${esc(cat.id)}">${esc(btn)} →</a>
      </div>
    </article>`;
}

const sections = categories
  .map(
    (c) => `
  <section class="cat" id="cat-${esc(c.id)}" data-cat="${esc(c.id)}">
    <h2>${esc(c.emoji || "")} ${esc(c.title)}</h2>
    ${c.subtitle ? `<p class="sub">${esc(c.subtitle)}</p>` : ""}
    <div class="grid">${c.products.map((p) => card(c, p)).join("")}
    </div>
  </section>`
  )
  .join("\n");

const chips = [
  `<button class="chip" data-f="all" aria-pressed="true">🎃 All</button>`,
  ...categories.map((c) => `<button class="chip" data-f="${esc(c.id)}" aria-pressed="false">${esc(c.emoji || "")} ${esc(c.title)}</button>`),
].join("\n      ");

/* ---------- optional blocks ---------- */
const brand = site.brand || {};
const hero = site.hero || {};
const banner = site.banner || {};
const announce = site.announce || {};
const cd = site.countdown || {};
const pin = site.pinterest || {};
const faq = (site.faq || []).filter((f) => f.q && f.a);
const articles = site.seo?.article || [];

const bannerSrc = banner.image ? (/^https?:/.test(banner.image) ? banner.image : "/" + banner.image.replace(/^\/+/, "")) : "";
if (banner.enabled !== false && banner.image && !/^https?:/.test(banner.image) && !existsSync(join(root, "public", banner.image))) {
  warn(`Banner image public/${banner.image} not found. Put your image there or set banner.enabled to false.`);
}

const ogImageRaw = site.seo?.ogImage || banner.image || "";
const ogImage = ogImageRaw ? (/^https?:/.test(ogImageRaw) ? ogImageRaw : (siteUrl ? `${siteUrl}/${ogImageRaw.replace(/^\/+/, "")}` : "")) : "";

const pinUser = (pin.username || "").trim();
const pinOk = pinUser && !/YOUR/i.test(pinUser);

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${brand.emoji || "🎃"}</text></svg>`;

const ldMain = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: site.seo?.ogTitle || site.seo?.title,
  description: site.seo?.description,
  inLanguage: site.lang || "en",
  ...(siteUrl ? { url: siteUrl + "/" } : {}),
  mainEntity: {
    "@type": "ItemList",
    itemListElement: listItems.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(siteUrl ? { url: `${siteUrl}/#${it.id}` } : {}),
    })),
  },
};
const ldFaq = faq.length
  ? {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    }
  : null;

/* ---------- client script (filters, countdown, tracking) ---------- */
const clientJs = `
(function(){
  var cfg=window.__CFG||{};
  var chips=document.querySelectorAll(".chip"),secs=document.querySelectorAll("section.cat");
  chips.forEach(function(c){c.addEventListener("click",function(){
    chips.forEach(function(x){x.setAttribute("aria-pressed",x===c?"true":"false")});
    var f=c.getAttribute("data-f");
    secs.forEach(function(s){s.hidden=!(f==="all"||s.getAttribute("data-cat")===f)});
  })});
  document.querySelectorAll("a.buy").forEach(function(a){a.addEventListener("click",function(){
    var n=a.getAttribute("data-name")||"";
    if(window.gtag)gtag("event","select_item",{item_name:n,item_category:a.getAttribute("data-cat")||""});
    if(window.pintrk)pintrk("track","custom",{event_name:"amazon_click",product_name:n});
  })});
  var cw=document.getElementById("countwrap");
  if(cw){
    var end=new Date(cw.getAttribute("data-date")).getTime(),iv=null;
    var pad=function(n){return String(n).length<2?"0"+n:String(n)};
    var tick=function(){
      var ms=end-Date.now();
      if(isNaN(ms)||ms<=0){cw.hidden=true;if(iv)clearInterval(iv);return}
      var s=Math.floor(ms/1000),d=Math.floor(s/86400);s%=86400;
      var h=Math.floor(s/3600);s%=3600;var m=Math.floor(s/60);s%=60;
      document.getElementById("cd-d").textContent=d;
      document.getElementById("cd-h").textContent=pad(h);
      document.getElementById("cd-m").textContent=pad(m);
      document.getElementById("cd-s").textContent=pad(s);
    };
    tick();iv=setInterval(tick,1000);
  }
  if(cfg.gaId){
    var g=document.createElement("script");g.async=true;g.src="https://www.googletagmanager.com/gtag/js?id="+cfg.gaId;document.head.appendChild(g);
    window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag("js",new Date());gtag("config",cfg.gaId);
  }
  if(cfg.pinTag){
    !function(){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var n=window.pintrk;n.queue=[];n.version="3.0";var s=document.createElement("script");s.async=true;s.src="https://s.pinimg.com/ct/core.js";var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(s,r)}}();
    pintrk("load",cfg.pinTag);pintrk("page");
  }
})();`;

/* ---------- HTML ---------- */
const html = `<!doctype html>
<html lang="${esc(site.lang || "en")}" dir="${esc(site.dir || "ltr")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(site.seo?.title)}</title>
<meta name="description" content="${esc(site.seo?.description)}">
${siteUrl ? `<link rel="canonical" href="${esc(siteUrl)}/">` : ""}
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="theme-color" content="${esc(t.bg)}">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(faviconSvg)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(site.seo?.ogTitle || site.seo?.title)}">
<meta property="og:description" content="${esc(site.seo?.ogDescription || site.seo?.description)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n<meta property="og:image:width" content="${esc(banner.width || 1200)}">\n<meta property="og:image:height" content="${esc(banner.height || 630)}">\n<meta name="twitter:image" content="${esc(ogImage)}">` : ""}
${siteUrl ? `<meta property="og:url" content="${esc(siteUrl)}/">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="pinterest-rich-pin" content="true">
${pin.verifyCode ? `<meta name="p:domain_verify" content="${esc(pin.verifyCode)}">` : ""}
${banner.enabled !== false && bannerSrc ? `<link rel="preload" as="image" href="${esc(bannerSrc)}" fetchpriority="high">` : ""}
<script type="application/ld+json">${jsonLd(ldMain)}</script>
${ldFaq ? `<script type="application/ld+json">${jsonLd(ldFaq)}</script>` : ""}
<style>
:root{--bg:${t.bg};--bg2:${t.bg2};--card:${t.card};--line:${t.line};--ink:${t.ink};--mute:${t.mute};--orange:${t.accent};--orange2:${t.accent2};--green:${t.highlight};--on:${t.onAccent};--buy:${t.buy};--buytext:${t.buyText};--r:18px}
*{box-sizing:border-box;margin:0}
html{scroll-behavior:smooth;scroll-padding-top:120px}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:radial-gradient(1200px 600px at 80% -10%,color-mix(in srgb,var(--orange) 14%,var(--bg2)) 0%,transparent 60%),var(--bg);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit}
[hidden]{display:none!important}
.wrap{max-width:1100px;margin:0 auto;padding:0 16px}
.announce{background:linear-gradient(90deg,color-mix(in srgb,var(--orange) 70%,#000),var(--orange),color-mix(in srgb,var(--orange) 70%,#000));color:var(--on);font-size:14px;font-weight:700;text-align:center;padding:10px 12px}
.announce .sep{opacity:.6}
header{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:56px}
.logo{font-weight:800;letter-spacing:.3px}
.logo span{color:var(--orange)}
header a.cta{background:var(--orange);color:var(--on);font-weight:700;font-size:14px;padding:8px 14px;border-radius:999px;text-decoration:none}
.hero{padding:16px 0 28px;text-align:center;position:relative;overflow:hidden}
.moon{position:absolute;right:-60px;top:-60px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff7d6,#ffd36b 55%,#e89b2c);opacity:.9;box-shadow:0 0 120px 30px rgba(255,190,80,.25)}
.banner{display:block;position:relative;margin:0 auto;max-width:1100px;border-radius:22px;overflow:hidden;border:1px solid var(--line);box-shadow:0 20px 60px color-mix(in srgb,var(--orange) 18%,transparent);text-decoration:none}
.banner img{display:block;width:100%;height:auto;aspect-ratio:${esc(banner.width || 1672)}/${esc(banner.height || 940)};object-fit:cover}
.banner-cta{position:absolute;right:14px;bottom:14px;background:linear-gradient(180deg,var(--orange2),var(--orange));color:var(--on);font-weight:800;font-size:14px;padding:10px 16px;border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.45)}
.eyebrow{display:inline-block;margin-top:26px;color:var(--green);font-weight:700;font-size:13px;letter-spacing:.14em;text-transform:uppercase}
h1{font-size:clamp(32px,7vw,58px);line-height:1.05;margin:10px 0 12px;font-weight:900}
h1 em{font-style:normal;background:linear-gradient(90deg,var(--orange),var(--orange2));-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{color:var(--mute);max-width:640px;margin:0 auto 20px;font-size:17px}
.countwrap{margin:18px 0 22px}
.countwrap small.lbl{display:block;color:var(--mute);font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px}
.count{display:flex;gap:10px;justify-content:center}
.count div{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 14px;min-width:68px}
.count b{display:block;font-size:26px;color:var(--orange2);font-variant-numeric:tabular-nums}
.count small{color:var(--mute);font-size:11px;text-transform:uppercase;letter-spacing:.1em}
.btn{display:inline-block;background:linear-gradient(180deg,var(--orange2),var(--orange));color:var(--on);font-weight:800;padding:13px 22px;border-radius:999px;text-decoration:none;box-shadow:0 8px 24px color-mix(in srgb,var(--orange) 35%,transparent)}
.trust{display:flex;flex-wrap:wrap;gap:8px 18px;justify-content:center;color:var(--mute);font-size:13px;margin-top:18px}
.filters{position:sticky;top:56px;z-index:15;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(10px);padding:10px 0;border-bottom:1px solid var(--line)}
.chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.chips::-webkit-scrollbar{display:none}
.chip{flex:none;background:var(--card);border:1px solid var(--line);color:var(--ink);padding:8px 14px;border-radius:999px;font-size:14px;cursor:pointer;font-weight:600;font-family:inherit}
.chip[aria-pressed="true"]{background:var(--orange);color:var(--on);border-color:var(--orange)}
.disclose-inline{color:var(--mute);font-size:12.5px;text-align:center;margin:20px 0 0;padding:8px 12px;border:1px dashed var(--line);border-radius:12px}
h2{font-size:26px;margin:34px 0 4px}
.sub{color:var(--mute);margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column;transition:transform .15s,border-color .15s}
.card:hover{transform:translateY(-3px);border-color:var(--orange)}
.art{height:150px;display:grid;place-items:center;position:relative}
.art .emoji{font-size:72px}
.art img{width:100%;height:100%;object-fit:contain;background:#fff}
.tag{position:absolute;top:10px;left:10px;z-index:1;background:color-mix(in srgb,var(--bg) 80%,transparent);color:var(--green);font-size:11px;font-weight:700;padding:4px 8px;border-radius:999px}
.body{padding:14px;display:flex;flex-direction:column;gap:8px;flex:1}
.body h3{font-size:16px;line-height:1.25}
.body p{color:var(--mute);font-size:13.5px;flex:1}
.buy{display:block;text-align:center;background:var(--buy);color:var(--buytext);font-weight:800;padding:11px;border-radius:12px;text-decoration:none;font-size:14.5px}
.buy:hover{filter:brightness(.94)}
.how{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:34px}
.how div{background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:16px}
.how b{color:var(--orange2)}
.faq{margin-top:34px}
.faq details{background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-top:10px}
.faq summary{cursor:pointer;font-weight:700}
.faq details p{color:var(--mute);margin-top:8px;font-size:14.5px}
.seo{margin-top:34px}
.seo h2{font-size:20px;margin:22px 0 6px}
.seo p{color:var(--mute);font-size:15px;max-width:780px}
.pin{margin:40px 0;background:linear-gradient(135deg,var(--bg2),var(--card));border:1px solid var(--line);border-radius:22px;padding:26px;text-align:center}
.pin h2{margin-top:0}
.pin .btn{margin-top:14px}
footer{border-top:1px solid var(--line);padding:26px 0 90px;color:var(--mute);font-size:12.5px;text-align:center}
footer p{max-width:760px;margin:6px auto}
footer nav{margin:10px 0}
footer nav a{margin:0 8px}
.sticky{position:fixed;left:12px;right:12px;bottom:12px;z-index:30;display:none}
@media(max-width:640px){.announce{font-size:13px}.hide-sm,.announce .sep{display:none}.sticky{display:block}.sticky .btn{display:block;text-align:center}.moon{width:160px;height:160px}}
@media(prefers-reduced-motion:no-preference){.bat{display:inline-block;animation:fly 3s ease-in-out infinite}@keyframes fly{50%{transform:translateY(-6px) rotate(-6deg)}}}
</style>
</head>
<body>

${announce.enabled !== false && announce.headline ? `<div class="announce"><strong>${esc(announce.headline)}</strong>${announce.subline ? `<span class="sep"> · </span><span class="hide-sm">${esc(announce.subline)}</span>` : ""}</div>` : ""}

<header>
  <div class="wrap">
    <div class="logo">${esc(brand.emoji || "")} ${esc(brand.logoText || "")}<span>${esc(brand.logoAccent || "")}</span></div>
    <a class="cta" href="#shop">${esc(brand.headerButton || "Shop picks")}</a>
  </div>
</header>

<section class="hero">
  ${hero.moon !== false ? `<div class="moon" aria-hidden="true"></div>` : ""}
  <div class="wrap" style="position:relative">
    ${banner.enabled !== false && bannerSrc ? `<a class="banner" href="${esc(banner.link || "#shop")}" aria-label="${esc(banner.ctaText || "Shop")}">
      <img src="${esc(bannerSrc)}" width="${esc(banner.width || 1672)}" height="${esc(banner.height || 940)}" fetchpriority="high" decoding="async" alt="${esc(banner.alt || "")}">
      ${banner.ctaText ? `<span class="banner-cta">${esc(banner.ctaText)}</span>` : ""}
    </a>` : ""}
    ${hero.eyebrow ? `<span class="eyebrow">${hero.eyebrow.includes("🦇") ? esc(hero.eyebrow).replace("🦇", `<span class="bat">🦇</span>`) : esc(hero.eyebrow)}</span>` : ""}
    <h1>${emph(hero.headline || site.seo?.title || "")}</h1>
    ${hero.subheadline ? `<p class="lead">${esc(hero.subheadline)}</p>` : ""}
    ${cd.enabled !== false && cd.date ? `<div class="countwrap" id="countwrap" data-date="${esc(cd.date)}">
      ${cd.label ? `<small class="lbl">${esc(cd.label)}</small>` : ""}
      <div class="count" aria-label="Countdown">
        <div><b id="cd-d">--</b><small>Days</small></div>
        <div><b id="cd-h">--</b><small>Hours</small></div>
        <div><b id="cd-m">--</b><small>Mins</small></div>
        <div><b id="cd-s">--</b><small>Secs</small></div>
      </div>
    </div>` : ""}
    <a class="btn" href="${esc(hero.ctaLink || "#shop")}">${esc(hero.ctaText || "Shop now")}</a>
    ${(hero.trust || []).length ? `<div class="trust">${hero.trust.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
  </div>
</section>

<nav class="filters" aria-label="Product categories">
  <div class="wrap">
    <div class="chips" id="chips">
      ${chips}
    </div>
  </div>
</nav>

<main class="wrap" id="shop">
  <p class="disclose-inline">${esc(discShort)}</p>
${sections}

  ${site.howItWorks?.enabled !== false && (site.howItWorks?.items || []).length ? `<div class="how">${site.howItWorks.items.map((i) => `<div><b>${esc(i.title)}</b><br>${esc(i.text)}</div>`).join("")}</div>` : ""}

  ${faq.length ? `<section class="faq" aria-labelledby="faq-h"><h2 id="faq-h">Frequently asked questions</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</section>` : ""}

  ${articles.length ? `<section class="seo">${articles.map((a) => `<h2>${esc(a.heading)}</h2><p>${esc(a.text)}</p>`).join("")}</section>` : ""}

  ${pinOk ? `<div class="pin"><h2>${esc(pin.ctaTitle || "")}</h2><p class="sub" style="margin-bottom:0">${esc(pin.ctaText || "")}</p><a class="btn" href="https://www.pinterest.com/${esc(pinUser)}/" rel="noopener" target="_blank">${esc(pin.buttonText || "Follow on Pinterest")}</a></div>` : ""}
</main>

<footer>
  <div class="wrap">
    ${(site.footer?.links || []).length ? `<nav>${site.footer.links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("")}</nav>` : ""}
    <p><b>${esc(discLong)}</b></p>
    ${site.disclosure?.disclaimer ? `<p>${esc(site.disclosure.disclaimer)}</p>` : ""}
    ${site.footer?.copyright ? `<p>${esc(site.footer.copyright)}</p>` : ""}
  </div>
</footer>

${site.stickyCta?.enabled !== false && site.stickyCta?.text ? `<div class="sticky"><a class="btn" href="${esc(site.stickyCta.link || "#shop")}">${esc(site.stickyCta.text)}</a></div>` : ""}

<script>window.__CFG=${jsonLd({ gaId, pinTag })};</script>
<script>${clientJs}</script>
</body>
</html>
`;

/* ---------- write output ---------- */
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
if (existsSync(join(root, "public"))) cpSync(join(root, "public"), dist, { recursive: true });
writeFileSync(join(dist, "index.html"), html);

const today = new Date().toISOString().slice(0, 10);
if (siteUrl) {
  writeFileSync(
    join(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${esc(siteUrl)}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n</urlset>\n`
  );
}
writeFileSync(join(dist, "robots.txt"), `User-agent: *\nAllow: /\n${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ""}`);

console.log(`\n✔ Built dist/index.html: ${categories.length} categories, ${stats.products} products`);
console.log(`  Links: ${stats.url} custom URL, ${stats.asin} ASIN, ${stats.search} search`);
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} warning(s):`);
  warnings.forEach((w) => console.log("  - " + w));
}
console.log("");
