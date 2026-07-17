import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class PrediccionTombstone {
  @Prop({ required: true, unique: true, index: true })
  idSiembra: string;

  @Prop({ required: true, type: Date })
  eliminadaEn: Date;
}

export const PrediccionTombstoneSchema =
  SchemaFactory.createForClass(PrediccionTombstone);
