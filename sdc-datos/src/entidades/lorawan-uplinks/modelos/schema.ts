import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, ILorawanUplink } from 'modelos/src';
import { Document } from 'mongoose';

@Schema({ collection: 'lorawan_uplinks' })
export class LorawanUplink implements Exactly<ILorawanUplink, LorawanUplink> {
  _id: string;

  @Prop({ type: Date, default: Date.now })
  fechaCreacion?: string;

  @Prop()
  topic?: string;

  @Prop()
  applicationID?: string;

  @Prop()
  applicationName?: string;

  @Prop({ uppercase: true, index: true })
  devEUI?: string;

  @Prop()
  deviceName?: string;

  @Prop()
  fCnt?: number;

  @Prop()
  fPort?: number;

  @Prop()
  data?: string;

  @Prop({ index: true })
  gatewayID?: string;

  @Prop()
  rssi?: number;

  @Prop()
  snr?: number;

  @Prop()
  frequency?: number;

  @Prop()
  dr?: number;

  @Prop({ type: Date, index: true })
  timestamp?: string;

  @Prop({ type: Object })
  rawPayload?: Record<string, any>;
}

export type LorawanUplinkDocument = LorawanUplink & Document;

export const LorawanUplinkSchema = SchemaFactory.createForClass(LorawanUplink);

LorawanUplinkSchema.set('toJSON', { virtuals: true, getters: true });

LorawanUplinkSchema.index({ devEUI: 1, timestamp: -1 });
LorawanUplinkSchema.index({ applicationID: 1, timestamp: -1 });
