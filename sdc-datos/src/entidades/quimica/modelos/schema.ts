import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IIntegracion, IQuimica } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Quimica implements Exactly<IQuimica, Quimica> {
  _id: string;

  @Prop({ required: true })
  nombre: string;

  @Prop()
  razonSocial: string;

  @Prop({ index: true })
  cuit: string;

  @Prop()
  logo: string;

  @Prop()
  email: string;

  @Prop()
  telefono: string;

  @Prop()
  web: string;

  @Prop()
  direccionFiscal: string;

  @Prop()
  observaciones: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion: string;

  @Prop({ type: Object })
  integraciones?: IIntegracion[];

  @Prop({ type: Boolean, default: false, index: true })
  archivado?: boolean;

  @Prop({ type: Date })
  fechaArchivado?: string;

  @Prop({ type: String })
  archivadoPor?: string;

  @Prop({ type: String })
  motivoArchivado?: string;
}

export type QuimicaDocument = Quimica & Document;

export const QuimicaSchema = SchemaFactory.createForClass(Quimica);

QuimicaSchema.set('toJSON', { virtuals: true, getters: true });
QuimicaSchema.index(
  { nombre: 1 },
  {
    name: 'uniq_quimica_nombre_activo_v2',
    unique: true,
    partialFilterExpression: { archivado: false },
  },
);
