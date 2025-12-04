"""Auth0 authentication utilities for the Ommiquiz backend."""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Optional, Sequence

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from .logging_config import get_logger

logger = get_logger("ommiquiz.auth")


@dataclass
class AuthenticatedUser:
    """Represents an authenticated user returned by Auth0."""

    sub: str
    email: Optional[str] = None
    name: Optional[str] = None
    permissions: Optional[Sequence[str]] = None


_http_bearer = HTTPBearer(auto_error=False)


def _parse_algorithms(raw_value: str) -> List[str]:
    return [alg.strip() for alg in raw_value.split(",") if alg.strip()]


def _parse_audience(raw_value: str) -> Sequence[str] | str:
    values = [aud.strip() for aud in raw_value.split(",") if aud.strip()]
    if not values:
        return ""
    if len(values) == 1:
        return values[0]
    return values


def _require_auth0_settings() -> Dict[str, Any]:
    domain = os.getenv("AUTH0_DOMAIN")
    audience_value = os.getenv("AUTH0_AUDIENCE", "")
    issuer = os.getenv("AUTH0_ISSUER") or (f"https://{domain}/" if domain else None)
    algorithms = _parse_algorithms(os.getenv("AUTH0_ALGORITHMS", "RS256"))

    if not domain or not audience_value:
        logger.warning("Auth0 configuration missing", domain=domain, audience=audience_value)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication provider is not configured",
        )

    return {
        "domain": domain,
        "audience": _parse_audience(audience_value),
        "issuer": issuer,
        "algorithms": algorithms or ["RS256"],
    }


def _require_auth0_login_settings() -> Dict[str, Any]:
    settings = _require_auth0_settings()
    client_id = os.getenv("AUTH0_CLIENT_ID")
    client_secret = os.getenv("AUTH0_CLIENT_SECRET")
    realm = os.getenv("AUTH0_REALM")

    if not client_id or not client_secret:
        logger.warning(
            "Auth0 login configuration missing", client_id=bool(client_id), client_secret=bool(client_secret)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication provider is not configured",
        )

    return {**settings, "client_id": client_id, "client_secret": client_secret, "realm": realm}


@lru_cache(maxsize=1)
def _get_jwks(domain: str) -> Dict[str, Any]:
    url = f"https://{domain}/.well-known/jwks.json"
    try:
        response = httpx.get(url, timeout=5.0)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as exc:
        logger.error("Failed to fetch JWKS", url=url, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable",
        ) from exc


def _get_rsa_key(token: str, domain: str) -> Dict[str, str]:
    jwks = _get_jwks(domain)
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        logger.warning("Unable to read token header", error=str(exc))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    kid = header.get("kid")
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return {
                "kty": key.get("kty"),
                "kid": key.get("kid"),
                "use": key.get("use"),
                "n": key.get("n"),
                "e": key.get("e"),
            }

    logger.warning("No matching JWKS key found", kid=kid)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unable to verify token")


def _decode_token(token: str) -> Dict[str, Any]:
    settings = _require_auth0_settings()
    rsa_key = _get_rsa_key(token, settings["domain"])

    try:
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=settings["algorithms"],
            audience=settings["audience"],
            issuer=settings["issuer"],
        )
        return payload
    except JWTError as exc:
        logger.warning("Token verification failed", error=str(exc))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token") from exc


async def login_with_email_password(email: str, password: str) -> Dict[str, Any]:
    settings = _require_auth0_login_settings()

    grant_type = "http://auth0.com/oauth/grant-type/password-realm" if settings.get("realm") else "password"
    payload = {
        "grant_type": grant_type,
        "username": email,
        "password": password,
        "audience": settings["audience"],
        "client_id": settings["client_id"],
        "client_secret": settings["client_secret"],
        "scope": "openid profile email",
    }

    if settings.get("realm"):
        payload["realm"] = settings["realm"]

    token_url = f"https://{settings['domain']}/oauth/token"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(token_url, json=payload)
    except httpx.HTTPError as exc:
        logger.error("Auth0 login request failed", url=token_url, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable",
        ) from exc

    if response.status_code == status.HTTP_401_UNAUTHORIZED:
        logger.info("Auth0 login failed with invalid credentials", email=email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Auth0 login returned unexpected status",
            status_code=response.status_code,
            response_text=response.text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication service error",
        ) from exc

    token_data = response.json()
    if "access_token" not in token_data:
        logger.error("Auth0 login response missing access token", response_text=response.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication service error",
        )

    return token_data


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_http_bearer),
) -> Optional[AuthenticatedUser]:
    """Resolve the authenticated user if a bearer token is provided."""

    if credentials is None:
        return None

    payload = _decode_token(credentials.credentials)
    subject = payload.get("sub")
    if not subject:
        logger.warning("Token missing subject claim")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token")

    permissions: Optional[Sequence[str]] = None
    if isinstance(payload.get("permissions"), list):
        permissions = payload["permissions"]

    return AuthenticatedUser(
        sub=subject,
        email=payload.get("email"),
        name=payload.get("name") or payload.get("nickname"),
        permissions=permissions,
    )

