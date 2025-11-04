#!/usr/bin/env python3
"""
Simple HTTP server with correct MIME types for JavaScript modules
"""
import http.server
import socketserver
import mimetypes
import os
import signal
import subprocess

# Ensure JavaScript files have the correct MIME type
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Log all requests
        print(f"{self.address_string()} - {format % args}")

    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        # Disable caching to prevent MIME type issues
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # Log the request path
        print(f"GET request for: {self.path}")
        print(f"Translated path: {self.translate_path(self.path)}")
        super().do_GET()

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
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
    print(f"Server running at http://0.0.0.0:{PORT}/")
    print(f"Access locally: http://localhost:{PORT}/")
    print("Press Ctrl+C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
