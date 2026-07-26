const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST request" });

  const { url, api_key } = req.body;
  if (!url || !api_key) return res.status(400).json({ error: "Missing 'url' or 'api_key'." });

  try {
    // 1. Check Token Balance
    const { data: user, error: dbError } = await supabase
      .from("users")
      .select("tokens_remaining")
      .eq("api_key", api_key)
      .single();
    if (dbError || !user) return res.status(401).json({ error: "Invalid API Key." });
    if (user.tokens_remaining <= 0) return res.status(403).json({ error: "Trial limit reached." });

    // 2. Fetch Website Text (Jina AI Reader)
    const jinaUrl = "https://r.jina.ai/" + url;
    const jinaResponse = await axios.get(jinaUrl, { timeout: 20000, headers: { 'Accept': 'text/plain' } });
    let websiteText = jinaResponse.data.replace(/\s+/g, " ").trim().substring(0, 5000);

    // 3. Fetch Real Data (Google PageSpeed API - free, no key required for light use)
    let speedData = "Speed data unavailable";
    try {
      const speedUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile`;
      const speedResponse = await axios.get(speedUrl, { timeout: 25000 });
      const lighthouse = speedResponse.data.lighthouseResult;
      const performanceScore = lighthouse.categories.performance.score * 100;
      const seoScore = lighthouse.categories.seo.score * 100;
      speedData = `Mobile Performance Score: ${performanceScore}/100. Mobile SEO Score: ${seoScore}/100.`;
    } catch (e) {
      console.log("Speed API failed:", e.message);
    }

    // 4. Send to Gemini for Analysis
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash-lite",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `You are a top-tier B2B Marketing Strategist. Analyze this website text and real speed data. 
    Return a JSON object with these exact keys:
    - "executive_summary": (1 paragraph summary of the brand's current positioning)
    - "tone_of_voice": (string describing their brand voice)
    - "unique_selling_propositions": (array of 3 strings)
    - "audience_pain_points": (array of 3 strings)
    - "competitor_benchmarking": (array of 3 objects, each with "competitor_name", "their_advantage", and "how_to_beat_them")
    - "missing_content_opportunities": (array of 3 strings for SEO)
    - "technical_audit": (string analyzing the provided speed data: ${speedData})
    
    Website Text: ${websiteText}`;

    const result = await model.generateContent(prompt);
    const aiResponse = JSON.parse(result.response.text());

    // 5. Deduct Tokens
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
