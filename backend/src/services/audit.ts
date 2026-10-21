import type { Db } from '../db.ts';

export interface AuditEntry {
  actorUserId: string | null;
  actorType?: 'user' | 'system' | 'integration' | 'job';
  action: string;
  entityType: string;
  entityId: string;
  changeData?: Record<string, { old: unknown; new: unknown }>;
  reason?: string | null;
  source?: 'admin_web' | 'mobile_app' | 'public_web' | 'api' | 'system_job' | 'integration';
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Appends one row per business action (AUD-D01..D05). Never pass secrets in changeData/metadata (AUD-D07). */
export async function audit(db: Db, e: AuditEntry): Promise<void> {
  const actorType = e.actorType ?? (e.actorUserId ? 'user' : 'system');
  await db`insert into audit_log (actor_user_id, actor_type, action, entity_type, entity_id, change_data, reason, source, request_id, metadata)
    values (${e.actorUserId}, ${actorType}, ${e.action}, ${e.entityType}, ${e.entityId},
            ${e.changeData ? db.json(e.changeData as never) : null}, ${e.reason ?? null}, ${e.source ?? 'api'},
            ${e.requestId ?? null}, ${e.metadata ? db.json(e.metadata as never) : null})`;
}
