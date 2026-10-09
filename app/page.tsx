import { redirect } from "next/navigation";
import { configured, identity } from "@/lib/server";
import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Home() {
  let signedIn = false;
  if (configured()) {
    try {
      await identity();
      signedIn = true;
    } catch {
      /* Show public input when signed out. */
    }
  }
  if (signedIn) redirect("/dashboard");
  return (
    <Dashboard
      initial={[]}
      email=""
      used={0}
      limit={30}
      ready={false}
      initialError=""
      guest
    />
  );
}
