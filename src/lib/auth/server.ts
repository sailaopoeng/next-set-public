import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { jsonError } from "@/lib/api";
import { ALLOWED_EMAIL, isAllowedEmail } from "@/lib/auth/allowed-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { canCreateSupabaseClient, createClient } from "@/lib/supabase/server";

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type AllowedUserContext = {
  supabase: SupabaseClient;
  user: User;
};

export type PageViewerContext = {
  supabase: SupabaseClient;
  ownerId: string | null;
  isOwner: boolean;
};

export async function getAllowedUser(): Promise<AllowedUserContext | null> {
  if (!canCreateSupabaseClient()) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !isAllowedEmail(data.user.email)) {
    return null;
  }

  return { supabase, user: data.user };
}

export async function requireAllowedUser(): Promise<AllowedUserContext> {
  const context = await getAllowedUser();

  if (!context) {
    throw new AuthError(401, "UNAUTHORIZED", "Sign in with the allowed email.");
  }

  return context;
}

export async function getPageViewer(): Promise<PageViewerContext> {
  const owner = await getAllowedUser();

  if (owner) {
    return {
      supabase: owner.supabase,
      ownerId: owner.user.id,
      isOwner: true,
    };
  }

  const supabase = createAdminClient();
  if (!ALLOWED_EMAIL) {
    return { supabase, ownerId: null, isOwner: false };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", ALLOWED_EMAIL)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return {
    supabase,
    ownerId: data?.id ? String(data.id) : null,
    isOwner: false,
  };
}

export function authErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return jsonError(error.status, error.code, error.message);
  }

  console.error("API request failed.", error);
  return jsonError(
    500,
    "INTERNAL_ERROR",
    "The request could not be completed. Please try again.",
  );
}
