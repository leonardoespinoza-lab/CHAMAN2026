import mongoose from 'mongoose';
import { SiembraSchema } from './modelos/schema';
import { LoteSchema } from '../lote/modelos/schema';
import { SiembrasService } from './service';
import { LotesService } from '../lote/service';

describe('redaction preserves populated agronomic relations', () => {
  const Sowing = mongoose.model('RedactionSowingRegression', SiembraSchema);
  const Lot = mongoose.model('RedactionLotRegression', LoteSchema);
  const prediction = () => ({ especies: [{ nombre: 'Eleusine', avancePct: 12,
    formula: 'private', temperaturaBase: 8, deltaHoras: 24 }] });

  function fixture() {
    const sowing: any = new Sowing({ _id: new mongoose.Types.ObjectId(),
      fechaSiembra: new Date('2026-07-01'), ultimaPrediccionMalezas: prediction() });
    sowing.semilla = { _id: new mongoose.Types.ObjectId(), cultivo: 'Arveja', nombre: 'ASTRONAUTE' };
    sowing.crono = { _id: new mongoose.Types.ObjectId(), nombre: 'Ciclo' };
    sowing.establecimiento = { _id: new mongoose.Types.ObjectId(), nombre: 'GILARDONI' };
    const lot: any = new Lot({ nombre: 'ARVEJA 1', idSiembra: sowing._id,
      ultimaPrediccionMalezas: prediction() });
    lot.siembra = sowing;
    lot.establecimiento = sowing.establecimiento;
    lot.dispositivos = [{ _id: new mongoose.Types.ObjectId(), nombre: 'Sonda' }];
    return { sowing, lot };
  }

  it('keeps crop, calendar and establishment in the batch sowing list', async () => {
    const { sowing } = fixture();
    const repository = { getFilter: jest.fn().mockResolvedValue({ totalCount: 1, datos: [sowing] }) };
    const service = new SiembrasService(repository as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const result: any = await service.getFilter({});
    expect(result.datos[0].semilla.cultivo).toBe('Arveja');
    expect(result.datos[0].crono.nombre).toBe('Ciclo');
    expect(result.datos[0].establecimiento.nombre).toBe('GILARDONI');
    expect(result.datos[0].ultimaPrediccionMalezas.especies[0]).toEqual({ nombre: 'Eleusine', avancePct: 12 });
    expect(sowing.ultimaPrediccionMalezas.especies[0].formula).toBe('private');
  });

  it('keeps the nested sowing and devices in the lot list without exposing formulas', async () => {
    const { lot } = fixture();
    const repository = { getFilter: jest.fn().mockResolvedValue({ totalCount: 1, datos: [lot] }) };
    const service = new LotesService(repository as any, {} as any, {} as any);
    const result: any = await service.getFilter({});
    const row = JSON.parse(JSON.stringify(result.datos[0]));
    expect(row.siembra.semilla.cultivo).toBe('Arveja');
    expect(row.siembra.crono.nombre).toBe('Ciclo');
    expect(row.establecimiento.nombre).toBe('GILARDONI');
    expect(row.dispositivos[0].nombre).toBe('Sonda');
    expect(row.ultimaPrediccionMalezas.especies[0]).toEqual({ nombre: 'Eleusine', avancePct: 12 });
    expect(row.siembra.ultimaPrediccionMalezas.especies[0]).toEqual({ nombre: 'Eleusine', avancePct: 12 });
  });
});
