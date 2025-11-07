# app.py
import sqlite3
import os
from flask import Flask, jsonify, request, send_from_directory, g, render_template
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
DB_PATH = os.path.join(DATA_DIR, 'reservations.sqlite')

os.makedirs(DATA_DIR, exist_ok=True)

app = Flask(__name__, static_folder='static', template_folder='templates')

# --- Database helpers ---
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
    return db

def init_db():
    db = get_db()
    db.execute('''
        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chale INTEGER NOT NULL DEFAULT 1,
            nome TEXT,
            whatsapp TEXT,
            valor_cents INTEGER DEFAULT 0,
            pessoas INTEGER DEFAULT 2,
            checkin TEXT,
            checkout TEXT,
            observacoes TEXT,
            status TEXT DEFAULT 'reservado',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    db.commit()

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

# util: convert "1.234,56" -> cents (int)
def valor_to_cents(v):
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return int(round(float(v) * 100))
    s = str(v).strip()
    if s == '':
        return 0
    # remove non numeric except comma and dot
    s = s.replace('.', '').replace(',', '.')
    try:
        f = float(s)
    except:
        f = 0.0
    return int(round(f * 100))

# util: row -> dict
def row_to_dict(row):
    if row is None: 
        return None
    d = dict(row)
    # ensure valor_cents is int
    d['valor_cents'] = int(d.get('valor_cents') or 0)
    return d

# init DB at startup
with app.app_context():
    init_db()

# Serve front
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def index(path):
    # Serve single page app
    return render_template('index.html')

# API: list reservations (optional from/to ISO YYYY-MM-DD)
@app.route('/api/reservations', methods=['GET'])
def api_list_reservations():
    from_date = request.args.get('from')
    to_date = request.args.get('to')
    db = get_db()
    if from_date and to_date:
        sql = '''SELECT * FROM reservations 
                 WHERE NOT (checkout < ? OR checkin > ?)
                 ORDER BY checkin, chale'''
        cur = db.execute(sql, (from_date, to_date))
    else:
        cur = db.execute('SELECT * FROM reservations ORDER BY checkin, chale')
    rows = cur.fetchall()
    data = [row_to_dict(r) for r in rows]
    return jsonify(data), 200

# API: get by id
@app.route('/api/reservations/<int:res_id>', methods=['GET'])
def api_get_reservation(res_id):
    db = get_db()
    cur = db.execute('SELECT * FROM reservations WHERE id = ?', (res_id,))
    row = cur.fetchone()
    if row is None:
        return jsonify({'error':'not found'}), 404
    return jsonify(row_to_dict(row)), 200

# API: create
@app.route('/api/reservations', methods=['POST'])
def api_create_reservation():
    payload = request.get_json() or {}
    chale = int(payload.get('chale') or 1)
    nome = payload.get('nome','').strip()
    whatsapp = (payload.get('whatsapp') or '').strip()
    valor = payload.get('valor')  # can be string "1.111,00"
    pessoas = int(payload.get('pessoas') or 2)
    checkin = payload.get('checkin')
    checkout = payload.get('checkout')
    observacoes = payload.get('observacoes','').strip()

    # validation
    if not checkin or not checkout:
        return jsonify({'error':'checkin e checkout são obrigatórios'}), 400
    try:
        dci = datetime.strptime(checkin, '%Y-%m-%d')
        dco = datetime.strptime(checkout, '%Y-%m-%d')
    except Exception:
        return jsonify({'error':'datas com formato inválido (use YYYY-MM-DD)'}), 400
    if dco < dci:
        return jsonify({'error':'checkout deve ser igual ou posterior ao checkin'}), 400

    valor_cents = valor_to_cents(valor)

    db = get_db()
    cur = db.execute('''
        INSERT INTO reservations (chale, nome, whatsapp, valor_cents, pessoas, checkin, checkout, observacoes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reservado')
    ''', (chale, nome, whatsapp, valor_cents, pessoas, checkin, checkout, observacoes))
    db.commit()
    rid = cur.lastrowid
    cur2 = db.execute('SELECT * FROM reservations WHERE id = ?', (rid,))
    row = cur2.fetchone()
    return jsonify(row_to_dict(row)), 201

# API: update
@app.route('/api/reservations/<int:res_id>', methods=['PUT'])
def api_update_reservation(res_id):
    payload = request.get_json() or {}
    # allow partial update; but validate dates if both present
    checkin = payload.get('checkin')
    checkout = payload.get('checkout')
    if checkin and checkout:
        try:
            dci = datetime.strptime(checkin, '%Y-%m-%d')
            dco = datetime.strptime(checkout, '%Y-%m-%d')
        except Exception:
            return jsonify({'error':'datas com formato inválido (use YYYY-MM-DD)'}), 400
        if dco < dci:
            return jsonify({'error':'checkout deve ser igual ou posterior ao checkin'}), 400

    valor = payload.get('valor', None)
    valor_cents = None
    if valor is not None:
        valor_cents = valor_to_cents(valor)

    fields = []
    params = []
    # build update
    for key in ('chale','nome','whatsapp','pessoas','checkin','checkout','observacoes','status'):
        if key in payload:
            fields.append(f"{key} = ?")
            params.append(payload.get(key))
    if valor_cents is not None:
        fields.append('valor_cents = ?')
        params.append(valor_cents)

    if not fields:
        return jsonify({'error':'nenhum campo para atualizar'}), 400

    params.append(res_id)
    db = get_db()
    sql = f"UPDATE reservations SET {', '.join(fields)} WHERE id = ?"
    db.execute(sql, params)
    db.commit()
    cur = db.execute('SELECT * FROM reservations WHERE id = ?', (res_id,))
    row = cur.fetchone()
    if row is None:
        return jsonify({'error':'not found'}), 404
    return jsonify(row_to_dict(row)), 200

# API: delete
@app.route('/api/reservations/<int:res_id>', methods=['DELETE'])
def api_delete_reservation(res_id):
    db = get_db()
    db.execute('DELETE FROM reservations WHERE id = ?', (res_id,))
    db.commit()
    return jsonify({'success': True}), 200

# API: checkin
@app.route('/api/reservations/<int:res_id>/checkin', methods=['POST'])
def api_checkin(res_id):
    db = get_db()
    db.execute("UPDATE reservations SET status = 'checkin' WHERE id = ?", (res_id,))
    db.commit()
    cur = db.execute('SELECT * FROM reservations WHERE id = ?', (res_id,))
    row = cur.fetchone()
    if row is None:
        return jsonify({'error':'not found'}), 404
    return jsonify(row_to_dict(row)), 200

# API: checkout
@app.route('/api/reservations/<int:res_id>/checkout', methods=['POST'])
def api_checkout(res_id):
    db = get_db()
    db.execute("UPDATE reservations SET status = 'checkout' WHERE id = ?", (res_id,))
    db.commit()
    cur = db.execute('SELECT * FROM reservations WHERE id = ?', (res_id,))
    row = cur.fetchone()
    if row is None:
        return jsonify({'error':'not found'}), 404
    return jsonify(row_to_dict(row)), 200

if __name__ == '__main__':
    # dev server
    app.run(host="0.0.0.0", port=5001)