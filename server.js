import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "swiftdesk_verify_2026";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "1401333586405626";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const SYSTEM_PROMPT = `
You are the 24/7 AI receptionist for Swift Desk TT in Trinidad and Tobago.
Keep replies concise, friendly, and helpful for WhatsApp.
Quote prices in TTD when asked about packages, and end with one clear qualifying question.
`.trim();

async function sendWhatsAppReply(to, text) {
  if (!WHATSAPP_TOKEN) {
    throw new Error("Missing WHATSAPP_TOKEN environment variable");
  }

  const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp API error (${response.status}): ${errorBody}`);
  }
}

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully!");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const incomingPhoneNumberId = value?.metadata?.phone_number_id;
    const message = value?.messages?.[0];

    if (!message) {
      return;
    }

    if (incomingPhoneNumberId !== PHONE_NUMBER_ID) {
      console.log(`Unconfigured Phone Number ID: ${incomingPhoneNumberId}`);
      return;
    }

    if (message.type !== "text" || !message.text?.body) {
      return;
    }

    const senderPhone = message.from;
    const incomingText = message.text.body.trim();

    const aiResponse = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: incomingText,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    const replyText =
      aiResponse.text?.trim() ||
      "Thanks for reaching out to Swift Desk TT! How can I help you today?";

    await sendWhatsAppReply(senderPhone, replyText);
  } catch (error) {
    console.error("Error processing webhook:", error);
  }
});

app.listen(PORT, () => {
  console.log(`Swift Desk TT running on port ${PORT}`);
});
