import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MailService } from './service';

@Module({
  imports: [HttpModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
