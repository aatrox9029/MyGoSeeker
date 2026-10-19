"""Cooperative task controls; HLS pauses restart the current remux on resume."""
import threading


class Cancelled(Exception):
    pass


class Control:
    def __init__(self):
        self.running = threading.Event()
        self.running.set()
        self.cancelled = threading.Event()
        self.process = None
        self.restart = False
        self.lock = threading.Lock()

    def wait(self):
        while not self.running.wait(0.1):
            if self.cancelled.is_set():
                raise Cancelled()
        if self.cancelled.is_set():
            raise Cancelled()

    def pause(self):
        self.restart = True
        self.running.clear()
        self.stop_process()

    def resume(self):
        self.running.set()

    def cancel(self):
        self.cancelled.set()
        self.running.set()
        self.stop_process()

    def stop_process(self):
        with self.lock:
            if self.process and self.process.poll() is None:
                self.process.terminate()
