# Piloto 001 — regras de parada

## STOP IMMEDIATELY

- Exposição de dados entre tenants.
- Perda de resposta já confirmada.
- Histórico concluído alterado.
- Duplicação operacional recorrente.
- Execução não recuperável.
- Evidência atribuída ao tenant errado.
- Corrupção de estado.

Pare o turno afetado, não edite nem apague dados, colete o relatório de incidente e preserve prints/IDs. Não tente correção em remoto.

## FIX AND CONTINUE

Texto, loading que se recupera, refresh manual, pequeno atraso de sincronização e UX não crítica podem continuar após registrar a ocorrência e confirmar que não há perda, duplicação ou isolamento incorreto.
