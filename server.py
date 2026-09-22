from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 8000), SimpleHTTPRequestHandler)
    print('Mindfold running at http://127.0.0.1:8000')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
