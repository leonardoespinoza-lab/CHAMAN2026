import { ApiProperty } from '@nestjs/swagger';
import { Exactly, ICreateClient } from 'modelos/src';

export class CreateClient implements Exactly<ICreateClient, CreateClient> {
  @ApiProperty()
  id: string;

  @ApiProperty()
  clientSecret?: string;

  @ApiProperty()
  grants: string[];

  @ApiProperty()
  redirectUris: string[];

  @ApiProperty()
  accessTokenLifetime: number;

  @ApiProperty()
  refreshTokenLifetime: number;
}
