import { redirect } from "next/navigation";

export default function NutritionRedirectPage(): never {
  redirect("/weight");
}
