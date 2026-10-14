import { PlaywrightMethods } from './PlaywrightMethods';
import { InboxObjects } from '../baseObjects/inbox.objects';
import { LoginObjects } from '../baseObjects/login.objects';

export class LogoutActions extends PlaywrightMethods {
  async logout(): Promise<void> {
    await this.pwClick(InboxObjects.userMenu);
    await this.pwClick(InboxObjects.logoutLink);
    await this.pwWaitVisible(LoginObjects.loginButton);
  }
}
