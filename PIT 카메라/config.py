"""지하피트 2인 인증 얼굴인식 도어락 - 설정값. 값만 바꿔서 튜닝한다."""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# --- 카메라 ---
CAMERA_INDEX = 0
FRAME_RESIZE_WIDTH = 480          # 처리 속도를 위해 이 너비로 축소 (None이면 원본 그대로)
PROCESS_EVERY_N_FRAMES = 1        # 1이면 매 프레임 처리, 2 이상이면 N프레임마다 한 번만 인식

# --- 얼굴 검출/인식 (OpenCV Haar + LBPH, dlib/cmake 불필요) ---
HAAR_SCALE_FACTOR = 1.2
HAAR_MIN_NEIGHBORS = 5
HAAR_MIN_SIZE = (80, 80)
FACE_SIZE = (200, 200)            # 인식용으로 정규화할 얼굴 크기
LBPH_CONFIDENCE_THRESHOLD = 70.0  # LBPH는 값이 "거리"라 낮을수록 더 확실한 매칭. 이 값보다 작아야 인정

# --- 2인 인증 로직 ---
ROLLING_WINDOW_SECONDS = 15.0     # 이 시간 안에 서로 다른 2명이 인식되면 통과
UNLOCK_DURATION_SECONDS = 5.0     # 문 열림(전원 차단) 유지 시간
COOLDOWN_SECONDS = 10.0           # 한 번 열린 후 재트리거 방지 시간

# --- 저장 경로 ---
KNOWN_FACES_DIR = os.path.join(BASE_DIR, "known_faces")
RAW_IMAGES_DIR = os.path.join(KNOWN_FACES_DIR, "raw_images")
MODEL_PATH = os.path.join(KNOWN_FACES_DIR, "lbph_model.yml")
LABELS_PATH = os.path.join(KNOWN_FACES_DIR, "labels.json")
LOG_FILE = os.path.join(BASE_DIR, "logs", "events.csv")

# --- 도어락/릴레이 ---
SIMULATE_RELAY = True             # True: 콘솔 로그로만 동작(하드웨어 없음). 실제 USB 릴레이 연동 시 False로 변경
RELAY_ACTIVE_HIGH = True          # 실제 릴레이 극성에 맞춰 조정
