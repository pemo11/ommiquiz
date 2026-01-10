"""
Database configuration and connection pooling for Ommiquiz.

Uses asyncpg for async PostgreSQL operations with plain SQL.
"""

import os
import asyncpg
from typing import Optional

# Database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


async def get_db_pool() -> asyncpg.Pool:
    """
    Get or create the database connection pool.

    Returns:
        asyncpg.Pool: The database connection pool
    """
    global _pool

    if _pool is None:
        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=5,  # Minimum number of connections
            max_size=20,  # Maximum number of connections
            command_timeout=60,  # Command timeout in seconds
        )

    return _pool


async def get_db_connection():
    """
    Get a database connection from the pool.

    Usage:
        async with get_db_connection() as conn:
            result = await conn.fetch("SELECT * FROM users")

    Yields:
        asyncpg.Connection: A database connection
    """
    pool = await get_db_pool()
    async with pool.acquire() as connection:
        yield connection


async def close_db_pool():
    """Close the database connection pool."""
    global _pool

    if _pool is not None:
        await _pool.close()
        _pool = None


async def execute_query(query: str, *args, fetch: bool = False, fetchrow: bool = False):
    """
    Execute a SQL query using the connection pool.

    Args:
        query: SQL query string
        *args: Query parameters
        fetch: If True, return all results
        fetchrow: If True, return single row

    Returns:
        Query results or None
    """
    pool = await get_db_pool()

    async with pool.acquire() as conn:
        if fetch:
            return await conn.fetch(query, *args)
        elif fetchrow:
            return await conn.fetchrow(query, *args)
        else:
            return await conn.execute(query, *args)
