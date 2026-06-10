import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Client } from './client.model';
import { Exactly, IToken, IUsuario } from 'modelos/src';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Schema()
export class Token implements Exactly<IToken, Token> {
  @ApiProperty()
  @Prop({ required: true })
  accessToken: string;

  @ApiProperty()
  @Prop({ type: Date })
  accessTokenExpiresAt: string;

  @ApiPropertyOptional()
  @Prop()
  refreshToken?: string;

  @ApiPropertyOptional()
  @Prop({ type: Date })
  refreshTokenExpiresAt?: string;

  @ApiPropertyOptional()
  @Prop({ type: String })
  scope?: string | string[];

  @ApiProperty()
  @Prop({ required: true })
  client: Client;

  @ApiProperty()
  @Prop({ type: Object, required: true })
  user: IUsuario;
}

export type TokenDocument = Token & Document;

export const TokenSchema = SchemaFactory.createForClass(Token);

TokenSchema.index({ accessToken: 1 });
TokenSchema.index({ refreshToken: 1 });
