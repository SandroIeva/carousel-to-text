import Dashboard from "@/components/dashboard";
export default function Home() {
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
