import { put, get } from "@vercel/blob";

export type MeetingStatus = "진행중" | "완료" | "예정";

export type MeetingItem = {
  title: string;
  description: string;
  /** Ongoing Tasks 항목에만 쓰인다(New Issues는 상태 태그가 없다). */
  status: MeetingStatus;
};

export type MeetingData = {
  updatedAt: string;
  meetingDate: string; // 표지에 쓸 날짜, 예: "2026-07-31"
  newIssues: MeetingItem[]; // 최대 7개
  ongoingTasks: MeetingItem[]; // 최대 7개
};

export const MAX_ITEMS = 7;

function emptyItem(): MeetingItem {
  return { title: "", description: "", status: "진행중" };
}

function emptyData(): MeetingData {
  return {
    updatedAt: "",
    meetingDate: new Date().toISOString().slice(0, 10),
    newIssues: Array.from({ length: MAX_ITEMS }, emptyItem),
    ongoingTasks: Array.from({ length: MAX_ITEMS }, emptyItem),
  };
}

const DATA_PATH = "meeting/draft.json";

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function normalize(data: Partial<MeetingData>): MeetingData {
  const base = emptyData();
  const pad = (list: MeetingItem[] | undefined) => {
    const items = (list ?? []).map((i) => ({
      title: i?.title ?? "",
      description: i?.description ?? "",
      status: (i?.status as MeetingStatus) ?? "진행중",
    }));
    while (items.length < MAX_ITEMS) items.push(emptyItem());
    return items.slice(0, MAX_ITEMS);
  };
  return {
    updatedAt: data.updatedAt ?? "",
    meetingDate: data.meetingDate || base.meetingDate,
    newIssues: pad(data.newIssues),
    ongoingTasks: pad(data.ongoingTasks),
  };
}

export async function loadMeetingData(): Promise<MeetingData> {
  try {
    const result = await get(DATA_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return emptyData();
    const text = (await streamToBuffer(result.stream as ReadableStream<Uint8Array>)).toString("utf-8");
    return normalize(JSON.parse(text));
  } catch {
    return emptyData();
  }
}

export async function saveMeetingData(data: Partial<MeetingData>): Promise<MeetingData> {
  const next = normalize({ ...data, updatedAt: new Date().toISOString() });
  await put(DATA_PATH, JSON.stringify(next), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return next;
}

/** 제목이 채워진(빈칸이 아닌) 항목만, 원래 순서(1부터 시작하는 번호)를 유지해서 돌려준다. */
export function filledItems(list: MeetingItem[]): { order: number; item: MeetingItem }[] {
  return list
    .map((item, idx) => ({ order: idx + 1, item }))
    .filter(({ item }) => item.title.trim().length > 0);
}
