import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, ITokenPush } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class TokenPush implements Exactly<ITokenPush, TokenPush> {
  _id: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;

  @Prop()
  idUsuario?: string;

  @Prop()
  tokenPush?: string;
}

export type TokenPushDocument = TokenPush & Document;

export const TokenPushSchema = SchemaFactory.createForClass(TokenPush);

TokenPushSchema.set('toJSON', { virtuals: true, getters: true });

TokenPushSchema.index({ idUsuario: 1 });
