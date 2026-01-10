"""Supabase authentication utilities for the Ommiquiz backend."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from .logging_config import get_logger

logger = get_logger("ommiquiz.auth")


@dataclass
class AuthenticatedUser:
    """Represents an authenticated user from Supabase."""

    user_id: str  # Supabase user UUID
    email: Optional[str] = None
    metadata: Optional[dict] = None

    # Legacy compatibility property
    @property
    def sub(self) -> str:
        """Alias for user_id for backward compatibility."""
        return self.user_id


_http_bearer = HTTPBearer(auto_error=False)


def _require_supabase_settings() -> dict[str, str]:
    """Get required Supabase configuration from environment."""
    supabase_url = os.getenv("SUPABASE_URL")
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET")

    if not supabase_url or not jwt_secret:
        logger.warning(
            "Supabase configuration missing",
            supabase_url=bool(supabase_url),
            jwt_secret=bool(jwt_secret)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication provider is not configured",
        )

    return {
        "supabase_url": supabase_url,
        "jwt_secret": jwt_secret,
    }


def _decode_supabase_token(token: str) -> dict:
    """
    Decode and verify a Supabase JWT token.

    Args:
        token: The JWT token to verify

    Returns:
        The decoded token payload

    Raises:
        HTTPException: If token is invalid or expired
    """
    settings = _require_supabase_settings()

    try:
        # Verify JWT with Supabase secret (HS256 algorithm)
        payload = jwt.decode(
            token,
            settings["jwt_secret"],
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload

    except jwt.ExpiredSignatureError:
        logger.info("Token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )

    except JWTError as exc:
        logger.warning("Token verification failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        ) from exc


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_http_bearer),
) -> AuthenticatedUser:
    """
    Validate Supabase JWT token and return authenticated user.

    Requires a valid JWT token in the Authorization header.

    Args:
        credentials: HTTP Bearer credentials from request

    Returns:
        AuthenticatedUser instance

    Raises:
        HTTPException: If not authenticated or token is invalid
    """
    if not credentials:
        logger.info("No credentials provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    token = credentials.credentials
    payload = _decode_supabase_token(token)

    user_id = payload.get("sub")
    email = payload.get("email")

    if not user_id:
        logger.warning("Token missing subject claim")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token - missing user ID"
        )

    logger.debug("User authenticated", user_id=user_id, email=email)

    return AuthenticatedUser(
        user_id=user_id,
        email=email,
        metadata=payload
    )


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_http_bearer),
) -> Optional[AuthenticatedUser]:
    """
    Optional authentication - returns None if not authenticated.

    Use this for endpoints that work both authenticated and unauthenticated.

    Args:
        credentials: HTTP Bearer credentials from request

    Returns:
        AuthenticatedUser if authenticated, None otherwise
    """
    if not credentials:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException as exc:
        logger.debug("Optional auth failed", detail=exc.detail)
        return None
