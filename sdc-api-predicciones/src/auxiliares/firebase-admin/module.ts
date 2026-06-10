import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { FirebaseAdminService } from './service';

@Module({
  imports: [AxiosModule],
  providers: [FirebaseAdminService],
  exports: [FirebaseAdminService],
})
export class FirebaseAdminModule {}
