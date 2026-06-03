import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import passport from './config/passport.js';
import authRoutes, { handleOAuthCallback } from './routes/auth.js';
import aiRoutes from './routes/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3500;

// ─── Security & Middleware ───
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50,
    message: { error: 'Too many requests, please try again later' },
});

// Session for Passport OAuth flows
app.use(session({
    secret: process.env.SESSION_SECRET || 'superluminal-session',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 10 * 60 * 1000 }, // 10 min for OAuth flow
}));

app.use(passport.initialize());
app.use(passport.session());

// ─── Auth API Routes ───
app.use('/auth', authLimiter, authRoutes);

// ─── AI API Routes ───
app.use('/api', aiRoutes);

// ─── OAuth Routes ───

// Google
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/auth/login?error=google_failed' }), handleOAuthCallback);

// GitHub
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/auth/login?error=github_failed' }), handleOAuthCallback);

// Discord
app.get('/auth/discord', passport.authenticate('discord', { scope: ['identify', 'email'] }));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/auth/login?error=discord_failed' }), handleOAuthCallback);

// Microsoft
app.get('/auth/microsoft', passport.authenticate('microsoft', { scope: ['user.read'] }));
app.get('/auth/microsoft/callback', passport.authenticate('microsoft', { failureRedirect: '/auth/login?error=microsoft_failed' }), handleOAuthCallback);

// Apple
app.get('/auth/apple', passport.authenticate('apple'));
app.post('/auth/apple/callback', passport.authenticate('apple', { failureRedirect: '/auth/login?error=apple_failed' }), handleOAuthCallback);

// ─── Login & Signup Pages ───
app.get('/auth/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/auth/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// ─── Health Check ───
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'superluminal-backend', timestamp: new Date().toISOString() });
});

// ─── Root ───
app.get('/', (req, res) => {
    res.redirect('/auth/login');
});

// ─── Start Server ───
app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║     🚀 Superluminal Backend Server       ║
  ║     Running on http://localhost:${PORT}     ║
  ╚══════════════════════════════════════════╝
  `);
});
