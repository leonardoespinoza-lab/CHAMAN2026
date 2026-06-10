import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IDatosPersonales, IPermiso, IUsuario } from 'modelos/src';
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

  @Prop({ required: true, unique: true, lowercase: true })
  username: string;

  @Prop({ required: true })
  hash?: string;

  @Prop({ type: [Object] })
  permisos: IPermiso[];

  @Prop({ type: String })
  email?: string;

  @Prop({ type: Object })
  datosPersonales?: IDatosPersonales;
}

export type UsuarioDocument = Usuario & Document;

export const UsuarioSchema = SchemaFactory.createForClass(Usuario);

UsuarioSchema.set('toJSON', { virtuals: true, getters: true });

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
