import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

export type EstadoDepuracion =
  | 'Pendiente de depurar'
  | 'Depurado';

/**
 * servicio: caso iniciado por API (InicioServicio).
 * portal: caso creado por la UI de un portal y observado por la automatización.
 */
export type ModoCreacionCaso = 'servicio' | 'portal';

/**
 * Registro persistente de un caso creado por la automatización.
 *
 * El histórico es además la infraestructura de recuperación: todo caso
 * pendiente aquí puede depurarse explícitamente después de un crash.
 */
export interface CasoHistorico {
  numeroCaso: string;
  fechaHora: string;
  escenario: string;
  modoCreacion: ModoCreacionCaso;
  estadoDepuracion: EstadoDepuracion;
}

export interface NuevoCasoHistorico {
  numeroCaso: string;
  escenario: string;
  modoCreacion?: ModoCreacionCaso;
}

/** Operaciones de archivo reemplazables solo para simular fallos en pruebas. */
interface OperacionesArchivo {
  escribir: (ruta: string, contenido: string) => Promise<void>;
  renombrar: (origen: string, destino: string) => Promise<void>;
}

interface DependenciasHistorialCasos {
  /**
   * Proyecto propietario del histórico.
   * En ejecución normal se obtiene desde process.env.PROJECT.
   */
  proyecto?: string;

  /**
   * Directorio raíz del framework.
   * Se puede reemplazar en pruebas para utilizar una carpeta temporal.
   */
  directorioBase?: string;

  /**
   * Función de fecha reemplazable para obtener resultados deterministas
   * en las pruebas.
   */
  ahora?: () => Date;

  archivos?: Partial<OperacionesArchivo>;
}

const PENDIENTE: EstadoDepuracion = 'Pendiente de depurar';
const DEPURADO: EstadoDepuracion = 'Depurado';

/**
 * Compatibilidad con registros anteriores: sin modo se asume servicio
 * (único modo que existía) y sin estado se asume pendiente.
 */
function normalizar(caso: Partial<CasoHistorico>): CasoHistorico {
  return {
    ...caso,
    numeroCaso: String(caso.numeroCaso ?? ''),
    fechaHora: caso.fechaHora ?? '',
    escenario: caso.escenario ?? '',
    modoCreacion: caso.modoCreacion ?? 'servicio',
    estadoDepuracion: caso.estadoDepuracion ?? PENDIENTE,
  };
}

const pausa = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Administra el histórico persistente de casos creados.
 *
 * Ruta:
 * test-results/<proyecto>/historico-casos.json
 *
 * Escritura atómica (temporal en el mismo directorio + rename): una
 * interrupción nunca deja el JSON truncado. No hay bloqueo entre procesos:
 * las pruebas reales que lo usan corren con workers=1.
 */
export class HistorialCasos {
  private readonly proyecto: string;
  private readonly directorioResultados: string;
  private readonly ahora: () => Date;
  private readonly archivos: OperacionesArchivo;

  constructor(
    dependencias: DependenciasHistorialCasos = {},
  ) {
    const proyecto = (
      dependencias.proyecto ??
      process.env.PROJECT ??
      ''
    ).trim();

    if (!proyecto) {
      throw new Error(
        'No se puede gestionar el histórico de casos porque falta el ' +
        'nombre del proyecto. Ejecuta mediante npm test -- <proyecto> ' +
        'o indica el proyecto al crear HistorialCasos.',
      );
    }

    this.proyecto = proyecto;
    this.directorioResultados = resolve(
      dependencias.directorioBase ?? process.cwd(),
      'test-results',
      proyecto,
    );
    this.ahora = dependencias.ahora ?? (() => new Date());
    this.archivos = {
      escribir: (ruta, contenido) => writeFile(ruta, contenido, 'utf8'),
      renombrar: rename,
      ...dependencias.archivos,
    };
  }

  /**
   * Ruta completa del archivo.
   * Se expone para documentación y pruebas.
   */
  get rutaArchivo(): string {
    return resolve(
      this.directorioResultados,
      'historico-casos.json',
    );
  }

  /**
   * Lee todos los casos registrados.
   *
   * Si el archivo todavía no existe, devuelve una lista vacía.
   */
  async listar(): Promise<CasoHistorico[]> {
    let contenido: string;

    try {
      contenido = await readFile(
        this.rutaArchivo,
        'utf8',
      );
    } catch (error: unknown) {
      const codigo = (
        error as NodeJS.ErrnoException
      ).code;

      if (codigo === 'ENOENT') {
        return [];
      }

      throw new Error(
        `No fue posible leer el histórico de casos del proyecto ` +
        `"${this.proyecto}". Verifica los permisos de ` +
        `test-results/${this.proyecto}/.`,
      );
    }

    try {
      const datos: unknown = JSON.parse(contenido);

      if (!Array.isArray(datos)) {
        throw new Error('La raíz del JSON no es una lista.');
      }

      return (datos as Partial<CasoHistorico>[]).map(normalizar);
    } catch {
      throw new Error(
        `El histórico de casos del proyecto "${this.proyecto}" ` +
        'no contiene un JSON válido. Corrige o respalda el archivo ' +
        `${this.rutaArchivo} antes de continuar.`,
      );
    }
  }

  /** Casos pendientes de depurar, opcionalmente de un solo modo de creación. */
  async listarPendientes(
    modoCreacion?: ModoCreacionCaso,
  ): Promise<CasoHistorico[]> {
    return (await this.listar()).filter(caso =>
      caso.estadoDepuracion === PENDIENTE &&
      (!modoCreacion || caso.modoCreacion === modoCreacion));
  }

  /**
   * Agrega un caso nuevo al histórico y devuelve el registro creado.
   * Un número ya registrado es un error: nunca se crea una segunda entrada.
   */
  async registrar(
    nuevoCaso: NuevoCasoHistorico,
  ): Promise<CasoHistorico> {
    const numeroCaso = nuevoCaso.numeroCaso.trim();
    const escenario = nuevoCaso.escenario.trim();

    if (!numeroCaso) {
      throw new Error(
        'No se puede registrar un caso sin número.',
      );
    }

    if (!escenario) {
      throw new Error(
        'No se puede registrar el caso porque falta el nombre del escenario.',
      );
    }

    const registro: CasoHistorico = {
      numeroCaso,
      fechaHora: this.ahora().toISOString(),
      escenario,
      modoCreacion: nuevoCaso.modoCreacion ?? 'servicio',
      estadoDepuracion: PENDIENTE,
    };

    const casos = await this.listar();

    if (casos.some(caso => caso.numeroCaso === numeroCaso)) {
      throw new Error(
        `El caso ${numeroCaso} ya existe en el histórico del proyecto ` +
        `"${this.proyecto}"; no se registra una segunda entrada.`,
      );
    }

    casos.push(registro);
    await this.guardar(casos, numeroCaso);

    return registro;
  }

  /**
   * Marca como Depurado únicamente el caso indicado. Idempotente si ya lo
   * estaba. Solo debe llamarse tras confirmar la depuración física.
   */
  async marcarDepurado(
    numeroCaso: string,
  ): Promise<CasoHistorico> {
    const numero = numeroCaso.trim();
    const casos = await this.listar();
    const indices = casos.flatMap((caso, i) =>
      caso.numeroCaso === numero ? [i] : []);

    if (indices.length === 0) {
      throw new Error(
        `El caso ${numero} no existe en el histórico del proyecto ` +
        `"${this.proyecto}"; no se marcó ningún caso como Depurado.`,
      );
    }

    if (indices.length > 1) {
      throw new Error(
        `El caso ${numero} aparece ${indices.length} veces en el histórico ` +
        `del proyecto "${this.proyecto}"; corrige el archivo antes de marcarlo.`,
      );
    }

    const actual = casos[indices[0]];

    if (actual.estadoDepuracion === DEPURADO) {
      return actual;
    }

    const actualizado = { ...actual, estadoDepuracion: DEPURADO };
    casos[indices[0]] = actualizado;
    await this.guardar(casos, numero);

    return actualizado;
  }

  /** Temporal en el mismo directorio + rename: el archivo previo sobrevive a cualquier fallo. */
  private async guardar(
    casos: CasoHistorico[],
    numeroCaso: string,
  ): Promise<void> {
    const temporal = `${this.rutaArchivo}.${process.pid}.${randomUUID()}.tmp`;

    try {
      await mkdir(
        this.directorioResultados,
        { recursive: true },
      );

      await this.archivos.escribir(
        temporal,
        JSON.stringify(casos, null, 2) + '\n',
      );

      // Windows puede negar el reemplazo un instante (antivirus/indexador).
      for (let intento = 1; ; intento++) {
        try {
          await this.archivos.renombrar(temporal, this.rutaArchivo);
          break;
        } catch (error: unknown) {
          const codigo = (error as NodeJS.ErrnoException).code;
          if (intento >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(codigo ?? '')) throw error;
          await pausa(50 * intento);
        }
      }
    } catch {
      await unlink(temporal).catch(() => {});
      throw new Error(
        `No fue posible guardar el caso ${numeroCaso} en el histórico ` +
        `del proyecto "${this.proyecto}". Verifica los permisos de ` +
        `test-results/${this.proyecto}/.`,
      );
    }
  }
}
