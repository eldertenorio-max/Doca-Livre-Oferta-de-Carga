import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { MapPin, Copy } from 'lucide-react'
import { PontoMapPreview } from '../ui/PontoMapPreview'
import { Field, inputClass } from '../ui/Modal'
import {
  buscarEnderecoPorCep,
  enderecoPorCoordenadas,
  enderecoProntoParaGeocode,
  formatCepBr,
  geocodificarEndereco,
} from '../../lib/geocodeEndereco'
import { fmtMapsCoords, parseMapsCoords } from '../../lib/mapsCoords'
import type { Transportador, Veiculo } from '../../types'

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

const RAIO_MIN_KM = 10
const RAIO_MAX_KM = 500
const RAIO_DEFAULT_KM = 50

export type LocalizacaoVeiculoValue = {
  origem_cep?: string
  origem_cidade?: string
  origem_uf?: string
  origem_endereco?: string
  origem_numero?: string
  origem_bairro?: string
  origem_complemento?: string
  origem_lat?: number | null
  origem_lng?: number | null
  raio_km?: number
}

type OrigemForm = {
  cep: string
  cidade: string
  uf: string
  endereco: string
  numero: string
  bairro: string
  complemento: string
  lat: number | null
  lng: number | null
  raio_km: number
}

function fromValue(v: LocalizacaoVeiculoValue | null | undefined): OrigemForm {
  return {
    cep: v?.origem_cep ?? '',
    cidade: v?.origem_cidade ?? '',
    uf: (v?.origem_uf || 'SP').toUpperCase().slice(0, 2),
    endereco: v?.origem_endereco ?? '',
    numero: v?.origem_numero ?? '',
    bairro: v?.origem_bairro ?? '',
    complemento: v?.origem_complemento ?? '',
    lat: v?.origem_lat ?? null,
    lng: v?.origem_lng ?? null,
    raio_km: v?.raio_km && v.raio_km > 0 ? Number(v.raio_km) : RAIO_DEFAULT_KM,
  }
}

function toPatch(o: OrigemForm): LocalizacaoVeiculoValue {
  return {
    origem_cep: o.cep,
    origem_cidade: o.cidade,
    origem_uf: o.uf,
    origem_endereco: o.endereco,
    origem_numero: o.numero,
    origem_bairro: o.bairro,
    origem_complemento: o.complemento,
    origem_lat: o.lat,
    origem_lng: o.lng,
    raio_km: o.raio_km,
  }
}

type Props = {
  value: LocalizacaoVeiculoValue
  transportador?: Transportador | null
  onChange: (patch: LocalizacaoVeiculoValue) => void
  /** id da placa (quando troca, recarrega estado local) */
  resetKey?: string
  className?: string
}

/**
 * Endereço da placa no Mapa da Frota + opção de copiar origem da transportadora.
 */
export function VeiculoLocalizacaoFields({
  value,
  transportador,
  onChange,
  resetKey = '',
  className = '',
}: Props) {
  const [origem, setOrigem] = useState<OrigemForm>(() => fromValue(value))
  const [mapsStr, setMapsStr] = useState(() =>
    fmtMapsCoords(value.origem_lat ?? null, value.origem_lng ?? null),
  )
  const [info, setInfo] = useState('')
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [reverseBusy, setReverseBusy] = useState(false)
  const [erro, setErro] = useState('')
  const ultimoCep = useRef('')
  const coordsManuais = useRef(false)
  const reverseTimer = useRef(0)
  const reverseSeq = useRef(0)
  const ignorarCepAuto = useRef(false)
  const ignorarGeoAuto = useRef(false)
  const emitindo = useRef(false)

  // Hidrata quando abre outra placa / modal
  useEffect(() => {
    const o = fromValue(value)
    ignorarCepAuto.current = true
    ignorarGeoAuto.current = true
    coordsManuais.current = Boolean(o.lat != null && o.lng != null)
    ultimoCep.current = (o.cep || '').replace(/\D/g, '')
    emitindo.current = true
    setOrigem(o)
    setMapsStr(fmtMapsCoords(o.lat, o.lng))
    setErro('')
    setInfo(
      o.endereco.trim() || o.cidade.trim() || (o.lat != null && o.lng != null)
        ? 'Localização do veículo carregada.'
        : 'Informe o endereço desta placa ou use o da transportadora.',
    )
    queueMicrotask(() => {
      emitindo.current = false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao trocar placa/reset
  }, [resetKey])

  // Propaga alterações para o form pai
  useEffect(() => {
    if (emitindo.current) return
    onChange(toPatch(origem))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange costuma ser inline
  }, [origem])

  useEffect(() => {
    if (ignorarCepAuto.current) {
      ignorarCepAuto.current = false
      return
    }
    const cep = origem.cep.replace(/\D/g, '')
    if (cep.length !== 8) {
      setBuscandoCep(false)
      return
    }
    if (ultimoCep.current === cep) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setBuscandoCep(true)
        setInfo('Consultando CEP…')
        const res = await buscarEnderecoPorCep(cep)
        if (cancelled) return
        setBuscandoCep(false)
        if (!res.ok) {
          setInfo(res.erro)
          return
        }
        ultimoCep.current = cep
        coordsManuais.current = false
        setOrigem((prev) => ({
          ...prev,
          ...res.dados,
          cep: res.dados.cep || prev.cep,
          lat: null,
          lng: null,
        }))
        setMapsStr('')
        setInfo('Endereço preenchido pelo CEP. Aguarde as coordenadas.')
      })()
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [origem.cep])

  useEffect(() => {
    if (ignorarGeoAuto.current) {
      ignorarGeoAuto.current = false
      setGeocoding(false)
      return
    }
    if (!enderecoProntoParaGeocode(origem) || coordsManuais.current) {
      setGeocoding(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setGeocoding(true)
        setInfo('Localizando coordenadas no mapa…')
        const res = await geocodificarEndereco(origem)
        if (cancelled) return
        setGeocoding(false)
        if (coordsManuais.current) return
        if (!res.ok) {
          setOrigem((prev) => ({ ...prev, lat: null, lng: null }))
          setMapsStr('')
          setInfo(res.erro)
          return
        }
        setOrigem((prev) => ({
          ...prev,
          lat: res.coords.lat,
          lng: res.coords.lng,
        }))
        setMapsStr(fmtMapsCoords(res.coords.lat, res.coords.lng))
        setInfo(
          `Coordenadas: ${res.coords.lat.toFixed(5)}, ${res.coords.lng.toFixed(5)}. Você pode ajustar no mapa.`,
        )
      })()
    }, 700)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    origem.cep,
    origem.cidade,
    origem.uf,
    origem.endereco,
    origem.numero,
    origem.bairro,
  ])

  function setCampo<K extends keyof OrigemForm>(key: K, value: OrigemForm[K]) {
    const limpaCoords = key !== 'lat' && key !== 'lng' && key !== 'raio_km'
    if (limpaCoords) {
      coordsManuais.current = false
      setMapsStr('')
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
      if (digits !== ultimoCep.current) ultimoCep.current = ''
    }
  }

  function aplicarCoordsManuais(lat: number, lng: number) {
    coordsManuais.current = true
    setOrigem((prev) => ({ ...prev, lat, lng }))
    setMapsStr(fmtMapsCoords(lat, lng))
    setInfo('Buscando endereço deste ponto no mapa…')
    setReverseBusy(true)
    window.clearTimeout(reverseTimer.current)
    const seq = ++reverseSeq.current
    reverseTimer.current = window.setTimeout(() => {
      void (async () => {
        const res = await enderecoPorCoordenadas(lat, lng)
        if (seq !== reverseSeq.current) return
        setReverseBusy(false)
        if (!res.ok) {
          setInfo(`Coordenadas ajustadas. ${res.erro}`)
          return
        }
        const cepDigits = (res.dados.cep || '').replace(/\D/g, '')
        if (cepDigits.length === 8) ultimoCep.current = cepDigits
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
        setInfo('Endereço atualizado pelas coordenadas.')
      })()
    }, 200)
  }

  function usarEnderecoTransportadora() {
    if (!transportador) {
      setErro('Selecione uma transportadora para copiar o endereço.')
      return
    }
    const lat = transportador.origem_lat
    const lng = transportador.origem_lng
    const temEndereco = Boolean(
      (transportador.origem_cidade || '').trim() ||
        (transportador.origem_endereco || '').trim() ||
        (transportador.origem_cep || '').trim() ||
        (transportador.cidade || '').trim() ||
        (transportador.endereco || '').trim(),
    )
    if (!temEndereco && (lat == null || lng == null)) {
      setErro(
        'A transportadora ainda não cadastrou a origem em “Cadastre sua origem”.',
      )
      return
    }
    setErro('')
    coordsManuais.current = lat != null && lng != null
    const cep = transportador.origem_cep || ''
    ultimoCep.current = cep.replace(/\D/g, '')
    setOrigem({
      cep,
      cidade:
        (transportador.origem_cidade || transportador.cidade || '').trim(),
      uf: (
        transportador.origem_uf ||
        transportador.uf ||
        'SP'
      )
        .toUpperCase()
        .slice(0, 2),
      endereco:
        (transportador.origem_endereco || transportador.endereco || '').trim(),
      numero:
        (transportador.origem_numero || transportador.numero || '').trim(),
      bairro:
        (transportador.origem_bairro || transportador.bairro || '').trim(),
      complemento: (
        transportador.origem_complemento ||
        transportador.complemento ||
        ''
      ).trim(),
      lat: lat ?? null,
      lng: lng ?? null,
      raio_km:
        transportador.raio_km && transportador.raio_km > 0
          ? Number(transportador.raio_km)
          : RAIO_DEFAULT_KM,
    })
    setMapsStr(fmtMapsCoords(lat ?? null, lng ?? null))
    setInfo('Endereço da transportadora aplicado. Confira e salve o veículo.')
  }

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      <p className="text-xs text-ink-muted">
        Endereço onde esta placa fica no Mapa da Frota (pode ser diferente do
        CNPJ). Preencha o endereço do veículo ou use o da transportadora.
      </p>

      <button
        type="button"
        className="cadastro-btn w-full"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          background: 'rgba(232, 197, 71, 0.12)',
          border: '1px solid rgba(232, 197, 71, 0.45)',
          color: '#1a1d21',
          fontWeight: 600,
          fontSize: 13,
        }}
        onClick={usarEnderecoTransportadora}
      >
        <Copy size={14} />
        Usar endereço da transportadora
      </button>

      <div className="form-fields" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Field label="CEP">
          <input
            className={inputClass}
            value={origem.cep}
            onChange={(e) => setCampo('cep', formatCepBr(e.target.value))}
            placeholder="00000-000"
            inputMode="numeric"
          />
        </Field>
        <Field label="Cidade">
          <input
            className={inputClass}
            value={origem.cidade}
            onChange={(e) => setCampo('cidade', e.target.value)}
            placeholder="Ex.: Santos"
          />
        </Field>
        <Field label="UF">
          <select
            className={inputClass}
            value={origem.uf}
            onChange={(e) => setCampo('uf', e.target.value)}
          >
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rua / logradouro">
          <input
            className={inputClass}
            value={origem.endereco}
            onChange={(e) => setCampo('endereco', e.target.value)}
            placeholder="Rua onde o veículo opera"
          />
        </Field>
        <Field label="Número">
          <input
            className={inputClass}
            value={origem.numero}
            onChange={(e) => setCampo('numero', e.target.value)}
            placeholder="Nº ou S/N"
          />
        </Field>
        <Field label="Bairro">
          <input
            className={inputClass}
            value={origem.bairro}
            onChange={(e) => setCampo('bairro', e.target.value)}
          />
        </Field>
        <Field label="Complemento">
          <input
            className={inputClass}
            value={origem.complemento}
            onChange={(e) => setCampo('complemento', e.target.value)}
            placeholder="Galpão, pátio (opcional)"
          />
        </Field>
        <Field label="Coordenadas (Maps)">
          <input
            className={inputClass}
            inputMode="text"
            placeholder="-23.5613545,-46.6590692,17"
            value={mapsStr}
            onChange={(e) => {
              const raw = e.target.value
              setMapsStr(raw)
              const parsed = parseMapsCoords(raw)
              if (parsed) {
                aplicarCoordsManuais(parsed.lat, parsed.lng)
                return
              }
              if (!raw.trim()) {
                coordsManuais.current = false
                setOrigem((prev) => ({ ...prev, lat: null, lng: null }))
                return
              }
              coordsManuais.current = true
            }}
          />
          <p className="mt-1 text-[11px] text-ink-muted">
            Cole lat,lng ou lat,lng,zoom do Google Maps.
          </p>
        </Field>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-ink">
          Pesquisar por raio
        </label>
        <div className="mb-1 flex items-baseline gap-1">
          <strong className="text-lg tabular-nums">{origem.raio_km}</strong>
          <span className="text-xs text-ink-muted">km</span>
        </div>
        <input
          type="range"
          min={RAIO_MIN_KM}
          max={RAIO_MAX_KM}
          step={5}
          value={origem.raio_km}
          onChange={(e) => setCampo('raio_km', Number(e.target.value))}
          className="w-full"
          style={
            {
              '--raio-pct': `${((origem.raio_km - RAIO_MIN_KM) / (RAIO_MAX_KM - RAIO_MIN_KM)) * 100}%`,
            } as CSSProperties
          }
        />
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink">
          <MapPin size={14} />
          Mapa — Localização do veículo
        </p>
        <PontoMapPreview
          lat={origem.lat}
          lng={origem.lng}
          raioKm={origem.raio_km}
          onPick={aplicarCoordsManuais}
          height={240}
        />
      </div>

      {(buscandoCep || geocoding || reverseBusy || info) && (
        <p className="text-xs text-ink-muted">
          {buscandoCep
            ? 'Consultando CEP…'
            : geocoding
              ? 'Localizando coordenadas…'
              : reverseBusy
                ? 'Atualizando endereço pelas coordenadas…'
                : info}
        </p>
      )}
      {erro && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {erro}
        </p>
      )}
    </div>
  )
}

/** Valida se a localização pode ser salva (quando preenchida). */
export function validarLocalizacaoVeiculo(
  v: LocalizacaoVeiculoValue,
  obrigatoria = false,
): string | null {
  const temAlgo = Boolean(
    (v.origem_cidade || '').trim() ||
      (v.origem_endereco || '').trim() ||
      (v.origem_cep || '').trim() ||
      (v.origem_lat != null && v.origem_lng != null),
  )
  if (!temAlgo && !obrigatoria) return null
  if (!(v.origem_cidade || '').trim() || !(v.origem_uf || '').trim() || !(v.origem_endereco || '').trim()) {
    return 'Na localização do veículo, informe cidade, UF e rua (ou use o endereço da transportadora).'
  }
  if (v.origem_lat == null || v.origem_lng == null) {
    return 'Aguarde as coordenadas no mapa ou ajuste o pin na localização do veículo.'
  }
  return null
}
