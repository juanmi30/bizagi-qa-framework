/**
 * Base Object COMPARTIDO: LOGIN de Bizagi Cloud.
 * Comun a todos los proyectos. Confirmar selectores reales con: npm run codegen -- <URL>
 */
export const LoginObjects = {
  // Los portales Bizagi varian en los ids: unos usan #UserName/#Password (PascalCase),
  // otros #user/#password (minuscula, ej. Colsubsidio). Se cubren ambas variantes.
  usernameInput: '#UserName, input[name="UserName"], #user',
  passwordInput: '#Password, input[name="Password"], #password:not([style*="display:none"])',
  passwordLabel: 'label[for="Password"], label[for="password"]',
  loginButton: '#btnLogin, #btn-login, button[type="submit"], button:has-text("Ingresar")',
  errorMessage: '.validation-summary-errors, .field-validation-error',
  quickLoginTile: (user: string): string => `a:has-text("${user}"), li:has-text("${user}")`,
  // Login por LISTA desplegable ("Seleccione sus datos para ingresar a Bizagi").
  userSelect: 'select',
  ingresarButton: 'button:has-text("Ingresar"), #btnLogin, button[type="submit"]',
  // Extensión D: portales con selector de DOMINIO antes de usuario/clave (ej. Colsubsidio).
  domainSelect: '#domain, select[name*="domain" i], select[id*="domain" i]',
  // Boton alterno "Iniciar sesion de Administrador" (aparece al elegir ciertos dominios).
  adminLoginButton: '#btn-login-admin, button:has-text("Iniciar sesión de")',
};
