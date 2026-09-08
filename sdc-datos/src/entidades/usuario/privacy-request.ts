import {
  BadRequestException,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { timingSafeEqual } from 'node:crypto';
import { Model } from 'mongoose';

@Schema({ collection: 'privacy_requests', versionKey: false })
export class PrivacyRequest {
  // One request per account, atomic even before secondary indexes exist.
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ type: Date, required: true }) requestedAt: Date;
  @Prop({ type: Date, required: true }) respondBy: Date;
  @Prop({ type: String, enum: ['pending'], required: true }) status: 'pending';
  @Prop({ type: String, required: true }) policyVersion: string;
}
export const PrivacyRequestSchema =
  SchemaFactory.createForClass(PrivacyRequest);

@Injectable()
export class PrivacyInternalGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const expected = (process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN || '').trim();
    if (expected.length < 32) throw new ServiceUnavailableException();
    const value = context.switchToHttp().getRequest().headers[
      'x-privacy-internal-token'
    ];
    const received =
      typeof value === 'string' ? Buffer.from(value) : Buffer.alloc(0);
    const configured = Buffer.from(expected);
    if (
      received.length !== configured.length ||
      !timingSafeEqual(received, configured)
    ) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

@Injectable()
export class PrivacyRequestsService {
  constructor(
    @InjectModel(PrivacyRequest.name)
    private readonly requests: Model<PrivacyRequest>,
  ) {}

  private accountId(value: string) {
    if (!/^[a-f\d]{24}$/i.test(value))
      throw new BadRequestException('Cuenta inválida');
    return value.toLowerCase();
  }

  async status(id: string) {
    return this.requests.findById(this.accountId(id)).lean().exec();
  }

  async request(id: string) {
    const accountId = this.accountId(id);
    const requestedAt = new Date();
    const respondBy = new Date(requestedAt.getTime() + 30 * 86400000);
    try {
      return await this.requests
        .findOneAndUpdate(
          { _id: accountId },
          {
            $setOnInsert: {
              requestedAt,
              respondBy,
              status: 'pending',
              policyVersion: '2026-09-07',
            },
          },
          { upsert: true, new: true, runValidators: true },
        )
        .lean()
        .exec();
    } catch (error) {
      // Simultaneous retries must return the original ticket and deadline.
      if (error?.code === 11000) {
        const existing = await this.status(accountId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async list(page: string) {
    if (!/^\d{1,5}$/.test(page))
      throw new BadRequestException('Página inválida');
    const records = await this.requests
      .find()
      .sort({ requestedAt: 1, _id: 1 })
      .skip(Number(page) * 50)
      .limit(51)
      .lean()
      .exec();
    return { records: records.slice(0, 50), hasMore: records.length > 50 };
  }
}

// Not a public API: fail closed without the dedicated shared service token.
@Controller('privacy-requests')
@UseGuards(PrivacyInternalGuard)
export class PrivacyRequestsController {
  constructor(private readonly service: PrivacyRequestsService) {}
  @Get() list(@Query('page') page = '0') {
    return this.service.list(page);
  }
  @Get(':id') status(@Param('id') id: string) {
    return this.service.status(id);
  }
  @Post(':id') request(@Param('id') id: string) {
    return this.service.request(id);
  }
}
