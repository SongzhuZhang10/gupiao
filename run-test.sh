#!/bin/bash
cd /home/songzhu/Desktop/gupiao/backend
npx tsx src/index.ts &
BACKEND_PID=$!
sleep 2

cd /home/songzhu/Desktop/gupiao/frontend
npm run dev &
FRONTEND_PID=$!
sleep 3

npx tsx e2e-test.ts
kill $BACKEND_PID
kill $FRONTEND_PID
