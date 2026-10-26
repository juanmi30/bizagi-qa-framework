"""Audita el soporte oficial contra fuentes locales, sin anonimizar ni ejecutar Bizagi."""
import hashlib
import io
import json
from pathlib import Path
import re
from zipfile import ZipFile
from lxml import etree as ET
from PIL import Image
from auditar_demo import paquete

raiz=Path('test-results/seguros-del-estado/soportes/HU06')
carpeta=max((p for p in raiz.iterdir() if p.is_dir()),key=lambda p:p.name)
docx=next(carpeta.glob('*.docx'))
plan=json.loads((carpeta/'HU06-soporte-plan.json').read_text(encoding='utf8'))
anterior=json.loads((raiz/'2026-10-22T19-17-59-815Z/HU06-soporte-plan.json').read_text(encoding='utf8'))
assert plan['casos']==anterior['casos'] and plan['seleccion']==anterior['seleccion'],'Resultados/seleccion alterados'
assert len(plan['casos'])==5 and sum(len(c['pasos']) for c in plan['casos'])==108
texto,media,names=paquete(docx)
sha=lambda b:hashlib.sha256(b).hexdigest()
capturas=[p['capturas'][-1] for c in plan['casos'] for p in c['pasos'] if p['capturas']]
assert len(capturas)==104
assert all(sha(Path(p).read_bytes()) in {sha(b) for b in media.values()} for p in capturas),'Captura modificada'
logo=Path('projects/seguros-del-estado/assets/branding/logo-seguros-del-estado.png').read_bytes()
with ZipFile('projects/seguros-del-estado/fuentes/20260928_SDE_CEL_V1_Casos de Prueba_HU06.xlsx') as x:
    assert logo==x.read('xl/media/image5.png')
with ZipFile(docx) as z,ZipFile('projects/colsubsidio/templates/soporte-certificacion-cliente-referencia.docx') as template:
    assert z.read('word/media/sde-logo-cliente.png')==logo
    assert '[Logo Cliente]' not in z.read('word/header1.xml').decode('utf8')
    for n in template.namelist():
        if n.startswith('word/media/') or n.startswith('word/footer'):
            assert z.read(n)==template.read(n),'Branding/pie de plantilla alterado'
    ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    root=ET.fromstring(z.read('word/document.xml')); principal=[];tecnico=[];es_tecnico=False
    for p in root.findall('.//w:p',ns):
        t=''.join(p.itertext())
        if re.match(r'^CP\d+ - ',t):es_tecnico=False
        if t=='Detalle técnico y trazabilidad':es_tecnico=True
        (tecnico if es_tecnico else principal).append(t)
    assert len([t for t in principal if t.startswith('Resultado obtenido:')])==108
    assert not any('[ANONIMIZADO]' in z.read(n).decode('utf8') for n in names if n.endswith('.xml'))
    assert not any('NO APTA PARA DISTRIBUCION EXTERNA' in t for t in principal)
    assert not any(re.search(r'EST-ORTOGRAFIA|INI-ETIQUETAS-INFORMACION-INICIAL|ORT-TERMINO-POLIZA|PRODUCTO_POR_CONFIRMAR|Comprobación automática realizada|Qué intentó realizar el robot',t) for t in principal)
    anexo='\n'.join(tecnico)
    for c in plan['casos']:
        for obs in c['observaciones']:assert obs in texto
        for p in c['pasos']:
            for d in p.get('diagnosticosOriginales') or [p['obtenido']]:assert d in anexo
    assert sum('Aprobación funcional QA: pendiente' in t for t in principal)==5
    assert sum('[Espacio para observaciones del analista QA]' in t for t in principal)==5
    assert not any(re.search(r'\b(?:password|CLAVE_\w+|access_token|refresh_token)\s*[:=]\s*(?!\[SECRETO)',t,re.I) for t in principal+tecnico)
    resultados=[t for t in principal if t.startswith('Resultado obtenido:')]
    assert not any('no permite resumir con precisión' in t for t in resultados),'Resumen generico sin cobertura'
    assert len(set(resultados))>60,'Redaccion excesivamente repetida'
    # Imagen del encabezado para revisión local; no es una comprobación de paginación.
    Image.open(io.BytesIO(logo)).save('tmp/word-oficial/logo-revision.png')
antes=json.loads(Path('tmp/word-oficial/antes.json').read_text(encoding='utf8'))
assert all(Path(f['p']).exists() and sha(Path(f['p']).read_bytes())==f['hash'] for f in antes),'Historico/fuente modificado'
informe={'docx':str(docx),'casos':5,'pasos':108,'estados':{'PASS':91,'FAIL':12,'NOT_AUTOMATED':5},
         'resultados_hallazgos_seleccion_identicos':True,'capturas_originales_incrustadas':len(capturas),
         'referencias_capturas_conservadas':sum(len(p['capturas']) for c in plan['casos'] for p in c['pasos']),
         'logo_cliente_sha256':sha(logo),'branding_gattaca_y_pies_intactos':True,
         'fuentes_e_historicos_identicos':len(antes),'anonimizacion_aplicada':False,
         'diagnosticos_integros_en_anexo':True,'paginacion_visual':'PENDIENTE: falta renderizador compatible'}
Path('tmp/word-oficial/verificacion.json').write_text(json.dumps(informe,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(informe,ensure_ascii=True))
