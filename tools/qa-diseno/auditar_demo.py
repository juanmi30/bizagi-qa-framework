"""Verificación offline de un soporte nuevo y su copia anonimizada; no modifica las fuentes."""
import argparse
import hashlib
import io
import json
import posixpath
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile
from PIL import Image


def sha(data):
    return hashlib.sha256(data).hexdigest()


def paquete(path, externo=False):
    with ZipFile(path) as z:
        assert z.testzip() is None
        names=set(z.namelist())
        for n in names:
            if n.endswith(('.xml','.rels')):
                root=ET.fromstring(z.read(n))
                if n.endswith('.rels'):
                    base=posixpath.dirname(posixpath.dirname(n))
                    for r in root:
                        if r.get('TargetMode')=='External':
                            assert not externo, 'Vínculo externo en demo'
                            continue
                        t=r.attrib['Target'].replace('\\','/')
                        t=t.lstrip('/') if t.startswith('/') else posixpath.normpath(posixpath.join(base,t))
                        assert t in names, f'Relacion rota en {n}'
        doc=ET.fromstring(z.read('word/document.xml'))
        text=' '.join(doc.itertext())
        media={n:z.read(n) for n in names if n.startswith('word/media/')}
        return text, media, names


def auditar(original, demo, anterior, nuevo, manifiesto):
    old=json.loads(anterior.read_text(encoding='utf-8-sig'))
    new=json.loads(nuevo.read_text(encoding='utf-8-sig'))
    assert len(old['casos'])==len(new['casos'])==5
    assert old['seleccion']==new['seleccion']
    for a,b in zip(old['casos'],new['casos']):
        for k in ['cp','numeroCaso','resumen','observaciones','observacionesAutomaticas','origen']:
            assert a.get(k)==b.get(k), f'Diferencia de {k}'
        assert len(a['pasos'])==len(b['pasos'])
        for p,q in zip(a['pasos'],b['pasos']):
            for k in p:
                assert p[k]==q[k], f'Resultado original modificado: {a["cp"]} P{p["n"]} {k}'
    assert sum(len(c['pasos']) for c in new['casos'])==108
    text, medias, _=paquete(original)
    demo_text, copias, names=paquete(demo, externo=True)
    for label in ['Comprobación automática realizada','Pendiente de revisión','Diagnóstico técnico y trazabilidad',
                  'Aprobación funcional QA','No quedó demostrado que Bizagi permita placas de más de seis caracteres',
                  'Incidente posterior separado','Generación de este soporte']:
        assert label in text and label in demo_text, label
    assert 'NO APTA PARA DISTRIBUCION EXTERNA' in demo_text
    assert set(medias)==set(copias)
    originales={sha(b) for b in medias.values()}
    for b in copias.values():
        assert sha(b) not in originales
        with Image.open(io.BytesIO(b)) as im:
            assert not im.info, 'Metadatos de imagen'
    assert not any(re.search(r'(^customXml/|^word/(embeddings/|comments|people)|^docProps/(thumbnail|custom))',n,re.I) for n in names)
    capturas=[p['capturas'][-1] for c in new['casos'] for p in c['pasos'] if p['capturas']]
    assert all(sha(Path(p).read_bytes()) in originales for p in capturas)
    historial=json.loads(manifiesto.read_text(encoding='utf-8-sig'))
    assert all(Path(f['p']).exists() and sha(Path(f['p']).read_bytes())==f['hash'] for f in historial)
    return {'casos':5,'pasos':108,'estados_y_diagnosticos_originales_identicos':True,
            'capturas_representativas':len(capturas),'imagenes_reemplazadas':len(copias),
            'paquetes_xml_relaciones_validos':True,'originales_recuperables_en_media':False,
            'partes_privadas_ocultas_retiradas':True,'historicos_identicos':len(historial),
            'revision_imagenes_QA':'PENDIENTE','paginacion_visual':'PENDIENTE',
            'apta_distribucion_externa':False}


if __name__=='__main__':
    p=argparse.ArgumentParser()
    for n in ['original','demo','anterior','nuevo','manifiesto','informe']:
        p.add_argument('--'+n,type=Path,required=True)
    a=p.parse_args()
    r=auditar(a.original,a.demo,a.anterior,a.nuevo,a.manifiesto)
    a.informe.write_text(json.dumps(r,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    print(json.dumps(r,ensure_ascii=False))
