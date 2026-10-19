"""Chromium's length-prefixed UTF-8 JSON transport; stdout is protocol only."""
import json
import struct
import threading

MAX_MESSAGE = 1024 * 1024


def read_exact(stream, length):
    data = bytearray()
    while len(data) < length:
        chunk = stream.read(length - len(data))
        if not chunk:
            if not data:
                return None
            raise ValueError("Truncated native message")
        data.extend(chunk)
    return bytes(data)


def read_message(stream):
    prefix = read_exact(stream, 4)
    if prefix is None:
        return None
    length = struct.unpack("<I", prefix)[0]
    if not 0 < length <= MAX_MESSAGE:
        raise ValueError("Native message size exceeds limit")
    body = read_exact(stream, length)
    if body is None:
        raise ValueError("Missing native message body")
    message = json.loads(body.decode("utf-8"))
    if not isinstance(message, dict):
        raise ValueError("Native message must be an object")
    return message


class MessageWriter:
    def __init__(self, stream):
        self.stream = stream
        self.lock = threading.Lock()

    def __call__(self, message):
        body = json.dumps(message, ensure_ascii=False, allow_nan=False).encode("utf-8")
        if len(body) > MAX_MESSAGE:
            raise ValueError("Native response size exceeds limit")
        with self.lock:
            self.stream.write(struct.pack("<I", len(body)) + body)
            self.stream.flush()
