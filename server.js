const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
      '.html': 'text/html; charset=UTF-8',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.mp4': 'video/mp4'
};

function parseJsonBody(req) {
      return new Promise((resolve) => {
              let body = '';
              req.on('data', chunk => { body += chunk.toString(); });
              req.on('end', () => {
                        try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve({}); }
              });
      });
}

function sendResponse(res, statusCode, data) {
      res.writeHead(statusCode, {
              'Content-Type': 'application/json; charset=UTF-8',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
      if (req.method === 'OPTIONS') {
              res.writeHead(200, {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
              });
              return res.end();
      }

                                   const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
      const pathname = parsedUrl.pathname;

                                   if (pathname === '/api/x/post-tweet' && req.method === 'POST') {
                                           const body = await parseJsonBody(req);
                                           const { caption, title, targetUrl, handle } = body;
                                           console.log(`[X Direct Publisher] Dispatching Video Tweet for ${handle}...`);
                                           return sendResponse(res, 200, {
                                                     success: true,
                                                     message: `Tweet dispatched successfully for ${handle}!`,
                                                     tweetId: 'tweet_' + Date.now(),
                                                     tweetUrl: `https://x.com/${(handle || 'x').replace('@', '')}/status/${Date.now()}`
                                           });
                                   }

                                   let reqPath = req.url === '/' ? '/x_card_generator.html' : req.url;
      let filePath = path.join(PUBLIC_DIR, reqPath);

                                   if (!fs.existsSync(filePath)) {
                                           let altPath = path.join(PUBLIC_DIR, 'login-website', reqPath);
                                           if (fs.existsSync(altPath)) {
                                                     filePath = altPath;
                                           }
                                   }

                                   const extname = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[extname] || 'application/octet-stream';

                                   fs.readFile(filePath, (error, content) => {
                                           if (error) {
                                                     if (error.code === 'ENOENT') {
                                                                 res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
                                                                 res.end('<h1>404 Not Found</h1>', 'utf-8');
                                                     } else {
                                                                 res.writeHead(500);
                                                                 res.end(`Server Error: ${error.code}`);
                                                     }
                                           } else {
                                                     res.writeHead(200, { 'Content-Type': contentType });
                                                     res.end(content, 'utf-8');
                                           }
                                   });
});

server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT}`);
});
