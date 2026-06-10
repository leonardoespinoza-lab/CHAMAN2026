import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, ILicencia } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Licencia implements Exactly<ILicencia, Licencia> {
  _id?: string;

  @Prop() // "Free" | "Pro" | "Enterprise";
  nombre?: string;

  @Prop()
  maxUsuarios?: number;

  // // Aplica a quimica
  @Prop()
  maxdDistribuidores?: number;
  // // Aplica a distribuidor
  @Prop()
  maxProductores?: number;
  // // Aplica a productor
  @Prop()
  maxEstablecimientos?: number;

  @Prop()
  maxLotes?: number;

  @Prop()
  maxdHectareas?: number;

  @Prop({ type: Object })
  modulos?: {
    Enfermedades?: boolean;
    Riego?: boolean;
    'Huella Hídrica'?: boolean;
    NDVI?: boolean;
    Clima?: boolean;
    'Etapas Fenológicas'?: boolean;
  };
  //

  @Prop({ type: Boolean, default: false })
  default?: boolean;
}

export type LicenciaDocument = Licencia & Document;

export const LicenciaSchema = SchemaFactory.createForClass(Licencia);

LicenciaSchema.set('toJSON', { virtuals: true, getters: true });
