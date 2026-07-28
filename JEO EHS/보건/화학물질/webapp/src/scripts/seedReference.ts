import { seedReferenceData } from "@/lib/seed/seedReferenceData";

async function main() {
  const summary = await seedReferenceData((msg) => console.log(msg));
  console.log("시딩 완료:", summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
