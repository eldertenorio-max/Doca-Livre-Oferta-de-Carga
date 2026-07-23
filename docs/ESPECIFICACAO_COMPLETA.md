# Especificação completa — Doca Livre Oferta de Carga

Complemento ao PowerPoint **Oferta de Cargas**. Este documento define o que o PPT não detalha: banco, campos, regras de borda, fluxos alternativos, dashboard, integração, permissões, UX, notificações, auditoria, relatórios e NFRs.

Status relativo ao código atual: **OK** · **Parcial** · **Falta**.

Canvas navegável no Cursor: `especificacao-completa.canvas.tsx`.

---

## 1. Banco de dados (entidades alvo)

| Tabela | Status | Observação |
|--------|--------|------------|
| `profiles` / usuários | Parcial | Existe; falta `perfil_operacional`, `updated_at` |
| `perfis_operacionais` | Falta | admin / operador / consulta |
| `permissoes_usuario` | Parcial | Hoje por módulo em localStorage |
| `transportadores` | OK | Cadastro completo + documentos |
| `motoristas` | Falta | Hoje só nome na alocação |
| `veiculos` | OK | 5 fotos obrigatórias |
| `grupos_transportadores` + membros | OK | |
| `estados` / `cidades` | Falta | Hoje texto livre |
| `rotas` | OK | Classificação ABC |
| `cargas` | Parcial | Falta cancelada/suspensa, `criado_por` |
| `publicacoes` | Falta | Recomendado separar da carga |
| `lances` / propostas | Parcial | Falta `updated_at` persistido + histórico |
| `historico_propostas` | Falta | Alterações de valor |
| `negociacoes` | Falta | Estado da rodada |
| `alocacoes` | Parcial | Placa/motorista na carga |
| `notificacoes` | Falta | |
| `auditoria_logs` | Parcial | Histórico local sem IP/diff |
| `integracoes_fretes` | Parcial | Fila local |
| `configuracoes` | Parcial | localStorage |
| `portal_email_codigos` | OK | OTP e-mail |

### 1.1 Campos — Transportadora (exemplo)

| Campo | Tipo | Obrig. |
|-------|------|--------|
| id | uuid | Sim |
| razao_social | text | Sim |
| nome_fantasia | text | Sim |
| cnpj | text unique | Sim |
| inscricao_estadual / municipal | text | Não |
| rntrc | text | Sim* |
| endereco, numero, bairro, cep, cidade, uf | text | Parcial |
| telefone, email | text | Sim* |
| contato_nome, contato_telefone | text | Sim* cadastro público |
| classificacao | ouro\|prata\|bronze | Sim |
| pontuacao | int | Sim |
| situacao | pendente\|ativo\|inativo\|recusado | Sim |
| motivo_recusa | text | Se recusado |
| created_at, updated_at | timestamptz | Sim |

\* Obrigatório no fluxo de cadastro público.

### 1.2 Decisão de modelagem

Preferir **`publicacoes` separada de `cargas`**: uma carga pode ter N republicações, com histórico limpo de margens, grupos e prazos.

---

## 2. Regras completas (além do PPT)

| Situação | Comportamento | Status |
|----------|---------------|--------|
| Transportador desistiu após aceite | Recusadas + −1 pt; republicar ou cancelar | Parcial |
| Recusou sem lance | +recusas, −1 pt; carga segue | Parcial |
| Usuário cancelou publicação | status cancelada; notifica | Falta |
| Tempo sem propostas | Recusadas; penaliza não visualizadas | OK |
| Dois lances iguais | 1º timestamp; depois classificação; senão manual | Falta |
| Lance &gt; máximo | Rejeitar ou alertar (`frete_max`) | Falta |
| Lance &lt; mínimo | Alertar / regra configurável | Falta |
| Alterar proposta | Leilão: sim até expirar + histórico; Oferta: não após envio | Parcial |
| Reabrir negociação | Só Admin; limpa vencedor; novo prazo | Falta |
| Republicar | Nova `publicacao_id` | Falta |
| Alocação expirou | Recusa automática | OK |
| Oferta urgente | 1º lance &lt; frete_oferta fecha | OK |

---

## 3. Fluxos alternativos

- **Cancelada** — Falta  
- **Suspensa / retomar** — Falta  
- **Expirado / sem vencedor** — Parcial (existe; falta republicar 1 clique)  
- **Encerrado manual** — OK  
- **Reenvio grupos (metade prazo)** — OK  
- **Falha integração** — Parcial (fila; falta retry automático)

---

## 4. Dashboard

**KPIs:** publicadas, propostas, fechados, recusados, economia, margem média, tempo médio, conversão, SLA alocação.

**UI:** filtro período / rota / ABC; série temporal; ranking; **export CSV/XLSX**.

---

## 5. Integração Controle de Fretes

| Item | Definição |
|------|-----------|
| Protocolo | **REST** HTTPS |
| Formato | **JSON** |
| Auth | `Authorization: Bearer {API_KEY}` |
| Endpoint | `controle_fretes_url` (config) |
| Payload | `origem_sistema`, `carga_numero`, `pedido`, origem/destino, fretes, margem, `transportador_id`, placa, motorista, peso, volumes, datas |
| Sucesso | HTTP 2xx → `enviado` |
| Erro | 4xx/5xx → `erro` + retry 3× (1/5/15 min) |
| Idempotência | chave `carga_numero` + `alocado_em` |
| Mensageria | Fase 2 opcional; MVP = outbox SQL |

---

## 6. Permissões (ações)
Você está no lugar certo. A tela diz que ainda não tem nenhum secret — é só cadastrar os 4 abaixo.

O que fazer nessa tela
Para cada secret:

Em Name → cole o nome exato
Em Value → cole o valor
Clique em Add another
Repita até os 4
Clique em Save
Os 4 secrets (copie assim)
Name	Value
RESEND_API_KEY
sua chave do Resend (re_... — a mesma do WMS Pro)
RESEND_FROM
Doca Livre Oferta de Carga <onboarding@resend.dev>
PORTAL_OTP_SECRET
qualquer texto longo, ex.: doca-oferta-otp-segredo-2026-xyz
PORTAL_OTP_DEBUG
0
Dica: se a tela permitir colar vários de uma vez (key-value), pode colar assim:

RESEND_API_KEY=re_SUA_CHAVE_AQUI
RESEND_FROM=Doca Livre Oferta de Carga <onboarding@resend.dev>
PORTAL_OTP_SECRET=doca-oferta-otp-segredo-2026-xyz
PORTAL_OTP_DEBUG=0
Depois Save.

Como fica quando der certo
Em Custom secrets devem aparecer os 4 nomes (o valor fica oculto, só o digest).

Depois disso
Ainda falta publicar a função no PC:

npx supabase login
npx supabase functions deploy portal-otp --project-ref imnlbbfgaztfhwndfxwb
Secrets sozinhos não enviam e-mail — a função

| Ação | Admin | Operador | Consulta |
|------|-------|----------|----------|
| Criar / publicar / aceitar / finalizar | Sim | Sim | Não |
| Cancelar / republicar | Sim | Sim* | Não |
| Configurar sistema | Sim | Não | Não |
| Ver propostas / indicadores | Sim | Sim | Sim |
| Exportar relatórios | Sim | Sim | Não |
| Aprovar transportador | Sim | Não | Não |

\* Opcional: operador só cancela publicações próprias.

---

## 7. Layout / UX

Por tela: componentes, validações, mensagens, filtros, paginação (20/50), ordenação de propostas. Ver canvas seção 8.

---

## 8. Notificações

| Evento | E-mail | In-app | Push | WhatsApp/SMS |
|--------|--------|--------|------|--------------|
| OTP | Sim | — | — | — |
| Publicada / frete fechado / alocar | Sim | Sim | Opc. | Fase 2 |
| Novo lance | Opc. | Sim | Opc. | — |

Fase 1: e-mail (Resend) + in-app.

---

## 9. Auditoria

Registrar: **quem**, **ação**, **entidade**, **antes/depois JSON**, **quando**, **IP**, **user-agent**. Retenção alinhada à LGPD (12–24 meses).

---

## 10. Relatórios

Fretes publicados/negociados, economia, ranking transportadoras/rotas, tempo médio, cancelamentos, recusas — export CSV.

---

## 11. Não funcionais

Autenticação OTP+senha · RBAC · LGPD · HTTPS/secrets/RLS · p95 API · SLA 99,5% · backup Supabase · logs 90d · front stateless + Edge Functions.

---

## 12. Backlog sugerido (ordem)

1. Contrato REST Fretes + API key + retry / idempotência *(fora do escopo atual — integração básica permanece)*  
2. ~~Status cancelada/suspensa + republicar~~ ✅  
3. ~~Empate + min/max frete~~ ✅  
4. ~~Auditoria (ator) + `historico_propostas`~~ ✅  
5. ~~Dashboard filtros + export CSV~~ ✅  
6. E-mails de negócio (além do OTP de cadastro)  
7. ~~Tabela `motoristas` + alocação por FK~~ ✅  
8. Política LGPD / retenção  
9. ~~Notificações in-app~~ ✅  

SQL de extensão: `supabase/oferta_extensoes.sql` (ambientes já criados) + enums atualizados em `schema.sql`.
