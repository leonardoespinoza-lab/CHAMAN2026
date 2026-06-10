import { ApiProperty } from '@nestjs/swagger';
import { Cultivo, ISemilla } from 'modelos/src';

export class Coordinates {
  @ApiProperty()
  lat: number;

  @ApiProperty()
  lng: number;
}

export class RequestPrediction {
  @ApiProperty({ example: 'nombre del establecimiento' })
  establecimiento: string;

  @ApiProperty({ example: 'nombre del lote' })
  lote: string;

  @ApiProperty({
    required: false,
    type: Coordinates,
    description:
      'Coordenadas del lote, opcional (usar si no se envia poligono)',
  })
  ubicacion?: Coordinates;

  @ApiProperty({
    required: false,
    type: [Coordinates],
    description: 'Poligono del lote, opcional (usar si no se envia ubicacion)',
  })
  poligono: Coordinates[];

  @ApiProperty()
  idDepartamento: string;

  @ApiProperty()
  idSemilla: string;

  @ApiProperty({ type: Date, description: 'fecha de siembra en formato ISO' })
  fechaSiembra: string;

  @ApiProperty({ description: 'capacidad de riego en mm por dia' })
  capacidadDeRiego: number;
}

export class SowingId {
  @ApiProperty()
  idSiembra: string;
}

//

export enum Crop {
  Trigo = 'Trigo',
  Soja = 'Soja',
  Maiz = 'Maiz',
}

export class Seed implements ISemilla {
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

export class Seeds {
  @ApiProperty({ type: [Seed] })
  data: Seed[];

  // @ApiProperty()
  // totalCount: number;
}

//

export class Departmanent {
  @ApiProperty()
  _id?: string;

  @ApiProperty()
  nombre?: string;

  @ApiProperty()
  provincia?: string;
}

export class Departments {
  @ApiProperty({ type: [Departmanent] })
  data: Departmanent[];

  // @ApiProperty()
  // totalCount: number;
}

//

export class ResponseCreateProducer {
  @ApiProperty()
  nombre?: string;

  @ApiProperty()
  apikey?: string;
}

export class CreateProducer {
  @ApiProperty()
  nombre?: string;
}

//

export class IrrigationPrediction {
  @ApiProperty({ example: '2024-12-31' })
  fecha?: string;

  @ApiProperty({ description: 'Cantidad de agua en mm' })
  cantidad?: number;
}

export class ResponseIrrigationPrediction {
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

  @ApiProperty({ type: [IrrigationPrediction] })
  recomendacion?: IrrigationPrediction[];
}

//

export class DiseasePrediction {
  @ApiProperty({ example: 'Roya de la Hoja' })
  enfermedad?: string;

  @ApiProperty({
    example: 3.5,
    description: 'resultado de la predicción en porcentaje',
  })
  resultado?: number;
}

export class ResponseDiseasePrediction {
  @ApiProperty()
  idSiembra: string;

  @ApiProperty({ description: 'Nombre del lote' })
  lote?: string;

  @ApiProperty({ description: 'Nombre del cultivo' })
  cultivo?: string;

  @ApiProperty({ example: '2024-12-31' })
  fecha?: string;

  @ApiProperty({ type: [DiseasePrediction] })
  enfermedades?: DiseasePrediction[];
}
