# Brand Strategy Intelligence API

Instant, data-backed growth audits for any website — built for agencies and sales teams who need to walk into a pitch already knowing more about a prospect than the prospect's own marketing team does.

Paste a URL. Get back a structured strategic brief grounded in live data: their tech stack, their ad activity, their real review numbers, their site performance, and — uniquely — how all of that has changed since the last time you checked.

---

## What It Is

The Brand Strategy Intelligence API takes a single website URL and returns a complete brand and growth audit as structured JSON. It combines live web scraping, third-party data verification (ad transparency libraries, review platforms, Google PageSpeed), and AI-driven strategic reasoning into one call — replacing what would normally be 30–60 minutes of manual prospect research.

Every report is also stored, which means every repeat analysis includes a trend comparison against the prior report — surfacing real change over time (e.g. "started running Meta ads," "review count up 40 in two months," "dropped their tracking pixel").

## Who It's For

- **Marketing & growth agencies** — instantly qualify and personalize outreach to prospects before a discovery call
- **Sales teams (SDRs/BDRs)** — walk into cold outreach or a first call with specific, defensible talking points
- **Freelance consultants & fractional CMOs** — produce a professional-grade audit deliverable in seconds instead of hours
- **SaaS platforms** — embed prospect intelligence directly into a lead-gen or CRM product via API

## Use Case

A user submits any prospect's website URL. The API:

1. Scrapes the live site content
2. Detects installed marketing/tracking tools (analytics, pixels, CRM, heatmaps)
3. Checks whether the business is actively running ads, verified against Meta Ad Library and Google Ads Transparency Center
4. Pulls verified review data — rating and review count — from Trustpilot's structured data (not AI-guessed sentiment)
5. Runs a live Google PageSpeed technical audit (mobile performance and SEO score)
6. Compares all of the above against the last time this URL was analyzed, if any
7. Feeds every verified data point into an AI reasoning layer to produce a strategic brief

The output is a single structured JSON object ready to drop into a pitch deck, CRM record, or outreach sequence.

## Result

- **Time saved**: manual competitive/prospect research condensed into one API call
- **Sharper outreach**: talking points are grounded in verified facts (real ad activity, real review counts) rather than generic AI speculation
- **A defensible edge**: because every report is saved, this is the only tool that can tell a prospect *"your ad spend doubled in the last two months"* — a claim no one-off scraper or generic AI prompt can make, because it has no memory of the prospect's past state
- **Developer-ready output**: clean, consistent JSON schema designed for direct integration into CRMs, dashboards, or internal tools

## How Advanced It Is

- **Verified-data-first architecture**: ad activity, review numbers, and tech stack are established through direct checks against live sources (Meta Ad Library, Google Ads Transparency Center, Trustpilot's structured schema data, and live HTML inspection) *before* the AI ever sees the data — the AI is used for strategic reasoning on top of facts, not for guessing the facts themselves
- **Structured extraction, not text-scraping guesswork**: review ratings and counts are parsed from schema.org markup, not inferred from free-text page content
- **Persistent trend intelligence**: every report is stored and diffed against the prior one for the same URL, enabling longitudinal insight (ad activity changes, review velocity, rating shifts) that a stateless tool cannot offer
- **Live technical benchmarking**: real-time Google PageSpeed data (mobile performance and SEO scoring) rather than static or cached estimates
- **Resilient by design**: each data source (ads, reviews, tech stack, speed) fails independently and gracefully — a blocked or unavailable source degrades that one section of the report instead of failing the entire analysis
- **Powered by Google's Gemini model** for the strategic reasoning layer, with structured JSON output enforced at the API level for reliable downstream parsing

## Sample Request

```bash
curl -X POST https://your-api-domain.com/api/brand-strategy \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.example.com",
    "api_key": "YOUR_API_KEY"
  }'
```

## Sample Response (abridged)

```json
{
  "success": true,
  "brand_dna": {
    "executive_summary": "...",
    "tech_stack_analysis": "...",
    "review_analysis": "...",
    "trend_analysis": "...",
    "conversion_bottlenecks": ["...", "...", "..."],
    "missing_lead_magnets": ["...", "...", "..."],
    "30_day_revenue_action_plan": ["...", "...", "..."],
    "technical_audit": "..."
  },
  "computed_metrics": {
    "tech_stack": ["..."],
    "ads": { "meta": { "active": true }, "google": { "active": false } },
    "reviews": { "platform": "Trustpilot", "rating": 4.2, "review_count": 341 }
  },
  "trend": {
    "has_history": true,
    "changes": ["Review count moved from 301 to 341 (+40)."]
  },
  "tokens_remaining": 8500
}
```

---

**Note:** Placeholders above (API domain, endpoint path) should be replaced with your actual deployment URL before publishing.
