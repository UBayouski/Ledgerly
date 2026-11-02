import { MODEL_LABEL } from "@/lib/model";
import { Dashboard } from "@/components/Dashboard";
import { isSandbox } from "@/lib/paypal";

export default function Home() {
  return <Dashboard sandbox={isSandbox()} modelLabel={MODEL_LABEL} />;
}
