require('dotenv').config();

// Suppress DEP0044 (util.isArray) emitted by the xlsx package — harmless, unfixable upstream
process.on('warning', (w) => {
    if (w.code === 'DEP0044') return;
    process.stderr.write(`${w.name}: ${w.message}\n`);
});

const http      = require('http');
const app       = require('./app');
const connectDB = require('./config/db');

const PORT       = process.env.PORT      || 3000;
const REDIS_URL  = process.env.REDIS_URL;
const GATEWAY_URL = process.env.GATEWAY_URL;

connectDB().then(async () => {
    const server = http.createServer(app);

    if (REDIS_URL && GATEWAY_URL) {
        // ── Distributed mode: Redis Pub/Sub ──────────────────────────────────
        // WebSocket connections are handled entirely by the stand-alone gateway.
        // This process only runs HTTP REST + the Redis message broker.
        const broker = require('./services/chatBrokerService');
        broker.init();
        console.log('🔀 Running in DISTRIBUTED mode (broker + gateway)');
    } else {
        // ── Monolithic mode: Socket.io on this process ────────────────────────
        // Original single-server setup.  Requires no REDIS_URL or GATEWAY_URL.
        const { initSocket } = require('./config/socket');
        const io = await initSocket(server);
        app.set('io', io);
        console.log('🔌 Running in MONOLITHIC mode (Socket.io on this process)');
    }

    server.listen(PORT, () => {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`🎓 School Management System is running!`);
        console.log(`🌐 URL:      http://localhost:${PORT}`);
        console.log(`📚 App:      ${process.env.APP_NAME || 'School ERP'}`);
        console.log(`💬 Gateway:  ${GATEWAY_URL || '(same process — monolithic)'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    });
});
