import { notFound } from "next/navigation";
import Link from "next/link";
import { getMixtureWithIngredients } from "@/lib/db/repo";
import { ReviewTable } from "@/components/ReviewTable";

export const dynamic = "force-dynamic";

export default async function ReviewPage(props: PageProps<"/mixtures/[id]/review">) {
  const { id } = await props.params;
  const result = await getMixtureWithIngredients(id);
  if (!result) notFound();
  const { mixture, ingredients } = result;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← 목록으로
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">구성성분 검토: {mixture.productName}</h1>
        <p className="mt-1 text-sm text-zinc-500">파일명: {mixture.pdfFilename}</p>
      </div>

      <ReviewTable
        mixtureId={mixture.id}
        initialProductName={mixture.productName}
        initialRows={ingredients.map((i) => ({
          ingredientName: i.ingredientName,
          casNo: i.casNo,
          contentPercentRaw: i.contentPercentRaw,
        }))}
      />
    </main>
  );
}
