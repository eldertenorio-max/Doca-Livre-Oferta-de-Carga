# Doca Livre — Oferta de Carga

Sistema **independente** de publicação e negociação de fretes, baseado no fluxo do PowerPoint **Oferta de Cargas** (Doca Livre Oferta de Carga / Multi Embarcador). Não faz parte do hub WMS Light/Plus/Pro.

## O que está implementado

- **Kanban Doca Livre Oferta de Carga:** Nova Carga → Negociando → Propostas → Recusadas → Alocadas
- **Kanban Transportador:** Nova Carga → Propostas → Confirmadas → Alocadas
- **Classificação de rotas A/B/C** com faixas de margem (−7/−8/−9 · −4/−5/−6 · −1/−2/−3)
- **Prioridade e modo automáticos** pelo prazo:
  - ≤ 30 min → Alta + **Oferta** (exige justificativa; 1º lance menor fecha)
  - 31–59 min → Média + **Leilão**
  - ≥ 1 h → Baixa + **Leilão** (fecha com melhor proposta ao fim do prazo)
- **Grupos de transportadores** com notificação dos demais na metade do prazo
- **Pontuação Ouro / Prata / Bronze** por aderência
- Cadastros: Rotas, Transportadores, Grupos + Indicadores
- **Cadastro público de transportador** (link compartilhável): `/cadastro-transportador`

## Contas demo (modo local)

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Doca Livre Oferta de Carga | `minerva@docalivre.com` | `minerva123` |
| Transportador Santos | `santos@transportes.com` | `santos123` |
| Transportador Nova Era | `novaera@log.com` | `novaera123` |

Sem Supabase configurado, os dados ficam no `localStorage` do navegador.

## Cadastro público de transportador (link)

Fluxo para você enviar o link e a pessoa aparecer no sistema:

1. Suba o schema no Supabase (inclui `transportador_documentos` + bucket `documentos-transportadores`)
2. Em **Authentication → Providers → Email**, desative “Confirm email” no MVP (ou a sessão não volta no signup)
3. Deploy do front no Render com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
4. Envie o link:

```text
https://SEU-APP.onrender.com/cadastro-transportador
```

A pessoa preenche empresa + documentos + acesso. O cadastro entra como **pendente**. Em **Doca Livre Oferta de Carga** → **Transportadoras**, filtre **Pendentes** → **Revisar** → **Aprovar** (libera o login) ou **Recusar**.

Em modo local (sem Supabase), o aviso na tela deixa claro: o cadastro só fica no navegador onde foi feito.

## Rodar local

```bash
npm install
npm run dev
```

Abra http://localhost:5173

## 1) Subir a base no Supabase

1. Crie um projeto em [https://supabase.com](https://supabase.com)
2. Abra **SQL Editor** e execute, nesta ordem:
   - `supabase/schema.sql`
   - `supabase/seed.sql`
3. Em **Authentication → Users**, crie usuários (ou use sign-up) e, se necessário, atualize `profiles.role` / `transportador_id`
4. Copie **Project URL** e **anon key** (Settings → API)
5. Crie `.env` a partir de `.env.example`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> O app hoje funciona completo em **modo local**. O schema SQL já está pronto para você conectar Auth + tabelas no Supabase; o cliente em `src/lib/supabase.ts` detecta quando as variáveis estão preenchidas.

## 2) Subir o frontend no GitHub

```bash
git init
git add .
git commit -m "feat: Doca Livre Oferta de Carga — MVP completo"
gh repo create doca-livre-oferta-de-carga --public --source=. --remote=origin --push
```

Ou no GitHub: **New repository** → depois:

```bash
git remote add origin https://github.com/SEU_USUARIO/doca-livre-oferta-de-carga.git
git branch -M main
git push -u origin main
```

**Não versione** `.env` (já está no `.gitignore`). Use só `.env.example`.

## 3) Deploy no Render

### Opção A — Static Site (recomendado)

1. [Render Dashboard](https://dashboard.render.com) → **New → Static Site**
2. Conecte o repositório GitHub
3. Configuração:
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Em **Environment**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Em **Redirects/Rewrites**, adicione rewrite `/*` → `/index.html` (SPA)

### Opção B — Blueprint

O arquivo `render.yaml` já descreve o serviço estático. No Render: **New → Blueprint** → selecione o repo.

## Fluxo rápido para testar

1. Login como **Doca Livre Oferta de Carga** (`minerva@docalivre.com`)
2. Abra uma carga em **Nova Carga** → configure margem, grupos, prazo → **Publicar**
3. Logout → login como **Santos Transportes**
4. Envie um lance no Kanban
5. Volte como embarcador → aceite o lance (ou aguarde leilão/oferta automática)
6. Como transportador vencedor → **Alocar** placa e motorista

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS 4
- React Router 7
- Supabase (schema + client)
- Deploy: GitHub + Render
