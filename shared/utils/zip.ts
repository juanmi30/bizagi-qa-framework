import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * ZIP mínimo para paquetes OOXML (docx/xlsx), sin dependencias: lectura por directorio central
 * (store/deflate) y escritura DETERMINISTA (fecha fija, orden dado, sin extras). No soporta ZIP64,
 * cifrado ni archivos multi-volumen: un OOXML de soporte nunca los necesita y se rechazan explícitamente.
 */

export interface EntradaZip { nombre: string; datos: Buffer }

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Buffer): number {
  let c = 0xffffffff;
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Lee todas las entradas en el orden del directorio central. Lanza si el archivo no es un ZIP soportado. */
export function leerZip(buffer: Buffer): EntradaZip[] {
  let fin = buffer.length - 22;
  while (fin >= 0 && buffer.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('El archivo no es un ZIP/OOXML válido (sin directorio central).');
  const total = buffer.readUInt16LE(fin + 10);
  let p = buffer.readUInt32LE(fin + 16);
  const entradas: EntradaZip[] = [];
  for (let i = 0; i < total; i++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP con directorio central corrupto.');
    const banderas = buffer.readUInt16LE(p + 8), metodo = buffer.readUInt16LE(p + 10);
    const comprimido = buffer.readUInt32LE(p + 20), largo = buffer.readUInt32LE(p + 24);
    const largoNombre = buffer.readUInt16LE(p + 28), extra = buffer.readUInt16LE(p + 30), comentario = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const nombre = buffer.subarray(p + 46, p + 46 + largoNombre).toString('utf8');
    if (banderas & 1) throw new Error(`ZIP cifrado no soportado (${nombre}).`);
    if (comprimido === 0xffffffff || local === 0xffffffff) throw new Error('ZIP64 no soportado.');
    const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const bruto = buffer.subarray(inicio, inicio + comprimido);
    const datos = metodo === 0 ? Buffer.from(bruto) : metodo === 8 ? inflateRawSync(bruto) : undefined;
    if (!datos) throw new Error(`Método de compresión ${metodo} no soportado (${nombre}).`);
    if (datos.length !== largo) throw new Error(`Tamaño inconsistente en ${nombre}.`);
    entradas.push({ nombre, datos });
    p += 46 + largoNombre + extra + comentario;
  }
  return entradas;
}

/** Fecha DOS fija (1980-01-01 00:00): el mismo contenido produce exactamente los mismos bytes. */
const FECHA_DOS = (1 << 5) | 1, HORA_DOS = 0;

/** Escribe un ZIP con deflate, en el orden recibido. Nombres duplicados -> error. */
export function escribirZip(entradas: readonly EntradaZip[]): Buffer {
  const vistos = new Set<string>();
  const locales: Buffer[] = [], centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const { nombre, datos } of entradas) {
    if (vistos.has(nombre)) throw new Error(`Entrada ZIP duplicada: ${nombre}`);
    vistos.add(nombre);
    const n = Buffer.from(nombre, 'utf8');
    const comprimido = deflateRawSync(datos, { level: 9 });
    const crc = crc32(datos);
    const cabecera = Buffer.alloc(30);
    cabecera.writeUInt32LE(0x04034b50, 0); cabecera.writeUInt16LE(20, 4); cabecera.writeUInt16LE(0x0800, 6); cabecera.writeUInt16LE(8, 8);
    cabecera.writeUInt16LE(HORA_DOS, 10); cabecera.writeUInt16LE(FECHA_DOS, 12); cabecera.writeUInt32LE(crc, 14);
    cabecera.writeUInt32LE(comprimido.length, 18); cabecera.writeUInt32LE(datos.length, 22); cabecera.writeUInt16LE(n.length, 26); cabecera.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(HORA_DOS, 12); central.writeUInt16LE(FECHA_DOS, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20); central.writeUInt32LE(datos.length, 24); central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    locales.push(cabecera, n, comprimido);
    centrales.push(central, n);
    desplazamiento += 30 + n.length + comprimido.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12); fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}
