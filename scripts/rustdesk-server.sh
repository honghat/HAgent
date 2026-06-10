#!/bin/bash
cd /Users/nguyenhat/HAgent/rustdesk/server

# Chạy hbbs (ID server) ngầm
./hbbs -r 100.115.2.71 > hbbs.log 2>&1 &

# Chạy hbbr (Relay server) ngầm
./hbbr > hbbr.log 2>&1 &

wait
