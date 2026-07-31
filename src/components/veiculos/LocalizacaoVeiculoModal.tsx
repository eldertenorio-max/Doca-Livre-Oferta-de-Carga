import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { MapPin, Copy } from 'lucide-react'
import { PontoMapPreview } from '../ui/PontoMapPreview'
import { Button, Field, Modal, inputClass } from '../ui/Modal'
import {
  buscarEnderecoPorCep,
  enderecoPorCoordenadas,
  enderecoProntoParaGeocode,
  formatCepBr,
  geocodificarEndereco,
} from '../../lib/geocodeEndereco'
import type { Transportador, Veiculo } from '../../types'

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

const RAIO_MIN_KM = 10
const RAIO_MAX_KM = 500
const RAIO_DEFAULT_KM = 50

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

type Props = {
  open: boolean
  veiculo: Veiculo | null
  transportador: Transportador | null
  onClose: () => void
  onSave: (patch: Partial<Veiculo>) => void
}

function fromVeiculo(v: Veiculo | null): OrigemForm {
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

export function LocalizacaoVeiculoModal({
  open,
  veiculo,
  transportador,
  onClose,
  onSave,
}: Props) {
  const [origem, setOrigem] = useState<OrigemForm>(fromVeiculo(null))
  const [latStr, setLatStr] = useState('')
  const [lngStr, setLngStr] = useState('')
  const [info, setInfo] = useState('')
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [reverseBusy, setReverseBusy] = useState(false)
  const [erro, setErro] = useState('')
  const ultimoCep = useRef('')
  const coordsManuais = useRef(false)
  const reverseTimer = useRef(0)
  const reverseSeq = useRef(0)
  /** Evita CEP/geocode apagarem o endereço recém-carregado do veículo. */
  const ignorarCepAuto = useRef(false)
  const ignorarGeoAuto = useRef(false)

  useEffect(() => {
    if (!open || !veiculo) return
    const o = fromVeiculo(veiculo)
    ignorarCepAuto.current = true
    ignorarGeoAuto.current = true
    coordsManuais.current = Boolean(o.lat != null && o.lng != null)
    ultimoCep.current = (o.cep || '').replace(/\D/g, '')
    setOrigem(o)
    setLatStr(o.lat != null ? o.lat.toFixed(6) : '')
    setLngStr(o.lng != null ? o.lng.toFixed(6) : '')
    const temEndereco = Boolean(
      o.endereco.trim() || o.cidade.trim() || (o.lat != null && o.lng != null),
    )
    setInfo(
      temEndereco
        ? 'Localização salva do veículo carregada.'
        : 'Nenhuma localização salva nesta placa ainda.',
    )
    setErro('')
  }, [
    open,
    veiculo?.id,
    veiculo?.origem_lat,
    veiculo?.origem_lng,
    veiculo?.origem_cep,
    veiculo?.origem_endereco,
    veiculo?.origem_cidade,
    veiculo?.origem_uf,
    veiculo?.origem_numero,
    veiculo?.origem_bairro,
    veiculo?.origem_complemento,
    veiculo?.raio_km,
    veiculo?.updated_at,
  ])

  useEffect(() => {
    if (!open) return
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
        setLatStr('')
        setLngStr('')
        setInfo('Endereço preenchido pelo CEP. Aguarde as coordenadas.')
      })()
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, origem.cep])

  useEffect(() => {
    if (!open) {
      setGeocoding(false)
      return
    }
    // Sempre consome o flag após hidratar — mesmo se o endereço ainda não está “pronto”
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
          setLatStr('')
          setLngStr('')
          setInfo(res.erro)
          return
        }
        setOrigem((prev) => ({
          ...prev,
          lat: res.coords.lat,
          lng: res.coords.lng,
        }))
        setLatStr(res.coords.lat.toFixed(6))
        setLngStr(res.coords.lng.toFixed(6))
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
    open,
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
      if (digits !== ultimoCep.current) ultimoCep.current = ''
    }
  }

  function aplicarCoordsManuais(lat: number, lng: number) {
    coordsManuais.current = true
    setOrigem((prev) => ({ ...prev, lat, lng }))
    setLatStr(lat.toFixed(6))
    setLngStr(lng.toFixed(6))
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

  function parseCoord(raw: string): number | null {
    const n = Number(raw.replace(',', '.').trim())
    return Number.isFinite(n) ? n : null
  }

  function usarOrigemTransportador() {
    if (!transportador) {
      setErro('Transportadora não encontrada para esta placa.')
      return
    }
    const lat = transportador.origem_lat
    const lng = transportador.origem_lng
    const temEndereco = Boolean(
      (transportador.origem_cidade || '').trim() ||
        (transportador.origem_endereco || '').trim() ||
        (transportador.origem_cep || '').trim(),
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
      cidade: transportador.origem_cidade || '',
      uf: (transportador.origem_uf || 'SP').toUpperCase().slice(0, 2),
      endereco: transportador.origem_endereco || '',
      numero: transportador.origem_numero || '',
      bairro: transportador.origem_bairro || '',
      complemento: transportador.origem_complemento || '',
      lat: lat ?? null,
      lng: lng ?? null,
      raio_km:
        transportador.raio_km && transportador.raio_km > 0
          ? Number(transportador.raio_km)
          : RAIO_DEFAULT_KM,
    })
    setLatStr(lat != null ? lat.toFixed(6) : '')
    setLngStr(lng != null ? lng.toFixed(6) : '')
    setInfo('Localização de origem da transportadora aplicada. Confira e salve.')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!veiculo) return
    if (!origem.cidade.trim() || !origem.uf.trim() || !origem.endereco.trim()) {
      setErro('Informe cidade, UF e rua da localização do veículo.')
      return
    }
    if (origem.lat == null || origem.lng == null) {
      setErro('Aguarde as coordenadas ou ajuste o pin no mapa.')
      return
    }
    onSave({
      origem_cep: origem.cep,
      origem_cidade: origem.cidade.trim(),
      origem_uf: origem.uf.trim().toUpperCase(),
      origem_endereco: origem.endereco.trim(),
      origem_numero: origem.numero.trim(),
      origem_bairro: origem.bairro.trim(),
      origem_complemento: origem.complemento.trim(),
      origem_lat: origem.lat,
      origem_lng: origem.lng,
      raio_km: origem.raio_km,
    })
    onClose()
  }

  if (!veiculo) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Localização do veículo · ${veiculo.placa}`}
      wide
    >
      <form className="space-y-3" onSubmit={submit}>
        <p className="text-xs text-ink-muted">
          Endereço onde esta placa fica disponível no Mapa da Frota. Diferente do
          endereço do CNPJ.
        </p>

        <Button
          type="button"
          variant="ghost"
          className="w-full !border !border-brand/30 !bg-brand/5 !text-sm"
          onClick={usarOrigemTransportador}
        >
          <Copy size={14} />
          Usar localização de origem (cadastro da transportadora)
        </Button>

        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="CEP">
            <input
              className={inputClass}
              value={origem.cep}
              onChange={(e) => setCampo('cep', formatCepBr(e.target.value))}
              placeholder="00000-000"
              inputMode="numeric"
            />
          </Field>
          <Field label="Cidade *">
            <input
              className={inputClass}
              value={origem.cidade}
              onChange={(e) => setCampo('cidade', e.target.value)}
              placeholder="Ex.: Santos"
            />
          </Field>
          <Field label="UF *">
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
          <Field label="Rua / logradouro *" className="sm:col-span-2">
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
          <Field label="Complemento" className="sm:col-span-2">
            <input
              className={inputClass}
              value={origem.complemento}
              onChange={(e) => setCampo('complemento', e.target.value)}
              placeholder="Galpão, pátio (opcional)"
            />
          </Field>
          <Field label="Latitude">
            <input
              className={inputClass}
              value={latStr}
              onChange={(e) => {
                const raw = e.target.value
                setLatStr(raw)
                const lat = parseCoord(raw)
                const lng = parseCoord(lngStr)
                if (lat != null && lng != null) aplicarCoordsManuais(lat, lng)
                else {
                  coordsManuais.current = true
                  setOrigem((prev) => ({ ...prev, lat }))
                }
              }}
              inputMode="decimal"
              placeholder="Automático ou edite"
            />
          </Field>
          <Field label="Longitude">
            <input
              className={inputClass}
              value={lngStr}
              onChange={(e) => {
                const raw = e.target.value
                setLngStr(raw)
                const lng = parseCoord(raw)
                const lat = parseCoord(latStr)
                if (lat != null && lng != null) aplicarCoordsManuais(lat, lng)
                else {
                  coordsManuais.current = true
                  setOrigem((prev) => ({ ...prev, lng }))
                }
              }}
              inputMode="decimal"
              placeholder="Automático ou edite"
            />
          </Field>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-ink">
            Pesquisar por raio *
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
            height={260}
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

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="success">
            Salvar localização
          </Button>
        </div>
      </form>
    </Modal>
  )
}
