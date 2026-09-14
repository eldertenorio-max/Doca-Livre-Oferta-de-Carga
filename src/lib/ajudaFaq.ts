export type AjudaFaqItem = {
  id: string
  pergunta: string
  resposta: string
}

export const AJUDA_FAQ: AjudaFaqItem[] = [
  {
    id: 'antt-piso',
    pergunta: 'O que é a tabela de frete mínimo da ANTT?',
    resposta:
      'É o piso mínimo obrigatório do frete rodoviário de cargas, definido pela ANTT (Lei 13.703/2018). O valor publicado é o menor preço que pode ser pago pelo serviço; não inclui pedágio nem o custo de combustível da sua operação. Neste calculador usamos a Resolução ANTT nº 6.084/2026.',
  },
  {
    id: 'tabelas-abcd',
    pergunta: 'Qual a diferença entre as Tabelas A, B, C e D?',
    resposta:
      'Tabela A: lotação (carga exclusiva). Tabela B: veículo agregado. Tabela C: lotação de alto desempenho. Tabela D: agregado de alto desempenho. A escolha muda o coeficiente CCD (R$/km) e o CC (carga e descarga) usados no piso.',
  },
  {
    id: 'calculo-frete',
    pergunta: 'Como é calculado o valor do frete?',
    resposta:
      'O piso ANTT é CCD × km (+ coeficiente de retorno vazio, se houver) + CC de carga e descarga, conforme eixos e tipo de carga. Aqui somamos também combustível (consumo × diesel × km) e pedágio das praças da rota. O total da calculadora é uma estimativa operacional, não substitui o contrato.',
  },
  {
    id: 'alto-desempenho',
    pergunta: 'O que significa Alto Desempenho?',
    resposta:
      'São as Tabelas C e D da ANTT, para operações com veículos de melhor desempenho energético. O piso fica diferente das Tabelas A e B (lotação e agregado convencionais). Use C/D só se a operação se enquadrar nessa regra.',
  },
  {
    id: 'retorno-vazio',
    pergunta: 'O que é retorno vazio?',
    resposta:
      'É o trecho em que o veículo volta sem carga. A ANTT aplica um fator (1,92) sobre o CCD nesse caso, para cobrir o deslocamento vazio. Na calculadora, ligue “ida e volta” quando quiser incluir o retorno no custo.',
  },
  {
    id: 'influencia',
    pergunta: 'O que influencia o valor do frete?',
    resposta:
      'Distância, número de eixos, tipo de carga, tabela ANTT (A–D), alto desempenho, retorno vazio, preço do diesel, consumo do veículo e as praças de pedágio do trajeto. A preferência de rota (mais rápida, mais barata ou eficiente) também muda km e pedágio.',
  },
  {
    id: 'atualizacao',
    pergunta: 'Com que frequência a tabela é atualizada?',
    resposta:
      'A ANTT republica os coeficientes quando há variação relevante, em especial do diesel. O Oferta de Carga acompanha a resolução vigente — hoje a Resolução nº 6.084/2026. Pedágio vem dos Dados Abertos da ANTT e pode mudar quando as praças atualizam tarifas.',
  },
  {
    id: 'quem-se-sujeita',
    pergunta: 'Quais transportadores estão sujeitos à tabela de frete?',
    resposta:
      'O piso vale para o transporte rodoviário remunerado de cargas no Brasil: TAC (autônomo), empresas e cooperativas. Contratar abaixo do piso mínimo é irregular. Consulte sempre o texto oficial da ANTT para o seu caso.',
  },
  {
    id: 'eixo-suspenso',
    pergunta: 'Quantos eixos devo considerar para o cálculo do piso mínimo, quando um dos eixos do veículo estiver suspenso?',
    resposta:
      'Considere só os eixos em contato com o solo no trecho. Eixo suspenso não entra na contagem do piso nem do pedágio por eixo. Ajuste o campo de eixos na calculadora para o número realmente apoiado no asfalto.',
  },
  {
    id: 'pedagio-tabela',
    pergunta: 'O valor do pedágio está incluído nas tabelas publicadas pela ANTT?',
    resposta:
      'Não. O piso mínimo da tabela ANTT não inclui pedágio. O vale-pedágio é obrigação à parte (Resolução ANTT nº 6.024/2023). Nesta tela o pedágio é calculado com as praças dos Dados Abertos da ANTT sobre o trajeto.',
  },
  {
    id: 'marcar-mapa',
    pergunta: 'Como marcar origem e destino no mapa?',
    resposta:
      'Toque em “Marcar origem e destino no mapa” e clique primeiro no ponto A (origem) e depois no ponto B (destino). Também dá para digitar o endereço ou usar o pino ao lado de cada campo. Depois de marcar os dois pontos, o cálculo roda sozinho.',
  },
  {
    id: 'salvar-rota',
    pergunta: 'Como salvar uma rota neste aparelho?',
    resposta:
      'Depois de calcular, use “Salvar neste aparelho”. As rotas ficam na lista “Salvas neste aparelho” no painel Trajeto. Elas não vão para a nuvem: são só deste navegador. No sistema logado você também pode gravar na aba Rotas.',
  },
  {
    id: 'calculos-gratis',
    pergunta: 'Quantos cálculos grátis eu tenho por dia?',
    resposta:
      'No site público há um limite diário de cálculos grátis. Quando acaba, você pode assinar o Doca Livre para calcular sem limite, ou esperar o dia seguinte. Quem está logado no sistema não tem esse teto.',
  },
  {
    id: 'frete-minimo',
    pergunta: 'Como usar a calculadora de frete mínimo?',
    resposta:
      'No painel, toque em “Calculadora de Frete” (logo abaixo de Calcular rota). Abre a página da calculadora de piso ANTT. Informe os km — ou use os km da rota já calculada — eixos, tabela A–D e o tipo de carga. Opcional: pedágio (R$), retorno vazio, margem, ICMS e toneladas. O piso da Resolução ANTT nº 6.084/2026 não inclui pedágio; o valor informado é somado à parte no total.',
  },
  {
    id: 'contato',
    pergunta: 'Como falo com o suporte do Doca Livre?',
    resposta:
      'Pesquise nas perguntas desta tela ou relate um problema por e-mail para contato@docalivre.com.br. Se preferir, chame no WhatsApp pelo botão verde. Informe origem, destino e o que apareceu na tela para agilizar o atendimento.',
  },
]

export function filtrarAjudaFaq(busca: string): AjudaFaqItem[] {
  const q = busca.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!q) return AJUDA_FAQ
  const tokens = q.split(/\s+/).filter(Boolean)
  return AJUDA_FAQ.filter((item) => {
    const blob = `${item.pergunta} ${item.resposta}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    return tokens.every((t) => blob.includes(t))
  })
}
