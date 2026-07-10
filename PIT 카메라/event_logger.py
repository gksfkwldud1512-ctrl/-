"""개방 이벤트 CSV 로깅."""
import csv
import os
from datetime import datetime
import config

_HEADER = ["timestamp", "person_a", "person_b", "all_names_seen"]


def log_unlock_event(names):
    os.makedirs(os.path.dirname(config.LOG_FILE), exist_ok=True)
    is_new = not os.path.exists(config.LOG_FILE)
    with open(config.LOG_FILE, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(_HEADER)
        names = list(names)
        writer.writerow([
            datetime.now().isoformat(timespec="seconds"),
            names[0] if len(names) > 0 else "",
            names[1] if len(names) > 1 else "",
            "|".join(names),
        ])
