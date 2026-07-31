import { useEffect, useMemo, useRef, useState } from "react";
import { isCargaEphemeral, useData } from "../../context/DataContext";
import {
  formatCurrency,
  formatMoneyInput,
  parseMoneyInput,
} from "../../lib/businessRules";
import { buscarCidades, filtrarSugestoes } from "../../lib/cidadesBrasil";
import { cnpjDigits, formatCnpj, isValidCnpj } from "../../lib/cnpj";
import { buscarDadosPorCnpj } from "../../lib/cnpjLookup";
import { formatPhoneBr } from "../../lib/phoneBr";
import { TIPOS_CARGA } from "../../lib/tiposCarga";
import type {
  AnttInfoCarga,
  Carga,
  ClassificacaoRota,
  Rota,
} from "../../types";
import { Button, Field, inputClass } from "../ui/Modal";
import { CnpjInput } from "../ui/CnpjInput";
import { SuggestInput } from "../ui/SuggestInput";
import { AddressSuggestInput } from "../ui/AddressSuggestInput";
import { joinCarrocerias, parseCarrocerias } from "../../lib/tiposCarroceria";
import { newRotaId } from "../../lib/rotasSync";
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

type Props = {
  carga: Carga;
  canEdit: boolean;
  onSaved?: () => void;
  onGoPublish?: () => void;
  /** Chamado quando o rascunho efêmero é gravado pela 1ª vez (ou atualizado na UI). */
  onPersisted?: (carga: Carga) => void;
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

export function CargaDadosForm({
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
  const [freteTabela, setFreteTabela] = useState(
    formatMoneyInput(carga.frete_tabela || 0),
  );
  const [anttInfo, setAnttInfo] = useState<AnttInfoCarga | null>(
    carga.antt ?? null,
  );
  const [classificacao, setClassificacao] = useState<ClassificacaoRota>(
    carga.classificacao_rota ?? "B",
  );
  const [salvarFavorita, setSalvarFavorita] = useState(false);
  const [cargaRetorno, setCargaRetorno] = useState(Boolean(carga.carga_retorno));
  const [retornaOrigem, setRetornaOrigem] = useState(Boolean(carga.retorna_origem));
  const [rotaId, setRotaId] = useState(carga.rota_id ?? "");
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
    setFreteTabela(formatMoneyInput(carga.frete_tabela || 0));
    setAnttInfo(carga.antt ?? null);
    setClassificacao(carga.classificacao_rota ?? "B");
    setSalvarFavorita(false);
    setCargaRetorno(Boolean(carga.carga_retorno));
    setRetornaOrigem(Boolean(carga.retorna_origem));
    setRotaId(carga.rota_id ?? "");
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
    setFreteTabela(formatMoneyInput(r.frete_tabela || 0));
    setClassificacao(r.classificacao ?? "B");
    setSalvarFavorita(false);
    setInfo(`Rota “${r.descricao}” aplicada (${r.origem} → ${r.destino}).`);
  }

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
        if (rotaId) setRotaId("");
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
        if (rotaId) setRotaId("");
      })();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [destinoMapsStr, editavel]);

  function handleSalvar(irParaPublicar = false) {
    setError("");
    setInfo("");
    if (!editavel) {
      setError("Esta carga já foi publicada e não pode ser editada aqui.");
      return;
    }

    const origemFinal = origem.trim();
    const destinoFinal = destino.trim();
    const freteFinal = parseMoneyInput(freteTabela);
    const classifFinal: ClassificacaoRota = classificacao;

    if (!origemFinal || !destinoFinal) {
      setError("Informe origem e destino da rota.");
      return;
    }
    if (!veiculo.trim()) {
      setError("Selecione o tipo de veículo.");
      return;
    }
    const complementoFinal = parseComplemento(complementoTxt);
    if (!complementoFinal) {
      setError("Selecione o complemento (Sim, Não ou Ambos).");
      return;
    }
    const riscoFinal = parseGerenciamentoRisco(riscoTxt);
    if (!riscoFinal) {
      setError(
        "Selecione o gerenciamento de risco (rastreador ou localizador).",
      );
      return;
    }
    if (Number.isNaN(freteFinal) || freteFinal <= 0) {
      setError("Informe o valor do frete tabela.");
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
      const novaRota: Rota = {
        id: newRotaId(),
        descricao: descricaoRota(origemFinal, destinoFinal),
        origem: origemFinal,
        destino: destinoFinal,
        origem_lat: origemLat,
        origem_lng: origemLng,
        destino_lat: destinoLat,
        destino_lng: destinoLng,
        classificacao: classifFinal,
        frete_tabela: freteFinal,
        km: anttInfo?.rota.distancia_km ?? 0,
        situacao: "ativo",
      };
      salvarRota(novaRota);
      rotaIdFinal = novaRota.id;
      setRotaId(novaRota.id);
      setInfo("Rota salva na aba Rotas (disponível para próximas cargas).");
    }

    if (!pedido.trim()) {
      setError("Informe o pedido.");
      return;
    }
    if (!destinatario.trim()) {
      setError("Informe o destinatário.");
      return;
    }
    const pesoNum = parseMoneyInput(peso);
    const volumesNum = Number(volumes);
    const entregasNum = Number(numEntregas);
    const valorNum = parseMoneyInput(valorMerc);
    if (Number.isNaN(pesoNum) || pesoNum <= 0) {
      setError("Peso inválido.");
      return;
    }
    if (Number.isNaN(volumesNum) || volumesNum < 0) {
      setError("Volumes inválidos.");
      return;
    }
    if (Number.isNaN(entregasNum) || entregasNum < 1) {
      setError("Número de entregas inválido (mínimo 1).");
      return;
    }
    if (Number.isNaN(valorNum) || valorNum < 0) {
      setError("Valor das mercadorias inválido.");
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
      complemento: complementoFinal,
      carga_retorno: cargaRetorno,
      retorna_origem: retornaOrigem,
      gerenciamento_risco: riscoFinal,
      frete_tabela: freteFinal,
      antt: anttInfo,
      pedido: pedido.trim(),
      tipo_carga: tipoCarga.trim() || TIPOS_CARGA[0],
      veiculo: veiculo.trim(),
      carrocerias: parseCarrocerias(carroceriaTxt),
      destinatario: destinatario.trim(),
      destinatario_cnpj: formatCnpj(destinatarioCnpj),
      destinatario_whatsapp: formatPhoneBr(destinatarioWhatsapp).trim() || null,
      destinatario_email: destinatarioEmail.trim() || null,
      peso: pesoNum,
      volumes: Math.round(volumesNum),
      num_entregas: Math.round(entregasNum),
      valor_mercadorias: valorNum,
      data_carregamento: fromDateInput(dataCarreg),
      previsao_entrega: fromDateInput(previsao),
      observacao: observacao.trim() || undefined,
      numero: carga.numero,
      created_at: carga.created_at,
    };

    if (isCargaEphemeral(carga)) {
      const criada = criarCarga(patch);
      if (!salvarFavorita) setInfo("Carga salva em Cargas salvas.");
      onPersisted?.(criada);
      onSaved?.();
      if (irParaPublicar) onGoPublish?.();
      return;
    }

    const res = atualizarCarga(carga.id, patch);
    if (!res.ok) {
      setError(res.error ?? "Erro ao salvar");
      return;
    }
    if (!salvarFavorita) setInfo("Dados salvos.");
    onSaved?.();
    if (irParaPublicar) onGoPublish?.();
  }

  if (!editavel) {
    return (
      <div className="space-y-0.5 text-[13px] leading-snug">
        <Row label="Número" value={carga.numero} />
        <Row label="Pedido" value={carga.pedido || "—"} />
        <Row label="Origem" value={carga.origem || "—"} />
        <Row label="Destino" value={carga.destino || "—"} />
        {canEdit ? (
          <div className="grid gap-1.5 py-1 sm:grid-cols-2">
            <Field label="Retorna para origem">
              <select
                className={inputClass}
                value={carga.retorna_origem ? "sim" : "nao"}
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
              Com “Sim”, o card mostra <strong className="text-red-600">Retorno</strong> em
              vermelho abaixo do frete.
            </p>
          </div>
        ) : (
          <>
            <Row
              label="Retorna para origem"
              value={carga.retorna_origem ? "Sim" : "Não"}
            />
            <Row
              label="Carga retorno"
              value={carga.carga_retorno ? "Sim" : "Não"}
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
            Carga {carga.numero}
          </p>
          <p className="text-[12px] font-semibold text-black">
            Preencha por seção: rota, frete, veículo, pedido e destinatário.
          </p>
        </div>
        {rotaSelecionada && (
          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-bold text-ink">
            Rota: {rotaSelecionada.descricao}
          </span>
        )}
      </div>

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
                  {r.descricao} — {r.origem} → {r.destino}
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
              value={classificacao}
              onChange={(e) =>
                setClassificacao(e.target.value as ClassificacaoRota)
              }
            >
              <option value="A">Rota A</option>
              <option value="B">Rota B</option>
              <option value="C">Rota C</option>
            </select>
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
                if (rotaId) setRotaId("");
              }}
              localSuggestions={sugOrigem}
              minChars={2}
              placeholder="Digite o endereço como no Google Maps"
            />
          </Field>
          <Field label="Destino *" className="sm:col-span-6">
            <AddressSuggestInput
              value={destino}
              onChange={(v) => {
                setDestino(v);
                if (rotaId) setRotaId("");
              }}
              localSuggestions={sugDestino}
              minChars={2}
              placeholder="Digite o endereço como no Google Maps"
            />
          </Field>
          <Field label="Coordenadas origem (Maps)" className="sm:col-span-6">
            <input
              className={inputClass}
              inputMode="text"
              placeholder="-23.5613545,-46.6590692,17"
              value={origemMapsStr}
              onChange={(e) => setOrigemMapsStr(e.target.value)}
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
              onChange={(e) => setDestinoMapsStr(e.target.value)}
            />
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Cole lat,lng ou lat,lng,zoom do Google Maps.
            </p>
          </Field>
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
                onChange={(e) => setSalvarFavorita(e.target.value === "sim")}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </Field>
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
              onBlur={() => {
                const n = parseMoneyInput(valorMerc);
                if (!Number.isNaN(n)) setValorMerc(formatMoneyInput(n));
              }}
            />
          </Field>
          <Field label="Peso (kg) *">
            <SuggestInput
              value={peso}
              onChange={setPeso}
              suggestions={sugPeso}
              onBlur={() => {
                const n = parseMoneyInput(peso);
                if (!Number.isNaN(n)) setPeso(formatMoneyInput(n));
              }}
            />
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
            />
          </Field>
        </div>
      </section>

      {/* 5. Destinatário */}
      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
          5 · Destinatário
        </h3>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <Field label="Nome / empresa *">
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

      {/* 6. Prazos e obs */}
      <section className="space-y-1.5 border-t border-ink/15 pt-2">
        <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-black">
          6 · Prazos e observações
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

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900">
          {error}
        </p>
      )}
      {info && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {info}
        </p>
      )}

      <div className="sticky bottom-0 -mx-1 flex flex-col gap-1.5 border-t border-ink/15 bg-white/95 px-1 pt-2 backdrop-blur sm:flex-row">
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
