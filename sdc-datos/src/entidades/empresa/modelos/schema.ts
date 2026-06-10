import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Exactly, IEmpresa } from 'modelos/src';
import { Document } from 'mongoose';

@Schema()
export class Empresa implements Exactly<IEmpresa, Empresa> {
  _id: string;

  @Prop({ required: true })
  nombre: string;

  @Prop()
  logo: string;

  @Prop()
  color: string;
}

export type EmpresaDocument = Empresa & Document;

export const EmpresaSchema = SchemaFactory.createForClass(Empresa);

EmpresaSchema.set('toJSON', { virtuals: true, getters: true });
