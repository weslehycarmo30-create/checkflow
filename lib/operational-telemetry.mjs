/**
 * Minimal, local-only incident evidence for pilot operations.
 * Never pass response values, files, credentials, tokens, names or emails here.
 */
export function operationalFailure({ operation, entity, entityId, organizationId, errorCode, error }) {
  const event = {
    operation,
    entity,
    entity_id: entityId || undefined,
    organization_id: organizationId || undefined,
    error_code: errorCode,
    timestamp: new Date().toISOString(),
    technical_context: {
      error_name: error instanceof Error ? error.name : "unknown",
    },
  };
  // Intentional local console evidence for support; do not include raw server errors.
  console.warn("[checkflow:operational-failure]", event);
  return event;
}

export function safeOperationalMessage(errorCode, action) {
  return `Não foi possível ${action}. Verifique a conexão e tente novamente. Código: ${errorCode}.`;
}
