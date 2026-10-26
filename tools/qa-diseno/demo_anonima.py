"""Copias offline con redacción irreversible. Pillow + OCR local de Windows; nunca modifica originales.

No certifica anonimización universal: produce inventario y mantiene bloqueada la distribución externa.
"""
import argparse
import hashlib
import io
import json
import re
import unicodedata
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from PIL import Image, ImageDraw
from privacidad_word import sanear_colaboradores

COLOR = (90, 90, 90)
SINTETICOS = {'900123456', '800765432', '901234567', '900456789', '900987654',
              '100245678', '1109876543', '9023456781', '12012345678',
              '300123456', '400123456', '300654321', '300789012'}
COMUNES = {'usuarios', 'usuario', 'creador', 'correo', 'seguros', 'ltda', 'analista', 'externos', 'caso', 'del', 'test', 'com', 'co',
           'numero', 'proceso', 'forma', 'consulta', 'informacion', 'placa', 'poliza', 'polizas', 'documento', 'fecha',
           'creacion', 'radicacion', 'tipo', 'identificacion', 'actividad', 'plan', 'eventos', 'adicionar', 'planear'}

def normal(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s).lower() if not unicodedata.combining(c))

def lineas(doc):
    return [[x] if isinstance(x, dict) else x for x in doc.get('lineas', [])]

def caja(words):
    return (min(w['x'] for w in words), min(w['y'] for w in words),
            max(w['x']+w['w'] for w in words), max(w['y']+w['h'] for w in words))

def zonas_identidad(size, ocr):
    w, h = size
    if (w, h) == (1475, 900):
        # Hay dos vistas de este tamaño: diálogo de gráfico y listado del portal.
        grafica = any('grafica' in normal(x['texto']) and x['y'] < 80 for l in lineas(ocr) for x in l)
        if grafica:
            return [(154, 118, 501, 150, 'valor-creador-consulta-grafica')]
        return [(1340, 0, w, 62, 'avatar-superior-listado')]
    if w != 1440 or h != 900:
        return [(0, 0, w, h, 'formato-no-calibrado-revision-manual')]
    zones = [(1340, 0, w, 62, 'avatar-superior'), (0, 62, 270, 192, 'perfil-lateral')]
    # El OCR omite a veces el título Usuarios bajo un modal. Cubrir también las tarjetas
    # inferiores y usar Creador como anclaje alterno, incluidas sus iniciales de avatar.
    creadores = [a['y']-110 for l in lineas(ocr) for a in l if a['x'] > 1050 and normal(a['texto']).startswith('creador')]
    inicio = min([520, *creadores])
    zones.append((1082, max(200, inicio), w, h-35, 'tarjetas-identidad-lateral-respaldo'))
    for line in lineas(ocr):
        if not line:
            continue
        for word in line:
            txt = normal(word['texto'])
            if txt == 'usuario' and 530 <= word['x'] <= 630 and 350 < word['y'] < 500:
                # Tabla de trazabilidad calibrada: ocultar las DOS celdas completas,
                # no solo el primer token de la cuenta. Conserva actividades y fechas.
                zones.append((531, word['y']+20, 668, word['y']+96, 'usuario-tabla-trazabilidad'))
            if txt == 'usuarios' and word['x'] > 1050:
                limite = min([caja(l)[1]-5 for l in lineas(ocr) if l and caja(l)[0] > 1050 and caja(l)[1] > word['y']+30 and normal(' '.join(x['texto'] for x in l)).strip() in ['eventos', 'plan']] or [h-35])
                zones.append((1082, word['y']+20, w, limite, 'usuarios-y-cuentas-lateral'))
            if txt.startswith('creador') and 300 < word['x'] < 1000:
                x, y = word['x'], word['y']
                siguientes = [a['x'] for a in line if a['x'] > x+65 and normal(a['texto']).startswith('fecha')]
                derecha = min(siguientes)-6 if siguientes else x+112
                zones.append((x-4, y+word['h']+5, derecha, y+106, 'valor-creador-encabezado'))
    return zones

def aprender_tokens(imagenes, ocr_dir):
    tokens = set()
    for name, image in imagenes.items():
        doc = json.loads((ocr_dir / (Path(name).stem+'.json')).read_text(encoding='utf-8-sig'))
        zones = zonas_identidad(image.size, doc)
        for line in lineas(doc):
            for word in line:
                cx, cy = word['x']+word['w']/2, word['y']+word['h']/2
                if any(x1 <= cx <= x2 and y1 <= cy <= y2 and motivo in ['valor-creador-encabezado', 'usuarios-y-cuentas-lateral', 'valor-creador-consulta-grafica'] for x1,y1,x2,y2,motivo in zones):
                    for token in re.findall(r'[\w]+', normal(word['texto'])):
                        if len(token) >= 4 and token not in COMUNES and not token.isdigit():
                            tokens.add(token)
    return tokens

def redactar(image, ocr, tokens):
    image = image.convert('RGB')  # nuevo raster sin metadatos ni capas
    zones = zonas_identidad(image.size, ocr)
    for line in lineas(ocr):
        for word in line:
            text = normal(word['texto'])
            numbers = re.findall(r'\d{7,}', text)
            privada = '@' in text or any(n not in SINTETICOS for n in numbers)
            privada = privada or any(len(t) >= 4 and t in text for t in tokens)
            if privada:
                zones.append((word['x']-5, word['y']-4, word['x']+word['w']+5, word['y']+word['h']+4, 'texto-identificable-ocr'))
    draw = ImageDraw.Draw(image)
    valid = []
    for x1,y1,x2,y2,motivo in zones:
        rect = (max(0,int(x1)),max(0,int(y1)),min(image.width,int(x2+1)),min(image.height,int(y2+1)))
        if rect[0] >= rect[2] or rect[1] >= rect[3]:
            continue
        draw.rectangle((rect[0],rect[1],rect[2]-1,rect[3]-1), fill=COLOR)
        valid.append({'rect': list(rect), 'motivo': motivo})
    out = io.BytesIO()
    image.save(out, format='PNG')  # no EXIF, texto OCR ni original comprimido
    return out.getvalue(), valid

def limpiar_xml(data, tokens):
    data = sanear_colaboradores(data)
    text = data.decode('utf8')
    for t in sorted(tokens, key=len, reverse=True):
        text = re.sub(re.escape(t), '[ANONIMIZADO]', text, flags=re.I)
    text = re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', '[CORREO OCULTO]', text)
    text = re.sub(r'\bINT-\d+\b', '[CUENTA OCULTA]', text)
    text = re.sub(r'\bNIT\s*(\d{7,})\b', lambda m: m[0] if m[1] in SINTETICOS else '[IDENTIFICADOR OCULTO]', text, flags=re.I)
    text = re.sub(r'(<(?:dc:creator|cp:lastModifiedBy)>).*?(</(?:dc:creator|cp:lastModifiedBy)>)', r'\1QA DEMO\2', text, flags=re.S)
    text = re.sub(r'(w:author=")[^"]*(")', r'\1QA DEMO\2', text)
    return text.encode('utf8')

def paquete_demo(docx, salida, medias, tokens):
    if salida.exists():
        raise FileExistsError('La salida ya existe; no se sobrescribe.')
    buffer = io.BytesIO()
    with ZipFile(docx) as original, ZipFile(buffer, 'w', compression=ZIP_DEFLATED) as nuevo:
        retiradas = {n for n in original.namelist() if re.search(r'(^customXml/|^word/(embeddings/|comments|people)|^docProps/(thumbnail|custom))', n, re.I)}
        for name in original.namelist():
            if name in retiradas:
                continue
            data = original.read(name)
            if name.startswith('word/media/'):
                if name not in medias:
                    raise ValueError('Imagen sin procesamiento; no se produce una demostracion parcial con originales.')
                data = medias[name]
            elif name.endswith(('.xml', '.rels')):
                data = limpiar_xml(data, tokens)
                # Elimina vínculos externos y partes privadas ocultas de la copia, conservando el documento visible.
                text = data.decode('utf8')
                if name.endswith('.rels'):
                    text = re.sub(r'<Relationship\b[^>]*(?:TargetMode="External"|Target="[^"]*(?:thumbnail|comments|people|customXml|embeddings|docProps/custom)[^"]*")[^>]*/>', '', text)
                if name == '[Content_Types].xml':
                    text = re.sub(r'<Override\b[^>]*PartName="[^"]*(?:thumbnail|comments|people|customXml|embeddings|docProps/custom)[^"]*"[^>]*/>', '', text)
                if name == 'word/document.xml':
                    text = re.sub(r'(<w:hyperlink\b[^>]*?)\s+r:id="[^"]+"', r'\1', text)
                    banner = '<w:p><w:r><w:t>COPIA ANONIMIZADA PARA REVISION INTERNA. NO APTA PARA DISTRIBUCION EXTERNA. Datos identificables cubiertos en copias; originales privados intactos. QA debe revisar las zonas indicadas y la cobertura funcional.</w:t></w:r></w:p>'
                    text = text.replace('<w:body>', '<w:body>'+banner, 1)
                data = text.encode('utf8')
            nuevo.writestr(name, data)
    # Publicación únicamente tras construir el paquete completo, sin dejar un demo parcial si falla una imagen.
    with ZipFile(io.BytesIO(buffer.getvalue())) as z:
        assert z.testzip() is None
    with salida.open('xb') as f:
        f.write(buffer.getvalue())

def extract(docx, work):
    work.mkdir(parents=True, exist_ok=True)
    entrada = work/'entrada'; entrada.mkdir(exist_ok=True)
    with ZipFile(docx) as z:
        for n in z.namelist():
            if n.startswith('word/media/'):
                if not n.lower().endswith('.png'):
                    raise ValueError('Formato de imagen no soportado: requiere revision sin compartir.')
                (entrada/Path(n).name).write_bytes(z.read(n))

def construir(docx, work, salida):
    imagenes = {f'word/media/{p.name}': Image.open(p) for p in (work/'entrada').glob('*.png')}
    tokens = aprender_tokens(imagenes, work/'ocr')
    procesadas = work/'procesadas'; procesadas.mkdir(exist_ok=True)
    medias, inventario = {}, []
    for name, image in imagenes.items():
        ocr = json.loads((work/'ocr'/(Path(name).stem+'.json')).read_text(encoding='utf-8-sig'))
        data, zones = redactar(image, ocr, tokens)
        medias[name] = data; (procesadas/Path(name).name).write_bytes(data)
        inventario.append({'imagen': name, 'dimensiones': list(image.size), 'zonas': zones, 'sha256_copia': hashlib.sha256(data).hexdigest(),
                           'requiere_revision': True, 'revisiones': ['PII residual por OCR o zonas no calibradas', 'legibilidad y significado funcional preservados']})
    salida.parent.mkdir(parents=True, exist_ok=True)
    paquete_demo(docx, salida, medias, tokens)
    # Verifica el paquete final, no solo los archivos intermedios.
    with ZipFile(docx) as orig, ZipFile(salida) as demo:
        originals = {hashlib.sha256(orig.read(n)).hexdigest() for n in orig.namelist() if n.startswith('word/media/')}
        for n in demo.namelist():
            if n.startswith('word/media/'):
                assert hashlib.sha256(demo.read(n)).hexdigest() not in originals
                with Image.open(io.BytesIO(demo.read(n))) as im:
                    assert not im.info, 'Metadatos de imagen no eliminados'
        assert demo.testzip() is None
    informe = {'docx': str(salida), 'imagenes': len(inventario), 'apta_distribucion_externa': False,
               'motivo': 'Requiere revision de cada imagen por QA; OCR no garantiza ausencia universal de PII.', 'inventario': inventario}
    (work/'anonimizacion.json').write_text(json.dumps(informe, indent=2), encoding='utf8')
    files = sorted(procesadas.glob('*.png'))
    for start in range(0, len(files), 16):
        sheet = Image.new('RGB', (1440, 1000), 'white'); d = ImageDraw.Draw(sheet)
        for i,p in enumerate(files[start:start+16]):
            im = Image.open(p).convert('RGB'); im.thumbnail((355,225))
            x,y=(i%4)*360,(i//4)*250; sheet.paste(im,(x,y+20)); d.text((x+3,y+3),p.name,fill='black')
        sheet.save(work/f'revision-{start//16+1:02}.png')
    print(json.dumps({'docx': str(salida), 'imagenes': len(inventario), 'apta_distribucion_externa': False}))

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('accion',choices=['extraer','construir']);p.add_argument('--docx',type=Path,required=True);p.add_argument('--trabajo',type=Path,required=True);p.add_argument('--salida',type=Path)
    a=p.parse_args()
    if a.accion=='extraer': extract(a.docx,a.trabajo)
    else:
        if a.salida is None: p.error('falta --salida')
        construir(a.docx,a.trabajo,a.salida)
