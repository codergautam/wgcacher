const http = require('http');
const https = require('https');
const { URL } = require('url');

// Cached files and cache duration (1 hour in milliseconds)
const cacheDuration = 60 * 60 * 1000;
const cache = {};
const cacheableFiles = ['/plop.mp3', '/index.html']; // Add files here

// Fetch and cache the file from na.worldguessr.com
function fetchAndCacheFile(path, callback) {
  const options = {
    hostname: 'na.worldguessr.com',
    path: path,
    method: 'GET',
    rejectUnauthorized: false, // Disable SSL certificate verification for development
    headers: {
      'Host': 'na.worldguessr.com', // Add the Host header
    }
  };

  https.get(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      cache[path] = {
        content: data,
        timestamp: Date.now(),
        headers: res.headers,
      };
      callback(null, data, res.headers);
    });
  }).on('error', (err) => {
    console.error(`Error fetching ${path}:`, err);
    callback(err);
  });
}

// Serve from cache or fetch if expired
function serveFromCacheOrFetch(path, res) {
  const cached = cache[path];

  if (cached && (Date.now() - cached.timestamp < cacheDuration)) {
    console.log(`Serving ${path} from cache`);
    res.writeHead(200, cached.headers);
    res.end(cached.content);
  } else {
    console.log(`Fetching ${path} from origin`);
    fetchAndCacheFile(path, (err, data, headers) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Error fetching file');
      }
      res.writeHead(200, {
        ...headers,
        'Access-Control-Allow-Origin': '*', // Handle CORS by allowing all origins
      });
      res.end(data);
    });
  }
}

// Proxy request to na.worldguessr.com if not cached
function proxyRequest(req, res) {
  const options = {
    hostname: 'na.worldguessr.com',
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      'Host': 'na.worldguessr.com',
    },
  };

  const proxy = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin': '*', // Handle CORS by allowing all origins
    });
    proxyRes.pipe(res, { end: true });
  });

  proxy.on('error', (err) => {
    console.error('Error proxying request:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy error');
  });

  req.pipe(proxy, { end: true });
}

// Create the server
http.createServer((req, res) => {
  const path = new URL(req.url, `http://${req.headers.host}`).pathname;

  if (cacheableFiles.includes(path)) {
    serveFromCacheOrFetch(path, res);
  } else {
    proxyRequest(req, res);
  }
}).listen(8080, () => {
  console.log('Server running on http://localhost:8080');
});
