import { Injectable } from '@nestjs/common';
import { InvalidStateTransitionException } from '@app/common';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { ActorContext } from '../types/actor-context.interface';

export type AppointmentAction =
  | 'approve'
  | 'reject'
  | 'check_in'
  | 'start'
  | 'complete'
  | 'no_show'
  | 'cancel'
  | 'expire';

interface TransitionDefinition {
  from: AppointmentStatus[];
  to: AppointmentStatus;
  allowedRoles?: string[];
  allowedActorTypes?: ('customer' | 'staff' | 'system' | 'anonymous')[];
}

const TRANSITION_MAP: Record<AppointmentAction, TransitionDefinition> = {
  approve: {
    from: [AppointmentStatus.PENDING],
    to: AppointmentStatus.CONFIRMED,
    allowedActorTypes: ['staff', 'system'],
  },
  reject: {
    from: [AppointmentStatus.PENDING],
    to: AppointmentStatus.REJECTED,
    allowedActorTypes: ['staff', 'system'],
  },
  check_in: {
    from: [AppointmentStatus.CONFIRMED],
    to: AppointmentStatus.CHECKED_IN,
    allowedActorTypes: ['staff', 'system'],
  },
  start: {
    from: [AppointmentStatus.CHECKED_IN],
    to: AppointmentStatus.IN_PROGRESS,
    allowedActorTypes: ['staff', 'system'],
  },
  complete: {
    from: [AppointmentStatus.IN_PROGRESS],
    to: AppointmentStatus.COMPLETED,
    allowedActorTypes: ['staff', 'system'],
  },
  no_show: {
    from: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
    to: AppointmentStatus.NO_SHOW,
    allowedActorTypes: ['staff', 'system'],
  },
  expire: {
    from: [AppointmentStatus.PENDING],
    to: AppointmentStatus.EXPIRED,
    allowedActorTypes: ['system', 'staff'],
  },
  cancel: {
    from: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN],
    to: AppointmentStatus.CANCELLED,
    allowedActorTypes: ['customer', 'staff', 'system'],
  },
};

/**
 * AppointmentStateMachine — Centralized lifecycle validator enforcing legal workshop transitions.
 */
@Injectable()
export class AppointmentStateMachine {
  public validateTransition(
    currentStatus: AppointmentStatus,
    action: AppointmentAction,
    actor?: ActorContext,
  ): AppointmentStatus {
    const definition = TRANSITION_MAP[action];
    if (!definition) {
      throw new InvalidStateTransitionException(`Unknown action "${action}" for appointment lifecycle`);
    }

    if (!definition.from.includes(currentStatus)) {
      throw new InvalidStateTransitionException(
        `Cannot perform action "${action}" on appointment with status ${currentStatus}. Expected one of [${definition.from.join(', ')}]`,
      );
    }

    if (actor && definition.allowedActorTypes && !definition.allowedActorTypes.includes(actor.actorType)) {
      throw new InvalidStateTransitionException(
        `Actor type "${actor.actorType}" is not authorized to perform action "${action}"`,
      );
    }

    return definition.to;
  }

  public getTargetStatus(action: AppointmentAction): AppointmentStatus {
    const definition = TRANSITION_MAP[action];
    if (!definition) {
      throw new InvalidStateTransitionException(`Unknown action "${action}"`);
    }
    return definition.to;
  }
}
