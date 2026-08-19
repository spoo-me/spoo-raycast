import type { LinkStatus } from "@/lib/links";
import { Color, Icon } from "@raycast/api";

export interface StatusMeta {
  label: string;
  icon: Icon;
  tintColor: Color;
}

const META: Record<LinkStatus, StatusMeta> = {
  ACTIVE: { label: "Active", icon: Icon.CircleFilled, tintColor: Color.Green },
  INACTIVE: {
    label: "Inactive",
    icon: Icon.CircleDisabled,
    tintColor: Color.SecondaryText,
  },
  EXPIRED: { label: "Expired", icon: Icon.Clock, tintColor: Color.Orange },
  BLOCKED: { label: "Blocked", icon: Icon.XMarkCircle, tintColor: Color.Red },
};

export function getStatusMeta(
  status: LinkStatus | null | undefined,
): StatusMeta {
  return status ? META[status] : META.INACTIVE;
}
