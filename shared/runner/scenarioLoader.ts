import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';

/**
 * Lector + validador de plantillas de escenario (YAML) para Bizagi.
 * Objetivo: que un analista funcional escriba el "qué probar" en YAML y, si se
 * equivoca, reciba un mensaje CLARO en espanol (qué falta y en qué linea).
 */

export type ControlTipo =
  | 'texto' | 'área de texto' | 'area de texto' | 'fecha' | 'número' | 'numero'
  | 'lista' | 'búsqueda' | 'busqueda' | 'radio' | 'checkbox';

export interface CampoLlenar {
  campo: string;
  valor: string | number | boolean;
  tipo?: ControlTipo;
  localizador?: string; // escape de emergencia: apunta a projects/<cliente>/baseObjects
}

export interface VerificacionEntrada {
  campo: string;
  debe_estar?: string;     // ej: "vacío"
  tiene_valor?: string;    // ej: valor precargado esperado
}

/** Una fila a agregar en una tabla/colección: se llena dentro de su pop-up. */
export interface FilaTabla {
  llenar: CampoLlenar[];
}

/** Una tabla/colección del formulario: por cada fila se abre "Adicionar", se llena y se guarda. */
export interface TablaLlenar {
  tabla: string;                           // nombre visible de la tabla (ej. "Necesidades planeadas")
  filas: FilaTabla[];
}

/**
 * Espera EXPLÍCITA de integración (Extensión G, capa 2). Se declara en el paso cuyo botón
 * dispara una integración lenta (SAP, motor de decisiones, biometría...). Se aplica DESPUÉS
 * de la acción del paso. Si no se declara, igual hay una espera implícita moderada.
 */
export interface EsperaIntegracion {
  hasta_llegar_a?: string;                 // actividad/texto que debe aparecer al terminar
  maximo_minutos?: number;                 // default: ESPERA_INTEGRACION_MINUTOS del .env (5)
}

export interface Paso {
  actividad: string;
  usuario?: string;                        // si cambia -> logout + login (asignacion)
  verificar_al_entrar?: VerificacionEntrada[];
  llenar?: CampoLlenar[];
  tablas?: TablaLlenar[];                  // colecciones: filas que se agregan por pop-up
  accion?: string;                         // texto del boton: Siguiente, Guardar...
  esperar_integracion?: EsperaIntegracion; // espera larga tras la accion (integraciones)
  personalizado?: string;                  // nombre de un snippet en custom/ (pantalla rara)
}

export interface Inicio {
  modo: 'bandeja' | 'crear-caso' | 'buscar' | 'servicio';
  usuario: string;
  categoria?: string;                      // opcional: clic intermedio (agrupador) antes del proceso
  proceso_a_crear?: string;                // requerido si modo = crear-caso
  numero_caso?: string;                    // requerido si modo = buscar (nº del caso a abrir)
  recurso?: string;                        // requerido si modo = servicio (JSON de Create Case en resources/)
}

export type Hazard =
  | { el_caso_avanza_a: string }
  | { el_caso_ya_no_esta_en_bandeja_de: string }
  | { asignado_a: string }
  | { campo_tiene_valor: { campo: string; valor: string } }
  | { la_tabla_tiene_filas: { tabla: string; minimo: number } }
  | { el_caso_termina: boolean };

export interface Scenario {
  proceso: string;
  escenario: string;
  etiquetas: string[];
  inicio: Inicio;
  pasos: Paso[];
  hazards: Hazard[];
  archivo: string;                         // ruta del .yaml (para reportes)
}

/** Error de plantilla con lista de problemas legibles en espanol. */
export class ScenarioError extends Error {
  constructor(public readonly archivo: string, public readonly problemas: string[]) {
    super(
      `La plantilla "${archivo}" tiene ${problemas.length} problema(s) por corregir:\n` +
      problemas.map((p) => '  • ' + p).join('\n'),
    );
    this.name = 'ScenarioError';
  }
}

const TIPOS_VALIDOS: string[] = [
  'texto', 'área de texto', 'area de texto', 'fecha', 'número', 'numero',
  'lista', 'búsqueda', 'busqueda', 'radio', 'checkbox',
];
const TIPOS_SUGERIDOS = 'texto, área de texto, fecha, número, lista, búsqueda, radio, checkbox';

const HAZARDS_VALIDOS = [
  'el_caso_avanza_a', 'el_caso_ya_no_esta_en_bandeja_de', 'asignado_a',
  'campo_tiene_valor', 'la_tabla_tiene_filas', 'el_caso_termina',
];

/** Carga un .yaml, lo valida y devuelve el escenario tipado. Lanza ScenarioError si algo esta mal. */
export function loadScenario(filePath: string): Scenario {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    throw new ScenarioError(filePath, ['No se pudo abrir el archivo. Verifica que la ruta exista.']);
  }

  let doc: unknown;
  try {
    doc = yaml.load(raw);
  } catch (e: unknown) {
    const err = e as { mark?: { line?: number }; reason?: string; message?: string };
    const linea = err?.mark?.line != null ? err.mark.line + 1 : '?';
    throw new ScenarioError(filePath, [
      `El archivo no es un YAML válido (cerca de la línea ${linea}). ` +
      `Revisa la sangría (usa espacios, nunca tabuladores) y que cada dato tenga su ":". ` +
      `Detalle técnico: ${err?.reason ?? err?.message ?? ''}`,
    ]);
  }

  const lineas = raw.split(/\r?\n/);
  const lineaDe = (key: string): string => {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idx = lineas.findIndex((l) => new RegExp('^\\s*' + esc + '\\s*:').test(l));
    return idx >= 0 ? `línea ${idx + 1}` : 'revisa el archivo';
  };
  const esTexto = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

  if (doc == null || typeof doc !== 'object') {
    throw new ScenarioError(filePath, ['El archivo está vacío o no tiene el formato esperado (clave: valor).']);
  }
  const d = doc as Record<string, unknown>;
  const problemas: string[] = [];

  // --- Cabecera ---
  if (!esTexto(d.proceso))
    problemas.push('Falta "proceso" (nombre del proceso). Ej:  proceso: Radicación por aviso web');
  if (!esTexto(d.escenario))
    problemas.push('Falta "escenario" (nombre del caso de prueba). Ej:  escenario: Radicador completa la información');
  if (d.etiquetas != null && !(Array.isArray(d.etiquetas) && d.etiquetas.every(esTexto)))
    problemas.push(`"etiquetas" (${lineaDe('etiquetas')}) debe ser una lista de textos. Ej:  etiquetas: [regresion, radicacion-web]`);

  // --- inicio ---
  const inicio = d.inicio as Record<string, unknown> | undefined;
  if (inicio == null || typeof inicio !== 'object') {
    problemas.push('Falta el bloque "inicio" (cómo empieza el caso). Debe tener "modo" y "usuario".');
  } else {
    const modosValidos = ['bandeja', 'crear-caso', 'buscar', 'servicio'];
    if (!modosValidos.includes(inicio.modo as string))
      problemas.push(`"inicio.modo" (${lineaDe('modo')}) debe ser uno de: ${modosValidos.join(', ')}. Valor actual: ${JSON.stringify(inicio.modo)}`);
    if (!esTexto(inicio.usuario))
      problemas.push(`Falta "inicio.usuario" (${lineaDe('usuario')}): el usuario lógico con el que inicia. Ej: radicador1`);
    if (inicio.modo === 'crear-caso' && !esTexto(inicio.proceso_a_crear))
      problemas.push('Como "inicio.modo" es "crear-caso", falta "inicio.proceso_a_crear" (nombre visible del proceso a crear en el Work Portal).');
    if (inicio.modo === 'buscar' && !esTexto(inicio.numero_caso))
      problemas.push('Como "inicio.modo" es "buscar", falta "inicio.numero_caso" (el número del caso a abrir en el buscador).');
    if (inicio.modo === 'servicio' && !esTexto(inicio.recurso))
      problemas.push('Como "inicio.modo" es "servicio", falta "inicio.recurso" (ruta del JSON de Create Case bajo projects/<cliente>/resources/, ej. create-case/credito.json).');
  }

  // --- pasos ---
  if (!Array.isArray(d.pasos) || d.pasos.length === 0) {
    problemas.push('Falta la lista "pasos" con al menos un paso (una actividad a diligenciar).');
  } else {
    d.pasos.forEach((pRaw, i) => {
      const n = i + 1;
      const p = pRaw as Record<string, unknown>;
      if (p == null || typeof p !== 'object') { problemas.push(`Paso #${n}: no tiene el formato esperado.`); return; }
      if (!esTexto(p.actividad)) problemas.push(`Paso #${n}: falta "actividad" (nombre de la actividad en Bizagi).`);
      if (p.usuario != null && !esTexto(p.usuario)) problemas.push(`Paso #${n}: "usuario" está vacío; quítalo o pon el usuario lógico.`);
      if (p.personalizado != null && !esTexto(p.personalizado)) problemas.push(`Paso #${n}: "personalizado" debe ser el nombre de un snippet en custom/ (ej: adjuntar-archivos).`);
      if (p.llenar != null) {
        if (!Array.isArray(p.llenar)) {
          problemas.push(`Paso #${n}: "llenar" debe ser una lista de campos.`);
        } else {
          p.llenar.forEach((cRaw, j) => {
            const c = cRaw as Record<string, unknown>;
            const cn = `Paso #${n}, campo #${j + 1}`;
            if (!esTexto(c?.campo)) problemas.push(`${cn}: falta "campo" (la etiqueta visible del campo en la forma).`);
            if (c?.valor === undefined) problemas.push(`${cn} ("${(c?.campo as string) ?? ''}"): falta "valor".`);
            if (c?.tipo != null && !TIPOS_VALIDOS.includes(c.tipo as string))
              problemas.push(`${cn} ("${(c?.campo as string) ?? ''}"): "tipo" = ${JSON.stringify(c.tipo)} no es válido. Usa uno de: ${TIPOS_SUGERIDOS}.`);
          });
        }
      }
      if (p.tablas != null) {
        if (!Array.isArray(p.tablas)) {
          problemas.push(`Paso #${n}: "tablas" debe ser una lista de tablas/colecciones.`);
        } else {
          p.tablas.forEach((tRaw, ti) => {
            const t = tRaw as Record<string, unknown>;
            const tn = `Paso #${n}, tabla #${ti + 1}`;
            if (!esTexto(t?.tabla)) problemas.push(`${tn}: falta "tabla" (el nombre visible de la tabla/colección).`);
            if (!Array.isArray(t?.filas) || t.filas.length === 0) {
              problemas.push(`${tn} ("${(t?.tabla as string) ?? ''}"): falta "filas" con al menos una fila.`);
            } else {
              t.filas.forEach((fRaw, fi) => {
                const f = fRaw as Record<string, unknown>;
                const fn = `${tn}, fila #${fi + 1}`;
                if (!Array.isArray(f?.llenar) || f.llenar.length === 0) {
                  problemas.push(`${fn}: falta "llenar" con al menos un campo.`);
                } else {
                  f.llenar.forEach((cRaw, j) => {
                    const c = cRaw as Record<string, unknown>;
                    const cn = `${fn}, campo #${j + 1}`;
                    if (!esTexto(c?.campo)) problemas.push(`${cn}: falta "campo" (la etiqueta visible del campo en el pop-up).`);
                    if (c?.valor === undefined) problemas.push(`${cn} ("${(c?.campo as string) ?? ''}"): falta "valor".`);
                    if (c?.tipo != null && !TIPOS_VALIDOS.includes(c.tipo as string))
                      problemas.push(`${cn} ("${(c?.campo as string) ?? ''}"): "tipo" = ${JSON.stringify(c.tipo)} no es válido. Usa uno de: ${TIPOS_SUGERIDOS}.`);
                  });
                }
              });
            }
          });
        }
      }
      if (p.esperar_integracion != null) {
        const e = p.esperar_integracion as Record<string, unknown>;
        if (typeof e !== 'object' || Array.isArray(e)) {
          problemas.push(`Paso #${n}: "esperar_integracion" debe ser un bloque con "hasta_llegar_a" y/o "maximo_minutos".`);
        } else {
          if (e.hasta_llegar_a != null && !esTexto(e.hasta_llegar_a))
            problemas.push(`Paso #${n}: "esperar_integracion.hasta_llegar_a" debe ser el nombre visible de la actividad a la que debe llegar el caso.`);
          if (e.maximo_minutos != null && (typeof e.maximo_minutos !== 'number' || e.maximo_minutos <= 0))
            problemas.push(`Paso #${n}: "esperar_integracion.maximo_minutos" debe ser un número de minutos mayor que 0.`);
        }
      }
      if (p.verificar_al_entrar != null && !Array.isArray(p.verificar_al_entrar))
        problemas.push(`Paso #${n}: "verificar_al_entrar" debe ser una lista.`);
    });
  }

  // --- hazards ---
  if (!Array.isArray(d.hazards) || d.hazards.length === 0) {
    problemas.push('Falta la lista "hazards" (lo que debe ser cierto al terminar). Agrega al menos uno.');
  } else {
    d.hazards.forEach((hRaw, i) => {
      const h = hRaw as Record<string, unknown>;
      if (h == null || typeof h !== 'object') { problemas.push(`Hazard #${i + 1}: no tiene el formato esperado (clave: valor).`); return; }
      const desconocidas = Object.keys(h).filter((k) => !HAZARDS_VALIDOS.includes(k));
      if (desconocidas.length)
        problemas.push(`Hazard #${i + 1}: clave(s) no reconocida(s): ${desconocidas.join(', ')}. Válidas: ${HAZARDS_VALIDOS.join(', ')}.`);
    });
  }

  if (problemas.length) throw new ScenarioError(filePath, problemas);

  return {
    proceso: d.proceso as string,
    escenario: d.escenario as string,
    etiquetas: (d.etiquetas as string[]) ?? [],
    inicio: inicio as unknown as Inicio,
    pasos: d.pasos as Paso[],
    hazards: d.hazards as Hazard[],
    archivo: filePath,
  };
}

/**
 * Token ÚNICO de la corrida, con fecha-hora (ej. "20260707-143205"). Sirve para que cada
 * caso creado sea identificable en Bizagi y para no chocar entre corridas.
 */
export function generarUnico(fecha: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}` +
    `-${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}`
  );
}

/**
 * Reemplaza `${unico}` por el token en TODOS los textos del escenario (valores a teclear
 * Y valores de los hazards), para que lo que se escribe y lo que se verifica coincidan.
 * Devuelve una copia; no muta el escenario original.
 */
export function aplicarUnico<T>(valor: T, token: string): T {
  const rep = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(/\$\{unico\}/g, token);
    if (Array.isArray(v)) return v.map(rep);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = rep(val);
      return o;
    }
    return v;
  };
  return rep(valor) as T;
}
