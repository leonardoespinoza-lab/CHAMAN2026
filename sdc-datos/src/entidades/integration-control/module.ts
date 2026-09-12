import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import {
  IntegrationControlController,
  IntegrationControlGuard,
} from './controller';
import { IntegrationControlService } from './service';

export const IntegrationClientSchema = new Schema(
  {
    id: { type: String, required: true },
    environment: { type: String, required: true },
    advisorUserId: { type: String, required: true },
    permissionIndex: Number,
    name: String,
    enabled: Boolean,
    expiresAt: String,
    scopes: [String],
    // Optional for compatibility. These entries never authorize API routes.
    requestedServices: { type: [String], default: undefined },
    limits: { productores: Number, establecimientos: Number, lotes: Number },
    requestsPerMinute: Number,
    maxSowingAgeDays: Number,
    revision: Number,
    keys: [{ _id: false, id: String, sha256: String, expiresAt: String }],
    createdAt: String,
    updatedAt: String,
    audit: [
      {
        _id: false,
        at: String,
        actorId: String,
        action: String,
        revision: Number,
      },
    ],
  },
  { collection: 'integrationclients', strict: 'throw', versionKey: false },
);
IntegrationClientSchema.index({ environment: 1, id: 1 }, { unique: true });
IntegrationClientSchema.index(
  { environment: 1, advisorUserId: 1 },
  { unique: true },
);
IntegrationClientSchema.index(
  { environment: 1, 'keys.id': 1 },
  { unique: true, partialFilterExpression: { 'keys.id': { $exists: true } } },
);
export const IntegrationUsageSchema = new Schema(
  {
    requestId: String,
    clientId: String,
    environment: String,
    operation: String,
    startedAt: Date,
    status: Number,
    durationMs: Number,
  },
  { collection: 'integrationusage', strict: 'throw', versionKey: false },
);
IntegrationUsageSchema.index(
  { environment: 1, requestId: 1 },
  { unique: true },
);
IntegrationUsageSchema.index({ environment: 1, clientId: 1, startedAt: -1 });
IntegrationUsageSchema.index(
  { startedAt: 1 },
  { expireAfterSeconds: 90 * 86400 },
);

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'IntegrationClientRecord', schema: IntegrationClientSchema },
      { name: 'IntegrationUsageEvent', schema: IntegrationUsageSchema },
    ]),
  ],
  controllers: [IntegrationControlController],
  providers: [IntegrationControlService, IntegrationControlGuard],
})
export class IntegrationControlModule {}
