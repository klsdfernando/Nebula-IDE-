import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

// ─── Manual Signup ───
router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'Email, password, and display name are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, provider)
      VALUES (?, ?, ?, ?, 'local')
    `).run(id, email, passwordHash, displayName);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const token = generateToken(user);

    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Manual Login ───
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND provider = ?').get(email, 'local');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const token = generateToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── OAuth Callback Handler ───
export function handleOAuthCallback(req, res) {
  try {
    const user = req.user;
    const token = generateToken(user);
    res.redirect(`/auth/success?token=${encodeURIComponent(token)}&name=${encodeURIComponent(user.display_name)}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/auth/login?error=auth_failed');
  }
}

// ─── Success Page ───
router.get('/success', (req, res) => {
  const { token, name } = req.query;
  if (!token) {
    return res.redirect('/auth/login');
  }

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Superluminal - Welcome!</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #0a0e17;
      color: #f1f5f9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .bg-effects { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
    .orb { position: absolute; border-radius: 50%; filter: blur(100px); opacity: 0.4; animation: float 20s infinite ease-in-out; }
    .orb-1 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(6,182,212,0.3), transparent); top: -10%; left: -5%; }
    .orb-2 { width: 350px; height: 350px; background: radial-gradient(circle, rgba(168,85,247,0.25), transparent); bottom: -10%; right: -5%; animation-delay: -7s; }
    @keyframes float { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-20px,20px) scale(0.95)} }
    .card {
      position: relative; z-index: 1;
      background: rgba(17,24,39,0.85);
      border: 1px solid rgba(99,102,241,0.15);
      border-radius: 20px; padding: 48px 40px;
      backdrop-filter: blur(20px);
      box-shadow: 0 0 80px rgba(99,102,241,0.15);
      max-width: 480px; width: 100%; text-align: center;
      animation: cardAppear 0.6s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes cardAppear { from{opacity:0;transform:translateY(20px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
    .check { font-size: 56px; margin-bottom: 16px; animation: pop 0.5s cubic-bezier(0.34,1.56,0.64,1); }
    @keyframes pop { from{transform:scale(0)} to{transform:scale(1)} }
    h1 { font-size: 24px; font-weight: 700; background: linear-gradient(135deg,#06b6d4,#a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .greeting { color: #94a3b8; font-size: 15px; margin-top: 8px; }
    .divider { height: 1px; background: rgba(99,102,241,0.15); margin: 28px 0; }
    .instruction { color: #94a3b8; font-size: 13px; margin-bottom: 16px; }
    .instruction strong { color: #e2e8f0; }
    .token-container { position: relative; }
    .token-box {
      background: #1a2332; border: 1px solid rgba(99,102,241,0.2);
      border-radius: 12px; padding: 16px; word-break: break-all;
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: #64748b; max-height: 60px; overflow: hidden;
      text-align: left; line-height: 1.4;
      user-select: all; cursor: pointer;
    }
    .copy-btn {
      width: 100%; margin-top: 12px; padding: 14px 20px;
      background: linear-gradient(135deg,#06b6d4,#a855f7);
      border: none; border-radius: 12px; color: white;
      font-size: 15px; font-weight: 600; font-family: inherit;
      cursor: pointer; transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .copy-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99,102,241,0.3); }
    .copy-btn.copied { background: linear-gradient(135deg,#22c55e,#16a34a); }
    .footer { color: #475569; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="bg-effects"><div class="orb orb-1"></div><div class="orb orb-2"></div></div>
  <div class="card">
    <div class="check">✅</div>
    <h1>Welcome to Superluminal!</h1>
    <p class="greeting">You're signed in${name ? ' as <strong>' + name + '</strong>' : ''}.</p>
    <div class="divider"></div>
    <p class="instruction">Copy the token below and paste it in the <strong>Superluminal IDE</strong> when prompted:</p>
    <div class="token-container">
      <div class="token-box" id="tokenBox">${token}</div>
    </div>
    <button class="copy-btn" id="copyBtn" onclick="copyToken()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      Copy Token
    </button>
    <p class="footer">You can close this tab after copying.</p>
  </div>
  <script>
    function copyToken() {
      const token = document.getElementById('tokenBox').textContent;
      navigator.clipboard.writeText(token).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.classList.add('copied');
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy Token';
        }, 2000);
      });
    }
  </script>
</body>
</html>`);
});

// ─── Get Current User (token-based) ───
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: sanitizeUser(user) });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// ─── Helper ───
function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    provider: user.provider,
    createdAt: user.created_at,
  };
}

export default router;
