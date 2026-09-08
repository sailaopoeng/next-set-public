import { LoginPanel } from "@/components/auth/login-panel";
import { getSupabaseEnv } from "@/lib/supabase/env";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;

  return (
    <LoginPanel
      configured={getSupabaseEnv().configured}
      emailNotAllowed={error === "email_not_allowed"}
    />
  );
}
