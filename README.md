# Halloween Affiliate Landing Page (Amazon Associates + Pinterest)

A fast, static, SEO-friendly landing page. **You only edit two JSON files.** Vercel builds and hosts it for free.

```
config/site.json       <- all text, SEO, colors, hero, countdown, FAQ, tracking IDs
config/products.json   <- categories and products (add / remove / reorder)
public/                <- images (halloween-hero.jpg is already here)
build.mjs              <- generates the page (no need to touch)
vercel.json            <- Vercel settings (no need to touch)
```

## 1. Make it yours (5 minutes)

**config/site.json**
- `amazon.tag`: your Associates tracking ID (e.g. `jawad-20`). *Without this you earn nothing.*
- `seo.siteUrl`: your final URL, e.g. `https://spooky-finds.vercel.app` (fixes canonical, sitemap, social preview)
- `pinterest.username` and `pinterest.verifyCode`: shows a Follow button and claims your domain
- `analytics.gaId` / `analytics.pinterestTagId`: optional tracking
- `theme`: change any color. `hero`, `announce`, `countdown`, `faq`, `seo.article`: all text is editable
- Turn sections off with `"enabled": false` (banner, announce bar, countdown, how it works, sticky button)
- Use `*word*` in `hero.headline` to color a word with your accent color

**config/products.json**: for each product set ONE link type (first found wins):

| Field | Example | Notes |
|-------|---------|-------|
| `url`   | `https://amzn.to/3abcXYZ` | SiteStripe short link, used exactly as given |
| `asin`  | `B0XXXXXXXX` | 10 characters after `/dp/`. Your tag is added automatically |
| `query` | `halloween led candles` | Opens Amazon search with your tag (works with no ASIN) |

Other optional fields: `image` (file in `public/` or full URL), `badge`, `emoji`, `color`, `button`, `hidden: true`.
To add a product, copy any product block and paste it in a category. To add a category, copy a whole category block.

## 2. Preview locally (optional)

```bash
npm run build      # creates dist/
npm run dev        # builds and serves at http://localhost:3000
```
The build prints warnings (placeholder tag, bad ASIN, missing image).

## 3. Deploy on Vercel (free)

**Option A: GitHub (recommended, auto-redeploys on every edit)**
1. Create a GitHub repo and upload this folder (the contents, with `package.json` at the top level).
2. Go to vercel.com/new, import the repo, and click **Deploy**. Settings are read from `vercel.json`.
3. Edit a JSON file on GitHub and Vercel redeploys within a minute.

**Option B: Vercel CLI**
```bash
npm i -g vercel
vercel          # first deploy (preview)
vercel --prod   # production
```

**Change settings without editing files:** Vercel project > Settings > Environment Variables. These override the JSON:
`AMAZON_TAG`, `SITE_URL`, `AMAZON_DOMAIN`, `GA_ID`, `PINTEREST_TAG_ID`. Redeploy after changing them.
If you do not set `SITE_URL`, the build falls back to your Vercel production domain automatically.

## 4. Connect Pinterest and Amazon
1. Add your live domain in Amazon Associates: Account Settings > Manage Your Websites.
2. Claim the site in Pinterest (Settings > Claimed accounts), paste the code into `pinterest.verifyCode`, redeploy.
3. Point your pins' destination link at your page. Add `?utm_source=pinterest&utm_campaign=halloween` to track traffic.
4. Submit `https://YOUR-DOMAIN/sitemap.xml` in Google Search Console.
5. Optional: add a custom domain in Vercel > Settings > Domains, then update `seo.siteUrl`.

## Amazon rules to keep in mind
- Keep the "As an Amazon Associate I earn from qualifying purchases" sentence. The build adds it back automatically if you delete it.
- Do not show prices or star ratings you typed by hand; send people to Amazon for live prices.
- Do not use Amazon product images without the SiteStripe/Product Advertising API terms. Emoji art is the safe default.
- Associates accounts need qualifying sales within 180 days of signup, so start driving traffic early.
- Check that you have rights to any image you use commercially, especially images showing people.

## Reuse for other seasons
Replace the text in `config/site.json` and the products in `config/products.json`. Nothing else changes.
