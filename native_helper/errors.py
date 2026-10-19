class NativeDownloadError(Exception):
    """Diagnostics assembled only from known, credential-free messages."""
    def __init__(self, code, message, **details):
        super().__init__(message)
        self.code = code
        self.details = details
