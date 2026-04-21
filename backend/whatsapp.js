import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

/**
 * Ye function har user ke liye ek alag WhatsApp instance banayega.
 * userId: Supabase ki user id ya naam (jaise 'Abdul')
 * io: Socket.io instance taaki front-end ko QR bhej sakein
 */
export const createWhatsAppClient = (userId, io) => {
    const client = new Client({
        // Har user ka session alag folder mein save hoga
        authStrategy: new LocalAuth({
            clientId: userId 
        }),
        puppeteer: {
            headless: true,
            // Windows stability ke liye optimized arguments
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--font-render-hinting=none'
            ],
            // Puppeteer navigation timeout errors se bachne ke liye
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false
        }
    });

    // Jab QR generate hoga
    client.on('qr', (qr) => {
        console.log(`[${userId}] QR Generated. Scan now!`);
        io.emit(`qr_${userId}`, qr); 
    });

    // Jab WhatsApp connect ho jayega
    client.on('ready', () => {
        console.log(`[${userId}] WhatsApp is Connected ✅`);
        io.emit(`ready_${userId}`, {
            status: 'Connected',
            user: userId
        });
    });

    // Agar session expire ho jaye ya disconnect ho
    client.on('disconnected', (reason) => {
        console.log(`[${userId}] WhatsApp Disconnected:`, reason);
        io.emit(`disconnected_${userId}`, 'Session closed');
    });

    // Error handling taaki server crash na ho
    client.on('auth_failure', (msg) => {
        console.error(`[${userId}] Auth Failure:`, msg);
    });

    // --- MODULE 6: AUTO-RESPONDER BOT (Keyword-based) ---
    client.on('message', async (msg) => {
        // Sirf individual chats ke liye (Group spam se bachne ke liye)
        if (msg.from.includes('@c.us')) {
            const body = msg.body.toLowerCase();
            
            // Example Keywords (Isse dynamic banaya ja sakta hai via DB)
            if (body === 'hi' || body === 'hello') {
                await msg.reply('Namaste! NM Connect Auto-Bot mein aapka swagat hai. 🙏\nHum jald hi aap se sampark karenge.');
            } else if (body.includes('price') || body.includes('plan')) {
                await msg.reply('Hamare Plans:\n1. Silver (₹499/mo)\n2. Gold (₹1999/yr)\n3. Enterprise (Contact Us)');
            } else if (body.includes('help')) {
                await msg.reply('Ji, bataiye hum aapki kya madad kar sakte hain? Type "Plans" for pricing.');
            }
        }
    });

    client.initialize().catch(err => {
        console.error(`[${userId}] Initialization Error:`, err);
    });

    return client;
};