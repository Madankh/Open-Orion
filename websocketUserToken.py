import os
import aiohttp
import logging
from typing import Optional, Dict, Any

NODE_API_BASE_URL = "https://api.curiositylab.fun"

class CreditAPIClient:
    def __init__(self, base_url: str = None):
        self.base_url = base_url or NODE_API_BASE_URL
        self.timeout = aiohttp.ClientTimeout(total=10.0)

    async def check_credit_availability(self, user_id: str, estimated_credits: int) -> dict:
        """Calls the Node.js API to check if a user can proceed."""
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    f"{self.base_url}/api/token/check/credit/availability",
                    json={"userId": user_id, "estimatedCredits": estimated_credits}, 
                    timeout=self.timeout
                ) as response:
                    response.raise_for_status()
                    return await response.json()
            except aiohttp.ClientError as e:
                logging.error(f"API call to check credit availability failed: {e}")
                return {"canProceed": False, "error": "Could not connect to billing service."}
            except Exception as e:
                logging.error(f"Unexpected error checking credit availability: {e}")
                return {"canProceed": False, "error": "Unexpected error occurred."}

    async def deduct_daily_credits(
        self, 
        token:str,
        user_id: str, 
        credits_used: int,
        model_name: str = "unknown",
        input_tokens: int = 0,
        output_tokens: int = 0,
        total_cost_usd: float = 0.0
    ) -> dict:
        """Deduct credits after API call completion."""
        async with aiohttp.ClientSession() as session:
            try:
                payload = {
                    "userId": user_id,
                    "creditsUsed": credits_used,
                    "modelName": model_name,
                    "inputTokens": input_tokens,
                    "outputTokens": output_tokens,
                    "totalCostUsd": total_cost_usd
                }
                headers = {
                   "token": f"{token}", 
                   "Content-Type": "application/json"
                }
                async with session.post(
                    f"{self.base_url}/api/token/deduct-credits",
                    json=payload,
                    headers=headers,
                    timeout=self.timeout
                ) as response:
                    result = await response.json()
                    
                    if response.status == 429:
                        # Daily limit exceeded
                        logging.warning(f"Daily limit exceeded for user {user_id}: {result}")
                        return result
                    
                    response.raise_for_status()
                    result = await response.json()
                    return result
                    
            except aiohttp.ClientError as e:
                logging.error(f"API call to deduct credits failed: {e}")
                raise Exception(f"Could not connect to billing service: {e}")
            except Exception as e:
                logging.error(f"Unexpected error deducting credits: {e}")
                raise Exception(f"Unexpected error occurred: {e}")

    # async def get_user_stats(self, user_id: str) -> dict:
    #     """Get user's current usage statistics."""
    #     async with aiohttp.ClientSession() as session:
    #         try:
    #             async with session.get(
    #                 f"{self.base_url}/user-stats/{user_id}",
    #                 timeout=self.timeout
    #             ) as response:
    #                 response.raise_for_status()
    #                 return await response.json()
    #         except aiohttp.ClientError as e:
    #             logging.error(f"API call to get user stats failed: {e}")
    #             return {"error": "Could not fetch user statistics."}
    #         except Exception as e:
    #             logging.error(f"Unexpected error getting user stats: {e}")
    #             return {"error": "Unexpected error occurred."}

    # async def get_daily_usage(self, user_id: str) -> dict:
    #     """Get user's daily usage statistics."""
    #     async with aiohttp.ClientSession() as session:
    #         try:
    #             async with session.get(
    #                 f"{self.base_url}/daily-usage/{user_id}",
    #                 timeout=self.timeout
    #             ) as response:
    #                 response.raise_for_status()
    #                 return await response.json()
    #         except aiohttp.ClientError as e:
    #             logging.error(f"API call to get daily usage failed: {e}")
    #             return {"error": "Could not fetch daily usage."}
    #         except Exception as e:
    #             logging.error(f"Unexpected error getting daily usage: {e}")
    #             return {"error": "Unexpected error occurred."}
