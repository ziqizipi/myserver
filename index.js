require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Your business data
let businessData = {
  name: "My Store",
  stock: ["Nike Air Force 1 - 10 pairs", "Adidas Samba - 5 pairs"],
  hours: "9am - 6pm"
};

// WhatsApp webhook
app.post('/webhook', async (req, res) => {
  const incomingMsg = req.body.Body;
  console.log('Incoming message:', incomingMsg);
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const prompt = `You are a helpful business assistant. Here is the business info: ${JSON.stringify(businessData)}. Customer says: ${incomingMsg}`;
    const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash-lite',
  contents: prompt
});
    const text = response.text;
    console.log('Gemini response:', text);
    twiml.message(text);
  } catch (err) {
    console.log('Error:', err.message);
    twiml.message("Sorry, I couldn't process that. Please try again!");
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Update business data from frontend
app.post('/api/stock', (req, res) => {
  businessData = { ...businessData, ...req.body };
  res.json({ success: true, data: businessData });
});

// Get current business data
app.get('/api/stock', (req, res) => {
  res.json(businessData);
});

app.listen(3000, () => console.log('Server running on port 3000'));