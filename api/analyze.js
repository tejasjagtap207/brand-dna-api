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

  if (!url || !api_key) {
    return res.status(400).json({ error: "Missing 'url' or 'api_key'." });
  }

  try {
    // 1. Check Token Balance
    const { data: user, error: dbError } = await supabase
      .from("users")
      .select("tokens_remaining")
      .eq("api_key", api_key)
      .single();

    if (dbError || !user) return res.status(401).json({ error: "Invalid API Key." });
    if (user.tokens_remaining <= 0) return res.status(403).json({ error: "Trial limit reached." });

    // 2. Fetch clean text using Jina AI Reader (Fast timeout)
    const jinaUrl = "https://r.jina.ai/" + url;
    const jinaResponse = await axios.get(jinaUrl, { 
      timeout: 15000,
      headers: { 'Accept': 'text/plain' }
    });
    
    let websiteText = jinaResponse.data;
    if (!websiteText || websiteText.length < 50) {
      return res.status(400).json({ error: "Could not extract enough text." });
    }
    
    // 3. Text ko 5000 characters tak limit karenge taaki Gemini fast reply de
    websiteText = websiteText.replace(/\s+/g, " ").trim().substring(0, 5000);

    // 4. Send to Gemini 1.5 Flash
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Analyze this website text. Return JSON with keys: "tone_of_voice" (string), "unique_selling_propositions" (array of 3 strings), "audience_pain_points" (array of 3 strings), "missing_content_opportunities" (array of 3 strings). Text: ${websiteText}`;

    const result = await model.generateContent(prompt);
    const aiResponse = JSON.parse(result.response.text());

    // 5. Deduct Tokens
    const tokensUsed = 1500; // Fixed token deduction for fast processing
    const newBalance = user.tokens_remaining - tokensUsed;

    await supabase
      .from("users")
      .update({ tokens_remaining: newBalance })
      .eq("api_key", api_key);

    return res.status(200).json({
      success: true,
      brand_dna: aiResponse,
      tokens_remaining: newBalance
    });

  } catch (error) {
    console.error("Full Error:", error);
    // Exact error frontend par bhejenge taaki pata chale kya problem hai
    return res.status(500).json({ 
      error: "Server Error: " + (error.message || "Unknown error") 
    });
  }
};
