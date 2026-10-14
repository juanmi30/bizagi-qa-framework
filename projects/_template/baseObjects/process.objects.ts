/**
 * Base Object DEL PROYECTO: proceso piloto (plantilla).
 * Duplicar/renombrar por cada proceso real (ej. cobroPersuasivo.objects.ts).
 * Convencion util en Bizagi: apuntar por nombre de atributo -> [id*="NombreAtributo"].
 * Si la forma esta en un <iframe>, ver README (seccion iframes).
 */
export const ProcessObjects = {
  processMenuItem: (processName: string): string => `a:has-text("${processName}")`,
  fieldText: (attr: string): string => `[id*="${attr}"] input, input[name*="${attr}"]`,
  fieldCombo: (attr: string): string => `[id*="${attr}"] select, select[name*="${attr}"]`,
  fieldDate: (attr: string): string => `[id*="${attr}"] input.date`,
  nextButton: 'button:has-text("Next"), button:has-text("Siguiente"), #btnNext',
  saveButton: 'button:has-text("Save"), button:has-text("Guardar"), #btnSave',
  caseNumberLabel: '.case-number, [data-field="caseNumber"]',
};
