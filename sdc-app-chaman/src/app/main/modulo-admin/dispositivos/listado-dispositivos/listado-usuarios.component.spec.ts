import { ListadoDispositivosComponent } from './listado-dispositivos.component';

describe('ListadoDispositivosComponent', () => {
  const component = Object.create(ListadoDispositivosComponent.prototype) as ListadoDispositivosComponent;

  it('exports the component', () => {
    expect(ListadoDispositivosComponent).toBeTruthy();
  });

  it('does not invent Sentek or analog services from a generic Milesight UC511 name', () => {
    const uplink = { deviceName: 'Milesight UC511', fPort: 85 };

    expect((component as any).inferType(uplink)).toBe('Otro');
    expect((component as any).inferSensors(uplink)).toEqual(['Otro']);
    expect((component as any).inferredReadoutCapabilities(uplink)).toEqual({
      soilProfile: false,
      analogInput: false,
    });
  });

  it('detects each controller capability from the corresponding payload block', () => {
    const soil = (component as any).inferredReadoutCapabilities({
      fPort: 85,
      data: '08db00302b31322e352b31332e352b31342e350d0a',
    });
    const analog = (component as any).inferredReadoutCapabilities({
      fPort: 85,
      data: '05e29a4a9a4a9a4a9a4a',
    });

    expect(soil).toEqual({ soilProfile: true, analogInput: false });
    expect(analog).toEqual({ soilProfile: false, analogInput: true });
  });

  it('decodes broker base64 before detecting the Milesight blocks', () => {
    const data = btoa(String.fromCharCode(0x05, 0xe2, 0x9a, 0x4a, 0x9a, 0x4a, 0x9a, 0x4a, 0x9a, 0x4a));

    expect((component as any).inferredReadoutCapabilities({ data })).toEqual({
      soilProfile: false,
      analogInput: true,
    });
  });
});
