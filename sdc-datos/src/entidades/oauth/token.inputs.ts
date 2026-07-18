import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional } from 'class-validator';
import { Exactly, ICreateClient, ICreateToken, IUsuario } from 'modelos/src';

export class CreateToken implements Exactly<ICreateToken, CreateToken> {
  @ApiProperty()
  @IsNotEmpty()
  accessToken: string;

  @ApiProperty()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  accessTokenExpiresAt?: string;

  @ApiProperty()
  @IsOptional()
  refreshToken?: string;

  @ApiProperty()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  refreshTokenExpiresAt?: string;

  @ApiPropertyOptional()
  sessionStartedAt?: string;

  @ApiPropertyOptional()
  sessionLastActivityAt?: string;

  @ApiPropertyOptional()
  sessionAbsoluteExpiresAt?: string;

  @ApiProperty()
  @IsOptional()
  scope?: string | string[];

  @ApiProperty()
  @IsNotEmpty()
  client: ICreateClient;

  @ApiProperty()
  @IsNotEmpty()
  user: IUsuario;
}
