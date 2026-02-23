import base64
import hashlib
import hmac
import secrets

PBKDF2_ALGORITHM = "sha256"
PBKDF2_ITERATIONS = 600_000
PBKDF2_SALT_BYTES = 16


def normalize_username(name: str) -> str:
    return " ".join((name or "").strip().split()).lower()


def hash_password(password: str) -> str:
    raw = (password or "").encode("utf-8")
    if not raw:
        raise ValueError("Password cannot be empty")
    salt = secrets.token_bytes(PBKDF2_SALT_BYTES)
    derived = hashlib.pbkdf2_hmac(PBKDF2_ALGORITHM, raw, salt, PBKDF2_ITERATIONS)
    salt_b64 = base64.b64encode(salt).decode("ascii")
    hash_b64 = base64.b64encode(derived).decode("ascii")
    return f"pbkdf2_{PBKDF2_ALGORITHM}${PBKDF2_ITERATIONS}${salt_b64}${hash_b64}"


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        scheme, iterations_str, salt_b64, hash_b64 = (encoded_hash or "").split("$", 3)
    except ValueError:
        return False
    if scheme != f"pbkdf2_{PBKDF2_ALGORITHM}":
        return False
    try:
        iterations = int(iterations_str)
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(hash_b64.encode("ascii"))
    except Exception:
        return False
    candidate = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM,
        (password or "").encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(candidate, expected)


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()
