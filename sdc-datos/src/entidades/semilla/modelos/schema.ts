import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, ISemilla, IResistencia, Cultivo } from 'modelos/src';
import { Document } from 'mongoose';
import { Enfermedad } from '../../enfermedad/modelos/schema';

@Schema()
export class Semilla implements Exactly<ISemilla, Semilla> {
  _id: string;

  @Prop()
  codigoCarga?: string;

  @Prop()
  fuenteBase?: string;

  @Prop({ required: true })
  semillero: string;

  @Prop({ required: true, type: String })
  cultivo: Cultivo;

  @Prop({ required: true })
  variedad: string;

  @Prop({ required: true, uppercase: true })
  ciclo: string;

  @Prop({ type: [Object] })
  resistencia: IResistencia[];

  @Prop()
  campania?: string;

  @Prop()
  tipoCultivo?: ISemilla['tipoCultivo'];

  @Prop()
  portainjerto?: string;

  @Prop({ type: Object })
  requerimientoFrio?: ISemilla['requerimientoFrio'];

  @Prop({ type: Object })
  fenologiaReferencia?: ISemilla['fenologiaReferencia'];

  @Prop()
  observaciones?: string;
}

export type SemillaDocument = Semilla & Document;

export const SemillaSchema = SchemaFactory.createForClass(Semilla);

SemillaSchema.set('toJSON', { virtuals: true, getters: true });

SemillaSchema.index(
  { cultivo: 1, semillero: 1, variedad: 1, ciclo: 1, campania: 1 },
  { unique: true },
);

SemillaSchema.index({ codigoCarga: 1 }, { sparse: true });

SemillaSchema.virtual('resistencia.enfermedad', {
  foreignField: '_id',
  justOne: true,
  localField: 'resistencia.idEnfermedad',
  ref: Enfermedad.name,
});
