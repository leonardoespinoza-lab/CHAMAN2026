import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, ILicencia } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Licencia implements Exactly<ILicencia, Licencia> {
  _id?: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;

  @Prop() // "Free" | "Pro" | "Enterprise";
  nombre?: string;

  @Prop({ type: String, trim: true })
  codigo?: string;

  @Prop({ type: Number, default: 1, min: 1 })
  version?: number;

  @Prop({ type: String, enum: ['borrador', 'activo', 'archivado'], default: 'activo' })
  estado?: 'borrador' | 'activo' | 'archivado';

  @Prop({ type: String, enum: ['sin_cargo', 'suscripcion', 'por_uso', 'hibrido'], default: 'sin_cargo' })
  modeloFacturacion?: 'sin_cargo' | 'suscripcion' | 'por_uso' | 'hibrido';

  @Prop({ type: String, enum: ['informativo', 'bloqueante'], default: 'informativo' })
  modoLimite?: 'informativo' | 'bloqueante';

  @Prop({ type: String, default: 'manual' })
  origen?: 'manual' | 'automatico' | 'sistema';

  @Prop()
  motivoCreacion?: string;

  @Prop()
  maxUsuarios?: number;

  // // Aplica a quimica
  @Prop()
  maxDistribuidores?: number;

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
  maxHectareas?: number;

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

LicenciaSchema.index(
  { codigo: 1, version: 1 },
  { unique: true, partialFilterExpression: { codigo: { $type: 'string' } } },
);

LicenciaSchema.set('toJSON', { virtuals: true, getters: true });
