/** Exclusión de secretos técnicos en el documento, sin anonimizar usuarios, cuentas ni evidencia funcional. */
export function excluirSecretosTecnicos(texto: string): string {
  return texto.replace(/\b(Authorization["']?\s*:\s*["']?)(?:Bearer|Basic)\s+[^\s|;]+/gi, '$1[SECRETO EXCLUIDO]')
    .replace(/\b((?:password|passwd|clave(?:_[\w]+)?|access_token|refresh_token|token|client_secret|sessionid|JSESSIONID|[A-Z_]+_(?:PASSWORD|TOKEN|SECRET))["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s;|]+)/gi, '$1[SECRETO EXCLUIDO]')
    .replace(/\b((?:Set-Cookie|Cookie)["']?\s*:\s*)[^\r\n]+/gi, '$1[SECRETO EXCLUIDO]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[SECRETO EXCLUIDO]');
}
