// Punto unico de importacion del nucleo compartido.
// En los tests:  import { LoginActions, Validations, LoginHazards } from '@shared';
export { PlaywrightMethods } from './core/PlaywrightMethods';
export { LoginActions } from './core/LoginActions';
export { LogoutActions } from './core/LogoutActions';
export { retrySafeUiOperation, esErrorTransitorioUi } from './core/SafeUiRetry';
export type { OperacionUiSegura } from './core/SafeUiRetry';
export { Validations } from './utils/Validations';
export { ApiHelpers } from './utils/ApiHelpers';
export { resourcePath } from './utils/FileHelpers';
export { LoginObjects } from './baseObjects/login.objects';
export { InboxObjects } from './baseObjects/inbox.objects';
export { FormActions } from './core/FormActions';
export { FormObjects } from './baseObjects/form.objects';
export { LoginHazards } from './hazards/login.hazards';
// Motor de plantillas (data-driven)
export { registerScenarios } from './runner/registerScenarios';
export { registerGrabado } from './runner/registerGrabado';
export type { GrabadoMeta } from './runner/registerGrabado';
export type { PasoContext } from './runner/customStep';
export { BpmEngine } from './runner/BpmEngine';
export { loadScenario, ScenarioError, generarUnico, aplicarUnico } from './runner/scenarioLoader';
export type { Scenario, Paso, CampoLlenar, Inicio, Hazard, VerificacionEntrada } from './runner/scenarioLoader';
export { verificarHazard, verificarEntrada } from './runner/hazards';
export type { ResultadoHazard } from './runner/hazards';
export { capturarEvidencia } from './runner/evidence';
