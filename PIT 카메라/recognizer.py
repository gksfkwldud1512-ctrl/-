"""얼굴 검출(Haar Cascade) + 인식(LBPH). dlib/cmake 없이 opencv-contrib-python만으로 동작한다."""
import json
import os
import cv2
import numpy as np
import config

_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"


class FaceRecognizer:
    def __init__(self):
        self.detector = cv2.CascadeClassifier(_CASCADE_PATH)
        self.model = cv2.face.LBPHFaceRecognizer_create()
        self.labels = {}  # {int_label: name}
        self.loaded = False
        self.load()

    def load(self):
        if os.path.exists(config.MODEL_PATH) and os.path.exists(config.LABELS_PATH):
            self.model.read(config.MODEL_PATH)
            with open(config.LABELS_PATH, "r", encoding="utf-8") as f:
                self.labels = {int(k): v for k, v in json.load(f).items()}
            self.loaded = True
        else:
            self.loaded = False

    def detect_faces(self, frame_bgr):
        """프레임에서 얼굴 bbox 목록 반환: [(x, y, w, h), ...]"""
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        faces = self.detector.detectMultiScale(
            gray,
            scaleFactor=config.HAAR_SCALE_FACTOR,
            minNeighbors=config.HAAR_MIN_NEIGHBORS,
            minSize=config.HAAR_MIN_SIZE,
        )
        return gray, faces

    def recognize(self, frame_bgr):
        """프레임 내 각 얼굴에 대해 (name_or_None, bbox, confidence) 리스트 반환."""
        gray, faces = self.detect_faces(frame_bgr)
        results = []
        for (x, y, w, h) in faces:
            face_roi = cv2.resize(gray[y:y + h, x:x + w], config.FACE_SIZE)
            name = None
            confidence = None
            if self.loaded:
                label, confidence = self.model.predict(face_roi)
                if confidence < config.LBPH_CONFIDENCE_THRESHOLD:
                    name = self.labels.get(label)
            results.append((name, (x, y, w, h), confidence))
        return results

    @staticmethod
    def normalize_face(gray_frame, bbox):
        x, y, w, h = bbox
        return cv2.resize(gray_frame[y:y + h, x:x + w], config.FACE_SIZE)
