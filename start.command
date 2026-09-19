#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
  echo '자동 데이터 서비스가 이미 실행 중입니다. 기존 포트폴리오 페이지를 새로고침하세요.'
else
  node server.mjs
fi
