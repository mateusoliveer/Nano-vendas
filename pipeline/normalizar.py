"""Normaliza a saída JSON do gosom/google-maps-scraper para data/empresas.json.

Uso: python3 pipeline/normalizar.py resultados.json data/empresas.json
- Aceita JSON em array ou uma linha por empresa (JSONL).
- Junta com a base existente (chave: place_id/cid/link), atualizando quem já existe.
- Descarta empresas fechadas definitivamente.
"""
import json, re, sys, datetime, pathlib

def ler(path):
    txt = pathlib.Path(path).read_text(encoding='utf-8').strip()
    if not txt:
        return []
    if txt.startswith('['):
        return json.loads(txt)
    return [json.loads(l) for l in txt.splitlines() if l.strip().startswith('{')]

def cidade_uf(e):
    ca = e.get('complete_address') or {}
    cidade, uf = ca.get('city') or '', ca.get('state') or ''
    if not cidade:
        m = re.search(r',\s*([^,\-]+?)\s*-\s*([A-Z]{2})\b', e.get('address') or '')
        if m:
            cidade, uf = m.group(1).strip(), m.group(2)
    if len(uf) > 2:
        uf = UFS.get(uf.lower(), uf)
    return cidade, uf, ca.get('borough') or ''

UFS = {k.lower(): v for k, v in {
    'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM', 'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
    'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG',
    'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE', 'Piauí': 'PI', 'Rio de Janeiro': 'RJ',
    'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC',
    'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO'}.items()}

def avaliacoes(e):
    out = []
    for r in (e.get('user_reviews') or [])[:8]:
        txt = (r.get('Description') or r.get('text_original') or '').strip()
        nota = r.get('Rating') or r.get('rating_float') or 0
        if not txt and not nota:
            continue
        out.append({'s': nota, 't': re.sub(r'\s+', ' ', txt)[:260], 'r': bool(r.get('reply_text') or r.get('reply_text_original')), 'w': r.get('When') or ''})
    return out

def compactar(e, hoje):
    cidade, uf, bairro = cidade_uf(e)
    status = (e.get('status') or '').lower()
    return {
        'id': e.get('place_id') or e.get('cid') or e.get('data_id') or e.get('link'),
        'n': (e.get('title') or '').strip(),
        'c': e.get('category') or '',
        'cs': e.get('categories') or [],
        'end': e.get('address') or '',
        'b': bairro, 'cid': cidade, 'uf': uf,
        'tel': e.get('phone') or '',
        'site': e.get('web_site') or '',
        'nota': e.get('review_rating') or 0,
        'av': e.get('review_count') or 0,
        'lat': e.get('latitude'), 'lng': e.get('longitude', e.get('longtitude')),
        'maps': e.get('link') or '',
        'hor': bool(e.get('open_hours')),
        'desc': bool((e.get('description') or '').strip()),
        'email': [m for m in (e.get('emails') or []) if m][:3],
        'rv': avaliacoes(e),
        'fechado': 'permanent' in status or 'definitiv' in status,
        'q': e.get('input_id') or '',
        'upd': hoje,
    }

def main(entrada, saida):
    hoje = datetime.date.today().isoformat()
    base_path = pathlib.Path(saida)
    base = {}
    if base_path.exists():
        for r in json.loads(base_path.read_text(encoding='utf-8') or '[]'):
            base[r['id']] = r
    novos = 0
    for e in ler(entrada):
        r = compactar(e, hoje)
        if not r['id'] or not r['n']:
            continue
        if r.pop('fechado'):
            base.pop(r['id'], None)
            continue
        novos += r['id'] not in base
        base[r['id']] = r
    dados = sorted(base.values(), key=lambda r: (r['cid'], r['c'], r['n']))
    base_path.parent.mkdir(parents=True, exist_ok=True)
    base_path.write_text(json.dumps(dados, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    meta = {'total': len(dados), 'novos': novos, 'atualizado': hoje}
    (base_path.parent / 'meta.json').write_text(json.dumps(meta), encoding='utf-8')
    print(meta)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
