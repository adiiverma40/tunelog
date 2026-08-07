import os

from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()


_MASTER_KEY = None
_CIPHER_SUITE = None


def get_secret_key() -> str:
    global _MASTER_KEY

    if _MASTER_KEY is not None:
        return _MASTER_KEY

    KEY_FILE_PATH = "/app/data/master.key"
    _MASTER_KEY = os.getenv("MASTER_KEY")

    if not _MASTER_KEY:
        if os.path.exists(KEY_FILE_PATH):
            with open(KEY_FILE_PATH, "r") as key_file:
                _MASTER_KEY = key_file.read().strip()

    if not _MASTER_KEY:
        _MASTER_KEY = Fernet.generate_key().decode()
        os.makedirs(os.path.dirname(KEY_FILE_PATH), exist_ok=True)
        with open(KEY_FILE_PATH, "w") as key_file:
            key_file.write(_MASTER_KEY)
        print(f"Generated new MASTER_KEY and saved to {KEY_FILE_PATH}")

    return _MASTER_KEY


def _get_cipher_suite() -> Fernet:
    global _CIPHER_SUITE
    if _CIPHER_SUITE is None:
        _CIPHER_SUITE = Fernet(get_secret_key().encode())
    return _CIPHER_SUITE


def encrypt_token(raw_token: str) -> str:
    token_bytes = raw_token.encode("utf-8")
    encrypted_bytes = _get_cipher_suite().encrypt(token_bytes)
    return encrypted_bytes.decode("utf-8")


def decrypt_token(encrypted_token: str) -> str:
    encrypted_bytes = encrypted_token.encode("utf-8")
    decrypted_bytes = _get_cipher_suite().decrypt(encrypted_bytes)
    return decrypted_bytes.decode("utf-8")
