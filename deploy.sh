#!/bin/bash
# CRM Module 배포 스크립트 (S3 + SSM 방식)
# 사전 조건: aws cli 설정 완료, S3 버킷 존재
set -e

REGION="ap-northeast-2"
INSTANCE_ID="i-0a1d152f59a8cf1f3"
S3_BUCKET="tara-crm-module-deploy-temp"
EC2_APP_DIR="/home/ec2-user/app"
EC2_WEB_DIR="/usr/share/nginx/html"
SERVICE_NAME="crm-module"

DEPLOY_API=true
DEPLOY_WEB=true

# 인자 처리: ./deploy.sh api  또는  ./deploy.sh web  (기본: 둘 다)
if [ "$1" = "api" ]; then
  DEPLOY_WEB=false
elif [ "$1" = "web" ]; then
  DEPLOY_API=false
fi

wait_for_command() {
  local CMD_ID="$1"
  local LABEL="$2"
  echo "[$LABEL] SSM 명령 대기 중... (CommandId: $CMD_ID)"
  for i in $(seq 1 30); do
    STATUS=$(aws ssm get-command-invocation \
      --command-id "$CMD_ID" \
      --instance-id "$INSTANCE_ID" \
      --region "$REGION" \
      --query 'Status' --output text 2>/dev/null || echo "Pending")
    if [ "$STATUS" = "Success" ]; then
      echo "[$LABEL] 완료"
      return 0
    elif [ "$STATUS" = "Failed" ] || [ "$STATUS" = "TimedOut" ] || [ "$STATUS" = "Cancelled" ]; then
      echo "[$LABEL] 실패 (Status: $STATUS)"
      aws ssm get-command-invocation \
        --command-id "$CMD_ID" \
        --instance-id "$INSTANCE_ID" \
        --region "$REGION" \
        --query 'StandardErrorContent' --output text
      return 1
    fi
    sleep 5
  done
  echo "[$LABEL] 타임아웃"
  return 1
}

# ── 백엔드 배포 ──
if [ "$DEPLOY_API" = "true" ]; then
  echo "===== [API] Gradle 빌드 ====="
  cd crm-module-api
  ./gradlew build -x test
  cd ..

  echo "===== [API] S3 업로드 ====="
  aws s3 cp crm-module-api/build/libs/crm-module-api-0.0.1-SNAPSHOT.jar \
    s3://$S3_BUCKET/crm-module-api.jar --region $REGION

  echo "===== [API] EC2 배포 ====="
  CMD_ID=$(aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters "{\"commands\":[
      \"aws s3 cp s3://$S3_BUCKET/crm-module-api.jar $EC2_APP_DIR/crm-module-api.jar --region $REGION\",
      \"systemctl restart $SERVICE_NAME\",
      \"sleep 10\",
      \"systemctl is-active $SERVICE_NAME && echo BACKEND_OK || echo BACKEND_FAIL\"
    ]}" \
    --region "$REGION" \
    --query 'Command.CommandId' --output text)
  wait_for_command "$CMD_ID" "API 배포"
fi

# ── 프론트엔드 배포 ──
if [ "$DEPLOY_WEB" = "true" ]; then
  echo "===== [WEB] npm 빌드 ====="
  cd crm-module-web
  npm run build
  tar czf dist.tar.gz dist/
  cd ..

  echo "===== [WEB] S3 업로드 ====="
  aws s3 cp crm-module-web/dist.tar.gz \
    s3://$S3_BUCKET/dist.tar.gz --region $REGION

  echo "===== [WEB] EC2 배포 ====="
  CMD_ID=$(aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters "{\"commands\":[
      \"aws s3 cp s3://$S3_BUCKET/dist.tar.gz /home/ec2-user/dist.tar.gz --region $REGION\",
      \"rm -rf /home/ec2-user/dist\",
      \"tar xzf /home/ec2-user/dist.tar.gz -C /home/ec2-user/\",
      \"rm -rf $EC2_WEB_DIR/*\",
      \"cp -r /home/ec2-user/dist/* $EC2_WEB_DIR/\",
      \"systemctl reload nginx\",
      \"echo FRONTEND_OK\"
    ]}" \
    --region "$REGION" \
    --query 'Command.CommandId' --output text)
  wait_for_command "$CMD_ID" "WEB 배포"
fi

echo ""
echo "===== 배포 완료 ====="
echo "웹:  (CRM 도메인 미정 — 배포 대상 확정 후 수정)"
echo "API: (CRM 도메인 미정 — 배포 대상 확정 후 수정)"
