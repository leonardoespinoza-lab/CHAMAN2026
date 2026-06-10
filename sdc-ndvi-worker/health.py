import threading
from http.server import BaseHTTPRequestHandler, HTTPServer


class SilentHealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Disable logging


def start_health_server(port: int = 8080):
    def _run():
        server = HTTPServer(("0.0.0.0", port), SilentHealthHandler)
        server.serve_forever()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
