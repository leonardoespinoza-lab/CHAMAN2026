import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Exactly,
  IDatosPersonales,
  IDatosProfesionales,
  IPermiso,
  IUbicacionProfesional,
  IUsuario,
} from 'modelos/src';
import { Document } from 'mongoose';
import { Distribuidor } from '../../distribuidor/modelos/schema';
import { Establecimiento } from '../../establecimiento/modelos/schema';
import { Productor } from '../../productor/modelos/schema';
import { Quimica } from '../../quimica/modelos/schema';

@Schema()
export class Usuario implements Exactly<IUsuario, Usuario> {
  _id: string;

  @Prop({ default: true })
  activo: boolean;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion: string;

  @Prop({ required: true, lowercase: true })
  username: string;

  @Prop({ required: true, select: false })
  hash?: string;

  @Prop({ type: [Object] })
  permisos: IPermiso[];

  @Prop({ type: String })
  email?: string;

  @Prop({ type: Object })
  datosPersonales?: IDatosPersonales;

  @Prop({ type: Object })
  datosProfesionales?: IDatosProfesionales;

  @Prop({ type: Object })
  ubicacionProfesional?: IUbicacionProfesional;

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

export type UsuarioDocument = Usuario & Document;

export const UsuarioSchema = SchemaFactory.createForClass(Usuario);

UsuarioSchema.set('toJSON', { virtuals: true, getters: true });

UsuarioSchema.index({ 'ubicacionProfesional.geojson': '2dsphere' });
UsuarioSchema.index(
  { username: 1 },
  {
    name: 'uniq_usuario_username_activo_v2',
    unique: true,
    partialFilterExpression: { archivado: false },
  },
);

UsuarioSchema.virtual('permisos.establecimiento', {
  foreignField: '_id',
  justOne: true,
  localField: 'permisos.idEstablecimiento',
  ref: Establecimiento.name,
});

UsuarioSchema.virtual('permisos.productor', {
  foreignField: '_id',
  justOne: true,
  localField: 'permisos.idProductor',
  ref: Productor.name,
});

UsuarioSchema.virtual('permisos.distribuidor', {
  foreignField: '_id',
  justOne: true,
  localField: 'permisos.idDistribuidor',
  ref: Distribuidor.name,
});

UsuarioSchema.virtual('permisos.quimica', {
  foreignField: '_id',
  justOne: true,
  localField: 'permisos.idQuimica',
  ref: Quimica.name,
});
