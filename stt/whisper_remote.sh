#!/bin/bash
# Khởi động whisper STT server với LD_LIBRARY_PATH cho CUDA 12 libs từ pip wheels
cd "$(dirname "$0")"

CUBLAS_LIB=$(.venv/bin/python -c 'import nvidia.cublas.lib, os; print(os.path.dirname(nvidia.cublas.lib.__file__))' 2>/dev/null)
CUDNN_LIB=$(.venv/bin/python -c 'import nvidia.cudnn.lib, os; print(os.path.dirname(nvidia.cudnn.lib.__file__))' 2>/dev/null)

export LD_LIBRARY_PATH="${CUBLAS_LIB}:${CUDNN_LIB}:${LD_LIBRARY_PATH:-}"
export WHISPER_PORT="${WHISPER_PORT:-9001}"
export FASTER_WHISPER_DEVICE="${FASTER_WHISPER_DEVICE:-cuda}"
export FASTER_WHISPER_COMPUTE_TYPE="${FASTER_WHISPER_COMPUTE_TYPE:-float16}"
export FASTER_WHISPER_MODEL="${FASTER_WHISPER_MODEL:-medium}"

exec .venv/bin/python whisper_server.py
