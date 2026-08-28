import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class HealthState:
    def __init__(self):
        self.healthy = False
        self.ready = False
        self.last_run = None
        self.last_error = None


STATE = HealthState()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/", "/health"):
            self.send_response(404)
            self.end_headers()
            return
        status = 200 if STATE.healthy else 503
        payload = json.dumps(
            {
                "service": "sdc-meteo-worker",
                "healthy": STATE.healthy,
                "ready": STATE.ready,
                "lastRun": STATE.last_run,
                "lastError": STATE.last_error,
            }
        ).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, _format, *_args):
        return


def start_health_server(port: int):
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
