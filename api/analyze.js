const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Helper function to extract domain name
function getDomain(urlStr) {
  try {
    return new URL(urlStr).hostname.replace('www.', '');
  } catch { return urlStr; }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST request" });

  const { url, api_key } = req.body;
  if (!url || !api_key) return res.status(400).json({ error: "Missing 'url' or 'api_key'." });

  try {
    // 1. Token Check
    const { data: user, error: dbError } = await supabase.from("users").select("tokens_remaining").eq("api_key", api_key).single();
    if (dbError || !user) return res.status(401).json({ error: "Invalid API Key." });
    if (user.tokens_remaining <= 0) return res.status(403).json({ error: "Trial limit reached." });

    // 2. Fetch Website Text
    const jinaUrl = "https://r.jina.ai/" + url;
    const jinaResponse = await axios.get(jinaUrl, { timeout: 15000, headers: { 'Accept': 'text/plain' } });
    let websiteText = jinaResponse.data.replace(/\s+/g, " ").trim().substring(0, 5000);

    // 3. Detect Tools & Tracking (Raw HTML check)
    let techStack = "Could not detect tools.";
    try {
      const rawHtml = await axios.get(url, { timeout: 10000 });
      const htmlText = rawHtml.data;
      let detected = [];
      if (htmlText.includes('gtag') || htmlText.includes('google-analytics')) detected.push("Google Analytics");
      if (htmlText.includes('fbq') || htmlText.includes('facebook.net')) detected.push("Meta Pixel (Facebook Ads)");
      if (htmlText.includes('hubspot')) detected.push("Hubspot CRM");
      if (htmlText.includes('hs-scripts')) detected.push("Hubspot Tracking");
      if (htmlText.includes('clarity.ms')) detected.push("Microsoft Clarity");
      if (htmlText.includes('hotjar')) detected.push("Hotjar");
      if (htmlText.includes('googleads.g.doubleclick.net')) detected.push("Google Ads Tracking");
      techStack = detected.length > 0 ? detected.join(', ') : "No major ad or tracking tools found. They are likely flying blind.";
    } catch(e) { console.log("HTML scrape failed"); }

    // 4. Fetch Real Reviews (Trustpilot)
    let reviewText = "No Trustpilot reviews found.";
    try {
      const domain = getDomain(url);
      const trustpilotUrl = "https://r.jina.ai/https://www.trustpilot.com/review/" + domain;
      const reviewRes = await axios.get(trustpilotUrl, { timeout: 10000 });
      reviewText = reviewRes.data.replace(/\s+/g, " ").trim().substring(0, 1500);
    } catch(e) { console.log("Trustpilot scrape failed"); }

    // 5. Check Past History (Supabase Reports Table)
    const { data: history } = await supabase.from("reports").select("report_data, created_at").eq("url", url).order("created_at", { ascending: false }).limit(1);
    let historyText = "No past history found. This is the first report.";
    if (history && history.length > 0) {
      historyText = JSON.stringify(history[0].report_data);
    }

    // 6. Fetch Speed Data
    let speedData = "Speed data unavailable";
    try {
      const speedUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${url}&strategy=mobile`;
      const speedResponse = await axios.get(speedUrl, { timeout: 15000 });
      const lighthouse = speedResponse.data.lighthouseResult;
      const perf = lighthouse.categories.performance.score * 100;
      const seo = lighthouse.categories.seo.score * 100;
      speedData = `Mobile Performance: ${perf}/100. Mobile SEO: ${seo}/100.`;
    } catch (e) { console.log("Speed API failed"); }

    // 7. Elite AI Prompt (With Trends, Reviews, Tech Stack)
const model = genAI.getGenerativeModel({
  model: "gemini-3.6-flash",
  generationConfig: { responseMimeType: "application/json" }
});

const prompt = `You are an elite B2B Growth Hacker. 
... 
    Analyze this website text, review data, tech stack, and past history.
    Return JSON with these exact keys:
    - "executive_summary": (1 paragraph summary)
    - "tech_stack_analysis": (Analyze this detected tech: ${techStack}. Are they running ads? Do they have tracking?)
    - "review_analysis": (Analyze this review data: ${reviewText}. What is their rating, sentiment, and how often do they get reviews?)
    - "trend_analysis": (Compare current data to past history: ${historyText}. If history exists, highlight what changed. If no history, say 'First baseline report established.')
    - "conversion_bottlenecks": (array of 3 strings)
    - "missing_lead_magnets": (array of 3 strings)
    - "30_day_revenue_action_plan": (array of 3 concrete steps)
    - "technical_audit": (string analyzing speed data: ${speedData})
    
    Website Text: ${websiteText}`;

    const result = await model.generateContent(prompt);
    const aiResponse = JSON.parse(result.response.text());

    // 8. Save this report to Supabase for future trend analysis
    await supabase.from("reports").insert([{ url: url, report_data: aiResponse }]);

    // 9. Deduct Tokens
    const newBalance = user.tokens_remaining - 1500;
    await supabase.from("users").update({ tokens_remaining: newBalance }).eq("api_key", api_key);

    return res.status(200).json({
      success: true,
      brand_dna: aiResponse,
      tokens_remaining: newBalance
    });

  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({ error: "Server Error: " + (error.message || "Unknown") });
  }
};
