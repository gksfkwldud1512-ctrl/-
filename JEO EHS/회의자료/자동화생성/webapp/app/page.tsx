import { loadMeetingData } from "@/lib/meetingData";
import { loadLibraryIndex } from "@/lib/library";
import { MeetingForm } from "@/components/MeetingForm";
import { LibraryPanel } from "@/components/LibraryPanel";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [data, libraryEntries] = await Promise.all([loadMeetingData(), loadLibraryIndex()]);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-800">회의자료 자동생성</h1>
        <p className="mt-1 text-sm text-zinc-500">
          신규 이슈·진행중인 업무를 한국어로 입력하면, EHS Weekly Meeting 양식 그대로 영어 PPT를 자동 생성합니다.
        </p>
      </div>
      <MeetingForm initialData={data} />
      <LibraryPanel initialEntries={libraryEntries} />
    </main>
  );
}
