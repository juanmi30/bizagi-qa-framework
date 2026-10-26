import io
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile
from lxml import etree as ET
from PIL import Image, ImageChops
from privacidad_word import PATRON, sanear_colaboradores, sustituir
from demo_anonima import limpiar_xml, zonas_identidad, COLOR
from cerrar_demo_v5 import crear, auditar, corregir_imagen, IMAGENES

BASE=Path('test-results/qa-hibrida/fase1.1/HU06_DEMO_ANONIMIZADA_REVISION_INTERNA_v4.docx')


class CierreV5Tests(unittest.TestCase):
    def test_roles_conservan_reglas_fechas_y_decisiones_pendientes(self):
        texto='Daniel con Iván; Karen; Confirmación funcional de Juan Miguel del 20/10/2026. FAIL. Pendiente de definición. OBS-07.'
        saneado=sustituir(texto)
        self.assertFalse(PATRON.search(saneado))
        for dato in ['20/10/2026','FAIL','Pendiente de definición','OBS-07','Confirmación funcional']:
            self.assertIn(dato,saneado)

    def test_nombre_entre_runs_y_atributos_y_contenido_duplicado(self):
        original=b'<doc autor="Daniel"><p><r formato="negrita">Dani</r><r>el con Iv</r><r>&#225;n</r></p><anexo>Juan Miguel / Karen</anexo></doc>'
        root=ET.fromstring(sanear_colaboradores(original))
        self.assertFalse(PATRON.search(''.join(root.itertext())))
        self.assertEqual(root[0][0].get('formato'),'negrita')
        self.assertEqual([e.tag for e in root.iter()],['doc','p','r','r','r','anexo'])
        self.assertEqual(root.get('autor'),'Responsable funcional QA')
        self.assertIn('Responsable funcional QA con Analista QA',''.join(root[0].itertext()))

    def test_regenerador_sanea_tambien_diagnosticos_sin_aprender_nombres_por_ocr(self):
        original='<doc><p>Daniel / Karen / Iván / Juan Miguel. Placa DEF456. FAIL.</p></doc>'.encode()
        nuevo=limpiar_xml(original,set())
        self.assertFalse(PATRON.search(''.join(ET.fromstring(nuevo).itertext())))
        self.assertIn(b'Placa DEF456. FAIL.',nuevo)

    def test_regenerador_oculta_celdas_completas_incluido_fragmento_corporativo(self):
        for y in [449,419,435]:
            with self.subTest(y=y):
                ocr={'lineas':[[{'texto':'Usuario','x':578,'y':y,'w':44,'h':9}]]}
                zones=zonas_identidad((1440,900),ocr)
                self.assertIn((531,y+20,668,y+96,'usuario-tabla-trazabilidad'),zones)

    def test_tres_mascaras_irreversibles_sin_cambiar_actividad_ni_fechas(self):
        for name,rect in IMAGENES.items():
            with self.subTest(imagen=name):
                original=Image.new('RGB',(1440,900),'white');buf=io.BytesIO();original.save(buf,format='PNG')
                copia=Image.open(io.BytesIO(corregir_imagen(buf.getvalue(),rect)))
                self.assertEqual(ImageChops.difference(original,copia).getbbox(),rect)
                self.assertEqual(copia.crop(rect).getextrema(),((90,90),(90,90),(90,90)))
                self.assertEqual(copia.getpixel((700,rect[1]+5)),(255,255,255))
                self.assertEqual(copia.getpixel((440,rect[1]+5)),(255,255,255))

    @unittest.skipUnless(BASE.exists(),'Regresión integrada requiere v4 local privada, que no se versiona.')
    def test_soporte_real_conservado_fuentes_intactas_y_originales_no_empaquetados(self):
        antes=BASE.read_bytes()
        with tempfile.TemporaryDirectory() as temp:
            out=Path(temp)/'v5.docx';r=crear(BASE,out)
            self.assertEqual(r['pasos'],108);self.assertEqual(r['casos'],5)
            self.assertEqual(r['estados'],{'PASS':91,'FAIL':12,'NOT_AUTOMATED':5})
            self.assertEqual(r['otras_imagenes_identicas'],102)
            self.assertFalse(r['originales_tres_imagenes_empaquetados'])
            self.assertTrue(r['observaciones_y_resultados_preservados'])
            self.assertEqual(BASE.read_bytes(),antes)
            with self.assertRaises(FileExistsError):crear(BASE,out)
            # Una alteración funcional debe invalidar la auditoría de conservación.
            buf=io.BytesIO()
            with ZipFile(out) as src,ZipFile(buf,'w') as dst:
                for n in src.namelist():
                    data=src.read(n)
                    if n=='word/document.xml':data=data.replace(b'Resultado esperado:',b'Resultado esperado: ALTERADO',1)
                    dst.writestr(n,data)
            buf.seek(0)
            with self.assertRaises(AssertionError):auditar(BASE,buf)

    def test_no_publica_salida_si_falta_imagen_requerida(self):
        with tempfile.TemporaryDirectory() as temp:
            src=Path(temp)/'v4.docx';dst=Path(temp)/'v5.docx'
            with ZipFile(src,'w') as z:z.writestr('word/document.xml',b'<doc/>')
            with self.assertRaises(ValueError):crear(src,dst)
            self.assertFalse(dst.exists())


if __name__=='__main__':unittest.main()
