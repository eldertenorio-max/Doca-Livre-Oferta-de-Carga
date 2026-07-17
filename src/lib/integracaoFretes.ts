import type { Carga, IntegracaoFrete } from '../types'
import type { ConfigNegocio } from './configNegocio'

export function montarPayloadControleFretes(carga: Carga) {
  return {
    origem_sistema: 'Doca Livre Oferta de Carga',
    carga_numero: carga.numero,
    pedido: carga.pedido,
    origem: carga.origem,
    destino: carga.destino,
    frete_tabela: carga.frete_tabela,
    frete_fechado: carga.frete_fechado,
    margem_percentual: carga.margem_percentual,
    transportador_id: carga.transportador_vencedor_id,
    placa: carga.placa,
    motorista: carga.motorista,
    data_carregamento: carga.data_carregamento,
    peso: carga.peso,
    volumes: carga.volumes,
    alocado_em: new Date().toISOString(),
  }
}

/** Envia para Controle de Fretes ou registra simulação local. */
export async function enviarControleFretes(
  carga: Carga,
  cfg: ConfigNegocio,
): Promise<Omit<IntegracaoFrete, 'id'>> {
  const payload = montarPayloadControleFretes(carga)
  const agora = new Date().toISOString()

  if (!cfg.controle_fretes_ativo) {
    return {
      carga_id: carga.id,
      payload,
      status: 'simulado',
      tentativa_em: agora,
      resposta: 'Integração desativada nas configurações.',
    }
  }

  if (!cfg.controle_fretes_url.trim()) {
    return {
      carga_id: carga.id,
      payload,
      status: 'simulado',
      tentativa_em: agora,
      resposta: 'Fila local — configure a URL do Controle de Fretes para envio real.',
    }
  }

  try {
    const res = await fetch(cfg.controle_fretes_url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const text = await res.text().catch(() => '')
    return {
      carga_id: carga.id,
      payload,
      status: res.ok ? 'enviado' : 'erro',
      tentativa_em: agora,
      resposta: text.slice(0, 500) || `HTTP ${res.status}`,
    }
  } catch (e) {
    return {
      carga_id: carga.id,
      payload,
      status: 'erro',
      tentativa_em: agora,
      resposta: e instanceof Error ? e.message : 'Falha de rede',
    }
  }
}
