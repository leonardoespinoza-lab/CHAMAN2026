import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IEstacion, Module } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Estacion implements Exactly<IEstacion, Estacion> {
  _id: string;

  @Prop({ type: String })
  origen?: 'FieldClimate' | 'Chaman' | 'Omixom' | 'Horatech';

  @Prop({ required: true })
  idExterno?: string;

  @Prop()
  user?: string;

  @Prop()
  pass?: string;

  @Prop()
  apikey?: string;

  @Prop({ type: Object })
  name?: {
    original: string; // "0020B01B"
    custom: string; // "Manexa"
  };

  @Prop({ type: Object })
  info?: {
    device_id: number; // 7
    device_name: string; // "iMetos 3.3";
    uid: string; // "249BC3085B7767E8";
    firmware: string; // "08.521.20200329";
    hardware: string; // "29-0503";
    programmed: string; // "";
    apn_table: number; // 3;
    description: string; // "iMetos 3.3; hw: 29-0503; fw: 08.521.20200329"
  };

  @Prop({ type: Object })
  dates?: {
    min_date: string; // "2020-08-21 07:29:06";
    max_date: string; // "2022-06-30 10:00:16";
    created_at: string; // "2020-08-21 06:55:22";
    last_communication: string; // "2022-06-30 10:01:03"
  };

  @Prop({ type: Object })
  position?: {
    geo: {
      type: string; // "Point";
      coordinates: [number, number]; // [-60.634811, -34.209442]
    };
    altitude: number; // 75.4;
    hdop: number; // 0.7;
    measure_time: number; // 0;
    timezoneCode: string; // "America/Argentina/Buenos_Aires"
  };

  @Prop({ type: [Object] })
  modulos?: Module[];
}

export type EstacionDocument = Estacion & Document;

export const EstacionSchema = SchemaFactory.createForClass(Estacion);

EstacionSchema.set('toJSON', { virtuals: true, getters: true });

EstacionSchema.index({ 'position.geo': '2dsphere' });
