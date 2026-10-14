import type { Page } from '@playwright/test';
import type { BpmEngine } from './BpmEngine';

/**
 * Contexto que recibe un PASO PERSONALIZADO (snippet de custom/). El motor lo invoca
 * en medio de una plantilla, con la sesión ya iniciada y el caso abierto. Así el
 * snippet solo resuelve la "pantalla rara", sin duplicar login ni configuración.
 */
export interface PasoContext {
  page: Page;         // la página abierta (misma sesión del navegador)
  engine: BpmEngine;  // el motor, por si el snippet quiere reutilizar sus acciones
  usuario?: string;   // usuario lógico en sesión
}
