import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { LOGO_DOCA_LIVRE_SRC } from '../lib/brandAssets'
import { ProductMark } from '../components/ProductMark'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  portalEmailEnviarCodigo,
  portalEmailVerificarCodigo,
} from '../lib/portalApi'
import {
  DOCUMENTOS_TRANSPORTADOR,
  fileToDataUrl,
  isAcceptedDocFile,
  openLocalDocumento,
} from '../lib/transportadorDocs'
import { isAcceptedImageFile } from '../lib/veiculoFotos'
import { ImageCropModal } from '../components/ui/ImageCropModal'
import type { TipoDocumentoTransportador } from '../types'
import { VerificacaoFacial } from '../components/verificacao/VerificacaoFacial'
import { facialParaTransportadora } from '../lib/verificacaoFacial'
import type { FacialCaptura } from '../lib/verificacaoFacial'
import { CnpjInput } from '../components/ui/CnpjInput'
import { PontoMapPreview } from '../components/ui/PontoMapPreview'
import { cnpjDigits, formatCnpj, isValidCnpj } from '../lib/cnpj'
import { buscarDadosPorCnpj } from '../lib/cnpjLookup'
import {
  buscarEnderecoPorCep,
  enderecoPorCoordenadas,
  enderecoProntoParaGeocode,
  formatCepBr,
  geocodificarEndereco,
} from '../lib/geocodeEndereco'
import { formatPhoneBr } from '../lib/phoneBr'
import { lerPlanoPago, planoOfertaPorId } from '../lib/planosOfertaCarga'
import {
  ORG_TIPO_LABEL,
  ancestraisOrg,
  flattenOrg,
  hydrateOrgTree,
  type OrgNo,
} from '../lib/orgHierarchy'
import '../styles/login.css'
import '../styles/cadastro.css'
import '../styles/shell.css'

type Step = 1 | 2 | 3 | 4 | 'ok'

/** Embarcador, unidade e motorista são cadastrados pelo Super na aba Hierarquia. */
const RAMIFICACAO_PUBLICA = 'transportadora'

function trilhaHierarquia(tree: OrgNo[], no: OrgNo) {
  const acima = ancestraisOrg(tree, no.id)
    .reverse()
    .map((n) => n.nome)
  const tipo = ORG_TIPO_LABEL[no.tipo]
  return `${tipo}: ${[...acima, no.nome].join(' → ')}`
}

type DocState = Partial<
  Record<TipoDocumentoTransportador, { nome_arquivo: string; data_url: string; file?: File }>
>

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

function formatCep(raw: string): string {
  return formatCepBr(raw)
}

function onlyDigits(raw: string, max: number): string {
  return raw.replace(/\D/g, '').slice(0, max)
}

const RAIO_MIN_KM = 10
const RAIO_MAX_KM = 500
const RAIO_DEFAULT_KM = 50

const emptyOrigem = () => ({
  cep: '',
  cidade: '',
  uf: 'SP',
  endereco: '',
  numero: '',
  bairro: '',
  complemento: '',
  lat: null as number | null,
  lng: null as number | null,
  raio_km: RAIO_DEFAULT_KM,
})

export function CadastroTransportadorPage() {
  const { user, registrarCadastroTransportador } = useData()
  const [params] = useSearchParams()
  const planoQuery = params.get('plano')
  const veioPago = params.get('pago') === '1'
  const planoEscolhido = planoOfertaPorId(planoQuery) ?? planoOfertaPorId(lerPlanoPago()?.planoId)
  const [paisHierarquia, setPaisHierarquia] = useState<Array<{ id: string; rotulo: string }>>([])
  const [orgParentId, setOrgParentId] = useState('')
  const [step, setStep] = useState<Step>(1)
  const [facial, setFacial] = useState<FacialCaptura | null>(null)
  const exigeFacial = facialParaTransportadora(RAMIFICACAO_PUBLICA)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const [empresa, setEmpresa] = useState({
    razao_social: '',
    nome_fantasia: '',
    cnpj: '',
    inscricao_estadual: '',
    inscricao_municipal: '',
    rntrc: '',
    cidade: '',
    uf: 'SP',
    endereco: '',
    numero: '',
    bairro: '',
    complemento: '',
    cep: '',
    telefone: '',
    email: '',
    contato_nome: '',
    contato_telefone: '',
  })

  const [origem, setOrigem] = useState(emptyOrigem)
  const [origemInfo, setOrigemInfo] = useState('')
  const [origemBuscandoCep, setOrigemBuscandoCep] = useState(false)
  const [origemGeocoding, setOrigemGeocoding] = useState(false)
  const [latStr, setLatStr] = useState('')
  const [lngStr, setLngStr] = useState('')
  const [origemReverseBusy, setOrigemReverseBusy] = useState(false)
  const ultimoCepOrigem = useRef('')
  const ultimoCepEmpresa = useRef('')
  const [cepEmpresaInfo, setCepEmpresaInfo] = useState('')
  const [cepEmpresaBuscando, setCepEmpresaBuscando] = useState(false)
  const [usarResidencialNaOrigem, setUsarResidencialNaOrigem] = useState(false)
  const coordsManuais = useRef(false)
  const reverseTimer = useRef(0)
  const reverseSeq = useRef(0)

  const [docs, setDocs] = useState<DocState>({})
  const [logo, setLogo] = useState<{
    nome_arquivo: string
    data_url: string
    file?: File
  } | null>(null)
  const [logoParaAjustar, setLogoParaAjustar] = useState<File | null>(null)
  const [acesso, setAcesso] = useState({
    usuario: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    nome: '',
  })
  const [emailCodigo, setEmailCodigo] = useState('')
  const [emailConfirmado, setEmailConfirmado] = useState(false)
  const [verifyToken, setVerifyToken] = useState('')
  const [debugCodigo, setDebugCodigo] = useState('')
  const [otpInfo, setOtpInfo] = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false)
  const [cnpjBuscando, setCnpjBuscando] = useState(false)
  const [cnpjInfo, setCnpjInfo] = useState('')
  const [cnpjInfoOk, setCnpjInfoOk] = useState(false)
  const [cnpjConsulta, setCnpjConsulta] = useState(0)
  const ultimoCnpjBuscado = useRef('')

  useEffect(() => {
    let ativo = true
    void hydrateOrgTree().then((tree) => {
      if (!ativo) return
      const flat = flattenOrg(tree)
      const opcoes = flat
        .filter((n) => n.tipo === 'unidade' || n.tipo === 'filial_operador')
        .map((n) => ({
          id: n.id,
          rotulo: trilhaHierarquia(tree, n),
        }))
      setPaisHierarquia(opcoes)
      setOrgParentId((atual) => atual || (opcoes.length === 1 ? opcoes[0].id : ''))
    })
    return () => {
      ativo = false
    }
  }, [])

  const docsOk = useMemo(() => {
    return DOCUMENTOS_TRANSPORTADOR.filter((d) => d.obrigatorio).every((d) => Boolean(docs[d.tipo]))
  }, [docs])

  // Ao completar CNPJ válido, puxa razão social, endereço e contato.
  useEffect(() => {
    const digits = cnpjDigits(empresa.cnpj)
    if (digits.length !== 14 || !isValidCnpj(digits)) {
      setCnpjBuscando(false)
      return
    }
    if (ultimoCnpjBuscado.current === digits) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setCnpjBuscando(true)
        setCnpjInfoOk(false)
        setCnpjInfo('Consultando CNPJ na Receita…')
        setError('')
        const res = await buscarDadosPorCnpj(digits)
        if (cancelled) return
        setCnpjBuscando(false)
        if (!res.ok) {
          setCnpjInfoOk(false)
          // CNPJ já passou na validação local — só a consulta externa falhou
          const rede = /rede|internet|consultar|Receita|encontrado|Muitas/i.test(res.erro)
          setCnpjInfo(
            rede
              ? 'CNPJ válido. Não foi possível buscar os dados na Receita agora — preencha manualmente.'
              : res.erro,
          )
          return
        }
        ultimoCnpjBuscado.current = digits
        const d = res.dados
        setEmpresa((prev) => ({
          ...prev,
          cnpj: d.cnpj || prev.cnpj,
          razao_social: d.razao_social || prev.razao_social,
          nome_fantasia: d.nome_fantasia || prev.nome_fantasia,
          cep: d.cep || prev.cep,
          cidade: d.cidade || prev.cidade,
          uf: d.uf || prev.uf,
          endereco: d.endereco || prev.endereco,
          numero: d.numero || prev.numero,
          bairro: d.bairro || prev.bairro,
          complemento: d.complemento || prev.complemento,
          telefone: d.telefone || prev.telefone,
          email: d.email || prev.email,
        }))
        setCnpjInfoOk(true)
        setCnpjInfo('Dados da empresa preenchidos automaticamente. Confira antes de continuar.')
      })()
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [empresa.cnpj, cnpjConsulta])

  // CEP da empresa → preenche rua, bairro, cidade e UF
  useEffect(() => {
    const cep = empresa.cep.replace(/\D/g, '')
    if (cep.length !== 8) {
      setCepEmpresaBuscando(false)
      setCepEmpresaInfo('')
      return
    }
    if (ultimoCepEmpresa.current === cep) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setCepEmpresaBuscando(true)
        setCepEmpresaInfo('Consultando CEP…')
        const res = await buscarEnderecoPorCep(cep)
        if (cancelled) return
        setCepEmpresaBuscando(false)
        if (!res.ok) {
          setCepEmpresaInfo(
            res.erro === 'CEP não encontrado.'
              ? 'CEP não encontrado. Confira o número ou preencha o endereço.'
              : res.erro,
          )
          return
        }
        ultimoCepEmpresa.current = cep
        setEmpresa((prev) => ({
          ...prev,
          cep: res.dados.cep || prev.cep,
          cidade: res.dados.cidade || prev.cidade,
          uf: res.dados.uf || prev.uf,
          endereco: res.dados.endereco ?? prev.endereco,
          bairro: res.dados.bairro ?? prev.bairro,
          complemento: res.dados.complemento || prev.complemento,
        }))
        setCepEmpresaInfo(
          res.dados.endereco
            ? 'Endereço preenchido pelo CEP. Informe o número.'
            : 'Cidade preenchida pelo CEP. Este CEP não traz a rua — complete o endereço.',
        )
      })()
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [empresa.cep])

  // Origem pode repetir o endereço residencial e então buscar as coordenadas.
  useEffect(() => {
    if (!usarResidencialNaOrigem) return
    const cepDigits = empresa.cep.replace(/\D/g, '')
    let copiou = false
    let limpouCoords = false
    setOrigem((prev) => {
      const igual =
        prev.cep === empresa.cep &&
        prev.cidade === empresa.cidade &&
        prev.uf === empresa.uf &&
        prev.endereco === empresa.endereco &&
        prev.numero === empresa.numero &&
        prev.bairro === empresa.bairro &&
        prev.complemento === empresa.complemento
      if (igual) return prev
      copiou = true
      const enderecoMudou =
        prev.cep !== empresa.cep ||
        prev.cidade !== empresa.cidade ||
        prev.uf !== empresa.uf ||
        prev.endereco !== empresa.endereco ||
        prev.numero !== empresa.numero ||
        prev.bairro !== empresa.bairro
      limpouCoords = enderecoMudou
      if (enderecoMudou) {
        ultimoCepOrigem.current = cepDigits.length === 8 ? cepDigits : ''
        coordsManuais.current = false
      }
      return {
        ...prev,
        cep: empresa.cep,
        cidade: empresa.cidade,
        uf: empresa.uf || prev.uf,
        endereco: empresa.endereco,
        numero: empresa.numero,
        bairro: empresa.bairro,
        complemento: empresa.complemento,
        lat: enderecoMudou ? null : prev.lat,
        lng: enderecoMudou ? null : prev.lng,
      }
    })
    if (!copiou) return
    if (limpouCoords) {
      setLatStr('')
      setLngStr('')
      setOrigemInfo('Endereço residencial copiado. Localizando coordenadas…')
    }
  }, [
    usarResidencialNaOrigem,
    empresa.cep,
    empresa.cidade,
    empresa.uf,
    empresa.endereco,
    empresa.numero,
    empresa.bairro,
    empresa.complemento,
  ])

  // CEP da origem → preenche rua/cidade (ViaCEP)
  useEffect(() => {
    const cep = origem.cep.replace(/\D/g, '')
    if (cep.length !== 8) {
      setOrigemBuscandoCep(false)
      return
    }
    if (ultimoCepOrigem.current === cep) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setOrigemBuscandoCep(true)
        setOrigemInfo('Consultando CEP…')
        const res = await buscarEnderecoPorCep(cep)
        if (cancelled) return
        setOrigemBuscandoCep(false)
        if (!res.ok) {
          setOrigemInfo(res.erro)
          return
        }
        ultimoCepOrigem.current = cep
        coordsManuais.current = false
        setOrigem((prev) => ({
          ...prev,
          ...res.dados,
          cep: res.dados.cep || prev.cep,
          lat: null,
          lng: null,
        }))
        setLatStr('')
        setLngStr('')
        setOrigemInfo('Endereço preenchido pelo CEP. Confira e aguarde as coordenadas.')
      })()
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [origem.cep])

  // Geocode quando CEP completo ou cidade+rua (+número se tiver)
  useEffect(() => {
    if (!enderecoProntoParaGeocode(origem)) {
      setOrigemGeocoding(false)
      return
    }
    // Evita re-geocode se já tem coords e nada mudou de forma parcial — limpa coords ao editar
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setOrigemGeocoding(true)
        setOrigemInfo((prev) =>
          prev.includes('coordenadas') ? prev : 'Localizando coordenadas no mapa…',
        )
        const res = await geocodificarEndereco(origem)
        if (cancelled) return
        setOrigemGeocoding(false)
        if (coordsManuais.current) return
        if (!res.ok) {
          setOrigem((prev) => ({ ...prev, lat: null, lng: null }))
          setLatStr('')
          setLngStr('')
          setOrigemInfo(res.erro)
          return
        }
        setOrigem((prev) => ({
          ...prev,
          lat: res.coords.lat,
          lng: res.coords.lng,
        }))
        setLatStr(res.coords.lat.toFixed(6))
        setLngStr(res.coords.lng.toFixed(6))
        setOrigemInfo(
          `Coordenadas encontradas: ${res.coords.lat.toFixed(5)}, ${res.coords.lng.toFixed(5)}. Você pode ajustar no mapa ou nos campos.`,
        )
      })()
    }, 700)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geocode pelos campos de endereço
  }, [
    origem.cep,
    origem.cidade,
    origem.uf,
    origem.endereco,
    origem.numero,
    origem.bairro,
  ])

  if (user) {
    return (
      <Navigate
        to={user.role === 'transportador' ? '/transportador' : '/embarcador'}
        replace
      />
    )
  }

  function setEmp<K extends keyof typeof empresa>(key: K, value: (typeof empresa)[K]) {
    setEmpresa((prev) => ({ ...prev, [key]: value }))
  }

  function aplicarCoordsManuais(lat: number, lng: number) {
    coordsManuais.current = true
    setOrigem((prev) => ({ ...prev, lat, lng }))
    setLatStr(lat.toFixed(6))
    setLngStr(lng.toFixed(6))
    setOrigemInfo('Buscando endereço deste ponto no mapa…')
    setOrigemReverseBusy(true)

    window.clearTimeout(reverseTimer.current)
    const seq = ++reverseSeq.current
    reverseTimer.current = window.setTimeout(() => {
      void (async () => {
        const res = await enderecoPorCoordenadas(lat, lng)
        if (seq !== reverseSeq.current) return
        setOrigemReverseBusy(false)
        if (!res.ok) {
          setOrigemInfo(
            `Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}. ${res.erro} Preencha o endereço manualmente.`,
          )
          return
        }
        const cepDigits = (res.dados.cep || '').replace(/\D/g, '')
        if (cepDigits.length === 8) ultimoCepOrigem.current = cepDigits
        else ultimoCepOrigem.current = ''
        coordsManuais.current = true
        setOrigem((prev) => ({
          ...prev,
          lat,
          lng,
          cep: res.dados.cep || '',
          cidade: res.dados.cidade || '',
          uf: res.dados.uf || prev.uf || 'SP',
          endereco: res.dados.endereco || '',
          numero: res.dados.numero || '',
          bairro: res.dados.bairro || '',
        }))
        const resumo = [
          res.dados.endereco,
          res.dados.numero,
          res.dados.bairro,
          res.dados.cidade,
          res.dados.uf,
          res.dados.cep,
        ]
          .filter(Boolean)
          .join(' · ')
        setOrigemInfo(
          `Endereço preenchido pelo mapa: ${resumo || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}`,
        )
        // Leva o usuário aos campos preenchidos (acima do mapa)
        window.requestAnimationFrame(() => {
          document
            .getElementById('origem-endereco-campos')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      })()
    }, 200)
  }

  function parseCoordInput(raw: string): number | null {
    const n = Number(raw.replace(',', '.').trim())
    return Number.isFinite(n) ? n : null
  }

  function onLatChange(raw: string) {
    setLatStr(raw)
    const lat = parseCoordInput(raw)
    const lng = parseCoordInput(lngStr)
    if (lat == null) {
      coordsManuais.current = true
      setOrigem((prev) => ({ ...prev, lat: null }))
      return
    }
    if (lng != null) aplicarCoordsManuais(lat, lng)
    else {
      coordsManuais.current = true
      setOrigem((prev) => ({ ...prev, lat }))
    }
  }

  function onLngChange(raw: string) {
    setLngStr(raw)
    const lng = parseCoordInput(raw)
    const lat = parseCoordInput(latStr)
    if (lng == null) {
      coordsManuais.current = true
      setOrigem((prev) => ({ ...prev, lng: null }))
      return
    }
    if (lat != null) aplicarCoordsManuais(lat, lng)
    else {
      coordsManuais.current = true
      setOrigem((prev) => ({ ...prev, lng }))
    }
  }

  function setOri<K extends keyof typeof origem>(key: K, value: (typeof origem)[K]) {
    const limpaCoords = key !== 'lat' && key !== 'lng' && key !== 'raio_km'
    if (limpaCoords && usarResidencialNaOrigem) setUsarResidencialNaOrigem(false)
    if (limpaCoords) {
      coordsManuais.current = false
      setLatStr('')
      setLngStr('')
    }
    setOrigem((prev) => {
      const next = { ...prev, [key]: value }
      if (limpaCoords) {
        next.lat = null
        next.lng = null
      }
      return next
    })
    if (key === 'cep') {
      const digits = String(value).replace(/\D/g, '')
      if (digits !== ultimoCepOrigem.current) ultimoCepOrigem.current = ''
    }
  }

  function setAcc<K extends keyof typeof acesso>(key: K, value: (typeof acesso)[K]) {
    setAcesso((prev) => ({ ...prev, [key]: value }))
  }

  async function onPickDoc(tipo: TipoDocumentoTransportador, file: File | null) {
    setError('')
    if (!file) {
      setDocs((prev) => {
        const next = { ...prev }
        delete next[tipo]
        return next
      })
      return
    }
    if (!isAcceptedDocFile(file)) {
      setError('Use PDF, JPG ou PNG (máx. recomendado 8 MB).')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Arquivo muito grande (máx. 8 MB).')
      return
    }
    const data_url = await fileToDataUrl(file)
    setDocs((prev) => ({
      ...prev,
      [tipo]: { nome_arquivo: file.name, data_url, file },
    }))
  }

  function nextFromEmpresa(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!orgParentId) {
      setError('Escolha a unidade ou a filial da hierarquia à qual a transportadora pertence.')
      return
    }
    if (!empresa.cnpj.trim() || !empresa.nome_fantasia.trim() || !empresa.razao_social.trim()) {
      setError('Preencha CNPJ, Nome Fantasia e Razão Social.')
      return
    }
    if (!empresa.rntrc.trim()) {
      setError('Preencha o RNTRC (registro ANTT).')
      return
    }
    if (!empresa.cidade.trim() || !empresa.uf.trim()) {
      setError('Preencha cidade e UF do endereço residencial.')
      return
    }
    if (!origem.cidade.trim() || !origem.uf.trim()) {
      setError('Preencha cidade e UF da sua origem (onde você mora).')
      return
    }
    if (!origem.endereco.trim() && origem.cep.replace(/\D/g, '').length < 8) {
      setError('Na origem, informe o CEP ou a rua.')
      return
    }
    if (origemGeocoding || origemBuscandoCep) {
      setError('Aguarde a consulta do CEP/coordenadas da origem.')
      return
    }
    if (origem.lat == null || origem.lng == null) {
      setError('Não encontramos as coordenadas da origem. Confira o endereço ou o CEP.')
      return
    }
    if (!Number.isFinite(origem.raio_km) || origem.raio_km < RAIO_MIN_KM) {
      setError(`Defina o raio de pesquisa (mínimo ${RAIO_MIN_KM} km).`)
      return
    }
    setStep(2)
  }

  function nextFromContato(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!empresa.contato_nome.trim() || !empresa.contato_telefone.trim()) {
      setError('Preencha nome do responsável e Celular / WhatsApp.')
      return
    }
    setStep(3)
  }

  function nextFromDocs(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!docsOk) {
      setError('Anexe todos os documentos obrigatórios.')
      return
    }
    if (exigeFacial && !facial) {
      setError('Faça a verificação facial do responsável antes de continuar.')
      return
    }
    setStep(4)
  }

  async function enviarCodigoEmail() {
    setError('')
    setOtpInfo('')
    setDebugCodigo('')
    if (!acesso.email.trim().includes('@')) {
      setError('Informe um e-mail válido para receber o código.')
      return
    }
    setLoading(true)
    const res = await portalEmailEnviarCodigo(acesso.email.trim())
    setLoading(false)
    if (!res.ok) {
      setError(res.erro)
      return
    }
    setEmailConfirmado(false)
    setVerifyToken('')
    setOtpInfo(res.mensagem || 'Código enviado para o e-mail.')
    setDebugCodigo(res.debug_codigo || '')
  }

  async function confirmarCodigoEmail() {
    setError('')
    setOtpInfo('')
    setLoading(true)
    const res = await portalEmailVerificarCodigo(acesso.email.trim(), emailCodigo.trim())
    setLoading(false)
    if (!res.ok) {
      setError(res.erro)
      return
    }
    setEmailConfirmado(true)
    setVerifyToken(res.verify_token || '')
    setDebugCodigo('')
    setOtpInfo('E-mail confirmado. Defina a senha e envie o cadastro.')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setOtpInfo('')
    if (!emailConfirmado) {
      setError('Confirme o e-mail com o código recebido antes de enviar o cadastro.')
      return
    }
    if (acesso.senha.length < 4) {
      setError('Senha deve ter ao menos 4 caracteres.')
      return
    }
    if (acesso.senha !== acesso.confirmarSenha) {
      setError('As senhas não coincidem.')
      return
    }
    setLoading(true)
    const result = await registrarCadastroTransportador({
      ramificacao: RAMIFICACAO_PUBLICA,
      orgParentId,
      plano: planoEscolhido?.id,
      empresa,
      origem: {
        cep: origem.cep,
        cidade: origem.cidade,
        uf: origem.uf,
        endereco: origem.endereco,
        numero: origem.numero,
        bairro: origem.bairro,
        complemento: origem.complemento,
        lat: origem.lat,
        lng: origem.lng,
        raio_km: origem.raio_km,
      },
      acesso: {
        ...acesso,
        nome: acesso.nome.trim() || empresa.contato_nome.trim(),
        verifyToken: verifyToken || undefined,
      },
      facial: exigeFacial ? facial : null,
      documentos: DOCUMENTOS_TRANSPORTADOR.flatMap((d) => {
        const item = docs[d.tipo]
        if (!item) return []
        return [
          {
            tipo: d.tipo,
            nome_arquivo: item.nome_arquivo,
            data_url: item.data_url,
            file: item.file,
          },
        ]
      }),
      logo,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Falha no cadastro.')
      return
    }
    setInfo(
      result.mensagem ??
        'Cadastro enviado. Aguarde a aprovação dos documentos. Quando for aprovado, o usuário e a senha chegam neste e-mail. Se for recusado, o e-mail explica o motivo.',
    )
    setStep('ok')
  }

  return (
    <div className="portal-login cadastro-publico">
      <div className="portal-login__card cadastro-publico__card">
        <div className="portal-login__brand">
          <img src={LOGO_DOCA_LIVRE_SRC} alt="Doca Livre" className="portal-login__logo" />
          <ProductMark size="md" />
        </div>

        <h1 className="portal-login__title">Cadastro de Transportador</h1>
        <p className="portal-login__subtitle">
          {veioPago && planoEscolhido
            ? `Plano ${planoEscolhido.nome} com PIX confirmado. Complete o cadastro de transportador.`
            : 'Cadastro de transportador. Preencha os dados da transportadora, anexe os documentos e crie seu acesso. Após o envio, aguarde a aprovação.'}
        </p>

        {!isSupabaseConfigured && step !== 'ok' && (
          <p className="cadastro-publico__aviso">
            Modo local: o cadastro fica neste navegador. Para o link funcionar entre pessoas,
            publique no Render com Supabase.
          </p>
        )}

        {step !== 'ok' && (
          <ol className="cadastro-steps" aria-label="Etapas">
            {[
              [1, 'Empresa'],
              [2, 'Contato'],
              [3, 'Documentos'],
              [4, 'Acesso'],
            ].map(([n, label]) => (
              <li
                key={n}
                className={
                  step === n
                    ? 'cadastro-steps__item cadastro-steps__item--active'
                    : typeof step === 'number' && step > Number(n)
                      ? 'cadastro-steps__item cadastro-steps__item--done'
                      : 'cadastro-steps__item'
                }
              >
                <span>{n}</span>
                {label}
              </li>
            ))}
          </ol>
        )}

        {step === 1 && (
          <form className="portal-login__form" onSubmit={nextFromEmpresa}>
            <section className="form-card form-card--blue">
              <header className="form-card__head">
                <h2 className="form-card__title">Dados da empresa</h2>
              </header>
              <div className="form-card__body">
                <p className="cadastro-publico__hint">
                  Cadastro de transportador: a empresa entra como transportadora, abaixo de uma unidade ou de uma
                  filial do operador. Operador, filial, embarcador e unidade são cadastrados pelo
                  Super Usuário, na aba Hierarquia. O endereço residencial fica no bloco seguinte.
                  A origem pode usar esse mesmo endereço.
                </p>

                <p className="cadastro-label" style={{ marginBottom: 8 }}>
                  Unidade ou filial <span>*</span>
                </p>
                {paisHierarquia.length === 0 ? (
                  <p className="cadastro-publico__hint">
                    Ainda não há unidade ou filial na hierarquia. Peça ao Super Usuário para
                    cadastrar esse ponto na aba Hierarquia antes de continuar.
                  </p>
                ) : (
                  <select
                    className="cadastro-input"
                    value={orgParentId}
                    required
                    onChange={(e) => setOrgParentId(e.target.value)}
                  >
                    <option value="">Selecione a unidade ou a filial</option>
                    {paisHierarquia.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.rotulo}
                      </option>
                    ))}
                  </select>
                )}

                <div className="cadastro-empresa-topo">
                <div className="cadastro-logo">
                  <div className="cadastro-logo__preview" aria-hidden>
                    {logo ? (
                      <img src={logo.data_url} alt="" />
                    ) : (
                      <span>Sem foto</span>
                    )}
                  </div>
                  <div className="cadastro-logo__meta">
                    <strong>Logo ou foto de perfil</strong>
                    <span>
                      Envie a logo da empresa. Se não tiver, use uma foto sua — ela aparece no
                      login do sistema, no perfil e no mapa da frota.
                    </span>
                    <div className="cadastro-logo__actions">
                      <label className="cadastro-btn cadastro-btn--ghost cadastro-logo__btn">
                        {logo ? 'Trocar imagem' : 'Escolher imagem'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (!file) return
                            if (!isAcceptedImageFile(file)) {
                              setError('Use JPG, PNG ou WEBP para a logo/foto.')
                              return
                            }
                            if (file.size > 4 * 1024 * 1024) {
                              setError('A imagem deve ter no máximo 4 MB.')
                              return
                            }
                            setError('')
                            setLogoParaAjustar(file)
                          }}
                        />
                      </label>
                      {logo && (
                        <button
                          type="button"
                          className="cadastro-btn cadastro-btn--ghost cadastro-logo__btn cadastro-logo__btn--danger"
                          onClick={() => setLogo(null)}
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="form-fields cadastro-empresa-topo__campos">
                  <Field label="CNPJ" required>
                    <CnpjInput
                      value={empresa.cnpj}
                      onChange={(v) => {
                        const next = formatCnpj(v)
                        if (cnpjDigits(next) !== ultimoCnpjBuscado.current) {
                          ultimoCnpjBuscado.current = ''
                          setCnpjInfo('')
                          setCnpjInfoOk(false)
                        }
                        setEmp('cnpj', next)
                      }}
                      placeholder="00.000.000/0000-00"
                      disabled={cnpjBuscando}
                      showHint={!cnpjBuscando && !cnpjInfo}
                    />
                    {(cnpjBuscando || cnpjInfo) && (
                      <p
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: cnpjBuscando
                            ? '#64748b'
                            : cnpjInfoOk
                              ? '#047857'
                              : '#b45309',
                        }}
                      >
                        {cnpjBuscando ? 'Consultando CNPJ na Receita…' : cnpjInfo}
                        {!cnpjBuscando && !cnpjInfoOk ? (
                          <>
                            {' '}
                            <button
                              type="button"
                              onClick={() => setCnpjConsulta((n) => n + 1)}
                              style={{
                                background: 'none',
                                border: 0,
                                padding: 0,
                                color: '#14532d',
                                font: 'inherit',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              Tentar de novo
                            </button>
                          </>
                        ) : null}
                      </p>
                    )}
                  </Field>
                  <Field label="Nome Fantasia" required>
                    <input
                      value={empresa.nome_fantasia}
                      onChange={(e) => setEmp('nome_fantasia', e.target.value)}
                      placeholder="Ex.: Santos Transportes"
                      autoComplete="organization"
                    />
                  </Field>
                  <Field label="Razão Social" required>
                    <input
                      value={empresa.razao_social}
                      onChange={(e) => setEmp('razao_social', e.target.value)}
                      placeholder="Ex.: Santos Transportes Ltda"
                      autoComplete="organization"
                    />
                  </Field>
                </div>
                </div>

                <div className="form-fields">
                  <Field label="RNTRC (ANTT)" required>
                    <input
                      value={empresa.rntrc}
                      onChange={(e) => setEmp('rntrc', onlyDigits(e.target.value, 14))}
                      placeholder="Registro ANTT (somente números)"
                      inputMode="numeric"
                      required
                    />
                  </Field>
                  <Field label="Inscrição Estadual">
                    <input
                      value={empresa.inscricao_estadual}
                      onChange={(e) => setEmp('inscricao_estadual', e.target.value)}
                      placeholder="Ex.: 10.20.0.3 ou Isento"
                    />
                  </Field>
                  <Field label="Inscrição Municipal">
                    <input
                      value={empresa.inscricao_municipal}
                      onChange={(e) => setEmp('inscricao_municipal', e.target.value)}
                      placeholder="Número da IM (se houver)"
                    />
                  </Field>
                </div>
              </div>
            </section>

            <section className="form-card form-card--green" style={{ marginTop: 16 }}>
              <header className="form-card__head">
                <h2 className="form-card__title">Cadastre seu endereço residencial</h2>
              </header>
              <div className="form-card__body">
                <p className="cadastro-publico__hint">
                  Onde você mora. Ao digitar o CEP, a rua, o bairro e a cidade são preenchidos.
                </p>
                <div className="form-fields">
                  <Field label="CEP">
                    <input
                      value={empresa.cep}
                      onChange={(e) => {
                        const next = formatCep(e.target.value)
                        if (next.replace(/\D/g, '') !== ultimoCepEmpresa.current) {
                          ultimoCepEmpresa.current = ''
                        }
                        setEmp('cep', next)
                      }}
                      placeholder="00000-000"
                      inputMode="numeric"
                      autoComplete="postal-code"
                    />
                    {(cepEmpresaBuscando || cepEmpresaInfo) && (
                      <p
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: cepEmpresaBuscando
                            ? '#64748b'
                            : cepEmpresaInfo.startsWith('Endereço preenchido') ||
                                cepEmpresaInfo.startsWith('Cidade preenchida')
                              ? '#047857'
                              : '#b45309',
                        }}
                      >
                        {cepEmpresaBuscando ? 'Consultando CEP…' : cepEmpresaInfo}
                      </p>
                    )}
                  </Field>
                  <Field label="Cidade" required>
                    <input
                      value={empresa.cidade}
                      onChange={(e) => setEmp('cidade', e.target.value)}
                      placeholder="Ex.: São Paulo"
                      autoComplete="address-level2"
                    />
                  </Field>
                  <Field label="UF" required>
                    <select
                      value={empresa.uf}
                      onChange={(e) => setEmp('uf', e.target.value)}
                      aria-label="UF — selecione o estado"
                    >
                      {UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Endereço" className="form-field--span2">
                    <input
                      value={empresa.endereco}
                      onChange={(e) => setEmp('endereco', e.target.value)}
                      placeholder="Ex.: Rodovia Castelo Branco ou Av. Paulista"
                      autoComplete="street-address"
                    />
                  </Field>
                  <Field label="Número">
                    <input
                      value={empresa.numero}
                      onChange={(e) => setEmp('numero', e.target.value)}
                      placeholder="Ex.: 975"
                    />
                  </Field>
                  <Field label="Bairro">
                    <input
                      value={empresa.bairro}
                      onChange={(e) => setEmp('bairro', e.target.value)}
                      placeholder="Ex.: Centro"
                    />
                  </Field>
                  <Field label="Complemento" className="form-field--span2">
                    <input
                      value={empresa.complemento}
                      onChange={(e) => setEmp('complemento', e.target.value)}
                      placeholder="Ex.: KM 33, Quadra, Lote, Sala (opcional)"
                    />
                  </Field>
                </div>
              </div>
            </section>

            <section className="form-card form-card--orange" style={{ marginTop: 16 }}>
              <header className="form-card__head">
                <h2 className="form-card__title">Cadastre sua origem</h2>
              </header>
              <div className="form-card__body">
                <p className="cadastro-publico__hint">
                  Ponto de partida para buscar cargas. O endereço preenche as coordenadas
                  automaticamente; se você editar latitude/longitude ou mover o pin, o endereço é
                  atualizado pelas coordenadas.
                </p>
                <label className="cadastro-usar-residencial">
                  <input
                    type="checkbox"
                    checked={usarResidencialNaOrigem}
                    onChange={(e) => setUsarResidencialNaOrigem(e.target.checked)}
                  />
                  <span>Usar o endereço residencial</span>
                </label>
                <div className="form-fields" id="origem-endereco-campos">
                  <Field label="CEP da origem">
                    <input
                      value={origem.cep}
                      onChange={(e) => setOri('cep', formatCep(e.target.value))}
                      placeholder="00000-000"
                      inputMode="numeric"
                      autoComplete="postal-code"
                    />
                  </Field>
                  <Field label="Cidade" required>
                    <input
                      value={origem.cidade}
                      onChange={(e) => setOri('cidade', e.target.value)}
                      placeholder="Ex.: Santos"
                      autoComplete="address-level2"
                    />
                  </Field>
                  <Field label="UF" required>
                    <select
                      value={origem.uf}
                      onChange={(e) => setOri('uf', e.target.value)}
                      aria-label="UF da origem"
                    >
                      {UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Rua / logradouro" className="form-field--span2" required>
                    <input
                      value={origem.endereco}
                      onChange={(e) => setOri('endereco', e.target.value)}
                      placeholder="Ex.: Rua das Flores ou Av. Ana Costa"
                      autoComplete="street-address"
                    />
                  </Field>
                  <Field label="Número">
                    <input
                      value={origem.numero}
                      onChange={(e) => setOri('numero', e.target.value)}
                      placeholder="Ex.: 975"
                    />
                  </Field>
                  <Field label="Bairro">
                    <input
                      value={origem.bairro}
                      onChange={(e) => setOri('bairro', e.target.value)}
                      placeholder="Ex.: Centro"
                    />
                  </Field>
                  <Field label="Complemento" className="form-field--span2">
                    <input
                      value={origem.complemento}
                      onChange={(e) => setOri('complemento', e.target.value)}
                      placeholder="Apto, bloco (opcional)"
                    />
                  </Field>
                  <Field label="Latitude" className="form-field--span2">
                    <input
                      value={latStr}
                      onChange={(e) => onLatChange(e.target.value)}
                      inputMode="decimal"
                      placeholder={origemGeocoding ? 'Buscando…' : 'Automático ou edite'}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Longitude" className="form-field--span2">
                    <input
                      value={lngStr}
                      onChange={(e) => onLngChange(e.target.value)}
                      inputMode="decimal"
                      placeholder={origemGeocoding ? 'Buscando…' : 'Automático ou edite'}
                      autoComplete="off"
                    />
                  </Field>
                  <div className="form-field form-field--span2 raio-pesquisa">
                    <label>
                      Pesquisar por raio <span className="req">*</span>
                    </label>
                    <p className="raio-pesquisa__hint">
                      Distância máxima entre a sua origem e o local de carregamento.
                    </p>
                    <div className="raio-pesquisa__value">
                      <strong>{origem.raio_km}</strong>
                      <span>km</span>
                    </div>
                    <input
                      type="range"
                      className="raio-pesquisa__slider"
                      min={RAIO_MIN_KM}
                      max={RAIO_MAX_KM}
                      step={5}
                      value={origem.raio_km}
                      onChange={(e) => setOri('raio_km', Number(e.target.value))}
                      aria-label="Raio de pesquisa em quilômetros"
                      style={
                        {
                          '--raio-pct': `${((origem.raio_km - RAIO_MIN_KM) / (RAIO_MAX_KM - RAIO_MIN_KM)) * 100}%`,
                        } as CSSProperties
                      }
                    />
                    <div className="raio-pesquisa__scale">
                      <span>{RAIO_MIN_KM} km</span>
                      <span>{RAIO_MAX_KM} km</span>
                    </div>
                  </div>
                  <div className="form-field form-field--span2">
                    <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                      Mapa da origem
                    </label>
                    <PontoMapPreview
                      lat={origem.lat}
                      lng={origem.lng}
                      raioKm={origem.raio_km}
                      onPick={aplicarCoordsManuais}
                      height={260}
                    />
                  </div>
                </div>
                {(origemBuscandoCep ||
                  origemGeocoding ||
                  origemReverseBusy ||
                  origemInfo) && (
                  <p
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      color:
                        origem.lat != null && !origemReverseBusy
                          ? '#047857'
                          : origemBuscandoCep || origemGeocoding || origemReverseBusy
                            ? '#64748b'
                            : '#b45309',
                    }}
                  >
                    {origemBuscandoCep
                      ? 'Consultando CEP…'
                      : origemGeocoding
                        ? 'Localizando coordenadas…'
                        : origemReverseBusy
                          ? 'Atualizando endereço pelas coordenadas…'
                          : origemInfo}
                  </p>
                )}
              </div>
            </section>

            {error && <p className="portal-login__erro">{error}</p>}
            <button type="submit" className="portal-login__submit">
              Continuar
            </button>
          </form>
        )}

        {step === 2 && (
          <form className="portal-login__form" onSubmit={nextFromContato}>
            <section className="form-card form-card--orange">
              <header className="form-card__head">
                <h2 className="form-card__title">Contato</h2>
              </header>
              <div className="form-card__body">
                <div className="form-fields">
                  <Field label="Nome do responsável" required>
                    <input
                      value={empresa.contato_nome}
                      onChange={(e) => setEmp('contato_nome', e.target.value)}
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Telefone">
                    <input
                      type="tel"
                      value={empresa.telefone}
                      onChange={(e) => setEmp('telefone', formatPhoneBr(e.target.value))}
                      placeholder="(00) 00000-0000"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </Field>
                  <Field label="Celular / WhatsApp" required>
                    <input
                      type="tel"
                      value={empresa.contato_telefone}
                      onChange={(e) => setEmp('contato_telefone', formatPhoneBr(e.target.value))}
                      placeholder="(00) 00000-0000"
                      inputMode="tel"
                      autoComplete="tel-national"
                      required
                    />
                  </Field>
                  <Field label="E-mail da empresa">
                    <input
                      type="email"
                      value={empresa.email}
                      onChange={(e) => setEmp('email', e.target.value)}
                      placeholder="contato@suaempresa.com.br"
                      autoComplete="email"
                    />
                  </Field>
                </div>
              </div>
            </section>
            {error && <p className="portal-login__erro">{error}</p>}
            <div className="cadastro-publico__nav">
              <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => setStep(1)}>
                Voltar
              </button>
              <button type="submit" className="portal-login__submit">
                Continuar
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form className="portal-login__form" onSubmit={nextFromDocs}>
            <section className="form-card form-card--green">
              <header className="form-card__head">
                <h2 className="form-card__title">Documentos</h2>
              </header>
              <div className="form-card__body">
                <p className="cadastro-publico__hint">
                  Anexe PDF, JPG ou PNG. Itens com * são obrigatórios.
                </p>
                <div className="doc-upload-list">
                  {DOCUMENTOS_TRANSPORTADOR.map((d) => {
                    const item = docs[d.tipo]
                    return (
                      <div key={d.tipo} className="doc-upload-row">
                        <div>
                          <strong>
                            {d.label}
                            {d.obrigatorio ? <span className="req"> *</span> : null}
                          </strong>
                          {d.hint && <span>{d.hint}</span>}
                          {item && (
                            <em className="doc-upload-row__file">{item.nome_arquivo}</em>
                          )}
                        </div>
                        <div className="doc-upload-row__actions">
                          {item && (
                            <>
                              <button
                                type="button"
                                className="cadastro-btn cadastro-btn--ghost doc-upload-row__btn"
                                onClick={() => {
                                  void openLocalDocumento({
                                    file: item.file,
                                    data_url: item.data_url,
                                  }).catch((err) => {
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : 'Não foi possível abrir o documento.',
                                    )
                                  })
                                }}
                              >
                                Visualizar
                              </button>
                              <button
                                type="button"
                                className="cadastro-btn cadastro-btn--ghost doc-upload-row__btn doc-upload-row__btn--danger"
                                onClick={() => void onPickDoc(d.tipo, null)}
                              >
                                Excluir
                              </button>
                            </>
                          )}
                          <label className="cadastro-btn cadastro-btn--ghost doc-upload-row__btn">
                            {item ? 'Trocar' : 'Anexar'}
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                              hidden
                              onChange={(e) => onPickDoc(d.tipo, e.target.files?.[0] ?? null)}
                            />
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: 18 }}>
                  {exigeFacial ? null : (
                    <p className="cadastro-publico__hint">
                      A verificação facial, por enquanto, é só no cadastro da transportadora.
                    </p>
                  )}
                  {exigeFacial && facial ? (
                    <div className="facial-ok">
                      <img src={facial.imagemDataUrl} alt="Rosto confirmado na verificação" />
                      <div>
                        <strong>Verificação facial concluída.</strong>
                        <p className="cadastro-publico__hint">
                          O rosto fica guardado para confirmar, de tempos em tempos, que é você quem acessa.
                        </p>
                        <button
                          type="button"
                          className="cadastro-btn cadastro-btn--ghost"
                          onClick={() => setFacial(null)}
                        >
                          Refazer
                        </button>
                      </div>
                    </div>
                  ) : exigeFacial ? (
                    <>
                      <p className="cadastro-publico__hint">
                        Verificação ao vivo, no estilo do banco: enquadre o rosto, pisque e vire a cabeça.
                        Não aceitamos foto pronta.
                      </p>
                      <VerificacaoFacial modo="cadastrar" onConcluido={setFacial} />
                    </>
                  ) : null}
                </div>
              </div>
            </section>
            {error && <p className="portal-login__erro">{error}</p>}
            <div className="cadastro-publico__nav">
              <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => setStep(2)}>
                Voltar
              </button>
              <button type="submit" className="portal-login__submit" disabled={exigeFacial && !facial}>
                Continuar
              </button>
            </div>
          </form>
        )}

        {step === 4 && (
          <form className="portal-login__form" onSubmit={submit}>
            <section className="form-card form-card--purple">
              <header className="form-card__head">
                <h2 className="form-card__title">Acesso ao sistema</h2>
              </header>
              <div className="form-card__body">
                <div className="form-fields form-fields--photo">
                  <Field label="Nome completo">
                    <input
                      value={acesso.nome}
                      onChange={(e) => setAcc('nome', e.target.value)}
                      placeholder={empresa.contato_nome || undefined}
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Usuário" required>
                    <input
                      value={acesso.usuario}
                      onChange={(e) => setAcc('usuario', e.target.value)}
                      placeholder="Ex.: santos.transportes"
                      autoComplete="username"
                    />
                  </Field>
                  <Field label="E-mail de login" required>
                    <input
                      type="email"
                      value={acesso.email}
                      onChange={(e) => {
                        setEmailConfirmado(false)
                        setAcc('email', e.target.value)
                      }}
                      placeholder="login@suaempresa.com.br"
                      autoComplete="email"
                      disabled={emailConfirmado}
                    />
                  </Field>

                  {!emailConfirmado ? (
                    <>
                      <div className="cadastro-publico__nav" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          className="portal-login__submit"
                          disabled={loading}
                          onClick={() => void enviarCodigoEmail()}
                        >
                          {loading ? 'Enviando…' : 'Enviar código por e-mail'}
                        </button>
                      </div>
                      <Field label="Código recebido">
                        <input
                          value={emailCodigo}
                          onChange={(e) => setEmailCodigo(e.target.value)}
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="6 dígitos"
                        />
                      </Field>
                      {debugCodigo && (
                        <p className="portal-login__info">
                          Debug — código: <strong>{debugCodigo}</strong>
                        </p>
                      )}
                      {otpInfo && <p className="portal-login__info">{otpInfo}</p>}
                      <button
                        type="button"
                        className="cadastro-btn cadastro-btn--ghost"
                        disabled={loading}
                        onClick={() => void confirmarCodigoEmail()}
                      >
                        Confirmar e-mail
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="portal-login__info">E-mail confirmado ✓ {acesso.email}</p>
                      <Field label="Senha" required>
                        <div className="form-field__password-wrap">
                          <input
                            type={showSenha ? 'text' : 'password'}
                            value={acesso.senha}
                            onChange={(e) => setAcc('senha', e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            autoComplete="new-password"
                            className="form-field__input--password"
                          />
                          <button
                            type="button"
                            className="form-field__password-toggle"
                            onClick={() => setShowSenha((v) => !v)}
                            aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                            title={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                          >
                            {showSenha ? (
                              <EyeOff size={18} strokeWidth={1.75} />
                            ) : (
                              <Eye size={18} strokeWidth={1.75} />
                            )}
                          </button>
                        </div>
                      </Field>
                      <Field label="Confirmar senha" required>
                        <div className="form-field__password-wrap">
                          <input
                            type={showConfirmarSenha ? 'text' : 'password'}
                            value={acesso.confirmarSenha}
                            onChange={(e) => setAcc('confirmarSenha', e.target.value)}
                            placeholder="Repita a senha"
                            autoComplete="new-password"
                            className="form-field__input--password"
                          />
                          <button
                            type="button"
                            className="form-field__password-toggle"
                            onClick={() => setShowConfirmarSenha((v) => !v)}
                            aria-label={
                              showConfirmarSenha ? 'Ocultar confirmação' : 'Mostrar confirmação'
                            }
                            title={
                              showConfirmarSenha ? 'Ocultar confirmação' : 'Mostrar confirmação'
                            }
                          >
                            {showConfirmarSenha ? (
                              <EyeOff size={18} strokeWidth={1.75} />
                            ) : (
                              <Eye size={18} strokeWidth={1.75} />
                            )}
                          </button>
                        </div>
                      </Field>
                    </>
                  )}
                </div>
              </div>
            </section>
            {error && <p className="portal-login__erro">{error}</p>}
            {otpInfo && emailConfirmado && <p className="portal-login__info">{otpInfo}</p>}
            <div className="cadastro-publico__nav">
              <button type="button" className="cadastro-btn cadastro-btn--ghost" onClick={() => setStep(3)}>
                Voltar
              </button>
              <button
                type="submit"
                className="portal-login__submit"
                disabled={loading || !emailConfirmado}
              >
                {loading ? 'Enviando…' : 'Enviar cadastro'}
              </button>
            </div>
          </form>
        )}

        {step === 'ok' && (
          <div className="cadastro-publico__ok">
            <p className="portal-login__ok">
              Cadastro enviado. Aguarde a aprovação dos documentos para acessar o sistema.
            </p>
            <p className="portal-login__hint">
              Quando o cadastro for aprovado, você recebe neste e-mail o usuário e a senha.
              Se for recusado, o e-mail informa qual documento não foi aceito ou o outro motivo.
            </p>
            <Link to="/login" className="portal-login__submit" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Ir para o login
            </Link>
          </div>
        )}

        {step !== 'ok' && (
          <div className="portal-login__links">
            <Link to="/login" className="portal-login__link">
              Já tenho conta — entrar
            </Link>
          </div>
        )}
      </div>

      <ImageCropModal
        open={Boolean(logoParaAjustar)}
        file={logoParaAjustar}
        shape="circle"
        title="Ajustar logo / foto"
        onCancel={() => setLogoParaAjustar(null)}
        onConfirm={(file) => {
          setLogoParaAjustar(null)
          void fileToDataUrl(file).then((data_url) => {
            setLogo({
              nome_arquivo: file.name || 'logo.jpg',
              data_url,
              file,
            })
          })
        }}
      />
    </div>
  )
}

function Field({
  label,
  required,
  children,
  className = '',
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`form-field ${className}`.trim()}>
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
    </div>
  )
}
