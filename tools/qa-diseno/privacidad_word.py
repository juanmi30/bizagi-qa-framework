"""Sustitución puntual de colaboradores en copias, incluso entre fragmentos XML."""
import re
from lxml import etree as ET

ROLES = {
    'Juan Miguel': 'Responsable funcional QA',
    'Daniel': 'Responsable funcional QA',
    'Iván': 'Analista QA',
    'Ivan': 'Analista QA',
    'Karen': 'Responsable de definición del requerimiento',
}
PATRON = re.compile(r'\b(?:' + '|'.join(re.escape(n).replace(r'\ ', r'\s+') for n in ROLES) + r')\b', re.I)


def sustituir(texto):
    def rol(m):
        nombre = re.sub(r'\s+', ' ', m[0]).casefold()
        return next(v for k,v in ROLES.items() if k.casefold() == nombre)
    return PATRON.sub(rol, texto)


def sustituir_fragmentos(slots):
    """Mantiene nodos y formato; pone el rol en el primer fragmento del nombre."""
    valores = [getattr(n, campo) or '' for n,campo in slots]
    texto = ''.join(valores)
    offsets = []; total = 0
    for v in valores:
        offsets.append(total); total += len(v)
    for match in reversed(list(PATRON.finditer(texto))):
        indices = [i for i,v in enumerate(valores) if offsets[i] < match.end() and offsets[i]+len(v) > match.start()]
        for j,i in enumerate(indices):
            inicio=max(0,match.start()-offsets[i]); fin=min(len(valores[i]),match.end()-offsets[i])
            valores[i]=valores[i][:inicio]+(sustituir(match[0]) if j==0 else '')+valores[i][fin:]
    for (n,campo),v in zip(slots,valores):
        if getattr(n,campo) is not None:
            setattr(n,campo,v)


def sanear_colaboradores(data):
    parser=ET.XMLParser(resolve_entities=False,load_dtd=False,no_network=True,remove_blank_text=False)
    root=ET.fromstring(data,parser)
    slots=[]
    def recorrer(n):
        if n.text is not None: slots.append((n,'text'))
        for hijo in n:
            recorrer(hijo)
            if hijo.tail is not None: slots.append((hijo,'tail'))
    recorrer(root)
    def bloque(n,campo):
        actual=n.getparent() if campo=='tail' else n
        superior=actual
        while actual is not None:
            if isinstance(actual.tag,str) and ET.QName(actual).localname=='p': return actual
            if actual.getparent() is root: superior=actual
            actual=actual.getparent()
        return superior
    separados=[]; anterior=None
    for n,k in slots:
        b=bloque(n,k)
        if anterior is not None and b is not anterior:
            separador=ET.Element('_limite');separador.text='\n';separados.append((separador,'text'))
        separados.append((n,k));anterior=b
    slots=separados
    antes=''.join(getattr(n,k) for n,k in slots)
    atributos=any(PATRON.search(v) for n in root.iter() for v in n.attrib.values())
    if not PATRON.search(antes) and not atributos:
        return data
    sustituir_fragmentos(slots)
    for n in root.iter():
        for k,v in list(n.attrib.items()): n.set(k,sustituir(v))
    return ET.tostring(root,encoding='utf-8',xml_declaration=data.lstrip().startswith(b'<?xml'))
