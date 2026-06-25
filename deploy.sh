#!/bin/bash
# Manual deploy script (Hostinger SSH).
# Use karo jab GitHub Action ke bina khud deploy karna ho:
#   bash deploy.sh
set -e
cd "$(dirname "$0")"

echo ">> Pulling latest code..."
git fetch origin main
git reset --hard origin/main

echo ">> Installing dependencies..."
npm install

echo ">> Building Next.js..."
npm run build

echo ">> Restarting app (Passenger)..."
mkdir -p tmp
touch tmp/restart.txt

echo ">> Done. Site live!"
