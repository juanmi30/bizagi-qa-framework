/**
 * Base Object COMPARTIDO: FORMULARIOS del Work Portal de Bizagi.
 * Estrategias GENERICAS (no específicas de ningún cliente) para ubicar controles
 * por su etiqueta visible y para pulsar botones por su texto.
 */
export const FormObjects = {
  /** Botón por su texto visible: Siguiente, Guardar, Aceptar, Finalizar... */
  botonPorTexto: (texto: string): string =>
    `button:has-text("${texto}"), a[role="button"]:has-text("${texto}"), ` +
    `input[type="submit"][value="${texto}"], input[type="button"][value="${texto}"]`,

  /** Bizagi a veces pinta la forma dentro de un <iframe>. Si aplica, el proyecto lo indica. */
  formIframe: 'iframe#formIframe, iframe.form-frame, iframe[name*="form"]',
};
