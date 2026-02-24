from llm.base import LLMClient
from llm.streamllm2 import OpenrouterDirectClient
# from llm.streamllm import OpenrouterDirectClient

def get_client(client_name: str, **kwargs) -> LLMClient:
    """
    Factory function to create LLM clients
    
    Args:
        client_name: Name of the client to create
        **kwargs: Additional arguments passed to the client constructor
    
    Returns:
        LLMClient instance
    
    Raises:
        ValueError: If client_name is not recognized
    """
    # Fix 1: Correct the boolean logic - was using 'or' instead of separate conditions
    if client_name == "openai":
        return OpenrouterDirectClient(**kwargs)
    elif client_name == "anthropic-dt":
        return OpenrouterDirectClient(**kwargs)  # Same client for now
    else:
        raise ValueError(f"Unknown client name: {client_name}")

# Fix 2: Added missing comma in __all__
__all__ = [
    "LLMClient",
    "OpenrouterDirectClient",
    "get_client",
]
