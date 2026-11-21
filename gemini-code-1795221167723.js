const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'swiftdesk_verify_2026';

// MULTI-CLIENT CONFIGURATION
// Map each WhatsApp Phone Number ID (from Meta Dashboard) to a specific client's prompt & token
const CLIENTS = {
  '1401333586405626': {
    businessName: 'Swift Desk TT Demo',
    whatsappToken: process.env.WHATSAPP_TOKEN,
    systemPrompt: `You are the 24/7 AI Receptionist for Swift Desk TT. 
    We install automated WhatsApp and website AI receptionists for businesses in Trinidad and Tobago.
    Packages:
- Starter Desk: $3,400 TTD setup + $1,000 TTD/month (24/7 WhatsApp or Web AI, FAQ trained, email alerts).
- Growth Engine: $8,100 TTD setup + $2,400 TTD/month (WhatsApp + Web AI, instant quote estimator, calendar booking, Google Sheets sync).
- Scale Suite: $17,000 TTD setup + $4,400 TTD/month (WhatsApp, IG DM & Web AI, automated 24hr/7-day follow-ups).
    Rules:
1. Keep every reply under 3 short, friendly sentences.
2. Answer questions directly using ONLY the info above.
3. Always end with ONE clear question to qualify the lead (e.g., ask what type of business they run or offer to build them a free custom demo).`
  }
};

// 1. Meta Webhook Verification Endpoint
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified successfully!');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2. Incoming WhatsApp Messages Handler
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately so Meta doesn't retry

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== 'text') return;

    const phoneNumberId = value.metadata.phone_number_id;
    const customerPhone = message.from;
    const customerText = message.text.body;

    const clientConfig = CLIENTS[phoneNumberId];
    if (!clientConfig) {
      console.log(`Unconfigured Phone Number ID: ${phoneNumberId}`);
      return;
    }

    // Generate AI reply via Gemini 2.5 Flash
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: customerText,
      config: {
        systemInstruction: clientConfig.systemPrompt,
        temperature: 0.4
      }
    });

    const replyText = response.text || "Thanks for messaging! One of our specialists will follow up with you shortly.";

    // Send reply back via WhatsApp Cloud API
    await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clientConfig.whatsappToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: customerPhone,
        text: { body: replyText }
      })
    });

  } catch (err) {
    console.error('Error processing webhook:', err);
  }
});

// Health check endpoint for UptimeRobot (keeps free Render tier awake 24/7)
app.get('/', (req, res) => res.send('Swift Desk TT AI Engine Active'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Swift Desk TT running on port ${PORT}`));