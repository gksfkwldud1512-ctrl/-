"""사람 등록 CLI. 사용법: python enroll.py --name alice
웹캠 미리보기를 보며 스페이스바로 얼굴 샘플을 캡처하고, q로 종료 후 전체 등록 인원으로 LBPH 모델을 재학습한다."""
import argparse
import json
import os
import cv2
import numpy as np
import config
from recognizer import _CASCADE_PATH


def capture_samples(name, target_count=25):
    detector = cv2.CascadeClassifier(_CASCADE_PATH)
    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    if not cap.isOpened():
        raise RuntimeError("카메라를 열 수 없습니다. CAMERA_INDEX 설정을 확인하세요.")

    person_dir = os.path.join(config.RAW_IMAGES_DIR, name)
    os.makedirs(person_dir, exist_ok=True)
    existing = len([f for f in os.listdir(person_dir) if f.endswith(".png")])
    count = 0

    print(f"[enroll] '{name}' 등록 시작. 스페이스바=캡처, q=종료 (목표 {target_count}장)")
    while count < target_count:
        ok, frame = cap.read()
        if not ok:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = detector.detectMultiScale(
            gray, scaleFactor=config.HAAR_SCALE_FACTOR,
            minNeighbors=config.HAAR_MIN_NEIGHBORS, minSize=config.HAAR_MIN_SIZE,
        )
        display = frame.copy()
        for (x, y, w, h) in faces:
            cv2.rectangle(display, (x, y), (x + w, y + h), (0, 255, 0), 2)
        cv2.putText(display, f"{name}: {count}/{target_count} (SPACE=capture, q=quit)",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.imshow("Enroll", display)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord(" ") and len(faces) == 1:
            x, y, w, h = faces[0]
            face_img = gray[y:y + h, x:x + w]
            idx = existing + count
            path = os.path.join(person_dir, f"{idx:04d}.png")
            cv2.imwrite(path, face_img)
            count += 1
            print(f"  캡처 {count}/{target_count} -> {path}")
        elif key == ord(" ") and len(faces) != 1:
            print("  얼굴이 정확히 1개 검출될 때만 캡처합니다 (현재:", len(faces), ")")

    cap.release()
    cv2.destroyAllWindows()
    return count


def retrain_all():
    """known_faces/raw_images/<name>/*.png 전체로 LBPH 모델을 재학습."""
    if not os.path.isdir(config.RAW_IMAGES_DIR):
        raise RuntimeError("등록된 사람이 없습니다.")

    names = sorted([d for d in os.listdir(config.RAW_IMAGES_DIR)
                     if os.path.isdir(os.path.join(config.RAW_IMAGES_DIR, d))])
    if not names:
        raise RuntimeError("등록된 사람이 없습니다.")

    label_map = {i: name for i, name in enumerate(names)}
    images, labels = [], []
    for label, name in label_map.items():
        person_dir = os.path.join(config.RAW_IMAGES_DIR, name)
        for fname in os.listdir(person_dir):
            if not fname.endswith(".png"):
                continue
            img = cv2.imread(os.path.join(person_dir, fname), cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue
            img = cv2.resize(img, config.FACE_SIZE)
            images.append(img)
            labels.append(label)

    if not images:
        raise RuntimeError("학습할 이미지가 없습니다.")

    model = cv2.face.LBPHFaceRecognizer_create()
    model.train(images, np.array(labels))
    os.makedirs(config.KNOWN_FACES_DIR, exist_ok=True)
    model.save(config.MODEL_PATH)
    with open(config.LABELS_PATH, "w", encoding="utf-8") as f:
        json.dump(label_map, f, ensure_ascii=False, indent=2)

    print(f"[enroll] 재학습 완료: {len(images)}장, {len(names)}명 -> {config.MODEL_PATH}")


def list_people():
    if not os.path.isdir(config.RAW_IMAGES_DIR):
        print("등록된 사람이 없습니다.")
        return
    for name in sorted(os.listdir(config.RAW_IMAGES_DIR)):
        person_dir = os.path.join(config.RAW_IMAGES_DIR, name)
        if os.path.isdir(person_dir):
            n = len([f for f in os.listdir(person_dir) if f.endswith(".png")])
            print(f"  {name}: {n}장")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", help="등록할 사람 이름")
    parser.add_argument("--count", type=int, default=25, help="캡처할 샘플 수")
    parser.add_argument("--list", action="store_true", help="등록된 사람 목록 출력")
    args = parser.parse_args()

    if args.list:
        list_people()
    elif args.name:
        capture_samples(args.name, args.count)
        retrain_all()
    else:
        parser.print_help()
