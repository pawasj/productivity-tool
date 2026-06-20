import { redirect } from "next/navigation";

export default function CRMRedirect() {
  redirect("/dashboard/pipeline");
}
