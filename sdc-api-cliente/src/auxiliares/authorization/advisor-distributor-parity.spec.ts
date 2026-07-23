import { AlertasController } from '../../entidades/alerta/controller';
import { EstablecimientosController } from '../../entidades/establecimiento/controller';
import { LotesController } from '../../entidades/lote/controller';
import { ProductorsController } from '../../entidades/productor/controller';
import { SiembrasController } from '../../entidades/siembra/controller';

type ControllerClass = { prototype: Record<string, unknown> };

function niveles(controller: ControllerClass, method: string): string[] {
  const permisos = Reflect.getMetadata(
    'permisos',
    controller.prototype[method],
  ) as Array<{ nivel: string }> | undefined;
  return (permisos || []).map((permiso) => permiso.nivel);
}

describe('Asesor - paridad comercial con Distribuidor', () => {
  it('ambos administran productores', () => {
    for (const method of ['get', 'getById', 'create', 'update', 'delete']) {
      expect(niveles(ProductorsController as any, method)).toEqual(
        expect.arrayContaining(['Distribuidor', 'Asesor']),
      );
    }
  });

  it('ambos supervisan establecimientos pero no los modifican', () => {
    for (const method of ['get', 'getById']) {
      expect(niveles(EstablecimientosController as any, method)).toEqual(
        expect.arrayContaining(['Distribuidor', 'Asesor']),
      );
    }
    for (const method of ['create', 'update', 'delete']) {
      expect(niveles(EstablecimientosController as any, method)).not.toEqual(
        expect.arrayContaining(['Distribuidor', 'Asesor']),
      );
    }
  });

  it('ambos supervisan lotes pero no los crean, editan ni eliminan', () => {
    for (const method of ['get', 'getById']) {
      expect(niveles(LotesController as any, method)).toEqual(
        expect.arrayContaining(['Distribuidor', 'Asesor']),
      );
    }
    for (const method of ['create', 'update', 'delete']) {
      const autorizados = niveles(LotesController as any, method);
      expect(autorizados).not.toContain('Distribuidor');
      expect(autorizados).not.toContain('Asesor');
    }
  });

  it('las campanas y cosechas quedan a cargo de Productor/Establecimiento', () => {
    expect(niveles(SiembrasController as any, 'get')).toEqual(
      expect.arrayContaining(['Distribuidor', 'Asesor']),
    );
    for (const method of ['create', 'cosechar', 'update', 'delete']) {
      const autorizados = niveles(SiembrasController as any, method);
      expect(autorizados).not.toContain('Distribuidor');
      expect(autorizados).not.toContain('Asesor');
    }
  });

  it('las alertas se observan aguas abajo, sin alta o borrado manual', () => {
    expect(niveles(AlertasController as any, 'get')).toEqual(
      expect.arrayContaining(['Distribuidor', 'Asesor']),
    );
    for (const method of ['create', 'update', 'delete']) {
      const autorizados = niveles(AlertasController as any, method);
      expect(autorizados).not.toContain('Distribuidor');
      expect(autorizados).not.toContain('Asesor');
    }
  });
});
