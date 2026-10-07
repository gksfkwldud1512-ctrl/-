import { seedEmployees } from "@/lib/seed/seedEmployees";

async function main() {
  const summary = await seedEmployees((msg) => console.log(msg));
  console.log("사원명부 시딩 완료:", summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
