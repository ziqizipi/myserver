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
let conversations = [];
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
  const from = req.body.From;
  console.log('Pesan masuk:', incomingMsg);
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const stockList = businessData.stock.length > 0
      ? businessData.stock.map(p => `- ${p.name} (${p.category}): Harga Jual Rp${p.sellPrice.toLocaleString('id-ID')}, Stok ${p.stock} unit`).join('\n')
      : 'Belum ada data stok.';

    const prompt = `Kamu adalah asisten AI WhatsApp untuk bisnis "${businessData.businessInfo.businessName}".
Pemilik bisnis: ${businessData.businessInfo.name}
Deskripsi bisnis: ${businessData.businessInfo.desc}
Nomor telepon bisnis: ${businessData.businessInfo.phone}
${businessData.businessInfo.hours ? `Jam operasional: ${businessData.businessInfo.hours}` : ''}

Daftar produk tersedia:
${stockList}

Instruksi penting:
- Selalu balas dalam Bahasa Indonesia yang ramah dan natural
- Jika pelanggan tanya nomor telepon, WAJIB berikan nomor: ${businessData.businessInfo.phone}
- Jika pelanggan tanya produk yang tidak ada di daftar, katakan dengan sopan bahwa produk tersebut tidak tersedia
- Jika stok 0, beritahu pelanggan produk sedang kosong
- JANGAN mengarang informasi yang tidak ada dalam data di atas
- Gunakan sapaan "Kak" untuk pelanggan
- Tanda tangan pesan dengan nama bisnis

Pesan pelanggan: ${incomingMsg}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt
    });

    const text = response.text;
    console.log('Respons AI:', text);

    // Save conversation
    const existingConvo = conversations.find(c => c.from === from);
    if (existingConvo) {
      existingConvo.messages.push({ role: 'customer', text: incomingMsg, time: new Date().toISOString() });
      existingConvo.messages.push({ role: 'ai', text: text, time: new Date().toISOString() });
      existingConvo.lastMessage = incomingMsg;
      existingConvo.lastTime = new Date().toISOString();
      existingConvo.unread = true;
    } else {
      conversations.push({
        from,
        name: from.replace('whatsapp:', ''),
        lastMessage: incomingMsg,
        lastTime: new Date().toISOString(),
        unread: true,
        messages: [
          { role: 'customer', text: incomingMsg, time: new Date().toISOString() },
          { role: 'ai', text: text, time: new Date().toISOString() }
        ]
      });
    }

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

// Get all conversations
app.get('/api/conversations', (req, res) => {
  res.json(conversations);
});

// Mark conversation as read
app.post('/api/conversations/:from/read', (req, res) => {
  const convo = conversations.find(c => c.from === decodeURIComponent(req.params.from));
  if (convo) convo.unread = false;
  res.json({ success: true });
});

// AI Insights endpoint
app.get('/api/insights', async (req, res) => {
  if (conversations.length === 0) {
    return res.json({
      popularProducts: [],
      mostAsked: [],
      customerIntents: [],
      summary: 'Belum ada data percakapan untuk dianalisis.'
    });
  }

  try {
    // Extract all customer messages
    const allMessages = conversations.flatMap(c =>
      c.messages.filter(m => m.role === 'customer').map(m => m.text)
    );

    const prompt = `Kamu adalah analis bisnis. Analisis pesan-pesan pelanggan berikut dari toko "${businessData.businessInfo.businessName}":

${allMessages.map((m, i) => `${i + 1}. "${m}"`).join('\n')}

Daftar produk toko:
${businessData.stock.map(p => p.name).join(', ') || 'Tidak ada data produk'}

Berikan analisis dalam format JSON berikut (HANYA JSON, tidak ada teks lain):
{
  "popularProducts": [
    { "name": "nama produk", "count": jumlah_sebutan, "percentage": persentase }
  ],
  "mostAsked": [
    { "question": "pertanyaan umum", "count": jumlah, "category": "kategori" }
  ],
  "customerIntents": [
    { "intent": "nama intent", "count": jumlah, "percentage": persentase, "color": "warna hex" }
  ],
  "summary": "ringkasan singkat 1-2 kalimat tentang tren pelanggan"
}

Untuk customerIntents, gunakan kategori: Cek Stok, Tanya Harga, Info Produk, Jam Buka, Komplain, Lainnya
Untuk warna intent gunakan: #3a7a55, #f59e0b, #3b82f6, #8b5cf6, #ef4444, #6b7280
Maksimal 5 item per kategori.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt
    });

    const text = response.text.replace(/```json|```/g, '').trim();
    const insights = JSON.parse(text);
    res.json(insights);
  } catch (err) {
    console.log('Insights error:', err.message);
    res.status(500).json({ error: 'Gagal menganalisis data' });
  }
});

app.listen(3000, () => console.log('Server BalasBro berjalan di port 3000'));