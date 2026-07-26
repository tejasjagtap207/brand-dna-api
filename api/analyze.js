const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

// Initialize APIs
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST request" });

  const { url, api_key } = req.body;

  if (!url || !api_key) {
    return res.status(400).json({ error: "Missing 'url' or 'api_key' in request body." });
  }

  try {
    // 1. Check Token Balance
    const { data: user, error: dbError } = await supabase
      .from("users")
      .select("tokens_remaining")
      .eq("api_key", api_key)
      .single();

    if (dbError || !user) {
      return res.status(401).json({ error: "Invalid API Key." });
    }

    if (user.tokens_remaining <= 0) {
      return res.status(403).json({ error: "Trial limit reached. Upgrade to premium." });
    }

    // 2. Fetch clean text using Jina AI Reader
    const jinaUrl = "https://r.jina.ai/" + url;
    const jinaResponse = await axios.get(jinaUrl, { 
      timeout: 20000,
      headers: { 'Accept': 'text/plain' }
    });
    
    let websiteText = jinaResponse.data;
    
    if (!websiteText || websiteText.length < 50) {
      return res.status(400).json({ error: "Could not extract enough text from this URL." });
    }
    
    // Truncate to save tokens
    websiteText = websiteText.replace(/\s+/g, " ").trim().substring(0, 12000);

    // 3. Send to Gemini
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
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

    // 4. Deduct Tokens
    const tokensUsed = Math.ceil(websiteText.length / 4) + 1000;
    const newBalance = user.tokens_remaining - tokensUsed;

    await supabase
      .from("users")
      .update({ tokens_remaining: newBalance })
      .eq("api_key", api_key);

    // 5. Return Data
    return res.status(200).json({
      success: true,
      brand_dna: aiResponse,
      tokens_remaining: newBalance
    });

  } catch (error) {
    console.error("API Error:", error.message);
    // Always return JSON so frontend doesn't crash
    return res.status(500).json({ 
      error: "Server error processing the request. It might be a timeout or API issue. Please try again." 
    });
  }
};
