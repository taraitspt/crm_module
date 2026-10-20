"""
MariaDB 로그인 → Teams 알림

server_audit 로그를 실시간으로 읽다가 사람 계정이 로그인하면 Teams로 카드를 보냅니다.
앱 계정(*_app)은 수시로 접속하므로 알림에서 제외합니다.

실행:
    TEAMS_WEBHOOK_URL="https://..." python3 teams_login_alert.py
    TEAMS_WEBHOOK_URL="https://..." python3 teams_login_alert.py --test   # 샘플 카드 1개 전송
"""
import csv
import json
import os
import socket
import sys
import time
import urllib.request
from datetime import datetime

AUDIT_LOG = os.environ.get("AUDIT_LOG", "/var/log/mysql/server_audit.log")
WEBHOOK_URL = os.environ["TEAMS_WEBHOOK_URL"]
SKIP_SUFFIXES = ("_app",)


def follow(path):
    """tail -F 처럼 새 줄만 계속 읽고, logrotate로 파일이 바뀌면 다시 엽니다."""
    f = open(path, encoding="utf-8", errors="replace")
    f.seek(0, os.SEEK_END)
    inode = os.fstat(f.fileno()).st_ino
    buf = ""
    while True:
        chunk = f.readline()
        if chunk:
            buf += chunk
            if buf.endswith("\n"):
                yield buf
                buf = ""
            continue
        time.sleep(1)
        try:
            if os.stat(path).st_ino != inode:
                f.close()
                f = open(path, encoding="utf-8", errors="replace")
                inode = os.fstat(f.fileno()).st_ino
        except FileNotFoundError:
            pass


def build_card(ok, user, host, db, server, when, retcode="0"):
    if ok:
        style, title = "good", "🔐 DB 로그인"
        summary = f"**{user}** 계정이 **{db or '-'}** 에 접속했어요"
    else:
        style, title = "attention", "🚨 DB 로그인 실패"
        summary = f"**{user}** 계정 로그인이 실패했어요 (오류 {retcode})"

    card = {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.4",
        "msteams": {"width": "Full"},
        "body": [
            {
                "type": "Container",
                "style": style,
                "bleed": True,
                "items": [
                    {"type": "TextBlock", "text": title, "weight": "Bolder", "size": "Large"},
                    {"type": "TextBlock", "text": summary, "wrap": True, "spacing": "Small"},
                ],
            },
            {
                "type": "FactSet",
                "spacing": "Medium",
                "facts": [
                    {"title": "계정", "value": user},
                    {"title": "접속 IP", "value": host},
                    {"title": "DB", "value": db or "-"},
                    {"title": "서버", "value": server},
                    {"title": "시간", "value": when},
                ],
            },
            {
                "type": "TextBlock",
                "text": "본인이 접속한 게 아니라면 IT 지원팀에 바로 알려주세요.",
                "size": "Small",
                "isSubtle": True,
                "wrap": True,
                "spacing": "Medium",
                "separator": True,
            },
        ],
    }
    return {
        "type": "message",
        "attachments": [
            {"contentType": "application/vnd.microsoft.card.adaptive", "contentUrl": None, "content": card}
        ],
    }


def send(payload):
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"Teams 전송 실패: {e}", flush=True)


def handle(line):
    # 형식: 시간,서버,계정,접속IP,연결ID,쿼리ID,동작,DB,객체,결과코드
    row = next(csv.reader([line.strip()]))
    if len(row) < 8:
        return
    ts, server, user, host, _, _, op, db = row[:8]
    retcode = row[-1]
    if op not in ("CONNECT", "FAILED_CONNECT") or user.endswith(SKIP_SUFFIXES):
        return

    ok = op == "CONNECT" and retcode == "0"
    when = datetime.strptime(ts, "%Y%m%d %H:%M:%S").strftime("%Y-%m-%d %H:%M:%S")
    send(build_card(ok, user, host, db, server, when, retcode))


def main():
    if sys.argv[1:] == ["--test"]:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        send(build_card(True, "crm_owner", "10.10.1.25", "crm_db", socket.gethostname(), now))
        print("샘플 카드를 보냈어요.")
        return

    print(f"감시 시작: {AUDIT_LOG}", flush=True)
    for line in follow(AUDIT_LOG):
        try:
            handle(line)
        except Exception as e:
            print(f"로그 처리 실패: {e} | {line.strip()}", flush=True)


if __name__ == "__main__":
    main()
