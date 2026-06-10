import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, INotificacion } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Notificacion implements Exactly<INotificacion, Notificacion> {
  _id: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: Date;

  @Prop({ default: false })
  leido?: boolean;

  @Prop()
  fechaLeido?: string;

  @Prop({ type: Object })
  tenant?: {
    idQuimica?: string;
    idDistribuidor?: string;
    idProductor?: string;
    idEstablecimiento?: string;
    idUsuario?: string;
  };

  @Prop()
  titulo?: string;

  @Prop()
  mensaje?: string;

  @Prop({ type: Object })
  data?: { [key: string]: string };
}

export type NotificacionDocument = Notificacion & Document;

export const NotificacionSchema = SchemaFactory.createForClass(Notificacion);

NotificacionSchema.set('toJSON', { virtuals: true, getters: true });

NotificacionSchema.index({ 'tenant.idUsuario': 1, leido: 1, fechaCreacion: 1 });
NotificacionSchema.index({ 'tenant.idUsuario': 1, fechaCreacion: 1 });
