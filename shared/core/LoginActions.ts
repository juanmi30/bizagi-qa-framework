import { PlaywrightMethods } from './PlaywrightMethods';
import { retrySafeUiOperation } from './SafeUiRetry';
import { LoginObjects } from '../baseObjects/login.objects';
import { InboxObjects } from '../baseObjects/inbox.objects';

/**
 * LoginActions (COMPARTIDO)
 * El Work Portal de Bizagi Cloud se renderiza igual entre proyectos, asi que el login
 * se escribe una vez y sirve para todos.
 */
export class LoginActions extends PlaywrightMethods {
  /**
   * Navegación inicial al Work Portal: SOLO page.goto('/'), reintentado ante errores de red
   * transitorios (SafeUiRetry). Nunca escribe ni envía credenciales.
   * Devuelve 'sesion' si el Inbox ya está visible, 'login' si se ve el formulario.
   */
  async navegarAlPortal({ timeout = 40_000, intervalo = 2_000 } = {}): Promise<'sesion' | 'login'> {
    let estado: 'sesion' | 'login' | undefined;
    await retrySafeUiOperation({
      nombre: 'Navegar al Work Portal de Bizagi',
      timeout, intervalo, esperaEstado: 15_000,
      accion: () => this.pwGoto('/'),
      estadoExitoso: async () => {
        if (await this.pwGet(InboxObjects.inboxContainer).first().isVisible()) estado = 'sesion';
        else if (await this.pwGet(`${LoginObjects.usernameInput}, ${LoginObjects.domainSelect}`).first().isVisible()) estado = 'login';
        return estado !== undefined;
      },
    });
    return estado!;
  }

  async login(user: string, password: string, dominioUsuario?: string): Promise<void> {
    // Sesión ya abierta: no reenviar credenciales.
    if (await this.navegarAlPortal() === 'sesion') return;
    // Credenciales UNA sola vez: el submit no se reintenta.
    // Extensión D: si el proyecto define BIZAGI_LOGIN_DOMINIO (.env), elegir primero el dominio.
    // Un dominio propio del usuario (DOMINIO_<clave>, lo pasa BpmEngine) tiene prioridad sobre el global.
    const dominio = dominioUsuario || process.env.BIZAGI_LOGIN_DOMINIO;
    if (dominio) {
      await this.pwGet(LoginObjects.domainSelect).first().selectOption(dominio);
    }
    const usuario = this.pwGet(LoginObjects.usernameInput).first();
    await usuario.waitFor({ state: 'visible', timeout: 15_000 });
    await usuario.fill(user);
    await this.pwGet(LoginObjects.passwordInput).first().fill(password);
    await this.pwGet(LoginObjects.loginButton).first().click();
    await this.pwWaitVisible(InboxObjects.inboxContainer);
  }

  async quickLogin(user: string): Promise<void> {
    await this.pwGoto('/');
    await this.pwClick(LoginObjects.quickLoginTile(user));
    await this.pwWaitVisible(InboxObjects.inboxContainer);
  }

  /**
   * Login por LISTA desplegable. Algunos ambientes Bizagi muestran "Seleccione sus
   * datos para ingresar a Bizagi": se elige el usuario en el combo y se pulsa Ingresar.
   * Sin contrasena. El `user` es el texto visible de la opcion (ej: "domain\\usuario.qa").
   */
  async selectUserLogin(user: string): Promise<void> {
    await this.pwGoto('/');
    await this.pwGet(LoginObjects.userSelect).selectOption({ label: user });
    await this.pwClick(LoginObjects.ingresarButton);
    await this.pwWaitVisible(InboxObjects.inboxContainer);
  }
}
