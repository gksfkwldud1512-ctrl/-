"""메인 루프: 캡처 -> 인식 -> 2인 판정 -> 개폐 -> 화면 표시.
지금은 0단계(사전 검증) 상태라 door_controller가 SIMULATE_RELAY 모드로 콘솔에만 로그를 남긴다."""
import time
import cv2
import config
from recognizer import FaceRecognizer
from door_controller import DoorController
from event_logger import log_unlock_event


def main():
    recognizer = FaceRecognizer()
    if not recognizer.loaded:
        print("[main] 경고: 학습된 얼굴 모델이 없습니다. 먼저 `python enroll.py --name 이름`으로 등록하세요.")

    door = DoorController()
    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    if not cap.isOpened():
        raise RuntimeError("카메라를 열 수 없습니다. CAMERA_INDEX 설정을 확인하세요.")

    seen_recently = {}  # {name: last_seen_timestamp}
    last_unlock_time = 0.0
    frame_count = 0
    fps_smoothed = 0.0
    prev_time = time.time()

    print("[main] 시작. q로 종료.")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            if config.FRAME_RESIZE_WIDTH:
                h, w = frame.shape[:2]
                scale = config.FRAME_RESIZE_WIDTH / w
                frame = cv2.resize(frame, (config.FRAME_RESIZE_WIDTH, int(h * scale)))

            now = time.time()
            frame_count += 1
            do_process = (frame_count % config.PROCESS_EVERY_N_FRAMES == 0)

            results = []
            if do_process:
                t0 = time.time()
                results = recognizer.recognize(frame)
                process_ms = (time.time() - t0) * 1000.0

                # 롤링 윈도우 갱신 (등록된 사람만)
                for name, bbox, confidence in results:
                    if name is not None:
                        seen_recently[name] = now

                # 만료된 항목 정리
                for n in list(seen_recently.keys()):
                    if now - seen_recently[n] > config.ROLLING_WINDOW_SECONDS:
                        del seen_recently[n]

                # 2인 인증 판정 (쿨다운 중이 아닐 때만)
                if len(seen_recently) >= 2 and (now - last_unlock_time) > config.COOLDOWN_SECONDS:
                    names = list(seen_recently.keys())[:2]
                    print(f"[main] 2인 인증 통과: {names}")
                    door.unlock()
                    log_unlock_event(names)
                    seen_recently.clear()
                    last_unlock_time = now
            else:
                process_ms = 0.0

            door.poll_auto_relock(now)

            # FPS 계산
            dt = now - prev_time
            prev_time = now
            if dt > 0:
                fps_smoothed = fps_smoothed * 0.9 + (1.0 / dt) * 0.1

            # 화면 표시
            for name, bbox, confidence in results:
                x, y, w, h = bbox
                color = (0, 255, 0) if name else (0, 0, 255)
                label = f"{name} ({confidence:.0f})" if name else "Unknown"
                cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
                cv2.putText(frame, label, (x, y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

            status = "UNLOCKED" if door.is_unlocked else "LOCKED"
            status_color = (0, 200, 0) if door.is_unlocked else (0, 0, 200)
            cv2.putText(frame, f"[{status}]", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, status_color, 2)
            cv2.putText(frame, f"FPS: {fps_smoothed:.1f}  frame_ms: {process_ms:.0f}",
                        (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
            cv2.putText(frame, f"seen: {list(seen_recently.keys())}",
                        (10, 78), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)

            cv2.imshow("PIT Door Access", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        door.safe_shutdown()
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
