import os
from dotenv import load_dotenv
from cryptography.fernet import Fernet



load_dotenv()
MASTER_KEY = os.getenv("MASTER_KEY")

if not MASTER_KEY:
    MASTER_KEY = Fernet.generate_key().decode()
    with open(".env", "a") as env_file:
        env_file.write(f"\nMASTER_KEY={MASTER_KEY}\n")
    print("Generated new MASTER_KEY and saved to .env")

cipher_suite = Fernet(MASTER_KEY.encode())


def encrypt_token(raw_token: str) -> str:
    token_bytes = raw_token.encode("utf-8")
    encrypted_bytes = cipher_suite.encrypt(token_bytes)
    return encrypted_bytes.decode("utf-8")


def decrypt_token(encrypted_token: str) -> str:
    encrypted_bytes = encrypted_token.encode("utf-8")
    decrypted_bytes = cipher_suite.decrypt(encrypted_bytes)
    return decrypted_bytes.decode("utf-8")


