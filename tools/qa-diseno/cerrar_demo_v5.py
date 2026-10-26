"""Cierre puntual desde v4: sin reconstruir soportes ni consultar evidencias privadas."""
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import re
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as ET
from PIL import Image, ImageDraw
from privacidad_word import PATRON, sanear_colaboradores, sustituir
from demo_anonima import COLOR
from auditar_demo import paquete

NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
IMAGENES={
    'word/media/sde-evidencia-050.png':(531,469,669,546),
    'word/media/sde-evidencia-074.png':(531,439,669,516),
    'word/media/sde-evidencia-096.png':(531,455,669,532),
}


def parrafos(data):
    return [''.join(p.itertext()) for p in ET.fromstring(data).findall('.//w:p',NS)]


def titulo_p18(data):
    root=ET.fromstring(data); activo=False; cambios=0
    for p in root.findall('.//w:p',NS):
        t=''.join(p.itertext())
        if re.match(r'^Paso \d+\.',t):
            activo=t.startswith('Paso 18. Ingresar una Placa que supere los 6 caracteres.')
        if activo and t.startswith('Causa:'):
            for nodo in p.findall('.//w:t',NS):
                if nodo.text and nodo.text.startswith('Causa:'):
                    nodo.text=nodo.text.replace('Causa:','Clasificaciones históricas:',1);cambios+=1
    if cambios!=1:
        raise ValueError('Se esperaba exactamente un título Causa de CP02-P18; no se publica una copia ambigua.')
    return ET.tostring(root,encoding='utf-8',xml_declaration=data.lstrip().startswith(b'<?xml'))


def corregir_imagen(data,rect):
    with Image.open(io.BytesIO(data)) as src:
        if src.size!=(1440,900): raise ValueError('Captura fuera de la calibración conocida.')
        image=src.convert('RGB')
    x1,y1,x2,y2=rect
    ImageDraw.Draw(image).rectangle((x1,y1,x2-1,y2-1),fill=COLOR)
    out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()


def crear(base,salida):
    if salida.exists(): raise FileExistsError('La salida ya existe; no se sobrescribe.')
    antes=hashlib.sha256(base.read_bytes()).hexdigest();buf=io.BytesIO()
    with ZipFile(base) as orig,ZipFile(buf,'w',compression=ZIP_DEFLATED) as nuevo:
        if not set(IMAGENES)<=set(orig.namelist()): raise ValueError('Falta una captura requerida en v4.')
        for name in orig.namelist():
            data=orig.read(name)
            if name in IMAGENES: data=corregir_imagen(data,IMAGENES[name])
            elif name.endswith(('.xml','.rels')):
                data=sanear_colaboradores(data)
                if name=='word/document.xml': data=titulo_p18(data)
            nuevo.writestr(name,data)
    salida.parent.mkdir(parents=True,exist_ok=True)
    # El contenido se valida antes de escribir el destino definitivo.
    resultado=auditar(base,io.BytesIO(buf.getvalue()))
    if hashlib.sha256(base.read_bytes()).hexdigest()!=antes: raise ValueError('La base cambió durante el proceso.')
    with salida.open('xb') as f: f.write(buf.getvalue())
    return {**resultado,'base_sha256':antes,'v5_sha256':hashlib.sha256(salida.read_bytes()).hexdigest()}


def auditar(base,destino):
    _,_,names=paquete(destino,externo=True)
    if hasattr(destino,'seek'): destino.seek(0)
    ubicaciones=Counter()
    with ZipFile(base) as a,ZipFile(destino) as b:
        assert set(a.namelist())==set(b.namelist()),'Partes añadidas o retiradas'
        before=parrafos(a.read('word/document.xml'));after=parrafos(b.read('word/document.xml'))
        estructura=lambda data:[(e.tag,sorted(e.attrib.items())) for e in ET.fromstring(data).iter()]
        assert estructura(sanear_colaboradores(a.read('word/document.xml')))==estructura(b.read('word/document.xml')),'Estructura o formato del cuerpo alterado'
        expected=[sustituir(t) for t in before]
        activo=False; titulos=0
        cp=0; paso=0
        principales={i for i,t in enumerate(before[:-1]) if re.match(r'^Paso \d+\.',t) and before[i+1]=='Resultado del paso'}
        for i,t in enumerate(before):
            if i in principales and t.startswith('Paso 1.'): cp+=1
            m=re.match(r'^Paso (\d+)(?:\.| —)',t)
            if m: paso=int(m[1])
            if PATRON.search(t): ubicaciones[f'CP{cp:02}-P{paso}']+=1
            if re.match(r'^Paso \d+\.',t): activo=t.startswith('Paso 18. Ingresar una Placa que supere los 6 caracteres.')
            if activo and t.startswith('Causa:'):
                expected[i]=expected[i].replace('Causa:','Clasificaciones históricas:',1);titulos+=1
        assert titulos==1 and after==expected,'Cambio textual ajeno a roles/título P18'
        assert set(ubicaciones)=={'CP01-P1','CP01-P4','CP05-P6','CP05-P8'},'Ubicaciones textuales inesperadas'
        pasos=[int(re.match(r'^Paso (\d+)\.',after[i])[1]) for i in sorted(principales)]
        grupos=[]
        for n in pasos:
            if n==1: grupos.append([])
            grupos[-1].append(n)
        assert [len(g) for g in grupos]==[29,22,25,23,9] and len(pasos)==108
        assert all(g==list(range(1,len(g)+1)) for g in grupos)
        estados=[re.match(r'^Paso \d+ — Estado: (\w+)',t)[1] for t in after if re.match(r'^Paso \d+ — Estado: (\w+)',t)]
        assert Counter(estados)=={'PASS':91,'FAIL':12,'NOT_AUTOMATED':5},'Estados alterados'
        assert sum('Diagnóstico técnico y trazabilidad' in t for t in after)==sum('Diagnóstico técnico y trazabilidad' in t for t in before)>=5
        assert any('Aprobación funcional QA' in t for t in after)
        assert any('NO APTA PARA DISTRIBUCION EXTERNA' in t for t in after)
        for n in names:
            data=b.read(n)
            if n.endswith(('.xml','.rels')):
                root=ET.fromstring(data)
                assert not PATRON.search(''.join(root.itertext())),f'Residuo textual en {n}'
                assert not any(PATRON.search(v) for e in root.iter() for v in e.attrib.values()),f'Residuo en atributo {n}'
                if n!='word/document.xml':
                    assert data==sanear_colaboradores(a.read(n)),'Cambio XML no previsto'
            elif n in IMAGENES:
                original=a.read(n)
                assert data==corregir_imagen(original,IMAGENES[n]),'Máscara o contenido alterado'
                assert all(original not in b.read(p) for p in names),'Bytes originales recuperables'
                with Image.open(io.BytesIO(data)) as im: assert not im.info
            else: assert data==a.read(n),'Parte no solicitada modificada'
        assert len([n for n in names if n.startswith('word/media/')])==105
    return {'casos':5,'pasos':108,'estados':dict(Counter(estados)),
            'ubicaciones_textuales_corregidas':dict(ubicaciones),'imagenes_corregidas':list(IMAGENES),
            'otras_imagenes_identicas':102,'observaciones_y_resultados_preservados':True,
            'paquete_xml_relaciones_validos':True,'residuos_textuales_conocidos':0,
            'originales_tres_imagenes_empaquetados':False,'aprobacion_funcional_QA':'PENDIENTE',
            'presentacion_visual':'PENDIENTE_REVISION_EN_WORD','apta_distribucion_externa':False}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--base',type=Path,required=True)
    p.add_argument('--salida',type=Path,required=True);p.add_argument('--informe',type=Path,required=True)
    args=p.parse_args();r=crear(args.base,args.salida)
    args.informe.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(r,ensure_ascii=True))
