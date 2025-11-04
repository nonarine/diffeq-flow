# Deployment Guide

## Running Locally

This project uses ES6 modules and requires a web server with correct MIME types.

### Option 1: Custom Python Server (Recommended)

Use the included `server.py` script which sets correct MIME types:

```bash
python3 server.py
```

The server will automatically:
- Kill any existing process on port 8081
- Set correct MIME types for JavaScript modules
- Add cache-busting headers
- Enable CORS

Then access at:
- Local: `http://localhost:8081/`
- Network: `http://YOUR_IP:8081/`

**Alternative server** (`server2.py`): Uses a different MIME type implementation if you have issues with `server.py`

### Option 2: Node.js http-server

If you have Node.js installed:

```bash
npx http-server -p 8081 --cors
```

### Option 3: Node.js serve

```bash
npx serve -p 8081
```

## Common Issues

### "Disallowed MIME type" Error

**Problem**: Browser shows error like:
```
Loading module from "..." was blocked because of a disallowed MIME type ("text/html")
```

**Cause**: The server is serving `.js` files with the wrong MIME type.

**Solution**: Use `server.py` or one of the Node.js options above. The default Python `http.server` module doesn't always set correct MIME types for JavaScript modules.

### CORS Issues

If you're hosting on one domain and accessing from another, you may need CORS headers. The `server.py` script includes these by default.

## Deploying to Production

For production deployment, use a proper web server:

- **Nginx**: Configure MIME types in `/etc/nginx/mime.types`
- **Apache**: Enable `mod_mime` and set MIME types in `.htaccess`
- **Static hosting** (Netlify, Vercel, GitHub Pages): These handle MIME types correctly by default

### Example Nginx Configuration

```nginx
location ~ \.js$ {
    default_type application/javascript;
    add_header Access-Control-Allow-Origin *;
}
```

## Port Forwarding / Public Access

If you want to share with friends over the internet:

1. **Port forwarding**: Configure your router to forward port 8081 to your machine
2. **Firewall**: Allow incoming connections on port 8081
3. **Dynamic DNS**: Use a service like DuckDNS if your IP changes frequently

**Security Warning**: Exposing a development server to the public internet is not recommended for long-term use. For production, use proper hosting.
