import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "swiftdesk_verify_2026";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "1401333586405626";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const RECEPTIONIST_SYSTEM_INSTRUCTION = `
You are Swift Desk TT, a 24/7 AI receptionist for businesses in Trinidad and Tobago.
Be polite, clear, and concise so responses read naturally on WhatsApp.
Share pricing in TTD when asked about plans or packages, and close with one helpful follow-up question.
`.trim();

async function generateReceptionistReply(userMessage, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: userMessage,
        config: {
          systemInstruction: RECEPTIONIST_SYSTEM_INSTRUCTION,
        },
      });

      const reply = response.text?.trim();
      if (reply) {
        return reply;
      }
    } catch (error) {
      const status = error?.status ?? error?.code;
      const message = String(error?.message || "");
      const isTemporarySpike =
        status === 503 || status === 429 || message.includes("UNAVAILABLE");

      if (!isTemporarySpike || attempt === maxRetries) {
        throw error;
      }

      const waitMs = 1200 * (attempt + 1);
      console.warn(
        `Gemini temporarily busy (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${waitMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  return "Thanks for messaging Swift Desk TT! How can I help your business today?";
}

async function sendWhatsAppMessage(recipientPhone, bodyText) {
  if (!WHATSAPP_TOKEN) {
    throw new Error("WHATSAPP_TOKEN is not set in environment variables");
  }

  const endpoint = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipientPhone,
      type: "text",
      text: { body: bodyText },
    }),
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${details}`);
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
    const changeValue = req.body?.entry?.[0]?.changes?.[0]?.value;
    const incomingPhoneId = changeValue?.metadata?.phone_number_id;
    const message = changeValue?.messages?.[0];

    if (!message) {
      return;
    }

    if (incomingPhoneId !== PHONE_NUMBER_ID) {
      console.log(`Unconfigured Phone Number ID: ${incomingPhoneId}`);
      return;
    }

    if (message.type !== "text" || !message.text?.body) {
      return;
    }

    const senderPhone = message.from;
    const incomingText = message.text.body.trim();

    console.log(`Incoming message from ${senderPhone}: ${incomingText}`);

    const replyText = await generateReceptionistReply(incomingText);
    await sendWhatsAppMessage(senderPhone, replyText);

    console.log(`Reply sent to ${senderPhone}`);
  } catch (error) {
    console.error("Error processing webhook:", error);
  }
});

app.listen(PORT, () => {
  console.log(`Swift Desk TT running on port ${PORT}`);
});
