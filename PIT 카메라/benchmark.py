"""0단계 사전검증용 자동 벤치마크. 사람 상호작용 없이 카메라 오픈+얼굴검출 속도를 측정한다."""
import time
import cv2
import config
from recognizer import FaceRecognizer


def main():
    recognizer = FaceRecognizer()
    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    if not cap.isOpened():
        print("ERROR: 카메라를 열 수 없습니다.")
        return

    print(f"모델 로드 상태: {'있음' if recognizer.loaded else '없음(등록 필요)'}")
    print("워밍업 중...")
    for _ in range(5):
        cap.read()

    n = 60
    times_ms = []
    detected_counts = 0
    print(f"{n}프레임 벤치마크 시작...")
    for i in range(n):
        ok, frame = cap.read()
        if not ok:
            print("프레임 읽기 실패")
            continue
        if config.FRAME_RESIZE_WIDTH:
            h, w = frame.shape[:2]
            scale = config.FRAME_RESIZE_WIDTH / w
            frame = cv2.resize(frame, (config.FRAME_RESIZE_WIDTH, int(h * scale)))

        t0 = time.time()
        results = recognizer.recognize(frame)
        elapsed_ms = (time.time() - t0) * 1000.0
        times_ms.append(elapsed_ms)
        if results:
            detected_counts += 1

    cap.release()

    avg_ms = sum(times_ms) / len(times_ms) if times_ms else 0
    max_ms = max(times_ms) if times_ms else 0
    min_ms = min(times_ms) if times_ms else 0
    print("\n=== 벤치마크 결과 ===")
    print(f"프레임 수: {len(times_ms)}, 얼굴 검출된 프레임: {detected_counts}")
    print(f"프레임당 처리시간: 평균 {avg_ms:.1f}ms, 최소 {min_ms:.1f}ms, 최대 {max_ms:.1f}ms")
    print(f"예상 처리 FPS(단순 역수): {1000.0/avg_ms:.1f} FPS" if avg_ms > 0 else "N/A")
    print(f"프레임 1장당 약 {avg_ms/1000.0:.2f}초 -> 0.X초 목표 {'달성' if avg_ms < 1000 else '미달'}")


if __name__ == "__main__":
    main()
