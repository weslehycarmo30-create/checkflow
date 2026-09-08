# Piloto 001 — matriz de confiança

| Failure mode | Impact | Protection | Test evidence | Residual risk | Pilot action |
| --- | --- | --- | --- | --- | --- |
| Checklist estrutural muda após atribuição | Histórico incorreto | DB trigger + frontend lock | Node, SQL, concurrency | Remoto pendente | Postflight + canary |
| Atribuição/execution duplica | Duplo trabalho | unique index + lifecycle trigger | SQL 8/8, concurrency 12/12 | Rollout pendente | Pare no primeiro conflito |
| Resposta some após refresh | Perda de confiança | Persistência DB + feedback | Node; E2E local bloqueado | Browser não executado | Human canary obrigatório |
| Conclusão sem obrigatório | Falso concluído | completion trigger | SQL, adversarial | UI real pendente | Canary bloqueia piloto se divergir |
| Histórico herda ciclo novo | Auditoria inválida | snapshot/identity guards | Node, SQL, adversarial | Remoto pendente | Verificar dois ciclos |
| Foto parece salva sem vínculo | Evidência falsa | Storage policy + RPC/trigger | adversarial 6/6 | Browser Storage não testado | Conferir foto/histórico |
| NC/plano parcial ou duplicado | Ação perdida | RPC atômico + unique indexes | SQL, concurrency | Remoto pendente | Criar NC/plano no canary |
| Dados cruzam empresas | Incidente P0 | RLS + tenant triggers | SQL/adversarial | E2E browser pendente | Two-tenant staging smoke |
| Duplo clique/race | Estado incoerente | frontend busy + DB locks | Node, concurrency 12/12 | Rede real pendente | Retry após recarregar |
| Erro de rede parece sucesso | Confiança perdida | respostas confirmadas/feedback | Node static tests | E2E offline pendente | Registrar falha e não repetir cegamente |
