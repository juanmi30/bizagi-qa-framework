import type { Page } from '@playwright/test';

/**
 * Observación ESTRUCTURAL sanitizada de la pantalla visible (CP01 HU 7.14). Solo textos PÚBLICOS de la UI (encabezados,
 * etiquetas, botones, alertas, tooltips/placeholders) y booleanos de estado; NUNCA el valor de un campo. Sirve como evidencia y
 * como descubrimiento reproducible de pantallas que el framework aún no modela.
 *
 * Identidad de un control: formcontrolname > name > id ESTABLE (los ids autogenerados de Material, p. ej. "mat-input-3", se
 * marcan como dinámicos y nunca se usan como identidad).
 */
export interface ControlEstructura {
  identidad: string;
  idDinamico: boolean;
  tag: string;
  tipo?: string;
  etiqueta?: string;
  placeholder?: string;
  familia: 'input' | 'autocomplete' | 'mat-select' | 'radio' | 'checkbox' | 'textarea' | 'select' | 'otro';
  requerido: boolean;
  deshabilitado: boolean;
  soloLectura: boolean;
  vacio: boolean;
  invalido: boolean;
}

export interface EstructuraPantalla {
  encabezados: string[];
  /** Migas de pan visibles (p. ej. "Afiliaciones / Registro Información Cliente"). */
  migas: string[];
  controles: ControlEstructura[];
  botones: { id: string | null; texto: string; habilitado: boolean }[];
  alertas: string[];
  /** Textos de tooltips visibles y atributos title/mattooltip de los controles (públicos). */
  tooltips: string[];
  spinners: string[];
}

export function observarEstructura(page: Page): Promise<EstructuraPantalla> {
  return page.evaluate((): EstructuraPantalla => {
    const visible = (e: Element) => (e as HTMLElement).getClientRects().length > 0 && getComputedStyle(e as HTMLElement).visibility !== 'hidden';
    const texto = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const dinamico = (id: string) => /^(mat|cdk|mdc)-[a-z-]*\d+$/i.test(id);
    const encabezados = [...document.querySelectorAll('h1, h2, h3, h4, [role="heading"]')].filter(visible).map(texto).filter(Boolean);
    const migas = [...document.querySelectorAll('[class*="breadcrumb" i], nav[aria-label*="breadcrumb" i]')].filter(visible).map(texto).filter(Boolean);
    const grupos = new Map<string, Element[]>();
    for (const e of [...document.querySelectorAll('input, mat-select, select, textarea')].filter(visible)) {
      if ((e as HTMLInputElement).type === 'hidden') continue;
      const estable = e.id && !dinamico(e.id) ? e.id : '';
      const id = e.getAttribute('formcontrolname') || e.getAttribute('name') || estable || `(sin-identidad:${e.tagName.toLowerCase()})`;
      grupos.set(id, [...(grupos.get(id) ?? []), e]);
    }
    const controles = [...grupos].map(([identidad, els]) => {
      const e = els[0];
      const campo = e.closest('mat-form-field') ?? e.parentElement;
      const tipo = (e as HTMLInputElement).type || undefined;
      const opciones = els.filter(x => ['radio', 'checkbox'].includes((x as HTMLInputElement).type));
      const familia: ControlEstructura['familia'] = e.tagName === 'MAT-SELECT' ? 'mat-select' : e.tagName === 'SELECT' ? 'select' : e.tagName === 'TEXTAREA' ? 'textarea'
        : tipo === 'radio' ? 'radio' : tipo === 'checkbox' ? 'checkbox'
          : e.getAttribute('aria-autocomplete') || e.classList.contains('mat-mdc-autocomplete-trigger') ? 'autocomplete' : e.tagName === 'INPUT' ? 'input' : 'otro';
      const etiqueta = texto(campo?.querySelector('mat-label, label')) || e.getAttribute('aria-label') || undefined;
      return {
        identidad, idDinamico: !!e.id && dinamico(e.id), tag: e.tagName, ...(tipo ? { tipo } : {}),
        ...(etiqueta ? { etiqueta } : {}), ...(e.getAttribute('placeholder') ? { placeholder: e.getAttribute('placeholder')! } : {}),
        familia,
        requerido: els.some(x => x.hasAttribute('required') || x.getAttribute('aria-required') === 'true')
          || !!campo?.querySelector('.mat-mdc-form-field-required-marker, .mat-form-field-required-marker'),
        deshabilitado: els.every(x => x.hasAttribute('disabled') || x.getAttribute('aria-disabled') === 'true'
          || x.classList.contains('mat-mdc-select-disabled') || x.classList.contains('mat-select-disabled')),
        soloLectura: els.some(x => x.hasAttribute('readonly')),
        vacio: opciones.length ? !opciones.some(r => (r as HTMLInputElement).checked)
          : e.tagName === 'MAT-SELECT' ? !texto(e.querySelector('.mat-mdc-select-value-text, .mat-select-value-text'))
            : !('value' in e) || String((e as HTMLInputElement).value).trim() === '',
        invalido: els.some(x => x.classList.contains('ng-invalid') || x.getAttribute('aria-invalid') === 'true'),
      };
    });
    const botones = [...document.querySelectorAll('button')].filter(visible).map(b => ({
      id: b.id && !dinamico(b.id) ? b.id : null, texto: texto(b), habilitado: !(b as HTMLButtonElement).disabled,
    })).filter(b => b.texto || b.id);
    const alertas = [...document.querySelectorAll('[role="alert"], .alert, .alerta, mat-error, .mat-mdc-form-field-error')].filter(visible).map(texto).filter(Boolean);
    const tooltips = [
      ...[...document.querySelectorAll('[role="tooltip"], .mat-mdc-tooltip, .mdc-tooltip')].filter(visible).map(texto),
      ...[...document.querySelectorAll('[mattooltip], [ng-reflect-message], [title]')].filter(visible)
        .map(e => e.getAttribute('mattooltip') || e.getAttribute('ng-reflect-message') || e.getAttribute('title') || ''),
    ].filter(Boolean);
    const spinners = [...document.querySelectorAll('mat-spinner, mat-progress-spinner, .spinner, [role="progressbar"]')].filter(visible)
      .map(e => texto(e.closest('div')) || '(spinner)');
    return { encabezados, migas: [...new Set(migas)], controles, botones, alertas: [...new Set(alertas)], tooltips: [...new Set(tooltips)], spinners };
  });
}
