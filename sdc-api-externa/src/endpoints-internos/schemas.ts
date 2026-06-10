import { ApiProperty } from '@nestjs/swagger';
import {
  Cultivo,
  IDepartamento,
  IListado,
  IProvincia,
  ISemilla,
} from 'modelos/src';

export class Coordenadas {
  @ApiProperty()
  lat: number;

  @ApiProperty()
  lng: number;
}

export class SolicitarPrediccion {
  @ApiProperty({ example: 'nombre del establecimiento' })
  establecimiento: string;

  @ApiProperty({ example: 'nombre del lote' })
  lote: string;

  @ApiProperty({
    required: false,
    type: Coordenadas,
    description:
      'Coordenadas del lote, opcional (usar si no se envia poligono)',
  })
  ubicacion?: Coordenadas;

  @ApiProperty({
    required: false,
    type: [Coordenadas],
    description: 'Poligono del lote, opcional (usar si no se envia ubicacion)',
  })
  poligono: Coordenadas[];

  @ApiProperty()
  idDepartamento: string;

  @ApiProperty()
  idSemilla: string;

  @ApiProperty({ type: Date, description: 'fecha de siembra en formato ISO' })
  fechaSiembra: string;

  @ApiProperty({ description: 'capacidad de riego en mm por dia' })
  capacidadDeRiego: number;
}

export class IdSiembra {
  @ApiProperty()
  idSiembra: string;
}

//

export enum TipoCultivo {
  Trigo = 'Trigo',
  Soja = 'Soja',
  Maiz = 'Maiz',
}

export class Semilla implements ISemilla {
  @ApiProperty()
  _id?: string;

  @ApiProperty()
  campania?: string;

  @ApiProperty()
  ciclo?: string;

  @ApiProperty()
  cultivo?: Cultivo;

  @ApiProperty()
  variedad?: string;

  @ApiProperty()
  semillero?: string;
}

export class ListadoSemillas implements IListado<ISemilla> {
  @ApiProperty({ type: [Semilla] })
  datos: Semilla[];

  @ApiProperty()
  totalCount: number;
}

//

export class Provincia implements IProvincia {
  @ApiProperty()
  _id?: string;

  @ApiProperty()
  nombre?: string;
}

export class Departamento implements IDepartamento {
  @ApiProperty()
  _id?: string;

  @ApiProperty()
  nombre?: string;

  @ApiProperty()
  provincia?: Provincia;
}

export class ListadoDepartamentos implements IListado<IDepartamento> {
  @ApiProperty({ type: [Departamento] })
  datos: Departamento[];

  @ApiProperty()
  totalCount: number;
}

//

export class ResponseCreateProductor {
  @ApiProperty()
  nombre?: string;

  @ApiProperty()
  apikey?: string;
}

export class CreateProductor {
  @ApiProperty()
  nombre?: string;
}

//

export class ResultadoPrediccionRiego {
  @ApiProperty({ example: '2024-12-31' })
  fecha?: string;

  @ApiProperty({ description: 'Cantidad de agua en mm' })
  cantidad?: number;
}

export class ConsultarPrediccionRiego {
  @ApiProperty()
  idSiembra: string;

  @ApiProperty({ description: 'Nombre del lote' })
  lote?: string;

  @ApiProperty({ description: 'Capacidad de campo promedio en %' })
  capacidadDeCampo?: number;

  @ApiProperty({ description: 'Punto de marchitez en %' })
  puntoDeMarchitez?: number;

  @ApiProperty({ example: '2024-12-31' })
  fecha?: string;

  @ApiProperty({ type: [ResultadoPrediccionRiego] })
  recomendacion?: ResultadoPrediccionRiego[];
}

//

export class ResultadoPrediccionEnfermedades {
  @ApiProperty({ example: 'Roya de la Hoja' })
  enfermedad?: string;

  @ApiProperty({
    example: 3.5,
    description: 'resultado de la predicción en porcentaje',
  })
  resultado?: number;
}

export class ConsultarPrediccionEnfermedades {
  @ApiProperty()
  idSiembra: string;

  @ApiProperty({ example: '2024-12-31' })
  fecha?: string;

  @ApiProperty({ type: [ResultadoPrediccionEnfermedades] })
  enfermedades?: ResultadoPrediccionEnfermedades[];
}
