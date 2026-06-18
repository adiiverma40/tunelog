import os

from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

KEY_FILE_PATH = "/app/data/master.key"
MASTER_KEY = os.getenv("MASTER_KEY")

if not MASTER_KEY:
    if os.path.exists(KEY_FILE_PATH):
        with open(KEY_FILE_PATH, "r") as key_file:
            MASTER_KEY = key_file.read().strip()

if not MASTER_KEY:
    MASTER_KEY = Fernet.generate_key().decode()
    os.makedirs(os.path.dirname(KEY_FILE_PATH), exist_ok=True)

    with open(KEY_FILE_PATH, "w") as key_file:
        key_file.write(MASTER_KEY)
    print(f"Generated new MASTER_KEY and saved to {KEY_FILE_PATH}")

cipher_suite = Fernet(MASTER_KEY.encode())


def encrypt_token(raw_token: str) -> str:
    token_bytes = raw_token.encode("utf-8")
    encrypted_bytes = cipher_suite.encrypt(token_bytes)
    return encrypted_bytes.decode("utf-8")


def decrypt_token(encrypted_token: str) -> str:
    encrypted_bytes = encrypted_token.encode("utf-8")
    decrypted_bytes = cipher_suite.decrypt(encrypted_bytes)
    return decrypted_bytes.decode("utf-8")
