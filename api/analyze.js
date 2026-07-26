const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const cheerio = require("cheerio");

// Initialize APIs using Vercel Environment Variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  // Allow CORS (so agencies can call this from their own websites)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST request" });

  const { url, api_key, email } = req.body;

  if (!url || !api_key) {
    return res.status(400).json({ error: "Missing 'url' or 'api_key' in request body." });
  }

  try {
    // 1. Check Token Balance in Supabase
    const { data: user, error: dbError } = await supabase
      .from("users")
      .select("tokens_remaining")
      .eq("api_key", api_key)
      .single();

    if (dbError || !user) {
      return res.status(401).json({ error: "Invalid API Key. Visit our site to get a key." });
    }

    if (user.tokens_remaining <= 0) {
      return res.status(403).json({ error: "Trial limit reached. Upgrade to premium for unlimited access." });
    }

  // 2. Scrape the Website URL for Text
    // 2. Fetch clean text from website using Jina AI Reader (Bypasses all blocks)
const jinaUrl = "https://r.jina.ai/" + url;
const response = await axios.get(jinaUrl, { timeout: 30000 });
const websiteText = response.data.replace(/\s+/g, " ").trim().substring(0, 15000);
      
    const $ = cheerio.load(response.data);
    
    // Remove scripts and styles so we only get text
    $("script, style, nav, footer").remove();
    const websiteText = $("body").text().replace(/\s+/g, " ").trim().substring(0, 15000); // Limit to 15k chars to save tokens

    if (!websiteText) {
      return res.status(400).json({ error: "Could not extract text from this URL." });
    }

    // 3. Send to Gemini 1.5 Flash for Brand DNA Analysis
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" } // Forces pure JSON output
    });

    const prompt = `You are a top-tier marketing strategist. Analyze the following website text and extract the Brand DNA. 
    Return a JSON object with the following keys:
    - "tone_of_voice": (string describing their brand voice in 1 sentence)
    - "unique_selling_propositions": (array of 3 strings, things they do better than others)
    - "audience_pain_points": (array of 3 strings, problems their customers have)
    - "missing_content_opportunities": (array of 3 strings, SEO or blog topics they are missing)
    
    Website Text: ${websiteText}`;

    const result = await model.generateContent(prompt);
    const aiResponse = JSON.parse(result.response.text());

    // 4. Deduct Tokens (Rough estimate: 1 token per character processed)
    const tokensUsed = Math.ceil(websiteText.length / 4) + 1000; // output tokens
    const newBalance = user.tokens_remaining - tokensUsed;

    await supabase
      .from("users")
      .update({ tokens_remaining: newBalance })
      .eq("api_key", api_key);

    // 5. Return the Valuable Data to the Agency
    return res.status(200).json({
      success: true,
      brand_dna: aiResponse,
      tokens_remaining: newBalance
    });

  } catch (error) {
    // NOTE: Log the full error so Vercel Runtime Logs show the real cause
    // (e.g. axios status code, Gemini error, etc.) instead of only a generic message.
    console.error("API Error:", error.message);
    return res.status(500).json({
      error: "Failed to analyze website. The site might be blocking scrapers.",
      details: error.message
    });
  }
};
