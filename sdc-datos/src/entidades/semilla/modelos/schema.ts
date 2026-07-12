import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  ISemilla,
  IResistencia,
  Cultivo,
  TConfianzaResistencia,
  TEnfermedad,
  TEnfermedadId,
  TEstadoResistencia,
  TPerfilResistencia,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Enfermedad } from '../../enfermedad/modelos/schema';

@Schema({ _id: false })
class ResistenciaSemilla implements IResistencia {
  @Prop({ type: String })
  enfermedad?: TEnfermedad;

  @Prop({ type: String })
  idEnfermedad?: TEnfermedadId;

  @Prop({ min: 0.01, max: 1.4 })
  multiplicador?: number;

  @Prop({ min: 0, max: 1 })
  indiceResistencia?: number;

  @Prop({ type: String })
  perfil?: TPerfilResistencia;

  @Prop({
    type: String,
    enum: ['observada', 'historica', 'inferida', 'desconocida'],
  })
  estado?: TEstadoResistencia;

  @Prop({ type: String, enum: ['alta', 'media', 'baja', 'sin_datos'] })
  confianza?: TConfianzaResistencia;

  @Prop()
  fuente?: string;

  @Prop()
  fuenteUrl?: string;

  @Prop()
  campaniaFuente?: string;

  @Prop()
  fechaFuente?: string;

  @Prop()
  observaciones?: string;
}

const ResistenciaSemillaSchema = SchemaFactory.createForClass(ResistenciaSemilla);

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

  @Prop({
    type: [ResistenciaSemillaSchema],
    default: [],
    validate: {
      validator: (values: IResistencia[]) => {
        const keys = (values || []).map((item) =>
          String(item.idEnfermedad || item.enfermedad || '').trim(),
        );
        return keys.every(Boolean) && new Set(keys).size === keys.length;
      },
      message: 'No puede haber resistencias duplicadas o sin enfermedad.',
    },
  })
  resistencia: IResistencia[];

  @Prop()
  campania?: string;

  @Prop({ type: String })
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

// `resistencia.enfermedad` ahora es el nombre canÃ³nico persistido. Se conserva
// la referencia histÃ³rica bajo otro nombre para no superponer un virtual a un
// campo real (Mongoose rechaza el esquema en tiempo de arranque).
SemillaSchema.virtual('resistencia.enfermedadDetalle', {
  foreignField: '_id',
  justOne: true,
  localField: 'resistencia.idEnfermedad',
  ref: Enfermedad.name,
});
