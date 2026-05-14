import asyncio
import functools
import logging
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

def safe_retry(max_attempts=3, min_wait=2.0, max_wait=10.0):
    """Decorator để retry an toàn cho các tác vụ network/browser."""
    return retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=min_wait, max=max_wait),
        before_sleep=lambda retry_state: logger.warning(
            f"Retrying attempt {retry_state.attempt_number} after error: {retry_state.outcome.exception()}"
        )
    )

async def safe_click(page, selector, timeout=5000):
    """Click an toàn với retry."""
    @safe_retry()
    async def _click():
        await page.click(selector, timeout=timeout)
    await _click()

async def safe_fill(page, selector, value, timeout=5000):
    """Fill form an toàn với retry."""
    @safe_retry()
    async def _fill():
        await page.fill(selector, value, timeout=timeout)
    await _fill()
