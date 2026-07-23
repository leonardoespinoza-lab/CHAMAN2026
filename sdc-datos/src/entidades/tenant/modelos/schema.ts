import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IBrandingTenant,
  ICapacidadesTenant,
  IEntidadRaizTenant,
  ILimitesTenant,
  IModulosPermiso,
  ITenant,
  EstadoTenant,
} from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Tenant implements Exactly<ITenant, Tenant> {
  _id: string;

  @Prop({ required: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true, trim: true })
  nombre: string;

  @Prop({ trim: true })
  razonSocial?: string;

  @Prop({ trim: true })
  cuit?: string;

  @Prop({
    type: String,
    enum: ['borrador', 'activo', 'suspendido', 'archivado'],
    default: 'borrador',
    index: true,
  })
  estado: EstadoTenant;

  // Un tenant sin dominio no debe generar una clave vacia en el indice
  // unico. `undefined` hace que el indice sparse lo ignore correctamente.
  @Prop({ type: [String], default: undefined })
  dominios?: string[];

  @Prop({ type: Object })
  branding?: IBrandingTenant;

  @Prop({ type: Object })
  modulos?: IModulosPermiso;

  @Prop({ type: Object })
  capacidades?: ICapacidadesTenant;

  @Prop({ type: Object })
  limites?: ILimitesTenant;

  @Prop({ type: Object })
  entidadRaiz?: IEntidadRaizTenant;

  @Prop({ type: String, index: true })
  idUsuarioAdmin?: string;

  @Prop({ type: Boolean, default: false })
  provisionado?: boolean;

  @Prop({ type: String })
  ultimoErrorProvisionamiento?: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;

  @Prop({ type: Date, default: Date.now })
  fechaActualizacion?: string;

  @Prop({ type: String })
  creadoPorUsuario?: string;

  @Prop({ type: Boolean, default: false, index: true })
  archivado?: boolean;

  @Prop({ type: Date })
  fechaArchivado?: string;

  @Prop({ type: String })
  archivadoPor?: string;

  @Prop({ type: String })
  motivoArchivado?: string;
}

export type TenantDocument = Tenant & Document;
export const TenantSchema = SchemaFactory.createForClass(Tenant);

TenantSchema.index(
  { slug: 1 },
  {
    name: 'uniq_tenant_slug_activo_v2',
    unique: true,
    partialFilterExpression: { archivado: false },
  },
);
TenantSchema.index(
  { dominios: 1 },
  {
    name: 'uniq_tenant_dominio_activo_v2',
    unique: true,
    partialFilterExpression: {
      archivado: false,
      dominios: { $type: 'array' },
    },
  },
);
TenantSchema.index({ estado: 1, nombre: 1 });
TenantSchema.set('toJSON', { virtuals: true, getters: true });
