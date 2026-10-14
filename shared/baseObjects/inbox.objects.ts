/**
 * Base Object COMPARTIDO: INBOX (bandeja del Work Portal). Comun a todos los proyectos.
 */
export const InboxObjects = {
  inboxContainer: '#inbox, .inbox, [data-region="inbox"], :text("Bandeja de entrada")',
  newCaseButton: 'a[title="New case"], #newCase, [data-action="newcase"], :text("Nuevo Caso"), :text("New case")',
  searchCase: 'input[type="search"], #searchBox',
  caseRow: '.case-row, tr.workitem',
  userMenu: '#user, #userMenu, .user-menu',
  logoutLink: 'a:has-text("Log out"), a:has-text("Cerrar sesion"), #logout',
  inboxMenu: ':text("Bandeja de entrada"), :text("Inbox")',
  caseNumber: '.case-number, [data-field="caseNumber"], [id*="caseNumber"], [id*="CaseNumber"]',
};
