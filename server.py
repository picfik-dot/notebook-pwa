import json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

STATE_FILE = Path(__file__).with_name('mindfold-state.json')


class MindfoldHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/state':
            self.send_json(self.read_state())
            return
        super().do_GET()

    def do_PUT(self):
        if self.path != '/api/state':
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', 0))
        try:
            state = json.loads(self.rfile.read(length))
            STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
            self.send_json({'ok': True})
        except (json.JSONDecodeError, OSError):
            self.send_error(400, 'Invalid state')

    @staticmethod
    def read_state():
        if not STATE_FILE.exists():
            return {}
        try:
            return json.loads(STATE_FILE.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError):
            return {}

    def send_json(self, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', 8000), MindfoldHandler)
    print('Mindfold running at http://0.0.0.0:8000')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
