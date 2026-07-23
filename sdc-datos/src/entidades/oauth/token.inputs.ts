import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  sessionStartedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  sessionLastActivityAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
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

export class RevokeToken {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
