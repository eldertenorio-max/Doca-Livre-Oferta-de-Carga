import { useState, type FormEvent } from 'react'
import { Button, Modal } from '../ui/Modal'
import {
  VeiculoLocalizacaoFields,
  validarLocalizacaoVeiculo,
  type LocalizacaoVeiculoValue,
} from './VeiculoLocalizacaoFields'
import type { Transportador, Veiculo } from '../../types'

type Props = {
  open: boolean
  veiculo: Veiculo | null
  transportador: Transportador | null
  onClose: () => void
  onSave: (patch: Partial<Veiculo>) => void
}

export function LocalizacaoVeiculoModal({
  open,
  veiculo,
  transportador,
  onClose,
  onSave,
}: Props) {
  const [loc, setLoc] = useState<LocalizacaoVeiculoValue>({})
  const [erro, setErro] = useState('')

  if (!veiculo) return null

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!veiculo) return
    const msg = validarLocalizacaoVeiculo(loc, true)
    if (msg) {
      setErro(msg)
      return
    }
    setErro('')
    onSave({
      origem_cep: loc.origem_cep,
      origem_cidade: (loc.origem_cidade || '').trim(),
      origem_uf: (loc.origem_uf || '').trim().toUpperCase(),
      origem_endereco: (loc.origem_endereco || '').trim(),
      origem_numero: (loc.origem_numero || '').trim(),
      origem_bairro: (loc.origem_bairro || '').trim(),
      origem_complemento: (loc.origem_complemento || '').trim(),
      origem_lat: loc.origem_lat,
      origem_lng: loc.origem_lng,
      raio_km: loc.raio_km,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Localização do veículo · ${veiculo.placa}`}
      wide
    >
      <form className="space-y-3" onSubmit={submit}>
        <VeiculoLocalizacaoFields
          resetKey={`${veiculo.id}-${open ? '1' : '0'}-${veiculo.updated_at ?? ''}`}
          value={{
            origem_cep: veiculo.origem_cep,
            origem_cidade: veiculo.origem_cidade,
            origem_uf: veiculo.origem_uf,
            origem_endereco: veiculo.origem_endereco,
            origem_numero: veiculo.origem_numero,
            origem_bairro: veiculo.origem_bairro,
            origem_complemento: veiculo.origem_complemento,
            origem_lat: veiculo.origem_lat,
            origem_lng: veiculo.origem_lng,
            raio_km: veiculo.raio_km,
          }}
          transportador={transportador}
          onChange={setLoc}
        />
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
