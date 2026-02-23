#!/usr/bin/env python3
"""
Simple HTTP server to serve the built Vue dashboard
Listens on 0.0.0.0:5173 and proxies /api and /socket.io to Flask backend
"""

import http.server
import socketserver
import os
import urllib.request
import urllib.error
from pathlib import Path

DIST_DIR = Path(__file__).parent / "smart-farm-dashboard" / "dist"
BACKEND_URL = "http://127.0.0.1:5000"
PORT = 5173

class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Proxy API requests to Flask
        if self.path.startswith('/api/'):
            self.proxy_to_backend(self.path)
        # Proxy socket.io to Flask
        elif self.path.startswith('/socket.io'):
            self.proxy_to_backend(self.path)
        # Serve static files
        else:
            self.serve_file(self.path)
    
    def proxy_to_backend(self, path):
        """Proxy request to Flask backend"""
        url = BACKEND_URL + path
        try:
            response = urllib.request.urlopen(url, timeout=10)
            self.send_response(response.status)
            # Copy headers
            for header, value in response.headers.items():
                self.send_header(header, value)
            self.end_headers()
            self.wfile.write(response.read())
        except Exception as e:
            self.send_error(502, f"Bad Gateway: {e}")
    
    def serve_file(self, path):
        """Serve static files from dist directory"""
        # Remove query string
        path = path.split('?')[0]
        
        # Default to index.html for root
        if path == '/':
            file_path = DIST_DIR / 'index.html'
        else:
            file_path = DIST_DIR / path.lstrip('/')
        
        # Security: prevent directory traversal
        try:
            file_path = file_path.resolve()
            if not str(file_path).startswith(str(DIST_DIR.resolve())):
                self.send_error(403, "Forbidden")
                return
        except:
            self.send_error(403, "Forbidden")
            return
        
        # If path is a directory or doesn't exist, serve index.html
        if not file_path.exists() or file_path.is_dir():
            file_path = DIST_DIR / 'index.html'
        
        if not file_path.exists():
            self.send_error(404, "Not Found")
            return
        
        # Determine content type
        content_type = self.guess_type(str(file_path))
        
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            
            self.send_response(200)
            self.send_header('Content-Type', content_type or 'application/octet-stream')
            self.send_header('Content-Length', len(content))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Internal Server Error: {e}")
    
    def log_message(self, format, *args):
        """Log to stdout with timestamp"""
        import datetime
        print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {format % args}")

if __name__ == '__main__':
    os.chdir(DIST_DIR)
    
    print(f"Starting dashboard server on 0.0.0.0:{PORT}")
    print(f"Serving from: {DIST_DIR}")
    print(f"Backend proxy: {BACKEND_URL}")
    
    with socketserver.TCPServer(("0.0.0.0", PORT), DashboardHandler) as httpd:
        print(f"✓ Dashboard available at:")
        print(f"  - http://127.0.0.1:{PORT}")
        print(f"  - http://100.69.241.16:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutdown requested")
