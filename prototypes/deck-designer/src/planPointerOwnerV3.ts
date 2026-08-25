export const canBeginPlanPointerGestureV3 = (activePointerId: number | null): boolean => activePointerId === null;

export const ownsPlanPointerGestureV3 = (activePointerId: number | null, pointerId: number): boolean => activePointerId === pointerId;

export const releasePlanPointerGestureV3 = (activePointerId: number | null, pointerId: number): number | null =>
  ownsPlanPointerGestureV3(activePointerId, pointerId) ? null : activePointerId;
