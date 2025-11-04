#!/usr/bin/env python3
"""
Simple HTTP server with correct MIME types - Alternative implementation
"""
from http.server import HTTPServer, SimpleHTTPRequestHandler
import os
import signal
import subprocess

class JSHTTPRequestHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.wasm': 'application/wasm',
        '': 'application/octet-stream',
    }

    def end_headers(self):
        # CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        # Disable caching
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def guess_type(self, path):
        """Override to ensure .js files always get application/javascript"""
        base, ext = os.path.splitext(path)
        if ext in self.extensions_map:
            return self.extensions_map[ext]
        ext = ext.lower()
        if ext in self.extensions_map:
            return self.extensions_map[ext]
        return self.extensions_map['']

PORT = 8081

# Kill any existing process on this port
def kill_process_on_port(port):
    try:
        # Find process using the port
        result = subprocess.run(
            ['lsof', '-ti', f':{port}'],
            capture_output=True,
            text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            pids = result.stdout.strip().split('\n')
            for pid in pids:
                print(f"Killing existing process {pid} on port {port}")
                os.kill(int(pid), signal.SIGTERM)
    except Exception as e:
        # lsof might not be available, try fuser
        try:
            subprocess.run(['fuser', '-k', f'{port}/tcp'],
                         stderr=subprocess.DEVNULL)
        except:
            pass  # Port might just be free

kill_process_on_port(PORT)

# Allow port reuse
HTTPServer.allow_reuse_address = True

with HTTPServer(("", PORT), JSHTTPRequestHandler) as httpd:
    print(f"Server running at http://0.0.0.0:{PORT}/")
    print(f"Access locally: http://localhost:{PORT}/")
    print("Press Ctrl+C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
