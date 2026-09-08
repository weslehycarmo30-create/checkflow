# Piloto 001 — matriz de cobertura

| Feature | Unit | Integration | SQL | Adversarial | Concurrency | E2E | Human canary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth/session | PARTIAL | PARTIAL | MISSING | MISSING | MISSING | BLOCKED | PASS roteiro |
| Checklist draft/lock | PASS | PARTIAL | PASS | PARTIAL | PASS | BLOCKED | PASS roteiro |
| Assignment/reassignment | PASS | PARTIAL | PASS | PASS | PASS | BLOCKED | PASS roteiro |
| Execution/progress/answers | PASS | PARTIAL | PASS | PASS | PASS | BLOCKED | PASS roteiro |
| Completion | PASS | PARTIAL | PASS | PASS | PASS | BLOCKED | PASS roteiro |
| NC/action plan | PARTIAL | PARTIAL | PASS | PASS | PASS | BLOCKED | PASS roteiro |
| Evidence/photo | PARTIAL | PARTIAL | PASS | PASS | PARTIAL | BLOCKED | PASS roteiro |
| History/snapshot | PASS | PARTIAL | PASS | PASS | PARTIAL | BLOCKED | PASS roteiro |
| Tenant isolation | PARTIAL | MISSING | PASS | PASS | PASS | BLOCKED | PASS roteiro |
| Mobile 360/390/412 | PARTIAL | MISSING | N/A | N/A | N/A | BLOCKED | PASS roteiro |

`PARTIAL` significa regras executadas em Node ou testes de contrato, mas sem DOM/browser real. E2E permanece **BLOCKED** pelo healthcheck já conhecido e não foi reinvestigado.
