import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { ApiCheckService } from './api-check.service';

@Module({
  imports: [AxiosModule],
  providers: [ApiCheckService],
  exports: [ApiCheckService],
})
export class ApiCheckModule {}
