import http.server
import json
import sqlite3
import urllib.parse
import sys
import os
import traceback

PORT = 8000

# Create the SQLite database file in the script's directory (workspace root folder)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(SCRIPT_DIR, 'bookings.db')

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bookings (
            id TEXT PRIMARY KEY,
            clientName TEXT,
            clientPhone TEXT,
            clientFacebook TEXT,
            date TEXT,
            location TEXT,
            jobType TEXT,
            photographers TEXT,
            timeSlot TEXT,
            notes TEXT,
            total REAL,
            deposit REAL,
            balance REAL,
            timestamp INTEGER
        )
    ''')
    conn.commit()
    conn.close()

def get_bookings():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM bookings ORDER BY timestamp DESC')
    rows = cursor.fetchall()
    bookings = [dict(row) for row in rows]
    conn.close()
    return bookings

def save_booking(b):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO bookings (
            id, clientName, clientPhone, clientFacebook, date, location,
            jobType, photographers, timeSlot, notes, total, deposit, balance, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        b.get('id'),
        b.get('clientName'),
        b.get('clientPhone'),
        b.get('clientFacebook'),
        b.get('date'),
        b.get('location'),
        b.get('jobType'),
        b.get('photographers'),
        b.get('timeSlot'),
        b.get('notes'),
        float(b.get('total') or 0),
        float(b.get('deposit') or 0),
        float(b.get('balance') or 0),
        int(b.get('timestamp') or 0)
    ))
    conn.commit()
    conn.close()

def delete_booking(booking_id):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM bookings WHERE id = ?', (booking_id,))
    conn.commit()
    conn.close()

def clear_all_bookings():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM bookings')
    conn.commit()
    conn.close()

class BookingHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Support CORS just in case
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == '/api/bookings':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            
            try:
                bookings = get_bookings()
                self.wfile.write(json.dumps(bookings, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                traceback.print_exc()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        else:
            # Fallback to serving static files
            super().do_GET()

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == '/api/bookings':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                booking = json.loads(post_data.decode('utf-8'))
                save_booking(booking)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success', 'id': booking.get('id')}).encode('utf-8'))
            except Exception as e:
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode('utf-8'))
                
        elif parsed_path.path == '/api/bookings/clear':
            try:
                clear_all_bookings()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
            except Exception as e:
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode('utf-8'))
                
        elif parsed_path.path == '/api/bookings/bulk':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                bookings = json.loads(post_data.decode('utf-8'))
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                # Clear first
                cursor.execute('DELETE FROM bookings')
                for b in bookings:
                    cursor.execute('''
                        INSERT OR REPLACE INTO bookings (
                            id, clientName, clientPhone, clientFacebook, date, location,
                            jobType, photographers, timeSlot, notes, total, deposit, balance, timestamp
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        b.get('id'),
                        b.get('clientName'),
                        b.get('clientPhone'),
                        b.get('clientFacebook'),
                        b.get('date'),
                        b.get('location'),
                        b.get('jobType'),
                        b.get('photographers'),
                        b.get('timeSlot'),
                        b.get('notes'),
                        float(b.get('total') or 0),
                        float(b.get('deposit') or 0),
                        float(b.get('balance') or 0),
                        int(b.get('timestamp') or 0)
                    ))
                conn.commit()
                conn.close()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
            except Exception as e:
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_DELETE(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == '/api/bookings':
            query = urllib.parse.parse_qs(parsed_path.query)
            booking_id = query.get('id', [None])[0]
            
            if booking_id:
                try:
                    delete_booking(booking_id)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'success', 'id': booking_id}).encode('utf-8'))
                except Exception as e:
                    traceback.print_exc()
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode('utf-8'))
            else:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Missing booking id'}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    init_db()
    
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
            
    print(f"Starting server on port {port}...")
    server_address = ('', port)
    httpd = http.server.HTTPServer(server_address, BookingHandler)
    print(f"Server running at http://localhost:{port}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()
        sys.exit(0)
