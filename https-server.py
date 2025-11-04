#!/usr/bin/env python3
"""
Simple HTTPS server for development
Serves files from the current directory over HTTPS with a self-signed certificate.

Usage:
    python3 https-server.py [port]

Default port: 8443
"""

import http.server
import ssl
import sys
import os

# Default port
PORT = 8443 if len(sys.argv) < 2 else int(sys.argv[1])

# Check if certificate files exist
if not os.path.exists('cert.pem') or not os.path.exists('key.pem'):
    print("Error: cert.pem and key.pem not found!")
    print("Generate them with:")
    print('  openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"')
    sys.exit(1)

# Create server
server_address = ('', PORT)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

# Wrap with SSL
ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ssl_context.load_cert_chain('cert.pem', 'key.pem')
httpd.socket = ssl_context.wrap_socket(httpd.socket, server_side=True)

print(f"🔒 HTTPS server running on https://localhost:{PORT}/")
print(f"📁 Serving files from: {os.getcwd()}")
print("⚠️  Using self-signed certificate - browser will show security warning")
print("   Accept the warning to continue (this is safe for local development)")
print("\nPress Ctrl+C to stop\n")

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\n\nServer stopped.")
    sys.exit(0)
