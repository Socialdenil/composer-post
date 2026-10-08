/* ==========================================================================
   Aegis Vault - Node.js Zero-Dependency REST API Backend Server
   Run with Node.js v22+
   ========================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(__dirname, 'database.json');

// Initialize Database file if missing
if (!fs.existsSync(DB_FILE)) {
    const salt = 'aegis_salt_2026';
    const pwdHash = crypto.createHash('sha256').update('password123' + salt).digest('hex');

    const initialDb = {
        users: [
            {
                id: 'usr_admin_001',
                email: 'admin@example.com',
                fullName: 'Alex Morgan',
                role: 'Security Lead',
                passwordHash: pwdHash,
                salt: salt,
                twoFactorEnabled: true,
                createdAt: new Date().toISOString()
            }
        ],
        sessions: [],
        auditLogs: [
            {
                id: 'log_001',
                userId: 'usr_admin_001',
                event: 'Backend API Initialized',
                ip: '127.0.0.1',
                timestamp: new Date().toISOString(),
                status: 'Success'
            }
        ]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf8');
    console.log(`[Database] Initialized new database file at ${DB_FILE}`);
}

function getDatabase() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { users: [], sessions: [], auditLogs: [] };
    }
}

function saveDatabase(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function hashPassword(password, salt) {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
}

function parseJsonBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            } catch (e) {
                resolve({});
            }
        });
    });
}

function sendResponse(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    // Handle CORS Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    console.log(`[${new Date().toLocaleTimeString()}] ${method} ${pathname}`);

    // 1. GET /api/health
    if (pathname === '/api/health' && method === 'GET') {
        return sendResponse(res, 200, {
            status: 'ok',
            service: 'Aegis Vault REST API Backend',
            version: '1.0.0',
            timestamp: new Date().toISOString()
        });
    }

    // 2. POST /api/auth/login
    if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { email, password } = body;

        if (!email || !password) {
            return sendResponse(res, 400, { success: false, error: 'Email and password are required' });
        }

        const db = getDatabase();
        const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

        if (!user) {
            return sendResponse(res, 401, { success: false, error: 'Account not found' });
        }

        const computedHash = hashPassword(password, user.salt);
        if (computedHash !== user.passwordHash) {
            return sendResponse(res, 401, { success: false, error: 'Invalid password' });
        }

        // Generate token
        const token = 'token_' + crypto.randomUUID().replace(/-/g, '');
        const newSession = {
            token,
            userId: user.id,
            device: req.headers['user-agent'] || 'Web Browser',
            ip: req.socket.remoteAddress || '127.0.0.1',
            createdAt: new Date().toISOString()
        };

        db.sessions.push(newSession);
        db.auditLogs.push({
            id: 'log_' + crypto.randomUUID().substring(0, 8),
            userId: user.id,
            event: 'User Logged In',
            ip: req.socket.remoteAddress || '127.0.0.1',
            timestamp: new Date().toISOString(),
            status: 'Success'
        });
        saveDatabase(db);

        return sendResponse(res, 200, {
            success: true,
            message: 'Login successful',
            token,
            requires2FA: user.twoFactorEnabled,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role
            }
        });
    }

    // 3. POST /api/auth/register
    if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { email, password, fullName } = body;

        if (!email || !password || !fullName) {
            return sendResponse(res, 400, { success: false, error: 'All fields are required' });
        }

        const db = getDatabase();
        if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
            return sendResponse(res, 400, { success: false, error: 'Email is already registered' });
        }

        const salt = crypto.randomBytes(8).toString('hex');
        const pwdHash = hashPassword(password, salt);
        const newId = 'usr_' + crypto.randomUUID().substring(0, 8);

        const newUser = {
            id: newId,
            email,
            fullName,
            role: 'User',
            passwordHash: pwdHash,
            salt,
            twoFactorEnabled: false,
            createdAt: new Date().toISOString()
        };

        db.users.push(newUser);
        saveDatabase(db);

        return sendResponse(res, 201, {
            success: true,
            message: 'Account created successfully',
            user: { id: newId, email, fullName, role: 'User' }
        });
    }

    // 4. POST /api/auth/verify-2fa
    if (pathname === '/api/auth/verify-2fa' && method === 'POST') {
        const body = await parseJsonBody(req);
        if (body.code && body.code.length === 6) {
            return sendResponse(res, 200, { success: true, message: '2FA code verified' });
        } else {
            return sendResponse(res, 400, { success: false, error: 'Invalid 2FA code' });
        }
    }

    // 5. GET /api/user/profile
    if (pathname === '/api/user/profile' && method === 'GET') {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return sendResponse(res, 401, { success: false, error: 'No Authorization token provided' });
        }

        const token = authHeader.replace('Bearer ', '').trim();
        const db = getDatabase();
        const session = db.sessions.find(s => s.token === token);

        if (!session) {
            return sendResponse(res, 401, { success: false, error: 'Session expired or invalid' });
        }

        const user = db.users.find(u => u.id === session.userId);
        return sendResponse(res, 200, {
            success: true,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                twoFactorEnabled: user.twoFactorEnabled
            }
        });
    }

    // Default 404
    sendResponse(res, 404, { success: false, error: 'Endpoint not found' });
});

server.listen(PORT, () => {
    console.log(`\n=======================================================`);
    console.log(` 🚀 Aegis Vault REST API Backend Server Running`);
    console.log(` Port: ${PORT}`);
    console.log(` Endpoint: http://localhost:${PORT}/api/health`);
    console.log(`=======================================================\n`);
});
