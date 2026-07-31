"use client";

import { useState } from "react";
import { type MeetingData, type MeetingItem, type MeetingStatus } from "@/lib/meetingData";

const STATUS_OPTIONS: MeetingStatus[] = ["진행중", "완료", "예정"];

function cloneList(list: MeetingItem[]): MeetingItem[] {
  return list.map((i) => ({ ...i }));
}

const TITLE_CASE_MINOR_WORDS = new Set(["a", "an", "the", "of", "on", "in", "to", "for", "and", "with", "by"]);

/** 구글 번역 결과는 제목도 그냥 문장체로 나와서("heat wave management") 슬라이드 제목답게 각 단어를 대문자로 시작하게 다듬는다. */
function toTitleCase(text: string): string {
  return text.replace(/[A-Za-z']+/g, (word, offset: number) => {
    const lower = word.toLowerCase();
    if (offset > 0 && TITLE_CASE_MINOR_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

// 자동 번역: 입력한 그대로(당분간 사용자가 직접 영어로 쓸 수도 있음)도, "영어로 번역해서 PPT
// 다운로드" 버튼(Google 번역 비공식 엔드포인트, lib/translate.ts)도 둘 다 지원한다.
function ItemColumn({
  title,
  items,
  onChange,
  showStatus,
}: {
  title: string;
  items: MeetingItem[];
  onChange: (next: MeetingItem[]) => void;
  showStatus: boolean;
}) {
  function update(idx: number, patch: Partial<MeetingItem>) {
    const next = cloneList(items);
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  return (
    <div className="flex-1 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-zinc-800">{title}</h2>
      <div className="flex flex-col gap-3">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-md border border-zinc-200 p-2">
            <div className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-xs font-semibold text-zinc-400">{idx + 1}.</span>
              <input
                type="text"
                value={item.title}
                onChange={(e) => update(idx, { title: e.target.value })}
                placeholder="업무 제목"
                className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm font-medium"
              />
              {showStatus && (
                <select
                  value={item.status}
                  onChange={(e) => update(idx, { status: e.target.value as MeetingStatus })}
                  className="rounded border border-zinc-200 px-1 py-1 text-xs"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>
            <textarea
              value={item.description}
              onChange={(e) => update(idx, { description: e.target.value })}
              placeholder="간단한 설명 (줄바꿈으로 여러 줄 가능)"
              rows={2}
              className="mt-1 w-full resize-y rounded border border-zinc-200 px-2 py-1 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function MeetingForm({ initialData }: { initialData: MeetingData }) {
  const [meetingDate, setMeetingDate] = useState(initialData.meetingDate);
  const [newIssues, setNewIssues] = useState<MeetingItem[]>(initialData.newIssues);
  const [ongoingTasks, setOngoingTasks] = useState<MeetingItem[]>(initialData.ongoingTasks);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [translatingDownload, setTranslatingDownload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current: MeetingData = { updatedAt: "", meetingDate, newIssues, ongoingTasks };

  async function downloadTranslatedPptx() {
    setTranslatingDownload(true);
    setError(null);
    try {
      // newIssues/ongoingTasks 각 항목의 제목·설명을 순서대로 한 번에 번역 요청한다.
      const allItems = [...newIssues, ...ongoingTasks];
      const texts = allItems.flatMap((i) => [i.title, i.description]);
      const res = await fetch("/api/meeting/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "번역에 실패했습니다.");
      }
      const { translated }: { translated: string[] } = await res.json();

      const translatedNewIssues = newIssues.map((item, idx) => ({
        ...item,
        title: toTitleCase(translated[idx * 2] || item.title),
        description: translated[idx * 2 + 1] || item.description,
      }));
      const offset = newIssues.length * 2;
      const translatedOngoingTasks = ongoingTasks.map((item, idx) => ({
        ...item,
        title: toTitleCase(translated[offset + idx * 2] || item.title),
        description: translated[offset + idx * 2 + 1] || item.description,
      }));

      const payload: MeetingData = { updatedAt: "", meetingDate, newIssues: translatedNewIssues, ongoingTasks: translatedOngoingTasks };
      const reportRes = await fetch("/api/meeting/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!reportRes.ok) throw new Error("PPT 생성에 실패했습니다.");
      const blob = await reportRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "EHS_Weekly_Meeting_EN.pptx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "번역/다운로드 중 오류가 발생했습니다.");
    } finally {
      setTranslatingDownload(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
      });
      if (!res.ok) throw new Error("저장에 실패했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadPptx() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/meeting/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
      });
      if (!res.ok) throw new Error("PPT 생성에 실패했습니다.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "EHS_Weekly_Meeting.pptx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "다운로드 중 오류가 발생했습니다.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <label className="text-sm font-medium text-zinc-700">회의 날짜</label>
        <input
          type="date"
          value={meetingDate}
          onChange={(e) => setMeetingDate(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <ItemColumn title="신규 이슈 (New Issues)" items={newIssues} onChange={setNewIssues} showStatus={false} />
        <ItemColumn title="진행중인 업무 (Ongoing Tasks)" items={ongoingTasks} onChange={setOngoingTasks} showStatus />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <button type="button" onClick={save} disabled={saving} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "저장 중..." : "임시저장"}
        </button>
        <button type="button" onClick={downloadPptx} disabled={downloading} className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50">
          {downloading ? "생성 중..." : "PPT 다운로드 (입력한 그대로)"}
        </button>
        <button type="button" onClick={downloadTranslatedPptx} disabled={translatingDownload} className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {translatingDownload ? "번역 중..." : "영어로 번역해서 PPT 다운로드"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
