import { Injectable } from '@nestjs/common';
import { ICreatePrediccionRiego, IPrediccionRiego } from 'modelos/src';
import { PrediccionRiegoRepository } from './repository';

@Injectable()
export class PrediccionRiegoService {
  constructor(private repository: PrediccionRiegoRepository) {}

  async create(data: ICreatePrediccionRiego): Promise<IPrediccionRiego> {
    return await this.repository.create(data);
  }
}
