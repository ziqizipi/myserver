require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// In-memory store
let businessData = {
  businessInfo: {
    name: 'Pemilik',
    businessName: 'Toko Kami',
    phone: '',
    desc: 'Toko dengan pelayanan terbaik.'
  },
  stock: []
};

// WhatsApp webhook
app.post('/webhook', async (req, res) => {
  const incomingMsg = req.body.Body;
  console.log('Pesan masuk:', incomingMsg);
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const stockList = businessData.stock.length > 0
      ? businessData.stock.map(p => `- ${p.name} (${p.category}): Harga Jual Rp${p.sellPrice.toLocaleString('id-ID')}, Stok ${p.stock} unit`).join('\n')
      : 'Belum ada data stok.';

    const prompt = `Kamu adalah asisten AI WhatsApp untuk bisnis "${businessData.businessInfo.businessName}".
Pemilik bisnis: ${businessData.businessInfo.name}
Deskripsi bisnis: ${businessData.businessInfo.desc}
Jam operasional: ${businessData.businessInfo.hours || '09:00 - 18:00'}

Daftar produk tersedia:
${stockList}

Instruksi penting:
- Selalu balas dalam Bahasa Indonesia yang ramah dan natural
- Jika pelanggan tanya produk yang tidak ada di daftar, katakan dengan sopan bahwa produk tersebut tidak tersedia
- Jika stok 0, beritahu pelanggan produk sedang kosong
- Jangan memberikan informasi di luar data bisnis yang diberikan
- Gunakan sapaan "Kak" untuk pelanggan
- Tanda tangan pesan dengan nama bisnis

Pesan pelanggan: ${incomingMsg}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt
    });

    const text = response.text;
    console.log('Respons AI:', text);
    twiml.message(text);
  } catch (err) {
    console.log('Error:', err.message);
    twiml.message('Maaf, ada gangguan teknis. Mohon coba lagi ya Kak!');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Update stock from frontend
app.post('/api/stock', (req, res) => {
  businessData.stock = req.body;
  console.log('Stok diperbarui:', businessData.stock.length, 'produk');
  res.json({ success: true });
});

// Update business info from frontend
app.post('/api/business', (req, res) => {
  businessData.businessInfo = { ...businessData.businessInfo, ...req.body };
  console.log('Info bisnis diperbarui:', businessData.businessInfo.businessName);
  res.json({ success: true });
});

app.get('/api/status', (req, res) => {
  res.json({ stock: businessData.stock.length, business: businessData.businessInfo.businessName, phone: businessData.businessInfo.phone });
});

app.listen(3000, () => console.log('Server BalasBro berjalan di port 3000'));