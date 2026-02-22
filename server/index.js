import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config({ path: "../.env" });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

console.log("Environment Key Loaded:", process.env.GEMINI_API_KEY ? "YES" : "NO");

// ✅ Standard SDK Initialization
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// models/gemini-flash-latest is the most stable reference in your project.
const MODEL_NAME = "models/gemini-flash-latest";

// ================= HEALTH =================
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    model: MODEL_NAME,
    time: new Date().toISOString(),
  });
});

// ================= IMAGE ANALYSIS =================
app.post("/analyze-image", async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "No image provided" });
    }

    const base64Image = image.split(",")[1] || image;

    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `You are analyzing an image for a children's AI app.
Describe only what is clearly visible.
Mention objects, colors, positions, and actions.
Do NOT invent fantasy elements.
Keep it 3–4 sentences.
Make it suitable for a 5-year-old.

Return ONLY a JSON object in this format:
{
  "main_object": "simple name",
  "colors": ["main colors"],
  "action": "short action",
  "mood": "happy/exciting/calm",
  "literal_description": "the 3-4 sentence description"
}`;

    console.log(`📸 Starting Gemini Analysis with model: ${MODEL_NAME}`);

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image,
        },
      },
    ]);

    const responseText = result.response.text();
    let structuredData;
    try {
      structuredData = JSON.parse(responseText);
    } catch (e) {
      console.error("JSON Parse Error:", responseText);
      throw new Error("Invalid analysis format from Gemini");
    }

    const summary = structuredData.literal_description;

    console.log("---------------------------");
    console.log("GEMINI IMAGE ANALYSIS:", summary);
    console.log("---------------------------");

    res.json({
      description: summary,
      structuredData: structuredData
    });
  } catch (error) {
    console.error("Image Error:", error);
    res.status(500).json({
      error: error.message || "Image analysis failed",
    });
  }
});

// ================= CHAT =================
app.post("/chat", async (req, res) => {
  try {
    const { message, context, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "No message provided" });
    }

    console.log(`💬 Chat request for model: ${MODEL_NAME}`);

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // ✅ FIX: Extract text from either top-level or parts array
    const rawHistory = history || [];
    const validHistory = [];
    let foundFirstUser = false;

    for (const item of rawHistory) {
      // Support both { role, text } and { role, parts: [{ text }] }
      const itemText = item.text || (item.parts && item.parts[0] && item.parts[0].text);
      const safeText = itemText ? String(itemText).trim() : "";

      if (!safeText) {
        console.log("⚠️ Skipping empty history item:", item.role);
        continue;
      }

      const gRole = (item.role === 'assistant' || item.role === 'model') ? 'model' : 'user';

      if (gRole === 'user') foundFirstUser = true;

      if (foundFirstUser) {
        validHistory.push({
          role: gRole,
          parts: [{ text: safeText }]
        });
      }
    }

    console.log(`📜 Validated History Length: ${validHistory.length}`);
    if (validHistory.length > 0) {
      console.log("📜 First History Item:", JSON.stringify(validHistory[0], null, 2));
    }

    const chat = model.startChat({
      history: validHistory,
    });

    const prompt = `
You are Magic Robot, a cheerful AI friend for kids (4-8).
Context from image: ${context || "Fun adventure world"}.

Rules:
- Short sentences.
- Simple words.
- Ask ONLY one question.

Child says: ${message}`;

    console.log("📤 Sending prompt to Gemini...");
    const result = await chat.sendMessage(prompt);
    const response = await result.response;

    res.json({
      response: response.text(),
    });
  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({
      error: error.message || "Chat failed",
    });
  }
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
