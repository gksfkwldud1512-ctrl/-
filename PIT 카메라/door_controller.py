"""도어락 릴레이 제어. 지금은 실제 USB 릴레이가 없으므로 SIMULATE_RELAY 모드로 콘솔에만 상태를 출력한다.
실제 하드웨어 연동 시 _drive_relay()만 USB 릴레이 SDK/HID 호출로 교체하면 된다.

Fail-Safe 원칙: 예외/종료 시 항상 lock()이 호출되도록 보장한다."""
import time
import config


class DoorController:
    def __init__(self):
        self._unlocked = False
        self._unlock_expiry = 0.0
        self.lock()  # 시작 시 항상 잠금 상태로 초기화

    @property
    def is_unlocked(self):
        return self._unlocked

    def lock(self):
        self._drive_relay(energize=False)
        self._unlocked = False

    def unlock(self, duration_seconds=None):
        duration = duration_seconds if duration_seconds is not None else config.UNLOCK_DURATION_SECONDS
        self._drive_relay(energize=True)
        self._unlocked = True
        self._unlock_expiry = time.time() + duration

    def poll_auto_relock(self, now=None):
        """매 루프마다 호출. 열림 유지시간이 지나면 자동으로 재시건."""
        now = now if now is not None else time.time()
        if self._unlocked and now >= self._unlock_expiry:
            self.lock()

    def _drive_relay(self, energize: bool):
        if config.SIMULATE_RELAY:
            print(f"[RELAY-SIM] {'UNLOCK (전원 차단)' if energize else 'LOCK (전원 통전)'}")
            return
        # TODO: 실제 USB 릴레이 모듈 SDK/HID 커맨드로 교체
        # 예: energize == True -> 릴레이 ON (NC 접점 열림 -> EM락 전원 차단 -> 문 열림)
        raise NotImplementedError("실제 USB 릴레이 연동 코드가 아직 없습니다. config.SIMULATE_RELAY=False로 바꾸기 전에 구현하세요.")

    def safe_shutdown(self):
        self.lock()
