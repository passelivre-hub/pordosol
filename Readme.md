# Cabanas Pôr do Sol — Sistema de Reservas (mobile)

Projeto simples em Flask + SQLite para lançar e acompanhar reservas de 3 chalés.
Feito para uso mobile (iPhone 15) — clique no calendário para abrir o popup.

## Estrutura
- `app.py` — backend Flask + API
- `data/reservations.sqlite` — banco SQLite criado automaticamente
- `templates/index.html` — frontend
- `static/style.css` e `static/script.js` — frontend assets

## Requisitos
- Python 3.10+ recomendado
- pip

## Rodando local
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
