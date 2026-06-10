import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Exactly, IClient } from 'modelos/src';

@Schema()
export class Client implements Exactly<IClient, Client> {
  @ApiProperty()
  @Prop({ required: true })
  id: string;

  @ApiProperty()
  @Prop({ required: true })
  clientSecret: string;

  @ApiProperty()
  @Prop({ type: [String], required: true })
  grants: string[];

  @ApiProperty()
  @Prop({ type: [String] })
  redirectUris: string[];

  @ApiProperty()
  @Prop()
  accessTokenLifetime: number;

  @ApiProperty()
  @Prop()
  refreshTokenLifetime: number;
}

export type ClientDocument = Client & Document;

export const ClientSchema = SchemaFactory.createForClass(Client);

ClientSchema.set('toJSON', { virtuals: true, getters: true });
