"""Supabase authentication utilities for the Ommiquiz backend."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional
import httpx

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt, jwk
from jose.backends import RSAKey, ECKey

from .logging_config import get_logger

logger = get_logger("ommiquiz.auth")

# Cache for JWKS keys
_jwks_cache: Optional[dict] = None


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
    jwt_secret = os.getenv("SUPABASE_PUB_KEY")

    if not supabase_url:
        logger.warning("Supabase URL is not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication provider is not configured",
        )

    return {
        "supabase_url": supabase_url,
        "jwt_secret": jwt_secret,  # Optional for ES256
    }


async def _fetch_jwks(supabase_url: str) -> dict:
    """
    Fetch JWKS (JSON Web Key Set) from Supabase.

    Args:
        supabase_url: Supabase project URL

    Returns:
        JWKS dictionary with keys
    """
    global _jwks_cache

    # Return cached JWKS if available
    if _jwks_cache is not None:
        return _jwks_cache

    try:
        jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
        async with httpx.AsyncClient() as client:
            response = await client.get(jwks_url, timeout=10.0)
            response.raise_for_status()
            _jwks_cache = response.json()
            logger.info("Fetched JWKS from Supabase", jwks_url=jwks_url)
            return _jwks_cache
    except Exception as exc:
        logger.error("Failed to fetch JWKS", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch authentication keys"
        ) from exc


def _get_signing_key(token: str, jwks: dict) -> str:
    """
    Get the signing key for a JWT token from JWKS.

    Args:
        token: JWT token
        jwks: JWKS dictionary

    Returns:
        Public key for verification
    """
    try:
        # Decode header without verification to get kid
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        if not kid:
            raise ValueError("Token missing 'kid' header")

        # Find matching key in JWKS
        for key_data in jwks.get("keys", []):
            if key_data.get("kid") == kid:
                # Convert JWK to PEM format
                key_obj = jwk.construct(key_data)
                return key_obj.to_pem().decode('utf-8')

        raise ValueError(f"Key with kid '{kid}' not found in JWKS")

    except Exception as exc:
        logger.warning("Failed to get signing key", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format"
        ) from exc


async def _decode_supabase_token(token: str) -> dict:
    """
    Decode and verify a Supabase JWT token.
    Supports both HS256 (with JWT secret) and ES256 (with JWKS).

    Args:
        token: The JWT token to verify

    Returns:
        The decoded token payload

    Raises:
        HTTPException: If token is invalid or expired
    """
    settings = _require_supabase_settings()

    try:
        # Get algorithm from token header
        unverified_header = jwt.get_unverified_header(token)
        algorithm = unverified_header.get("alg", "HS256")

        if algorithm == "HS256":
            # Use JWT secret for HS256
            if not settings["jwt_secret"]:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="JWT secret not configured"
                )

            payload = jwt.decode(
                token,
                settings["jwt_secret"],
                algorithms=["HS256"],
                audience="authenticated",
            )
            return payload

        elif algorithm in ["ES256", "RS256"]:
            # Use JWKS for asymmetric algorithms
            jwks = await _fetch_jwks(settings["supabase_url"])
            public_key = _get_signing_key(token, jwks)

            payload = jwt.decode(
                token,
                public_key,
                algorithms=[algorithm],
                audience="authenticated",
            )
            return payload

        else:
            logger.warning(f"Unsupported algorithm: {algorithm}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Unsupported token algorithm: {algorithm}"
            )

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
    payload = await _decode_supabase_token(token)

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


async def get_current_admin(
    user: AuthenticatedUser = Depends(get_current_user)
) -> AuthenticatedUser:
    """
    Validate that the current user has admin privileges.

    Requires valid JWT token AND is_admin=true in user_profiles table.

    Args:
        user: Authenticated user from get_current_user

    Returns:
        AuthenticatedUser instance with admin privileges

    Raises:
        HTTPException(403): If user is not an admin
    """
    from .database import get_db_pool

    pool = await get_db_pool()

    async with pool.acquire() as conn:
        result = await conn.fetchrow(
            "SELECT is_admin FROM user_profiles WHERE id = $1",
            user.user_id
        )

        if not result:
            logger.warning(
                "User profile not found for authenticated user",
                user_id=user.user_id,
                email=user.email
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User profile not found"
            )

        if not result['is_admin']:
            logger.warning(
                "Non-admin user attempted admin action",
                user_id=user.user_id,
                email=user.email
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin privileges required"
            )

    logger.info("Admin authenticated", user_id=user.user_id, email=user.email)
    return user


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
