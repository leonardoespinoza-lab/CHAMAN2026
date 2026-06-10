import mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Cultivo,
  Exactly,
  ICrono,
  IDepartamento,
  IEtapasSoja,
  IEtapasTrigo,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Departamento } from '../../departamento/modelos/schema';

@Schema()
export class Crono implements Exactly<ICrono, Crono> {
  _id: string;

  @Prop({ required: true })
  cultivo: Cultivo;

  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  idDepartamento: string;

  @Prop({ required: true })
  ciclo: string;

  @Prop({ required: true })
  diaSiembra: number;

  @Prop({ required: true })
  mesSiembra: number;

  @Prop({ type: Object, required: true })
  etapas: IEtapasSoja | IEtapasTrigo;

  // Populate
  departamento?: IDepartamento;
}

export type CronoDocument = Crono & Document;

export const CronoSchema = SchemaFactory.createForClass(Crono);

CronoSchema.set('toJSON', { virtuals: true, getters: true });

CronoSchema.index(
  { cultivo: 1, idDepartamento: 1, ciclo: 1, mesSiembra: 1, diaSiembra: 1 },
  { unique: true },
);

CronoSchema.virtual('departamento', {
  foreignField: '_id',
  justOne: true,
  localField: 'idDepartamento',
  ref: Departamento.name,
});
