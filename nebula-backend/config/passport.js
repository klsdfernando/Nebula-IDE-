import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';

// ─── Generic OAuth user upsert ───
function findOrCreateUser(provider, profile) {
    const providerId = profile.id;
    const email = profile.emails?.[0]?.value || `${provider}_${providerId}@antigravity.local`;
    const displayName = profile.displayName || profile.username || email.split('@')[0];
    const avatarUrl = profile.photos?.[0]?.value || null;

    // Check if user already exists with this provider
    let user = db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?').get(provider, providerId);

    if (user) {
        // Update their info
        db.prepare(`
      UPDATE users SET display_name = ?, avatar_url = ?, email = ?, last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(displayName, avatarUrl, email, user.id);
        return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    // Check if user exists with same email (link accounts)
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (user) {
        db.prepare(`
      UPDATE users SET provider = ?, provider_id = ?, avatar_url = ?, last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(provider, providerId, avatarUrl, user.id);
        return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    // Create new user
    const id = uuidv4();
    db.prepare(`
    INSERT INTO users (id, email, display_name, avatar_url, provider, provider_id, last_login)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(id, email, displayName, avatarUrl, provider, providerId);

    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// ─── Passport serialization ───
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    done(null, user);
});

// ─── Google Strategy ───
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your-google-client-id') {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.BASE_URL}/auth/google/callback`,
        scope: ['profile', 'email'],
    }, (accessToken, refreshToken, profile, done) => {
        try {
            const user = findOrCreateUser('google', profile);
            done(null, user);
        } catch (err) {
            done(err);
        }
    }));
    console.log('✅ Google OAuth configured');
}

// ─── GitHub Strategy ───
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_ID !== 'your-github-client-id') {
    passport.use(new GitHubStrategy({
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${process.env.BASE_URL}/auth/github/callback`,
        scope: ['user:email'],
    }, (accessToken, refreshToken, profile, done) => {
        try {
            const user = findOrCreateUser('github', profile);
            done(null, user);
        } catch (err) {
            done(err);
        }
    }));
    console.log('✅ GitHub OAuth configured');
}

// ─── Discord Strategy ───
if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_ID !== 'your-discord-client-id') {
    passport.use(new DiscordStrategy({
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: `${process.env.BASE_URL}/auth/discord/callback`,
        scope: ['identify', 'email'],
    }, (accessToken, refreshToken, profile, done) => {
        try {
            const user = findOrCreateUser('discord', profile);
            done(null, user);
        } catch (err) {
            done(err);
        }
    }));
    console.log('✅ Discord OAuth configured');
}

// ─── Microsoft Strategy ───
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_ID !== 'your-microsoft-client-id') {
    // Dynamic import for Microsoft strategy
    import('passport-microsoft').then(({ default: MicrosoftStrategy }) => {
        passport.use(new MicrosoftStrategy({
            clientID: process.env.MICROSOFT_CLIENT_ID,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
            callbackURL: `${process.env.BASE_URL}/auth/microsoft/callback`,
            scope: ['user.read'],
        }, (accessToken, refreshToken, profile, done) => {
            try {
                const user = findOrCreateUser('microsoft', profile);
                done(null, user);
            } catch (err) {
                done(err);
            }
        }));
        console.log('✅ Microsoft OAuth configured');
    }).catch(() => {
        console.log('⚠️  Microsoft OAuth not available (install passport-microsoft)');
    });
}

// ─── Apple Strategy ───
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_ID !== 'your-apple-client-id') {
    try {
        import('passport-apple').then(({ default: AppleStrategy }) => {
            passport.use(new AppleStrategy({
                clientID: process.env.APPLE_CLIENT_ID,
                teamID: process.env.APPLE_TEAM_ID,
                keyID: process.env.APPLE_KEY_ID,
                privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH,
                callbackURL: `${process.env.BASE_URL}/auth/apple/callback`,
                scope: ['name', 'email'],
            }, (accessToken, refreshToken, idToken, profile, done) => {
                try {
                    const user = findOrCreateUser('apple', profile);
                    done(null, user);
                } catch (err) {
                    done(err);
                }
            }));
            console.log('✅ Apple Sign In configured');
        });
    } catch {
        console.log('⚠️  Apple Sign In not available');
    }
}

export default passport;
