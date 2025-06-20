"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const protected_1 = __importDefault(require("./routes/protected"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// Middleware
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173', // Vite default port
    'http://localhost:4173', // Vite preview port
    'https://beatinblink.com',
    'https://www.beatinblink.com',
    'https://beat-in-blink-ui.vercel.app', // Optional: clean production domain
    // WebContainer origins with optional port numbers
    /^https:\/\/.*\.webcontainer\.io(?::\d+)?$/,
    /^https:\/\/.*\.stackblitz\.io(?::\d+)?$/,
    /^https:\/\/.*\.staticblitz\.com(?::\d+)?$/,
    /^https:\/\/.*\.bolt\.new(?::\d+)?$/,
    // Additional WebContainer and development origins
    /^https:\/\/.*\.csb\.app(?::\d+)?$/,
    /^https:\/\/.*\.gitpod\.io(?::\d+)?$/,
    /^https:\/\/.*\.repl\.co(?::\d+)?$/,
    /^https:\/\/.*\.vercel\.app(?::\d+)?$/,
    /^https:\/\/.*\.netlify\.app(?::\d+)?$/,
    // Local development with any port
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/127\.0\.0\.1:\d+$/,
    /^http:\/\/0\.0\.0\.0:\d+$/
];
// Add dynamic frontend URL if defined in environment variables
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
            return callback(null, true);
        }
        // Check if origin matches any of the allowed origins (including regex patterns)
        const isAllowed = allowedOrigins.some(allowedOrigin => {
            if (typeof allowedOrigin === 'string') {
                return allowedOrigin === origin;
            }
            else if (allowedOrigin instanceof RegExp) {
                return allowedOrigin.test(origin);
            }
            return false;
        });
        if (isAllowed) {
            callback(null, true);
        }
        else {
            console.log(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express_1.default.json());
// PostgreSQL connection
exports.db = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    }
});
exports.db.connect()
    .then(() => console.log('✅ Connected to PostgreSQL'))
    .catch(err => console.error('❌ DB connection error', err));
// Routes
app.get('/', (_req, res) => {
    res.send('EduExamine API is running 🎓');
});
app.use('/api/protected', protected_1.default);
app.use('/api/auth', auth_routes_1.default);
// ------------------------------
// 👇 Dual mode: local + Vercel
// ------------------------------
if (process.env.VERCEL === undefined) {
    // Local development mode
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running locally on http://localhost:${PORT}`);
    });
}
// Export app directly for Vercel
exports.default = app;
