import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, FileText, Plus, Share2, Trash2 } from "lucide-react";
import { isCargaEphemeral, useData } from "../../context/DataContext";
import {
  formatCurrency,
  formatMoneyInput,
  parseMoneyInput,
} from "../../lib/businessRules";
import { flagSim, emptyClienteDistribuicao, isOfertaDistribuicao, labelTipoOferta, newClienteDistribuicaoId } from "../../lib/cargaDefaults";
import { buscarCidades, filtrarSugestoes } from "../../lib/cidadesBrasil";
import { cnpjDigits, formatCnpj, isValidCnpj } from "../../lib/cnpj";
import { buscarDadosPorCnpj } from "../../lib/cnpjLookup";
import { formatPhoneBr } from "../../lib/phoneBr";
import { TIPOS_CARGA } from "../../lib/tiposCarga";
import type {
  AnttInfoCarga,
  Carga,
  ClienteDistribuicao,
  ClassificacaoRota,
  PontoPassagemRota,
  Rota,
} from "../../types";
import { CargaExigenciasFields } from "./CargaExigenciasFields";
import { MARCA_SEM_ESPECIFICA } from "../../lib/cargaExigencias";
import { Button, Field, Modal, inputClass } from "../ui/Modal";
import { CnpjInput } from "../ui/CnpjInput";
import { SuggestInput } from "../ui/SuggestInput";
import { AddressSuggestInput, PLACEHOLDER_ENDERECO_EXEMPLO } from "../ui/AddressSuggestInput";
import { joinCarrocerias, parseCarrocerias } from "../../lib/tiposCarroceria";
import { limparPontosPassagemRota, newPontoPassagemId, newRotaId } from "../../lib/rotasSync";
import { fmtMapsCoords, parseMapsCoords } from "../../lib/mapsCoords";
import {
  enderecoPorCoordenadas,
  geocodificarConsulta,
  type EnderecoCampos,
} from "../../lib/geocodeEndereco";
import { CarroceriaSuggestInput } from "../ui/CarroceriaSuggestInput";
import { VeiculoSuggestInput } from "../ui/VeiculoSuggestInput";
import { AnttFretePanel } from "./AnttFretePanel";
import { RotaMapPreview } from "./RotaMapPreview";
import { CargaDistribuicaoDados } from "./CargaDistribuicaoDados";
import { consumoPadraoKmL, eixosDoVeiculo, PRECO_DIESEL_SUGERIDO } from "../../lib/anttFrete";
import {
  baixarPdfCarga,
  capturarMapaCarga,
  compartilharPdfCarga,
  type CargaPdfData,
} from "../../lib/cargaPdf";

function labelEndereco(dados: EnderecoCampos, display?: string): string {
  if (display?.trim()) return display.trim();
  const rua =
    dados.endereco && dados.numero
      ? `${dados.endereco}, ${dados.numero}`
      : dados.endereco || dados.numero || "";
  return [rua, dados.bairro, dados.cidade, dados.uf]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(", ");
}

type ComplementoCarga = NonNullable<Carga["complemento"]>;
type GerenciamentoRisco = NonNullable<Carga["gerenciamento_risco"]>;

const COMPLEMENTO_LABELS = ["Sim", "Não", "Ambos"] as const;
const RISCO_LABELS = [
  "Rastreador",
  "Localizador",
  "Ambos",
  "Não exige",
] as const;

function labelComplemento(v?: Carga["complemento"]) {
  if (v === "sim") return "Sim";
  if (v === "nao") return "Não";
  if (v === "ambos") return "Ambos";
  return "";
}

function parseComplemento(txt: string): ComplementoCarga | undefined {
  const n = txt.trim().toLowerCase();
  if (n === "sim") return "sim";
  if (n === "nao" || n === "não") return "nao";
  if (n === "ambos") return "ambos";
  return undefined;
}

function labelGerenciamentoRisco(v?: Carga["gerenciamento_risco"]) {
  if (v === "rastreador") return "Rastreador";
  if (v === "localizador") return "Localizador";
  if (v === "ambos") return "Ambos";
  if (v === "nao") return "Não exige";
  return "";
}

function parseGerenciamentoRisco(txt: string): GerenciamentoRisco | undefined {
  const n = txt.trim().toLowerCase();
  if (n === "rastreador") return "rastreador";
  if (n === "localizador") return "localizador";
  if (n === "ambos") return "ambos";
  if (n === "nao" || n === "não" || n === "nao exige" || n === "não exige")
    return "nao";
  return undefined;
}

type ClienteDistForm = {
  id: string
  nome: string
  endereco: string
  cnpj: string
  qtdEntregas: string
  qtdNfs: string
  pesoStr: string
  valorStr: string
}

function emptyClienteDistForm(): ClienteDistForm {
  const vazio = emptyClienteDistribuicao()
  return {
    id: vazio.id,
    nome: "",
    endereco: "",
    cnpj: "",
    qtdEntregas: "1",
    qtdNfs: "1",
    pesoStr: "",
    valorStr: "",
  }
}

function clientesParaForm(list: ClienteDistribuicao[]): ClienteDistForm[] {
  const rows = list.map((c) => ({
    id: c.id || newClienteDistribuicaoId(),
    nome: c.nome || "",
    endereco: c.endereco || "",
    cnpj: c.cnpj || "",
    qtdEntregas: String(c.qtd_entregas || 1),
    qtdNfs: String(c.qtd_nfs || 1),
    pesoStr: c.peso > 0 ? formatMoneyInput(c.peso) : "",
    valorStr: c.valor > 0 ? formatMoneyInput(c.valor) : "",
  }))
  return rows.length > 0 ? rows : [emptyClienteDistForm()]
}

function formParaClientes(rows: ClienteDistForm[]): ClienteDistribuicao[] {
  const out: ClienteDistribuicao[] = []
  for (const r of rows) {
    const nome = r.nome.trim() || r.endereco.trim()
    if (!nome) continue
    const qtdNf = Math.round(Number(r.qtdNfs) || 0)
    const qtdEnt = Math.round(Number(r.qtdEntregas) || 0)
    const valor = parseMoneyInput(r.valorStr)
    const peso = parseMoneyInput(r.pesoStr)
    out.push({
      id: r.id || newClienteDistribuicaoId(),
      nome,
      endereco: r.endereco.trim() || undefined,
      cnpj: r.cnpj.trim() || undefined,
      qtd_entregas: qtdEnt > 0 ? qtdEnt : 1,
      qtd_nfs: qtdNf > 0 ? qtdNf : 1,
      peso: Number.isNaN(peso) || peso < 0 ? 0 : peso,
      valor: Number.isNaN(valor) || valor < 0 ? 0 : valor,
    })
  }
  return out
}

function reordenarPontos<T>(lista: T[], indice: number, direcao: -1 | 1): T[] {
  const destino = indice + direcao
  if (destino < 0 || destino >= lista.length) return lista
  const next = [...lista]
  const [item] = next.splice(indice, 1)
  next.splice(destino, 0, item)
  return next
}

type Props = {
  carga: Carga;
  canEdit: boolean;
  onSaved?: () => void;
  onGoPublish?: () => void;
  /** Chamado quando o rascunho efêmero é gravado pela 1ª vez (ou atualizado na UI). */
  onPersisted?: (carga: Carga, opts?: { irParaPublicar?: boolean }) => void;
};

function toDateInput(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInput(value: string) {
  if (!value) return new Date().toISOString();
  const d = new Date(`${value}T12:00:00`);
  return d.toISOString();
}

function descricaoRota(origem: string, destino: string) {
  const o = origem.trim().toUpperCase();
  const d = destino.trim().toUpperCase();
  return `${o} - ${d}`;
}

function mesmaOrigemDestino(origem: string, destino: string): boolean {
  const o = origem.trim().toLowerCase().replace(/\s+/g, " ");
  const d = destino.trim().toLowerCase().replace(/\s+/g, " ");
  return Boolean(o && d && o === d);
}

function pontosDaCargaOuRota(carga: Carga, rotas: Rota[]): PontoPassagemRota[] {
  const daCarga = limparPontosPassagemRota(carga.pontos_passagem);
  if (daCarga.length > 0) return daCarga;
  if (!carga.rota_id) return [];
  const r = rotas.find((x) => x.id === carga.rota_id);
  return limparPontosPassagemRota(r?.pontos_passagem);
}

function asClassificacaoRota(raw: unknown): ClassificacaoRota {
  const v = String(raw ?? "B")
    .trim()
    .toUpperCase()
    .replace(/^ROTA\s+/, "");
  if (v === "A" || v === "B" || v === "C") return v;
  return "B";
}

function classificacaoDaCargaOuRota(
  carga: Carga,
  rotas: Rota[],
): ClassificacaoRota {
  if (carga.rota_id) {
    const r = rotas.find((x) => x.id === carga.rota_id);
    if (r?.classificacao) return asClassificacaoRota(r.classificacao);
  }
  return asClassificacaoRota(carga.classificacao_rota);
}

function resumoOpcaoRota(r: Rota): string {
  const vias = limparPontosPassagemRota(r.pontos_passagem);
  const base = `${r.origem} → ${r.destino}`;
  const cls = `Rota ${r.classificacao || "B"}`;
  if (vias.length === 0) return `${base} · ${cls}`;
  return `${base} · ${vias.length} ponto${vias.length === 1 ? "" : "s"} · ${cls}`;
}

const SUGESTOES_OBS = [
  "seco",
  "refrigerado",
  "fragil",
  "urgente",
  "agendar entrega",
  "requer acompanhamento",
  "carga paletizada",
];

const DESTINOS_ESPECIAIS = ["Distribuição"];

export function CargaDadosForm(props: Props) {
  if (isOfertaDistribuicao(props.carga)) {
    return <CargaDistribuicaoDados {...props} />;
  }
  return <CargaDadosFormLongoPercurso {...props} />;
}

function CargaDadosFormLongoPercurso({
  carga,
  canEdit,
  onSaved,
  onGoPublish,
  onPersisted,
}: Props) {
  const { rotas, cargas, atualizarCarga, criarCarga, salvarRota } = useData();
  const editavel = canEdit && carga.status === "nova_carga";

  const [origem, setOrigem] = useState(carga.origem);
  const [destino, setDestino] = useState(carga.destino);
  const [origemLat, setOrigemLat] = useState<number | null>(
    carga.origem_lat ?? null,
  );
  const [origemLng, setOrigemLng] = useState<number | null>(
    carga.origem_lng ?? null,
  );
  const [destinoLat, setDestinoLat] = useState<number | null>(
    carga.destino_lat ?? null,
  );
  const [destinoLng, setDestinoLng] = useState<number | null>(
    carga.destino_lng ?? null,
  );
  const [origemMapsStr, setOrigemMapsStr] = useState(
    fmtMapsCoords(carga.origem_lat, carga.origem_lng),
  );
  const [destinoMapsStr, setDestinoMapsStr] = useState(
    fmtMapsCoords(carga.destino_lat, carga.destino_lng),
  );
  const skipGeoOrigem = useRef(false);
  const skipGeoDestino = useRef(false);
  const skipRevOrigem = useRef(false);
  const skipRevDestino = useRef(false);
  const [complementoTxt, setComplementoTxt] = useState(() =>
    labelComplemento(carga.complemento),
  );
  const [riscoTxt, setRiscoTxt] = useState(() =>
    labelGerenciamentoRisco(carga.gerenciamento_risco),
  );
  const [marcaRastreador, setMarcaRastreador] = useState(
    carga.marca_rastreador || MARCA_SEM_ESPECIFICA,
  );
  const [marcaLocalizador, setMarcaLocalizador] = useState(
    carga.marca_localizador || MARCA_SEM_ESPECIFICA,
  );
  const [tempMin, setTempMin] = useState<number | undefined>(carga.temp_min);
  const [tempMax, setTempMax] = useState<number | undefined>(carga.temp_max);
  const [exigeAjudante, setExigeAjudante] = useState(Boolean(carga.exige_ajudante));
  const [freteTabela, setFreteTabela] = useState(
    formatMoneyInput(carga.frete_tabela || 0),
  );
  const [anttInfo, setAnttInfo] = useState<AnttInfoCarga | null>(
    carga.antt ?? null,
  );
  const [classificacao, setClassificacao] = useState<ClassificacaoRota>(() =>
    classificacaoDaCargaOuRota(carga, rotas),
  );
  const [salvarFavorita, setSalvarFavorita] = useState(false);
  const [rotaDescricaoSalvar, setRotaDescricaoSalvar] = useState("");
  const [cargaRetorno, setCargaRetorno] = useState(flagSim(carga.carga_retorno));
  const [retornaOrigem, setRetornaOrigem] = useState(flagSim(carga.retorna_origem));
  const [rotaId, setRotaId] = useState(carga.rota_id ?? "");
  const [pontosPassagem, setPontosPassagem] = useState<PontoPassagemRota[]>(() =>
    pontosDaCargaOuRota(carga, rotas),
  );
  const [pontosMapsStr, setPontosMapsStr] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      for (const p of pontosDaCargaOuRota(carga, rotas)) {
        init[p.id] = fmtMapsCoords(p.lat, p.lng);
      }
      return init;
    },
  );
  const skipRevPontos = useRef<Record<string, boolean>>({});
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState("");
  const [pedido, setPedido] = useState(carga.pedido);
  const [tipoCarga, setTipoCarga] = useState(carga.tipo_carga);
  const [veiculo, setVeiculo] = useState(carga.veiculo);
  const [carroceriaTxt, setCarroceriaTxt] = useState(() =>
    joinCarrocerias(parseCarrocerias(carga.carrocerias)),
  );
  const [destinatario, setDestinatario] = useState(carga.destinatario);
  const [destinatarioCnpj, setDestinatarioCnpj] = useState(
    formatCnpj(carga.destinatario_cnpj || ""),
  );
  const [destinatarioWhatsapp, setDestinatarioWhatsapp] = useState(
    formatPhoneBr(carga.destinatario_whatsapp || ""),
  );
  const [destinatarioEmail, setDestinatarioEmail] = useState(
    carga.destinatario_email || "",
  );
  const [peso, setPeso] = useState(formatMoneyInput(carga.peso || 0));
  const [volumes, setVolumes] = useState(String(carga.volumes || 0));
  const [numEntregas, setNumEntregas] = useState(
    String(carga.num_entregas || 1),
  );
  const [valorMerc, setValorMerc] = useState(
    formatMoneyInput(carga.valor_mercadorias || 0),
  );
  const [clientesDist, setClientesDist] = useState<ClienteDistForm[]>(() =>
    clientesParaForm(carga.clientes_distribuicao ?? []),
  );
  const [numeroCarga, setNumeroCarga] = useState(carga.numero);
  const [nomeRota, setNomeRota] = useState(carga.nome_rota ?? "");
  const isDistribuicao = isOfertaDistribuicao(carga);
  const [dataCarreg, setDataCarreg] = useState(
    toDateInput(carga.data_carregamento),
  );
  const [previsao, setPrevisao] = useState(toDateInput(carga.previsao_entrega));
  const [observacao, setObservacao] = useState(carga.observacao ?? "");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cnpjBuscando, setCnpjBuscando] = useState(false);
  const [cnpjInfo, setCnpjInfo] = useState("");
  const [cnpjInfoOk, setCnpjInfoOk] = useState(false);
  const ultimoCnpjBuscado = useRef("");

  const historico = useMemo(() => {
    const outras = cargas.filter((c) => c.id !== carga.id);
    return {
      origem: outras.map((c) => c.origem),
      destino: outras.map((c) => c.destino),
      pedido: outras.map((c) => c.pedido),
      tipo: outras.map((c) => c.tipo_carga),
      veiculo: outras.map((c) => c.veiculo),
      destinatario: outras.map((c) => c.destinatario),
      cnpj: outras.map((c) => c.destinatario_cnpj),
      whatsapp: outras.map((c) => c.destinatario_whatsapp || ""),
      email: outras.map((c) => c.destinatario_email || ""),
      peso: outras.map((c) => (c.peso > 0 ? formatMoneyInput(c.peso) : "")),
      volumes: outras.map((c) => (c.volumes > 0 ? String(c.volumes) : "")),
      entregas: outras.map((c) =>
        c.num_entregas > 0 ? String(c.num_entregas) : "",
      ),
      valorMerc: outras.map((c) =>
        c.valor_mercadorias > 0 ? formatMoneyInput(c.valor_mercadorias) : "",
      ),
      frete: outras.map((c) =>
        c.frete_tabela > 0 ? formatMoneyInput(c.frete_tabela) : "",
      ),
      obs: outras.map((c) => c.observacao),
      rotasOrigem: rotas.map((r) => r.origem),
      rotasDestino: rotas.map((r) => r.destino),
      rotasVias: rotas.flatMap((r) =>
        (r.pontos_passagem ?? []).map((p) => p.endereco),
      ),
    };
  }, [cargas, carga.id, rotas]);

  const sugOrigem = useMemo(
    () => (q: string) =>
      filtrarSugestoes(
        q,
        [buscarCidades(q, 14), historico.origem, historico.rotasOrigem],
        14,
      ),
    [historico.origem, historico.rotasOrigem],
  );

  const sugDestino = useMemo(
    () => (q: string) =>
      filtrarSugestoes(
        q,
        [
          DESTINOS_ESPECIAIS,
          buscarCidades(q, 14),
          historico.destino,
          historico.rotasDestino,
        ],
        14,
      ),
    [historico.destino, historico.rotasDestino],
  );

  const sugPonto = useMemo(
    () => (q: string) =>
      filtrarSugestoes(
        q,
        [
          buscarCidades(q, 10),
          historico.origem,
          historico.destino,
          historico.rotasVias,
        ],
        12,
      ),
    [historico.origem, historico.destino, historico.rotasVias],
  );

  const sugTipo = useMemo(
    () => (q: string) => {
      const catalog = [...TIPOS_CARGA];
      const qt = q.trim();
      if (!qt) return catalog;
      // Já selecionou um tipo do catálogo → ao focar mostra a lista inteira
      const exact = catalog.some((t) => t.toLowerCase() === qt.toLowerCase());
      if (exact) return catalog;
      const matched = filtrarSugestoes(qt, [catalog], 20);
      if (matched.length === 0) return catalog;
      return filtrarSugestoes(qt, [catalog, historico.tipo], 20);
    },
    [historico.tipo],
  );

  const sugRisco = useMemo(
    () => (q: string) => {
      const catalog = [...RISCO_LABELS];
      const qt = q.trim().toLowerCase();
      if (!qt) return catalog;
      if (catalog.some((t) => t.toLowerCase() === qt)) return catalog;
      return filtrarSugestoes(qt, [catalog], 8);
    },
    [],
  );

  const sugComplemento = useMemo(
    () => (q: string) => {
      const catalog = [...COMPLEMENTO_LABELS];
      const qt = q.trim().toLowerCase();
      if (!qt) return catalog;
      // Já escolheu Sim/Não/Ambos → ao focar mostra as 3 opções
      if (catalog.some((t) => t.toLowerCase() === qt)) return catalog;
      const matched = catalog.filter((t) => t.toLowerCase().includes(qt));
      return matched.length > 0 ? matched : catalog;
    },
    [],
  );

  const sugDestinatario = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.destinatario], 12),
    [historico.destinatario],
  );

  const sugPedido = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.pedido], 12),
    [historico.pedido],
  );

  const sugPeso = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.peso], 8),
    [historico.peso],
  );

  const sugVolumes = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.volumes], 8),
    [historico.volumes],
  );

  const sugEntregas = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.entregas], 8),
    [historico.entregas],
  );

  const sugValorMerc = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.valorMerc], 8),
    [historico.valorMerc],
  );

  const sugFrete = useMemo(
    () => (q: string) => filtrarSugestoes(q, [historico.frete], 8),
    [historico.frete],
  );

  const sugObs = useMemo(
    () => (q: string) =>
      filtrarSugestoes(q, [SUGESTOES_OBS, historico.obs], 12),
    [historico.obs],
  );

  useEffect(() => {
    setOrigem(carga.origem);
    setDestino(carga.destino);
    const temO =
      carga.origem_lat != null &&
      carga.origem_lng != null &&
      Number.isFinite(carga.origem_lat) &&
      Number.isFinite(carga.origem_lng);
    const temD =
      carga.destino_lat != null &&
      carga.destino_lng != null &&
      Number.isFinite(carga.destino_lat) &&
      Number.isFinite(carga.destino_lng);
    skipGeoOrigem.current = temO;
    skipGeoDestino.current = temD;
    skipRevOrigem.current = temO;
    skipRevDestino.current = temD;
    setOrigemLat(carga.origem_lat ?? null);
    setOrigemLng(carga.origem_lng ?? null);
    setDestinoLat(carga.destino_lat ?? null);
    setDestinoLng(carga.destino_lng ?? null);
    setOrigemMapsStr(fmtMapsCoords(carga.origem_lat, carga.origem_lng));
    setDestinoMapsStr(fmtMapsCoords(carga.destino_lat, carga.destino_lng));
    setComplementoTxt(labelComplemento(carga.complemento));
    setRiscoTxt(labelGerenciamentoRisco(carga.gerenciamento_risco));
    setMarcaRastreador(carga.marca_rastreador || MARCA_SEM_ESPECIFICA);
    setMarcaLocalizador(carga.marca_localizador || MARCA_SEM_ESPECIFICA);
    setTempMin(carga.temp_min);
    setTempMax(carga.temp_max);
    setExigeAjudante(Boolean(carga.exige_ajudante));
    setFreteTabela(formatMoneyInput(carga.frete_tabela || 0));
    setAnttInfo(carga.antt ?? null);
    setClassificacao(classificacaoDaCargaOuRota(carga, rotas));
    setSalvarFavorita(false);
    setRotaDescricaoSalvar("");
    setCargaRetorno(flagSim(carga.carga_retorno));
    setRetornaOrigem(flagSim(carga.retorna_origem));
    setRotaId(carga.rota_id ?? "");
    const pts = pontosDaCargaOuRota(carga, rotas);
    setPontosPassagem(pts);
    const maps: Record<string, string> = {};
    for (const p of pts) maps[p.id] = fmtMapsCoords(p.lat, p.lng);
    setPontosMapsStr(maps);
    setPedido(carga.pedido);
    setTipoCarga(carga.tipo_carga);
    setVeiculo(carga.veiculo);
    setCarroceriaTxt(joinCarrocerias(parseCarrocerias(carga.carrocerias)));
    setDestinatario(carga.destinatario);
    setDestinatarioCnpj(formatCnpj(carga.destinatario_cnpj || ""));
    setDestinatarioWhatsapp(formatPhoneBr(carga.destinatario_whatsapp || ""));
    setDestinatarioEmail(carga.destinatario_email || "");
    setPeso(formatMoneyInput(carga.peso || 0));
    setVolumes(String(carga.volumes || 0));
    setNumEntregas(String(carga.num_entregas || 1));
    setValorMerc(formatMoneyInput(carga.valor_mercadorias || 0));
    setClientesDist(clientesParaForm(carga.clientes_distribuicao ?? []));
    setNumeroCarga(carga.numero);
    setNomeRota(carga.nome_rota ?? "");
    setDataCarreg(toDateInput(carga.data_carregamento));
    setPrevisao(toDateInput(carga.previsao_entrega));
    setObservacao(carga.observacao ?? "");
    setError("");
    setInfo("");
    setCnpjBuscando(false);
    setCnpjInfo("");
    setCnpjInfoOk(false);
    ultimoCnpjBuscado.current = "";
  }, [carga.id, carga.updated_at]);

  const totaisDist = useMemo(() => {
    const pontos = formParaClientes(clientesDist);
    const nfs = pontos.reduce((acc, c) => acc + c.qtd_nfs, 0);
    const entregas = pontos.reduce((acc, c) => acc + c.qtd_entregas, 0);
    const valor = pontos.reduce((acc, c) => acc + c.valor, 0);
    const pesoKg = pontos.reduce((acc, c) => acc + c.peso, 0);
    return { pontos: pontos.length, entregas, nfs, valor, peso: pesoKg };
  }, [clientesDist]);

  useEffect(() => {
    if (!isDistribuicao) return;
    setNumEntregas(String(Math.max(1, totaisDist.entregas)));
    setValorMerc(formatMoneyInput(totaisDist.valor));
    setPeso(formatMoneyInput(totaisDist.peso));
  }, [isDistribuicao, totaisDist.entregas, totaisDist.valor, totaisDist.peso]);

  // Se a rota cadastrada chega depois (sync), preenche pontos + classificação
  useEffect(() => {
    if (!rotaId) return;
    const r = rotas.find((x) => x.id === rotaId);
    if (!r) return;
    setClassificacao(asClassificacaoRota(r.classificacao));
    setPontosPassagem((prev) => {
      if (prev.length > 0) return prev;
      const pts = limparPontosPassagemRota(r.pontos_passagem);
      if (pts.length === 0) return prev;
      setPontosMapsStr((m) => {
        const next = { ...m };
        for (const p of pts) next[p.id] = fmtMapsCoords(p.lat, p.lng);
        return next;
      });
      return pts;
    });
  }, [rotaId, rotas]);

  // Consulta Receita Federal ao completar o CNPJ do destinatário
  useEffect(() => {
    if (!editavel) return;
    const digits = cnpjDigits(destinatarioCnpj);
    if (digits.length !== 14 || !isValidCnpj(digits)) {
      setCnpjBuscando(false);
      return;
    }
    if (ultimoCnpjBuscado.current === digits) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setCnpjBuscando(true);
        setCnpjInfoOk(false);
        setCnpjInfo("Consultando CNPJ na Receita…");
        const res = await buscarDadosPorCnpj(digits);
        if (cancelled) return;
        setCnpjBuscando(false);
        ultimoCnpjBuscado.current = digits;
        if (!res.ok) {
          setCnpjInfoOk(false);
          setCnpjInfo(res.erro);
          return;
        }
        const d = res.dados;
        const nome = (d.nome_fantasia || d.razao_social || "").trim();
        if (nome) setDestinatario(nome);
        setDestinatarioCnpj(d.cnpj || formatCnpj(digits));
        if (d.telefone?.trim()) {
          setDestinatarioWhatsapp(
            (cur) => cur.trim() || formatPhoneBr(d.telefone),
          );
        }
        if (d.email?.trim()) {
          setDestinatarioEmail((cur) => cur.trim() || d.email.trim());
        }

        // Preenche destino da rota com o endereço do CNPJ se ainda estiver vazio
        setDestino((cur) => {
          if (cur.trim()) return cur;
          const rua = [d.endereco, d.numero].filter(Boolean).join(", ");
          const cidadeUf = [d.cidade, d.uf].filter(Boolean).join(" - ");
          const linha = [rua, d.bairro, cidadeUf].filter(Boolean).join(", ");
          return linha || cidadeUf || cur;
        });

        setCnpjInfoOk(true);
        setCnpjInfo(
          d.razao_social
            ? `CNPJ encontrado: ${d.razao_social}${d.nome_fantasia && d.nome_fantasia !== d.razao_social ? ` (${d.nome_fantasia})` : ""}.`
            : "CNPJ encontrado. Dados preenchidos.",
        );
      })();
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [destinatarioCnpj, editavel]);

  const rotasAtivas = useMemo(
    () =>
      [...rotas]
        .filter((r) => r.situacao === "ativo")
        .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR")),
    [rotas],
  );
  const rotaSelecionada =
    rotasAtivas.find((r) => r.id === rotaId) ||
    rotas.find((r) => r.id === carga.rota_id);
  const classificacaoEfetiva: ClassificacaoRota = rotaId
    ? asClassificacaoRota(rotas.find((r) => r.id === rotaId)?.classificacao ?? classificacao)
    : classificacao;

  function aplicarRotaCadastrada(id: string) {
    setRotaId(id);
    if (!id) {
      setInfo(
        "Rota desvinculada. Você pode preencher origem e destino manualmente.",
      );
      return;
    }
    const r = rotas.find((x) => x.id === id);
    if (!r) return;
    const temO = r.origem_lat != null && r.origem_lng != null;
    const temD = r.destino_lat != null && r.destino_lng != null;
    skipGeoOrigem.current = temO;
    skipGeoDestino.current = temD;
    skipRevOrigem.current = temO;
    skipRevDestino.current = temD;
    setOrigem(r.origem);
    setDestino(r.destino);
    setOrigemLat(r.origem_lat ?? null);
    setOrigemLng(r.origem_lng ?? null);
    setDestinoLat(r.destino_lat ?? null);
    setDestinoLng(r.destino_lng ?? null);
    setOrigemMapsStr(fmtMapsCoords(r.origem_lat, r.origem_lng));
    setDestinoMapsStr(fmtMapsCoords(r.destino_lat, r.destino_lng));
    const pts = limparPontosPassagemRota(r.pontos_passagem).map((p) => ({
      ...p,
      id: p.id || newPontoPassagemId(),
    }));
    setPontosPassagem(pts);
    const maps: Record<string, string> = {};
    for (const p of pts) {
      maps[p.id] = fmtMapsCoords(p.lat, p.lng);
      skipRevPontos.current[p.id] = true;
    }
    setPontosMapsStr(maps);
    setFreteTabela(formatMoneyInput(r.frete_tabela || 0));
    const classif = asClassificacaoRota(r.classificacao);
    setClassificacao(classif);
    setSalvarFavorita(false);
    setRotaDescricaoSalvar("");
    setNomeRota(r.descricao);
    const nVias = pts.length;
    setInfo(
      nVias > 0
        ? `Rota “${r.descricao}” (classificação ${classif}) aplicada com ${nVias} ponto${nVias === 1 ? "" : "s"} de passagem.`
        : `Rota “${r.descricao}” (classificação ${classif}) aplicada (${r.origem} → ${r.destino}).`,
    );
  }

  function adicionarPontoPassagem() {
    const id = newPontoPassagemId();
    setPontosPassagem((prev) => [
      ...prev,
      { id, endereco: "", lat: null, lng: null },
    ]);
    setPontosMapsStr((prev) => ({ ...prev, [id]: "" }));
    if (rotaId) setRotaId("");
  }

  function removerPontoPassagem(id: string) {
    setPontosPassagem((prev) => prev.filter((p) => p.id !== id));
    setPontosMapsStr((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (rotaId) setRotaId("");
  }

  function atualizarPonto(
    id: string,
    patch: Partial<Pick<PontoPassagemRota, "endereco" | "lat" | "lng">>,
  ) {
    setPontosPassagem((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
    if (rotaId) setRotaId("");
  }

  // Geocode dos pontos de passagem (endereço → coords)
  useEffect(() => {
    if (!editavel) return;
    const timers: number[] = [];
    for (const p of pontosPassagem) {
      const txt = (p.endereco || "").trim();
      if (txt.length < 5) continue;
      if (p.lat != null && p.lng != null) continue;
      const id = p.id;
      const t = window.setTimeout(() => {
        void (async () => {
          const res = await geocodificarConsulta(txt);
          if (!res.ok) return;
          skipRevPontos.current[id] = true;
          setPontosPassagem((prev) =>
            prev.map((x) =>
              x.id === id
                ? { ...x, lat: res.coords.lat, lng: res.coords.lng }
                : x,
            ),
          );
          setPontosMapsStr((prev) => ({
            ...prev,
            [id]: fmtMapsCoords(res.coords.lat, res.coords.lng),
          }));
        })();
      }, 700);
      timers.push(t);
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [pontosPassagem, editavel]);

  // Coords Maps dos pontos → lat/lng (+ endereço se vazio)
  useEffect(() => {
    if (!editavel) return;
    const timers: number[] = [];
    for (const [id, str] of Object.entries(pontosMapsStr)) {
      if (skipRevPontos.current[id]) {
        skipRevPontos.current[id] = false;
        continue;
      }
      const parsed = parseMapsCoords(str);
      if (!parsed) continue;
      const t = window.setTimeout(() => {
        void (async () => {
          setPontosPassagem((prev) =>
            prev.map((x) =>
              x.id === id
                ? { ...x, lat: parsed.lat, lng: parsed.lng }
                : x,
            ),
          );
          const res = await enderecoPorCoordenadas(parsed.lat, parsed.lng);
          if (!res.ok) return;
          setPontosPassagem((prev) =>
            prev.map((x) => {
              if (x.id !== id) return x;
              if ((x.endereco || "").trim().length >= 5) return x;
              return {
                ...x,
                endereco: labelEndereco(res.dados, res.display),
              };
            }),
          );
        })();
      }, 500);
      timers.push(t);
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [pontosMapsStr, editavel]);

  // Endereço origem → coordenadas Maps
  useEffect(() => {
    if (!editavel) return;
    const txt = origem.trim();
    if (skipGeoOrigem.current) {
      skipGeoOrigem.current = false;
      return;
    }
    if (txt.length < 5) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await geocodificarConsulta(txt);
        if (cancelled || !res.ok) return;
        skipRevOrigem.current = true;
        setOrigemLat(res.coords.lat);
        setOrigemLng(res.coords.lng);
        setOrigemMapsStr(fmtMapsCoords(res.coords.lat, res.coords.lng));
      })();
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [origem, editavel]);

  // Endereço destino → coordenadas Maps
  useEffect(() => {
    if (!editavel) return;
    const txt = destino.trim();
    if (skipGeoDestino.current) {
      skipGeoDestino.current = false;
      return;
    }
    if (txt.length < 5) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await geocodificarConsulta(txt);
        if (cancelled || !res.ok) return;
        skipRevDestino.current = true;
        setDestinoLat(res.coords.lat);
        setDestinoLng(res.coords.lng);
        setDestinoMapsStr(fmtMapsCoords(res.coords.lat, res.coords.lng));
      })();
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [destino, editavel]);

  // Coordenadas Maps origem → endereço
  useEffect(() => {
    if (!editavel) return;
    if (skipRevOrigem.current) {
      skipRevOrigem.current = false;
      return;
    }
    const parsed = parseMapsCoords(origemMapsStr);
    if (!parsed) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await enderecoPorCoordenadas(parsed.lat, parsed.lng);
        if (cancelled) return;
        setOrigemLat(parsed.lat);
        setOrigemLng(parsed.lng);
        if (!res.ok) return;
        skipGeoOrigem.current = true;
        setOrigem(labelEndereco(res.dados, res.display));
      })();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [origemMapsStr, editavel]);

  // Coordenadas Maps destino → endereço
  useEffect(() => {
    if (!editavel) return;
    if (skipRevDestino.current) {
      skipRevDestino.current = false;
      return;
    }
    const parsed = parseMapsCoords(destinoMapsStr);
    if (!parsed) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await enderecoPorCoordenadas(parsed.lat, parsed.lng);
        if (cancelled) return;
        setDestinoLat(parsed.lat);
        setDestinoLng(parsed.lng);
        if (!res.ok) return;
        skipGeoDestino.current = true;
        setDestino(labelEndereco(res.dados, res.display));
      })();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [destinoMapsStr, editavel]);

  async function montarDadosPdf(): Promise<CargaPdfData> {
    const ex = anttInfo?.eixos_utilizados || eixosDoVeiculo(veiculo || "Carreta");
    let mapaDataUrl: string | null = null;
    try {
      mapaDataUrl = await capturarMapaCarga({
        origemLat,
        origemLng,
        destinoLat,
        destinoLng,
        origemNome: origem,
        destinoNome: destino,
        pontosPassagem: limparPontosPassagemRota(pontosPassagem),
      });
    } catch {
      mapaDataUrl = null;
    }
    return {
      numero: carga.numero,
      pedido: pedido.trim(),
      origem: origem.trim(),
      destino: destino.trim(),
      origemLat,
      origemLng,
      destinoLat,
      destinoLng,
      pontosPassagem: limparPontosPassagemRota(pontosPassagem),
      classificacao: classificacaoEfetiva,
      tipoCarga: tipoCarga.trim(),
      veiculo: veiculo.trim(),
      carrocerias: parseCarrocerias(carroceriaTxt),
      complemento: labelComplemento(parseComplemento(complementoTxt)),
      gerenciamentoRisco: labelGerenciamentoRisco(
        parseGerenciamentoRisco(riscoTxt),
      ),
      cargaRetorno,
      retornaOrigem,
      remetente: carga.remetente,
      remetenteCnpj: carga.remetente_cnpj,
      destinatario: destinatario.trim(),
      destinatarioCnpj: destinatarioCnpj,
      destinatarioWhatsapp: destinatarioWhatsapp,
      destinatarioEmail: destinatarioEmail,
      peso: parseMoneyInput(peso),
      volumes: Number(volumes) || 0,
      numEntregas: Number(numEntregas) || 0,
      valorMercadorias: parseMoneyInput(valorMerc),
      freteTabela: parseMoneyInput(freteTabela),
      dataCarregamentoIso: fromDateInput(dataCarreg),
      previsaoEntregaIso: fromDateInput(previsao),
      observacao: observacao.trim(),
      antt: anttInfo,
      consumoSugeridoKmL: consumoPadraoKmL(ex),
      precoDieselSugerido: PRECO_DIESEL_SUGERIDO,
      mapaDataUrl,
      rotaNome: rotaSelecionada?.descricao,
    };
  }

  async function handleBaixarPdf() {
    setPdfBusy(true);
    setPdfMsg("");
    try {
      await baixarPdfCarga(await montarDadosPdf());
      setPdfMsg("PDF baixado.");
    } catch {
      setPdfMsg("Não foi possível gerar o PDF.");
    }
    setPdfBusy(false);
  }

  async function handleCompartilharPdf() {
    setPdfBusy(true);
    setPdfMsg("");
    const res = await compartilharPdfCarga(await montarDadosPdf());
    setPdfBusy(false);
    if (!res.ok) {
      setPdfMsg(res.erro);
      return;
    }
    setPdfMsg(
      res.via === "share"
        ? "PDF compartilhado."
        : "Compartilhamento não suportado neste navegador — PDF baixado, envie o arquivo manualmente.",
    );
  }

  function falhaSalvar(msg: string) {
    setError(msg);
    window.requestAnimationFrame(() => {
      document.getElementById("carga-dados-erro")?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }

  function handleSalvar(irParaPublicar = false) {
    setError("");
    setInfo("");
    if (!editavel) {
      falhaSalvar("Esta carga já foi publicada e não pode ser editada aqui.");
      return;
    }

    const origemFinal = origem.trim();
    const destinoFinal = destino.trim();
    const freteFinal = parseMoneyInput(freteTabela);
    const classifFinal: ClassificacaoRota = classificacaoEfetiva;

    if (!origemFinal || !destinoFinal) {
      falhaSalvar("Informe origem e destino da rota.");
      return;
    }
    const pontosLimpos = limparPontosPassagemRota(pontosPassagem);
    if (mesmaOrigemDestino(origemFinal, destinoFinal) && pontosLimpos.length === 0) {
      falhaSalvar(
        "Origem = destino: adicione pelo menos 1 ponto de passagem com endereço.",
      );
      return;
    }
    if (!veiculo.trim()) {
      falhaSalvar("Selecione o tipo de veículo.");
      return;
    }
    const complementoFinal = parseComplemento(complementoTxt);
    if (!complementoFinal) {
      falhaSalvar("Selecione o complemento (Sim, Não ou Ambos).");
      return;
    }
    const riscoFinal = parseGerenciamentoRisco(riscoTxt);
    if (!riscoFinal) {
      falhaSalvar(
        "Selecione o gerenciamento de risco (rastreador ou localizador).",
      );
      return;
    }
    let tmin = tempMin;
    let tmax = tempMax;
    if (tmin != null && tmax != null && tmin > tmax) {
      const tmp = tmin;
      tmin = tmax;
      tmax = tmp;
    }
    if (Number.isNaN(freteFinal) || freteFinal <= 0) {
      falhaSalvar("Informe o valor do frete tabela.");
      return;
    }

    let rotaIdFinal: string | null = rotaId || carga.rota_id;
    if (rotaIdFinal) {
      const r = rotas.find((x) => x.id === rotaIdFinal);
      if (!r || r.origem !== origemFinal || r.destino !== destinoFinal) {
        rotaIdFinal = null;
      }
    }

    if (salvarFavorita) {
      const nomeRotaSalvar = (
        isDistribuicao ? nomeRota || rotaDescricaoSalvar : rotaDescricaoSalvar
      ).trim();
      if (nomeRotaSalvar.length < 3) {
        falhaSalvar("Informe a descrição da rota para salvá-la na aba Rotas.");
        return;
      }
      const novaRota: Rota = {
        id: newRotaId(),
        descricao: nomeRotaSalvar,
        origem: origemFinal,
        destino: destinoFinal,
        origem_lat: origemLat,
        origem_lng: origemLng,
        destino_lat: destinoLat,
        destino_lng: destinoLng,
        pontos_passagem: pontosLimpos,
        classificacao: classifFinal,
        frete_tabela: freteFinal,
        km: anttInfo?.rota.distancia_km ?? 0,
        situacao: "ativo",
      };
      salvarRota(novaRota);
      rotaIdFinal = novaRota.id;
      setRotaId(novaRota.id);
      setInfo(`Rota “${nomeRotaSalvar}” salva na aba Rotas (disponível para próximas cargas).`);
    }

    if (!pedido.trim()) {
      falhaSalvar("Informe o pedido.");
      return;
    }
    const clientesFinais = isDistribuicao ? formParaClientes(clientesDist) : [];
    if (isDistribuicao) {
      if (!numeroCarga.trim()) {
        falhaSalvar("Informe o número da carga.");
        return;
      }
      if (nomeRota.trim().length < 3) {
        falhaSalvar("Informe o nome da rota.");
        return;
      }
      if (clientesFinais.length === 0) {
        falhaSalvar("Inclua ao menos um ponto de entrega com notas, peso e valor.");
        return;
      }
    } else if (!destinatario.trim()) {
      falhaSalvar("Informe o destinatário.");
      return;
    }
    const pesoNum = isDistribuicao ? totaisDist.peso : parseMoneyInput(peso);
    const volumesNum = Number(volumes);
    const entregasNum = isDistribuicao
      ? Math.max(1, totaisDist.entregas)
      : Number(numEntregas);
    const valorNum = isDistribuicao
      ? totaisDist.valor
      : parseMoneyInput(valorMerc);
    if (Number.isNaN(pesoNum) || pesoNum <= 0) {
      falhaSalvar(
        isDistribuicao
          ? "Informe o peso em pelo menos um ponto de entrega."
          : "Peso inválido.",
      );
      return;
    }
    if (Number.isNaN(volumesNum) || volumesNum < 0) {
      falhaSalvar("Volumes inválidos.");
      return;
    }
    if (Number.isNaN(entregasNum) || entregasNum < 1) {
      falhaSalvar("Número de entregas inválido (mínimo 1).");
      return;
    }
    if (Number.isNaN(valorNum) || valorNum < 0) {
      falhaSalvar("Valor das mercadorias inválido.");
      return;
    }

    const patch: Partial<Carga> = {
      rota_id: rotaIdFinal,
      classificacao_rota: classifFinal,
      origem: origemFinal,
      destino: destinoFinal,
      origem_lat: origemLat,
      origem_lng: origemLng,
      destino_lat: destinoLat,
      destino_lng: destinoLng,
      pontos_passagem: pontosLimpos,
      complemento: complementoFinal,
      carga_retorno: cargaRetorno,
      retorna_origem: retornaOrigem,
      gerenciamento_risco: riscoFinal,
      marca_rastreador:
        riscoFinal === "rastreador" || riscoFinal === "ambos"
          ? marcaRastreador
          : undefined,
      marca_localizador:
        riscoFinal === "localizador" || riscoFinal === "ambos"
          ? marcaLocalizador
          : undefined,
      temp_min: tmin,
      temp_max: tmax,
      exige_ajudante: exigeAjudante,
      frete_tabela: freteFinal,
      antt: anttInfo,
      pedido: pedido.trim(),
      tipo_carga: tipoCarga.trim() || TIPOS_CARGA[0],
      veiculo: veiculo.trim(),
      carrocerias: parseCarrocerias(carroceriaTxt),
      destinatario: isDistribuicao
        ? (destinatario.trim() || clientesFinais[0]?.nome || "")
        : destinatario.trim(),
      destinatario_cnpj: formatCnpj(destinatarioCnpj),
      destinatario_whatsapp: formatPhoneBr(destinatarioWhatsapp).trim() || null,
      destinatario_email: destinatarioEmail.trim() || null,
      peso: pesoNum,
      volumes: Math.round(volumesNum),
      num_entregas: Math.round(entregasNum),
      valor_mercadorias: valorNum,
      tipo_oferta: isDistribuicao ? "distribuicao" : "longo_percurso",
      nome_rota: isDistribuicao ? nomeRota.trim() : carga.nome_rota,
      clientes_distribuicao: isDistribuicao ? clientesFinais : [],
      data_carregamento: fromDateInput(dataCarreg),
      previsao_entrega: fromDateInput(previsao),
      observacao: observacao.trim() || undefined,
      numero: isDistribuicao ? numeroCarga.trim() : carga.numero,
      created_at: carga.created_at,
    };

    try {
      if (isCargaEphemeral(carga)) {
        const criada = criarCarga(patch);
        if (!salvarFavorita) setInfo("Carga salva em Cargas salvas.");
        onPersisted?.(criada, { irParaPublicar });
        onSaved?.();
        if (irParaPublicar) onGoPublish?.();
        return;
      }

      const res = atualizarCarga(carga.id, patch);
      if (!res.ok) {
        falhaSalvar(res.error ?? "Erro ao salvar");
        return;
      }
      if (!salvarFavorita) setInfo("Dados salvos.");
      onSaved?.();
      if (irParaPublicar) onGoPublish?.();
    } catch (e) {
      falhaSalvar(
        e instanceof Error ? e.message : "Não foi possível salvar a carga.",
      );
    }
  }

  if (!editavel) {
    const pontosReadonly = pontosDaCargaOuRota(carga, rotas);
    return (
      <div className="space-y-0.5 text-[13px] leading-snug">
        <Row label="Número" value={carga.numero} />
        <Row label="Tipo de oferta" value={labelTipoOferta(carga.tipo_oferta)} />
        {isOfertaDistribuicao(carga) && (
          <Row label="Nome da rota" value={carga.nome_rota?.trim() || "—"} />
        )}
        <Row label="Pedido" value={carga.pedido || "—"} />
        <Row label="Origem" value={carga.origem || "—"} />
        <Row label="Destino" value={carga.destino || "—"} />
        {pontosReadonly.length > 0 ? (
          <div className="rounded-md border border-sky-200 bg-sky-50/70 px-2.5 py-2 my-1">
            <p className="text-[12px] font-bold text-sky-900">
              Pontos de passagem ({pontosReadonly.length})
            </p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-[12px] text-sky-950">
              {pontosReadonly.map((p, idx) => (
                <li key={p.id || idx}>
                  {(p.endereco || "").trim() ||
                    (p.lat != null && p.lng != null
                      ? `${p.lat}, ${p.lng}`
                      : `Ponto ${idx + 1}`)}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <Row label="Pontos de passagem" value="Nenhum" />
        )}
        {canEdit ? (
          <div className="grid gap-1.5 py-1 sm:grid-cols-2">
            <Field label="Retorna para origem">
              <select
                className={inputClass}
                value={flagSim(carga.retorna_origem) ? "sim" : "nao"}
                onChange={(e) => {
                  void atualizarCarga(carga.id, {
                    retorna_origem: e.target.value === "sim",
                  });
                }}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </Field>
            <Field label="Carga retorno">
              <select
                className={inputClass}
                value={flagSim(carga.carga_retorno) ? "sim" : "nao"}
                onChange={(e) => {
                  void atualizarCarga(carga.id, {
                    carga_retorno: e.target.value === "sim",
                  });
                }}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </Field>
            <Field label="Carga retorno">
              <select
                className={inputClass}
                value={carga.carga_retorno ? "sim" : "nao"}
                onChange={(e) => {
                  void atualizarCarga(carga.id, {
                    carga_retorno: e.target.value === "sim",
                  });
                }}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </Field>
            <p className="sm:col-span-2 text-[11px] text-ink-muted">
              Só o campo <strong>Carga retorno</strong> em “Sim” mostra{" "}
              <strong className="text-red-600">Retorno</strong> em vermelho no card.
              Origem = destino (rota circular) não marca retorno automaticamente.
            </p>
          </div>
        ) : (
          <>
            <Row
              label="Retorna para origem"
              value={flagSim(carga.retorna_origem) ? "Sim" : "Não"}
            />
            <Row
              label="Carga retorno"
              value={flagSim(carga.carga_retorno) ? "Sim" : "Não"}
            />
          </>
        )}
        <Row
          label="Complemento"
          value={labelComplemento(carga.complemento) || "—"}
        />
        <Row
          label="Gerenciamento de risco"
          value={labelGerenciamentoRisco(carga.gerenciamento_risco) || "—"}
        />
        {(carga.gerenciamento_risco === "rastreador" ||
          carga.gerenciamento_risco === "ambos") && (
          <Row
            label="Marca do rastreador"
            value={carga.marca_rastreador || MARCA_SEM_ESPECIFICA}
          />
        )}
        {(carga.gerenciamento_risco === "localizador" ||
          carga.gerenciamento_risco === "ambos") && (
          <Row
            label="Marca do localizador"
            value={carga.marca_localizador || MARCA_SEM_ESPECIFICA}
          />
        )}
        <Row
          label="Temperatura"
          value={
            carga.temp_min != null || carga.temp_max != null
              ? `${carga.temp_min ?? "—"} a ${carga.temp_max ?? "—"} °C`
              : "—"
          }
        />
        <Row
          label="Exige ajudante"
          value={carga.exige_ajudante ? "Sim" : "Não"}
        />
        <Row label="Tipo" value={carga.tipo_carga || "—"} />
        <Row label="Veículo" value={carga.veiculo || "—"} />
        <Row
          label="Carroceria"
          value={
            parseCarrocerias(carga.carrocerias).length
              ? parseCarrocerias(carga.carrocerias).join(", ")
              : "—"
          }
        />
        <Row label="Remetente" value={carga.remetente || "—"} />
        <Row
          label="CNPJ remetente"
          value={formatCnpj(carga.remetente_cnpj || "") || "—"}
        />
        <Row label="Destinatário" value={carga.destinatario || "—"} />
        <Row
          label="CNPJ destinatário"
          value={formatCnpj(carga.destinatario_cnpj || "") || "—"}
        />
        <Row
          label="WhatsApp destinatário"
          value={formatPhoneBr(carga.destinatario_whatsapp || "") || "—"}
        />
        <Row
          label="E-mail destinatário"
          value={carga.destinatario_email?.trim() || "—"}
        />
        <Row label="Peso" value={formatMoneyInput(carga.peso)} />
        <Row label="Volumes" value={String(carga.volumes)} />
        <Row label="Nº de entregas" value={String(carga.num_entregas || 1)} />
        <Row label="Frete tabela" value={formatCurrency(carga.frete_tabela)} />
        <Row
          label="Mercadorias"
          value={formatCurrency(carga.valor_mercadorias)}
        />
        {isOfertaDistribuicao(carga) &&
          (carga.clientes_distribuicao?.length ?? 0) > 0 && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 my-1">
              <p className="text-[12px] font-bold text-emerald-900">
                Pontos de entrega ({carga.clientes_distribuicao?.length}) — sequência
              </p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-[12px] text-emerald-950">
                {(carga.clientes_distribuicao ?? []).map((c) => (
                  <li key={c.id}>
                    <strong>{c.nome}</strong>
                    {c.endereco ? ` · ${c.endereco}` : ""}
                    {c.cnpj ? ` · ${c.cnpj}` : ""} — {c.qtd_entregas} entrega
                    {c.qtd_entregas === 1 ? "" : "s"} · {c.qtd_nfs} NF
                    {c.qtd_nfs === 1 ? "" : "s"} · {formatMoneyInput(c.peso)} kg ·{" "}
                    {formatCurrency(c.valor)}
                  </li>
                ))}
              </ol>
            </div>
          )}
        <Row
          label="Carregamento"
          value={
            carga.data_carregamento
              ? new Date(carga.data_carregamento).toLocaleString("pt-BR")
              : "—"
          }
        />
        <Row
          label="Previsão entrega"
          value={
            carga.previsao_entrega
              ? new Date(carga.previsao_entrega).toLocaleString("pt-BR")
              : "—"
          }
        />
        {carga.observacao && <Row label="Obs." value={carga.observacao} />}
      </div>
    );
  }

  return (
    <div className="carga-dados-form space-y-2 text-sm font-medium text-black">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-ink/15 pb-2">
        <div>
          <p className="font-display text-base font-bold text-ink">
            {isDistribuicao ? "Oferta distribuição" : "Oferta longo percurso"} · Carga {numeroCarga || carga.numero}
          </p>
          <p className="text-[12px] font-semibold text-black">
            {isDistribuicao
              ? "Número da carga, nome da rota e a sequência dos pontos de entrega (NFs, peso e valor)."
              : "Preencha por seção: rota, frete, veículo, pedido e destinatário."}
          </p>
        </div>
        {rotaSelecionada && (
          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-bold text-ink">
            Rota: {rotaSelecionada.descricao}
          </span>
        )}
      </div>

      {isDistribuicao && (
        <section className="grid gap-1.5 sm:grid-cols-2">
          <Field label="Número da carga *">
            <input
              className={inputClass}
              value={numeroCarga}
              onChange={(e) => setNumeroCarga(e.target.value)}
              placeholder="Ex.: 128688"
            />
          </Field>
          <Field label="Nome da rota *">
            <input
              className={inputClass}
              value={nomeRota}
              onChange={(e) => setNomeRota(e.target.value)}
              placeholder="Ex.: CD Guarulhos → lojas zona sul"
              maxLength={120}
            />
          </Field>
        </section>
      )}

      {/* 1. Rota */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
            1 · Rota
          </h3>
          <span className="text-[12px] font-bold text-black">
            {rotasAtivas.length} cadastrada{rotasAtivas.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="grid min-w-0 gap-1.5 sm:grid-cols-12">
          <Field label="Usar rota cadastrada" className="sm:col-span-6">
            <select
              className={inputClass}
              value={rotaId}
              disabled={!editavel}
              onChange={(e) => aplicarRotaCadastrada(e.target.value)}
            >
              <option value="">Digitar origem e destino manualmente…</option>
              {rotasAtivas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.descricao} — {resumoOpcaoRota(r)}
                  {r.frete_tabela > 0
                    ? ` · R$ ${formatMoneyInput(r.frete_tabela)}`
                    : ""}
                </option>
              ))}
            </select>
            {rotasAtivas.length === 0 && (
              <p className="mt-0.5 text-[11px] font-semibold text-black">
                Nenhuma rota ativa. Cadastre em <strong>Rotas</strong> no menu
                lateral.
              </p>
            )}
          </Field>
          <Field label="Classificação da rota" className="sm:col-span-3">
            <select
              className={inputClass}
              value={classificacaoEfetiva}
              disabled={!editavel}
              onChange={(e) => {
                setClassificacao(e.target.value as ClassificacaoRota);
                if (rotaId) setRotaId("");
              }}
            >
              <option value="A">Rota A</option>
              <option value="B">Rota B</option>
              <option value="C">Rota C</option>
            </select>
            {rotaSelecionada && (
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Da rota cadastrada: <strong>Rota {rotaSelecionada.classificacao}</strong>
              </p>
            )}
          </Field>
          <Field label="Veículo *" className="sm:col-span-3">
            <VeiculoSuggestInput
              value={veiculo}
              onChange={setVeiculo}
              placeholder="Carreta, Truck, Fiorino…"
            />
          </Field>
          <Field label="Origem *" className="sm:col-span-6">
            <AddressSuggestInput
              value={origem}
              onChange={(v) => {
                setOrigem(v);
                if (rotaId && v.trim() !== origem.trim()) setRotaId("");
              }}
              localSuggestions={sugOrigem}
              minChars={2}
              placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
            />
          </Field>
          <Field label="Destino *" className="sm:col-span-6">
            <AddressSuggestInput
              value={destino}
              onChange={(v) => {
                setDestino(v);
                if (rotaId && v.trim() !== destino.trim()) setRotaId("");
              }}
              localSuggestions={sugDestino}
              minChars={2}
              placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
            />
          </Field>
          <Field label="Coordenadas origem (Maps)" className="sm:col-span-6">
            <input
              className={inputClass}
              inputMode="text"
              placeholder="-23.5613545,-46.6590692,17"
              value={origemMapsStr}
              onChange={(e) => {
                setOrigemMapsStr(e.target.value);
                if (rotaId) setRotaId("");
              }}
            />
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Cole lat,lng ou lat,lng,zoom do Google Maps.
            </p>
          </Field>
          <Field label="Coordenadas destino (Maps)" className="sm:col-span-6">
            <input
              className={inputClass}
              inputMode="text"
              placeholder="-22.9068470,-43.1728970,17"
              value={destinoMapsStr}
              onChange={(e) => {
                setDestinoMapsStr(e.target.value);
                if (rotaId) setRotaId("");
              }}
            />
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Cole lat,lng ou lat,lng,zoom do Google Maps.
            </p>
          </Field>
          <div className="sm:col-span-12 rounded-lg border border-dashed border-ink/20 bg-ink/[0.02] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-ink">
                  Pontos de passagem
                  {limparPontosPassagemRota(pontosPassagem).length > 0
                    ? ` (${limparPontosPassagemRota(pontosPassagem).length})`
                    : ""}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {mesmaOrigemDestino(origem, destino)
                    ? "Origem = destino (circular): obrigatório pelo menos 1 ponto."
                    : "Opcional: paradas intermediárias entre origem e destino."}
                </p>
              </div>
              {editavel && (
                <button
                  type="button"
                  className="rounded-md border border-ink/20 bg-white px-3 py-1.5 text-xs font-bold text-ink hover:bg-ink/5"
                  onClick={adicionarPontoPassagem}
                >
                  + Adicionar ponto
                </button>
              )}
            </div>
            {pontosPassagem.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Nenhum ponto. Use “Adicionar ponto” ou selecione uma rota que já
                tenha vias.
              </p>
            ) : (
              <div className="space-y-3">
                {pontosPassagem.map((p, idx) => (
                  <div
                    key={p.id}
                    className="grid gap-2 rounded-md border border-ink/10 bg-white p-3 sm:grid-cols-2"
                  >
                    <Field label={`Ponto ${idx + 1} — endereço`}>
                      <AddressSuggestInput
                        value={p.endereco}
                        onChange={(endereco) =>
                          atualizarPonto(p.id, {
                            endereco,
                            lat: null,
                            lng: null,
                          })
                        }
                        localSuggestions={sugPonto}
                        minChars={2}
                        placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
                        disabled={!editavel}
                      />
                    </Field>
                    <Field label={`Ponto ${idx + 1} — coordenadas (Maps)`}>
                      <div className="flex gap-2">
                        <input
                          className={inputClass}
                          inputMode="text"
                          disabled={!editavel}
                          placeholder="-23.5613545,-46.6590692,17"
                          value={pontosMapsStr[p.id] ?? ""}
                          onChange={(e) => {
                            setPontosMapsStr((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }));
                            if (rotaId) setRotaId("");
                          }}
                        />
                        {editavel && (
                          <button
                            type="button"
                            className="shrink-0 rounded-md border border-red-200 px-2 text-xs font-bold text-red-700 hover:bg-red-50"
                            onClick={() => removerPontoPassagem(p.id)}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </Field>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-1.5 sm:col-span-12 sm:grid-cols-3">
            <Field label="Retorna para origem">
              <select
                className={inputClass}
                value={retornaOrigem ? "sim" : "nao"}
                onChange={(e) => setRetornaOrigem(e.target.value === "sim")}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </Field>
            <Field label="Carga retorno">
              <select
                className={inputClass}
                value={cargaRetorno ? "sim" : "nao"}
                onChange={(e) => setCargaRetorno(e.target.value === "sim")}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </Field>
            <Field label="Salvar rota na aba Rotas">
              <select
                className={inputClass}
                value={salvarFavorita ? "sim" : "nao"}
                onChange={(e) => {
                  const sim = e.target.value === "sim";
                  setSalvarFavorita(sim);
                  if (sim && !rotaDescricaoSalvar.trim()) {
                    setRotaDescricaoSalvar(
                      descricaoRota(origem, destino),
                    );
                  }
                  if (!sim) setRotaDescricaoSalvar("");
                }}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </Field>
            {salvarFavorita ? (
              <Field
                label="Descrição da rota *"
                className="sm:col-span-3"
              >
                <input
                  className={inputClass}
                  value={rotaDescricaoSalvar}
                  onChange={(e) => setRotaDescricaoSalvar(e.target.value)}
                  placeholder="Ex.: Guarulhos/SP → Pouso Alegre/MG"
                  maxLength={120}
                />
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  Nome que aparece na lista de rotas cadastradas.
                </p>
              </Field>
            ) : null}
          </div>
        </div>
      </section>

      {/* 2. Frete */}
      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(240px,0.45fr)]">
          <h3 className="pb-1 text-[13px] font-extrabold uppercase tracking-wide text-black">
            2 · Frete
          </h3>
          <Field label="Frete tabela (R$) *">
            <SuggestInput
              value={freteTabela}
              onChange={setFreteTabela}
              suggestions={sugFrete}
              placeholder="0,00 — use Calcular ANTT ou digite"
              onBlur={() => {
                const n = parseMoneyInput(freteTabela);
                if (!Number.isNaN(n)) setFreteTabela(formatMoneyInput(n));
              }}
            />
          </Field>
        </div>
        <AnttFretePanel
          origem={origem}
          destino={destino}
          veiculo={veiculo}
          waypoints={pontosPassagem}
          origemCoords={
            origemLat != null && origemLng != null
              ? { lat: origemLat, lng: origemLng }
              : null
          }
          destinoCoords={
            destinoLat != null && destinoLng != null
              ? { lat: destinoLat, lng: destinoLng }
              : null
          }
          value={anttInfo}
          onChange={(info, frete) => {
            setAnttInfo(info);
            if (frete != null && frete > 0) {
              setFreteTabela(formatMoneyInput(frete));
            }
          }}
        />
        <RotaMapPreview
          origem={origem}
          destino={destino}
          origemCoords={
            origemLat != null && origemLng != null
              ? { lat: origemLat, lng: origemLng }
              : null
          }
          destinoCoords={
            destinoLat != null && destinoLng != null
              ? { lat: destinoLat, lng: destinoLng }
              : null
          }
          waypoints={pontosPassagem}
          veiculo={veiculo}
          className="h-[220px] min-h-[220px] w-full"
        />
      </section>

      {/* 3. Veículo e exigências */}
      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
          3 · Veículo e exigências
        </h3>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <Field label="Complemento *">
            <SuggestInput
              value={complementoTxt}
              onChange={setComplementoTxt}
              suggestions={sugComplemento}
              placeholder="Sim, Não ou Ambos"
            />
          </Field>
          <Field label="Gerenciamento de risco *">
            <SuggestInput
              value={riscoTxt}
              onChange={setRiscoTxt}
              suggestions={sugRisco}
              placeholder="Rastreador, Localizador, Ambos ou Não exige"
            />
          </Field>
        </div>
        <CargaExigenciasFields
          risco={parseGerenciamentoRisco(riscoTxt)}
          marcaRastreador={marcaRastreador}
          marcaLocalizador={marcaLocalizador}
          tempMin={tempMin}
          tempMax={tempMax}
          exigeAjudante={exigeAjudante}
          onChange={(patch) => {
            if ("marca_rastreador" in patch) {
              setMarcaRastreador(patch.marca_rastreador || MARCA_SEM_ESPECIFICA)
            }
            if ("marca_localizador" in patch) {
              setMarcaLocalizador(patch.marca_localizador || MARCA_SEM_ESPECIFICA)
            }
            if ("temp_min" in patch) setTempMin(patch.temp_min)
            if ("temp_max" in patch) setTempMax(patch.temp_max)
            if ("exige_ajudante" in patch) {
              setExigeAjudante(Boolean(patch.exige_ajudante))
            }
          }}
        />
      </section>

      {/* 4. Pedido e carga */}
      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
          4 · Pedido e carga
        </h3>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Pedido *">
            <SuggestInput
              value={pedido}
              onChange={setPedido}
              suggestions={sugPedido}
              placeholder="Número do pedido"
            />
          </Field>
          <Field label="Tipo de carga">
            <SuggestInput
              value={tipoCarga}
              onChange={setTipoCarga}
              suggestions={sugTipo}
              placeholder="Carga seca, refrigerada, congelada…"
            />
          </Field>
          <Field label="Carroceria">
            <CarroceriaSuggestInput
              value={carroceriaTxt}
              onChange={setCarroceriaTxt}
              placeholder="Baú, Sider, Graneleiro…"
            />
          </Field>
          <Field label="Valor mercadorias (R$)">
            <SuggestInput
              value={valorMerc}
              onChange={setValorMerc}
              suggestions={sugValorMerc}
              disabled={isDistribuicao}
              onBlur={() => {
                const n = parseMoneyInput(valorMerc);
                if (!Number.isNaN(n)) setValorMerc(formatMoneyInput(n));
              }}
            />
            {isDistribuicao && (
              <p className="mt-0.5 text-[11px] font-semibold text-black">
                Soma automática dos valores por ponto.
              </p>
            )}
          </Field>
          <Field label="Peso (kg) *">
            <SuggestInput
              value={peso}
              onChange={setPeso}
              suggestions={sugPeso}
              disabled={isDistribuicao}
              onBlur={() => {
                const n = parseMoneyInput(peso);
                if (!Number.isNaN(n)) setPeso(formatMoneyInput(n));
              }}
            />
            {isDistribuicao && (
              <p className="mt-0.5 text-[11px] font-semibold text-black">
                Soma automática do peso por ponto.
              </p>
            )}
          </Field>
          <Field label="Volumes">
            <SuggestInput
              value={volumes}
              onChange={setVolumes}
              suggestions={sugVolumes}
              inputMode="numeric"
            />
          </Field>
          <Field label="Número de entregas">
            <SuggestInput
              value={numEntregas}
              onChange={setNumEntregas}
              suggestions={sugEntregas}
              placeholder="1"
              inputMode="numeric"
              disabled={isDistribuicao}
            />
            {isDistribuicao && (
              <p className="mt-0.5 text-[11px] font-semibold text-black">
                Soma das entregas em cada ponto.
              </p>
            )}
          </Field>
        </div>
      </section>

      {/* 5. Destinatário */}
      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
          5 · Destinatário{isDistribuicao ? " (opcional)" : ""}
        </h3>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <Field label={isDistribuicao ? "Nome / empresa" : "Nome / empresa *"}>
            <SuggestInput
              value={destinatario}
              onChange={setDestinatario}
              suggestions={sugDestinatario}
              placeholder="Destinatário"
            />
          </Field>
          <Field label="CNPJ">
            <CnpjInput
              value={destinatarioCnpj}
              onChange={(v) => {
                const next = formatCnpj(v);
                if (cnpjDigits(next) !== ultimoCnpjBuscado.current) {
                  ultimoCnpjBuscado.current = "";
                  setCnpjInfo("");
                  setCnpjInfoOk(false);
                }
                setDestinatarioCnpj(next);
              }}
              suggestions={historico.cnpj}
              disabled={cnpjBuscando || !editavel}
              showHint={!cnpjBuscando && !cnpjInfo}
            />
            {(cnpjBuscando || cnpjInfo) && (
              <p
                className={`mt-1 text-[11px] font-medium ${
                  cnpjBuscando
                    ? "text-ink"
                    : cnpjInfoOk
                      ? "text-emerald-800"
                      : "text-amber-800"
                }`}
              >
                {cnpjBuscando ? "Consultando CNPJ na Receita…" : cnpjInfo}
              </p>
            )}
          </Field>
          <Field label="WhatsApp">
            <SuggestInput
              value={destinatarioWhatsapp}
              onChange={(v) => setDestinatarioWhatsapp(formatPhoneBr(v))}
              suggestions={(q) => filtrarSugestoes(q, [historico.whatsapp], 8)}
              placeholder="(00) 00000-0000"
              inputMode="tel"
            />
          </Field>
          <Field label="E-mail">
            <SuggestInput
              value={destinatarioEmail}
              onChange={setDestinatarioEmail}
              suggestions={(q) => filtrarSugestoes(q, [historico.email], 8)}
              placeholder="contato@empresa.com (vários: separe por vírgula)"
              inputMode="email"
            />
          </Field>
        </div>
      </section>

      {isDistribuicao && (
        <section className="space-y-1.5 border-t border-ink/15 pt-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
              6 · Pontos de entrega (sequência)
            </h3>
            <p className="text-[12px] font-semibold text-black">
              {totaisDist.pontos} ponto{totaisDist.pontos === 1 ? "" : "s"} ·{" "}
              {totaisDist.entregas} entrega{totaisDist.entregas === 1 ? "" : "s"} ·{" "}
              {totaisDist.nfs} NF{totaisDist.nfs === 1 ? "" : "s"} ·{" "}
              {formatMoneyInput(totaisDist.peso)} kg · {formatCurrency(totaisDist.valor)}
            </p>
          </div>
          <p className="text-[11px] font-semibold text-black">
            Use as setas para definir a ordem de entrega. O 1º ponto é a primeira parada.
          </p>
          <div className="space-y-2">
            {clientesDist.map((cli, idx) => (
              <div
                key={cli.id}
                className="rounded-lg border border-ink/15 bg-sand-light/40 p-2.5"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[12px] font-extrabold uppercase tracking-wide text-black">
                    Ponto {idx + 1}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Subir na sequência"
                      disabled={idx === 0}
                      className="rounded-md border border-ink/15 bg-white p-1 text-ink disabled:opacity-30"
                      onClick={() =>
                        setClientesDist((prev) => reordenarPontos(prev, idx, -1))
                      }
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      title="Descer na sequência"
                      disabled={idx === clientesDist.length - 1}
                      className="rounded-md border border-ink/15 bg-white p-1 text-ink disabled:opacity-30"
                      onClick={() =>
                        setClientesDist((prev) => reordenarPontos(prev, idx, 1))
                      }
                    >
                      <ChevronDown size={14} />
                    </button>
                    {clientesDist.length > 1 && (
                      <button
                        type="button"
                        className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:underline"
                        onClick={() =>
                          setClientesDist((prev) => prev.filter((x) => x.id !== cli.id))
                        }
                      >
                        <Trash2 size={12} />
                        Remover
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Cliente / ponto *" className="lg:col-span-2">
                    <input
                      className={inputClass}
                      value={cli.nome}
                      onChange={(e) =>
                        setClientesDist((prev) =>
                          prev.map((x) =>
                            x.id === cli.id ? { ...x, nome: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="Nome do cliente ou do ponto"
                    />
                  </Field>
                  <Field label="Endereço do ponto" className="lg:col-span-2">
                    <AddressSuggestInput
                      value={cli.endereco}
                      onChange={(v) =>
                        setClientesDist((prev) =>
                          prev.map((x) =>
                            x.id === cli.id ? { ...x, endereco: v } : x,
                          ),
                        )
                      }
                      minChars={2}
                      placeholder={PLACEHOLDER_ENDERECO_EXEMPLO}
                    />
                  </Field>
                  <Field label="CNPJ">
                    <input
                      className={inputClass}
                      value={cli.cnpj}
                      onChange={(e) =>
                        setClientesDist((prev) =>
                          prev.map((x) =>
                            x.id === cli.id ? { ...x, cnpj: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="00.000.000/0000-00"
                    />
                  </Field>
                  <Field label="Entregas neste ponto *">
                    <input
                      className={inputClass}
                      value={cli.qtdEntregas}
                      inputMode="numeric"
                      onChange={(e) =>
                        setClientesDist((prev) =>
                          prev.map((x) =>
                            x.id === cli.id ? { ...x, qtdEntregas: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="1"
                    />
                  </Field>
                  <Field label="Notas fiscais *">
                    <input
                      className={inputClass}
                      value={cli.qtdNfs}
                      inputMode="numeric"
                      onChange={(e) =>
                        setClientesDist((prev) =>
                          prev.map((x) =>
                            x.id === cli.id ? { ...x, qtdNfs: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="1"
                    />
                  </Field>
                  <Field label="Peso (kg) *">
                    <input
                      className={inputClass}
                      value={cli.pesoStr}
                      inputMode="decimal"
                      onChange={(e) =>
                        setClientesDist((prev) =>
                          prev.map((x) =>
                            x.id === cli.id ? { ...x, pesoStr: e.target.value } : x,
                          ),
                        )
                      }
                      onBlur={() => {
                        const n = parseMoneyInput(cli.pesoStr);
                        if (Number.isNaN(n)) return;
                        setClientesDist((prev) =>
                          prev.map((x) =>
                            x.id === cli.id
                              ? { ...x, pesoStr: formatMoneyInput(n) }
                              : x,
                          ),
                        );
                      }}
                      placeholder="0,00"
                    />
                  </Field>
                  <Field label="Valor da carga (R$) *" className="sm:col-span-2 lg:col-span-4">
                    <input
                      className={inputClass}
                      value={cli.valorStr}
                      inputMode="decimal"
                      onChange={(e) =>
                        setClientesDist((prev) =>
                          prev.map((x) =>
                            x.id === cli.id ? { ...x, valorStr: e.target.value } : x,
                          ),
                        )
                      }
                      onBlur={() => {
                        const n = parseMoneyInput(cli.valorStr);
                        if (Number.isNaN(n)) return;
                        setClientesDist((prev) =>
                          prev.map((x) =>
                            x.id === cli.id
                              ? { ...x, valorStr: formatMoneyInput(n) }
                              : x,
                          ),
                        );
                      }}
                      placeholder="0,00"
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#2f9e6a]/40 bg-white px-3 py-1.5 text-xs font-bold text-[#2f9e6a] hover:bg-emerald-50"
            onClick={() =>
              setClientesDist((prev) => [...prev, emptyClienteDistForm()])
            }
          >
            <Plus size={14} />
            Adicionar ponto de entrega
          </button>
        </section>
      )}

      {/* 6. Prazos e obs */}
      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
          {isDistribuicao ? "7 · Prazos e observações" : "6 · Prazos e observações"}
        </h3>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Carregamento">
            <input
              type="date"
              className={inputClass}
              value={dataCarreg}
              onChange={(e) => setDataCarreg(e.target.value)}
            />
          </Field>
          <Field label="Previsão entrega">
            <input
              type="date"
              className={inputClass}
              value={previsao}
              onChange={(e) => setPrevisao(e.target.value)}
            />
          </Field>
          <Field label="Observações">
            <SuggestInput
              value={observacao}
              onChange={setObservacao}
              suggestions={sugObs}
              placeholder="Opcional — também pedidas na publicação"
            />
          </Field>
        </div>
      </section>

      {info && !error && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {info}
        </p>
      )}

      <div className="sticky bottom-0 z-20 -mx-1 flex flex-col gap-1.5 border-t border-ink/15 bg-white/95 px-1 pt-2 pb-1 backdrop-blur">
        {error && (
          <p
            id="carga-dados-erro"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900"
          >
            {error}
          </p>
        )}
        <div className="flex flex-col gap-1.5 sm:flex-row">
        <Button
          variant="ghost"
          className="!border !border-ink/20 !bg-white"
          onClick={() => {
            setError("");
            if (!origem.trim() || !destino.trim()) {
              falhaSalvar("Preencha origem e destino para gerar o PDF.");
              return;
            }
            setPdfMsg("");
            setPdfOpen(true);
          }}
        >
          <FileText size={16} />
          Gerar PDF
        </Button>
        <Button
          variant="success"
          className="flex-1"
          onClick={() => handleSalvar(false)}
        >
          Salvar dados
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => handleSalvar(true)}
        >
          Salvar e publicar
        </Button>
        </div>
      </div>

      <Modal
        open={pdfOpen}
        title={`PDF da carga ${carga.numero}`}
        onClose={() => setPdfOpen(false)}
      >
        <div className="space-y-3 text-sm">
          <p className="text-ink-muted">
            Gere um PDF com todos os dados da Nova carga: rota, mapa, ANTT, combustível,
            veículo, destinatário e prazos — para baixar ou enviar fora do sistema.
          </p>
          <div className="rounded-lg border border-ink/10 bg-sand-light/40 px-3 py-2.5 text-xs text-ink">
            <p>
              <span className="font-bold">Origem:</span> {origem || "—"}
            </p>
            <p>
              <span className="font-bold">Destino:</span> {destino || "—"}
            </p>
            {limparPontosPassagemRota(pontosPassagem).length > 0 && (
              <p>
                <span className="font-bold">Pontos de passagem:</span>{" "}
                {limparPontosPassagemRota(pontosPassagem).length}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="ghost"
              className="flex-1 !border !border-ink/20 !bg-white"
              disabled={pdfBusy}
              onClick={() => void handleBaixarPdf()}
            >
              <Download size={16} />
              {pdfBusy ? "Gerando…" : "Baixar PDF"}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={pdfBusy}
              onClick={() => void handleCompartilharPdf()}
            >
              <Share2 size={16} />
              {pdfBusy ? "Preparando…" : "Compartilhar"}
            </Button>
          </div>
          {pdfMsg && (
            <p className="rounded-md border border-ink/10 bg-white px-2.5 py-1.5 text-xs text-ink-muted">
              {pdfMsg}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink/10 py-0.5">
      <span className="shrink-0 text-[13px] font-semibold text-ink">
        {label}
      </span>
      <span className="text-right text-[13px] font-bold text-ink">{value}</span>
    </div>
  );
}
