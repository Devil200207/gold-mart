import { ClientSession, Types } from 'mongoose';
import { ActorType, AuditLog } from '../models';

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditInput {
  actorType: ActorType;
  actorId?: Types.ObjectId | null;
  actorLabel?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
  ctx?: RequestContext;
}

/** Insert-only. The DB role forbids update/remove on audit_logs. */
export async function audit(input: AuditInput, session?: ClientSession): Promise<void> {
  await AuditLog.create(
    [
      {
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        ip: input.ctx?.ip ?? null,
        userAgent: input.ctx?.userAgent ?? null,
        details: input.details ?? null,
        createdAt: new Date(),
      },
    ],
    session ? { session } : {},
  );
}
