import io
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, ImageDraw, PngImagePlugin
from demo_anonima import redactar, paquete_demo, COLOR

class AnonimizacionTests(unittest.TestCase):
    def test_mascara_solida_no_altera_region_funcional_ni_guarda_metadatos(self):
        original = Image.new('RGB', (1440,900), 'white')
        draw = ImageDraw.Draw(original)
        draw.text((455,270), 'Persona Privada', fill='black')
        draw.text((710,480), 'DEF456', fill='black')
        ocr={'lineas':[[{'texto':'Creador','x':450,'y':235,'w':100,'h':14},{'texto':'Fecha','x':565,'y':235,'w':40,'h':14}],
                       [{'texto':'Persona','x':455,'y':270,'w':100,'h':14}]]}
        data, zones=redactar(original,ocr,{'persona'})
        image=Image.open(io.BytesIO(data))
        self.assertEqual(image.crop((450,255,555,300)).getextrema(), ((90,90),(90,90),(90,90)))
        self.assertEqual(image.crop((700,450,850,520)).tobytes(), original.crop((700,450,850,520)).tobytes())
        self.assertFalse(image.info)
        self.assertTrue(zones)

    def test_formato_no_calibrado_se_retiene_completo_para_revision(self):
        data,zones=redactar(Image.new('RGB',(100,100),'red'),{'lineas':[]},set())
        image=Image.open(io.BytesIO(data))
        self.assertEqual(image.getextrema(),((90,90),(90,90),(90,90)))
        self.assertEqual(zones[0]['motivo'],'formato-no-calibrado-revision-manual')

    def test_consulta_grafica_conserva_ruta_y_cubre_creador(self):
        original=Image.new('RGB',(1475,900),'white')
        ImageDraw.Draw(original).text((600,500),'Ruta funcional',fill='blue')
        ocr={'lineas':[[{'texto':'Gráfica','x':110,'y':30,'w':90,'h':24}]]}
        data,zones=redactar(original,ocr,set())
        image=Image.open(io.BytesIO(data))
        self.assertEqual(image.getpixel((200,130)),COLOR)
        self.assertEqual(image.crop((24,210,1416,794)).tobytes(),original.crop((24,210,1416,794)).tobytes())
        self.assertEqual(zones[0]['motivo'],'valor-creador-consulta-grafica')

    def test_listado_mismo_tamano_del_grafico_cubre_avatar_sin_tapar_cabeceras(self):
        original=Image.new('RGB',(1475,900),'white')
        data,_=redactar(original,{'lineas':[]},set())
        image=Image.open(io.BytesIO(data))
        self.assertEqual(image.getpixel((1390,30)),COLOR)
        self.assertEqual(image.getpixel((200,125)),(255,255,255))

    def test_tarjetas_e_iniciales_cubiertas_aunque_ocr_omita_titulo_usuarios(self):
        original=Image.new('RGB',(1440,900),'white')
        ocr={'lineas':[[{'texto':'Creador','x':1140,'y':629,'w':50,'h':15}]]}
        data,_=redactar(original,ocr,set())
        image=Image.open(io.BytesIO(data))
        self.assertEqual(image.getpixel((1155,672)),COLOR)
        self.assertEqual(image.getpixel((715,400)),(255,255,255))

    def test_identificador_y_correo_se_ocultan_sin_ocultar_sintetico_autorizado(self):
        im=Image.new('RGB',(1440,900),'white')
        words=[{'texto':s,'x':400+i*220,'y':500,'w':130,'h':20} for i,s in enumerate(['NIT123456789','persona@example.test','100245678'])]
        data,_=redactar(im,{'lineas':[words]},set())
        out=Image.open(io.BytesIO(data))
        self.assertEqual(out.getpixel((405,505)),COLOR)
        self.assertEqual(out.getpixel((625,505)),COLOR)
        self.assertEqual(out.getpixel((845,505)),(255,255,255))

    def test_docx_no_conserva_originales_miniaturas_comentarios_embebidos_o_metadatos_personales(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp);src=base/'original.docx';dst=base/'demo.docx'
            image=Image.new('RGB',(1440,900),'white'); buf=io.BytesIO()
            meta=PngImagePlugin.PngInfo();meta.add_text('secret','Persona Privada');image.save(buf,format='PNG',pnginfo=meta)
            original=buf.getvalue();copia,_=redactar(image,{'lineas':[]},set())
            with ZipFile(src,'w') as z:
                z.writestr('word/media/test.png',original)
                z.writestr('word/document.xml','<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Persona texto</w:t></w:r></w:p></w:body></w:document>')
                z.writestr('word/embeddings/objeto.bin',original)
                z.writestr('word/comments.xml','Persona comentario')
                z.writestr('docProps/thumbnail.jpeg',original)
                z.writestr('customXml/item1.xml','Persona privado')
                z.writestr('docProps/core.xml','<x xmlns:dc="urn:dc"><dc:creator>Persona</dc:creator></x>')
            antes=src.read_bytes();paquete_demo(src,dst,{'word/media/test.png':copia},{'persona'})
            self.assertEqual(src.read_bytes(),antes)
            with ZipFile(dst) as z:
                self.assertEqual(z.namelist(),['word/media/test.png','word/document.xml','docProps/core.xml'])
                self.assertNotEqual(z.read('word/media/test.png'),original)
                self.assertNotIn(b'Persona',b''.join(z.read(n) for n in z.namelist()))
                self.assertIn(b'NO APTA PARA DISTRIBUCION EXTERNA',z.read('word/document.xml'))
            with self.assertRaises(FileExistsError):paquete_demo(src,dst,{'word/media/test.png':copia},set())

    def test_no_emite_copia_parcial_con_una_imagen_original_sin_tratar(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp);src=base/'original.docx'
            with ZipFile(src,'w') as z:z.writestr('word/media/original.png',b'original privado')
            with self.assertRaises(ValueError):paquete_demo(src,base/'demo.docx',{},set())
            self.assertFalse((base/'demo.docx').exists())

if __name__=='__main__': unittest.main()
