import { z } from "zod";

/** Common wire fields; parsePaging/adminDateRange own their value validation. */
export const adminListFields = {
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.string().optional(),
  page_size: z.string().optional(),
};

export const moderationListFields = {
  ...adminListFields,
  handled_by: z.string().trim().min(1).max(64).optional(),
};
