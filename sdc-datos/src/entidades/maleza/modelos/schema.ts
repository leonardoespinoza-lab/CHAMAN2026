import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IMaleza,
  IParametrosGompertzMaleza,
  IRecomendacionMaleza,
  IUmbralEmergenciaMaleza,
} from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Maleza implements Exactly<IMaleza, Maleza> {
  _id: string;

  @Prop()
  codigoCarga?: string;

  @Prop()
  fuenteBase?: string;

  @Prop({ required: true })
  nombre?: string;

  @Prop()
  nombreCientifico?: string;

  @Prop({ type: [String] })
  cultivosObjetivo?: IMaleza['cultivosObjetivo'];

  @Prop({ type: String, default: 'Gompertz HTT' })
  modelo?: IMaleza['modelo'];

  @Prop({ type: Object })
  parametros?: IParametrosGompertzMaleza;

  @Prop({ type: [Object] })
  umbrales?: IUmbralEmergenciaMaleza[];

  @Prop({ type: [Object] })
  recomendaciones?: IRecomendacionMaleza[];

  @Prop()
  observaciones?: string;
}

export type MalezaDocument = Maleza & Document;

export const MalezaSchema = SchemaFactory.createForClass(Maleza);

MalezaSchema.set('toJSON', { virtuals: true, getters: true });

MalezaSchema.index({ codigoCarga: 1 }, { unique: true, sparse: true });
MalezaSchema.index({ nombre: 1, nombreCientifico: 1 }, { unique: true });
MalezaSchema.index({ cultivosObjetivo: 1 });
