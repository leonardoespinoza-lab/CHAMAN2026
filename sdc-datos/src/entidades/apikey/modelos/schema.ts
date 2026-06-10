import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IApikey, IPermiso } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Apikey implements Exactly<IApikey, Apikey> {
  _id?: string;
  //
  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;

  @Prop()
  identificacion?: string;

  @Prop()
  key?: string;

  @Prop({ type: Object })
  permiso?: IPermiso;
}

export type ApikeyDocument = Apikey & Document;

export const ApikeySchema = SchemaFactory.createForClass(Apikey);

ApikeySchema.set('toJSON', { virtuals: true, getters: true });
